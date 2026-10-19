#!/usr/bin/env node
// Made By Eng Nayer Nader
/**
 * The C Lounge — re-key existing Firestore documents onto meaningful IDs.
 *
 * Firestore document IDs are immutable, so "renaming" means copy-then-delete.
 * This script does that safely:
 *
 *   * DRY RUN BY DEFAULT. Nothing is written until you pass --apply.
 *   * Copies subcollections (conversations/{id}/messages) and re-sequences the
 *     messages so a transcript reads in order under its new parent.
 *   * Records the old ID on every migrated document as `legacyId`, so nothing
 *     is lost and the migration is auditable.
 *   * Skips documents that already carry a v72-shaped ID, so it is safe to run
 *     more than once.
 *   * Deletes the original only after the copy is confirmed, and only with
 *     --delete-originals. Without that flag the old documents are left in place
 *     and you can verify before committing.
 *
 * Usage
 *   node scripts/migrate-firestore-ids.js                       # dry run, all collections
 *   node scripts/migrate-firestore-ids.js --only conversations  # dry run, one collection
 *   node scripts/migrate-firestore-ids.js --apply               # write the new documents
 *   node scripts/migrate-firestore-ids.js --apply --delete-originals
 *
 * Environment: the same FIREBASE_* variables the backend uses.
 * Run it from the repository root with backend/node_modules installed.
 */

const path = require('path');

process.env.NODE_PATH = path.join(__dirname, '..', 'backend', 'node_modules');
require('module').Module._initPaths();

const { getDb } = require('../backend/config/firebaseAdmin');
const ids = require('../backend/utils/docIds');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DELETE_ORIGINALS = args.includes('--delete-originals');
const ONLY = (() => {
  const index = args.indexOf('--only');
  return index >= 0 ? args[index + 1] : null;
})();
const LIMIT = (() => {
  const index = args.indexOf('--limit');
  return index >= 0 ? Number(args[index + 1]) : 0;
})();

/** Prefixes that mean "this document already has a v72 ID". */
const V72_PREFIXES = /^(conv|msg|turn|evt|asess|vsess|inq|audit|route|sec)_/;

function whenOf(data) {
  const candidate = data.createdAt || data.startedAt || data.firstSeenAt || data.lastSeenAt;
  if (candidate && typeof candidate.toDate === 'function') return candidate.toDate();
  if (candidate instanceof Date) return candidate;
  if (typeof candidate === 'string') {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** How each collection derives its new ID from the document's own fields. */
const PLAN = {
  conversations: (data) => ids.conversationId({
    country: data.country, deviceType: data.deviceType, date: whenOf(data),
  }),
  analytics_events: (data) => ids.analyticsEventId({
    eventType: data.eventType, date: whenOf(data),
  }),
  analytics_sessions: (data) => ids.analyticsSessionId({
    country: data.country, deviceType: data.deviceType, date: whenOf(data),
  }),
  visitor_sessions: (data) => ids.visitorSessionId({
    country: data.country, deviceType: data.deviceType, date: whenOf(data),
  }),
  inquiries: (data) => ids.inquiryId({
    reference: data.reference, requestType: data.requestType || data.service, date: whenOf(data),
  }),
  audit_events: (data) => ids.auditEventId({ type: data.type, date: whenOf(data) }),
  routing_logs: (data) => ids.routingLogId({
    deskId: data.deskId, source: data.source, date: whenOf(data),
  }),
};

async function copyMessages(db, oldRef, newRef, report) {
  const snapshot = await oldRef.collection('messages').orderBy('createdAt', 'asc').get();
  if (snapshot.empty) return 0;
  let sequence = 0;
  let batch = db.batch();
  let queued = 0;

  for (const doc of snapshot.docs) {
    sequence += 1;
    const data = doc.data();
    const role = data.role || 'unknown';
    const target = newRef.collection('messages').doc(ids.messageId(sequence, role));
    if (APPLY) {
      batch.set(target, { ...data, sequence, legacyId: doc.id });
      queued += 1;
      if (queued >= 400) {            // Firestore caps a batch at 500 writes
        await batch.commit();
        batch = db.batch();
        queued = 0;
      }
    }
  }
  if (APPLY && queued) await batch.commit();
  report.messages += sequence;
  return sequence;
}

async function migrateCollection(db, name) {
  const derive = PLAN[name];
  if (!derive) return null;

  let query = db.collection(name);
  if (LIMIT) query = query.limit(LIMIT);
  const snapshot = await query.get();

  const report = {
    collection: name, scanned: 0, migrated: 0, skipped: 0, messages: 0, deleted: 0, errors: 0,
  };

  for (const doc of snapshot.docs) {
    report.scanned += 1;
    if (V72_PREFIXES.test(doc.id)) { report.skipped += 1; continue; }

    const data = doc.data();
    let newId;
    try {
      newId = derive(data);
    } catch (error) {
      console.error(`  ! ${name}/${doc.id}: could not derive an ID (${error.message})`);
      report.errors += 1;
      continue;
    }

    const newRef = db.collection(name).doc(newId);
    console.log(`  ${doc.id}  ->  ${newId}`);

    if (APPLY) {
      try {
        await newRef.set({ ...data, legacyId: doc.id, migratedAt: new Date() });
        if (name === 'conversations') await copyMessages(db, doc.ref, newRef, report);
        // Only ever delete after the copy has been written and confirmed.
        if (DELETE_ORIGINALS) {
          const confirm = await newRef.get();
          if (confirm.exists) {
            await db.recursiveDelete(doc.ref);
            report.deleted += 1;
          }
        }
      } catch (error) {
        console.error(`  ! ${name}/${doc.id}: ${error.message}`);
        report.errors += 1;
        continue;
      }
    } else if (name === 'conversations') {
      const messages = await doc.ref.collection('messages').count().get().catch(() => null);
      report.messages += messages ? messages.data().count : 0;
    }
    report.migrated += 1;
  }
  return report;
}

async function main() {
  console.log('The C Lounge — Firestore ID migration');
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (nothing will be written)'}`);
  if (APPLY && DELETE_ORIGINALS) console.log('originals: WILL BE DELETED after a confirmed copy');
  console.log('');

  const db = getDb();
  const collections = ONLY ? [ONLY] : Object.keys(PLAN);
  const reports = [];

  for (const name of collections) {
    console.log(`# ${name}`);
    const report = await migrateCollection(db, name);
    if (!report) { console.log(`  (no migration plan for "${name}")\n`); continue; }
    reports.push(report);
    console.log(`  scanned=${report.scanned} migrated=${report.migrated} `
      + `skipped=${report.skipped} messages=${report.messages} `
      + `deleted=${report.deleted} errors=${report.errors}\n`);
  }

  console.table(reports);
  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write the new documents,');
    console.log('then verify in the console before adding --delete-originals.');
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
