// Made By Eng Nayer Nader
// The C Lounge — server-side visitor intelligence ledger.
//
// Firestore collection map (V58). Every name below is deliberate; keep them
// stable so dashboards and retention rules do not have to be rewritten.
//
//   analytics_events    immutable event stream — one document per action
//   visitor_sessions    rolling profile per pseudonymous visitor (aggregated)
//   analytics_sessions  one document per browsing session (visit summary)
//   commercial_events   monetary events only, when a real amount is supplied
//   inquiries           submitted private briefs + routing metadata
//   conversations/*     AI concierge transcripts
//   routing_logs        governed desk-routing decisions
//   audit_events        operational events (notifications, handoffs)
//
// Aggregation rule: the event stream is the source of truth. The profile and
// session documents are *derived counters* written with atomic increments so
// two concurrent requests can never clobber each other's totals.

const crypto = require('crypto');
const admin = require('firebase-admin');
const { getDb, serverTimestamp } = require('../config/firebaseAdmin');
const { hashIp, safeAgent } = require('./privacy');

const RETENTION_DAYS = Number(process.env.ANALYTICS_RETENTION_DAYS || 180);
const MAX_EVENT_DATA_KEYS = 40;
const MAX_VALUE = 1_000_000_000;

// arrayUnion has no server-side cap, so bound the breadcrumb lists ourselves.
// A visitor who browses 200 pages should not grow an unbounded profile doc.
const MAX_TRACKED_PAGES = 60;
const MAX_TRACKED_COUNTRIES = 10;

// Event names that count as "a page was seen". Anything else is an interaction.
const PAGE_VIEW_EVENTS = new Set(['page_view', 'pageview', 'page_enter']);

const increment = (n) => admin.firestore.FieldValue.increment(n);
const arrayUnion = (...values) => admin.firestore.FieldValue.arrayUnion(...values);

function retentionDate() {
  return new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function cleanString(value, max = 500) {
  return String(value ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, max);
}

function cleanData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_EVENT_DATA_KEYS)) {
    const safeKey = cleanString(key, 80).replace(/[^a-zA-Z0-9_.-]/g, '_');
    if (!safeKey) continue;
    if (typeof value === 'string') output[safeKey] = cleanString(value, 500);
    else if (typeof value === 'number' && Number.isFinite(value)) output[safeKey] = value;
    else if (typeof value === 'boolean') output[safeKey] = value;
  }
  return output;
}

function proxyCountryHeader(req) {
  // Only an edge/CDN header is treated as real geolocation. Browser locale is
  // a hint at best — a UK phone roaming in Cairo still reports en-GB.
  return req.get('cf-ipcountry')
    || req.get('x-country-code')
    || req.get('x-vercel-ip-country')
    || req.get('fly-client-ip-country')
    || '';
}

function countryFromRequest(req, clientCountry) {
  const country = cleanString(proxyCountryHeader(req) || clientCountry, 8).toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

function currencyValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= MAX_VALUE ? amount : null;
}

function createVisitorId() {
  return crypto.randomUUID();
}

/**
 * Record one visitor event and fold it into the derived profile/session docs.
 * Never throws for a partial failure — the event write is what matters; the
 * roll-ups are best effort so a counter error can never lose the event.
 */
async function recordEvent(req, payload = {}) {
  const db = getDb();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const eventType = cleanString(payload.event_type || payload.type, 80) || 'custom';
  const visitorId = cleanString(payload.visitor_id, 120) || createVisitorId();
  const sessionId = cleanString(payload.session_id, 120) || null;
  const pagePath = cleanString(payload.page_path || req.get('referer'), 500) || '/';
  const value = currencyValue(payload.value);
  const country = countryFromRequest(req, payload.country);
  const isPageView = PAGE_VIEW_EVENTS.has(eventType);
  const expiresAt = retentionDate();

  const event = {
    eventType,
    eventCategory: isPageView ? 'navigation' : 'interaction',
    eventVersion: '2',
    visitorId,
    sessionId,
    occurredAt: payload.occurred_at ? new Date(payload.occurred_at) : serverTimestamp(),
    serverReceivedAt: serverTimestamp(),
    pagePath,
    pageTitle: cleanString(payload.page_title, 250) || null,
    referrer: cleanString(payload.referrer, 500) || null,
    ipHash: hashIp(ip),
    ipAddress: cleanString(ip, 120),
    userAgent: safeAgent(req.get('user-agent')),
    country,
    countrySource: proxyCountryHeader(req)
      ? 'proxy_header'
      : (payload.country ? 'browser_locale_hint' : null),
    language: cleanString(payload.language, 35) || null,
    timezone: cleanString(payload.timezone, 80) || null,
    deviceType: cleanString(payload.device_type, 30) || null,
    screen: cleanString(payload.screen, 30) || null,
    value,
    currency: cleanString(payload.currency, 8).toUpperCase() || null,
    data: cleanData(payload.data),
    expiresAt,
  };

  // 1. The immutable event. This one is allowed to throw.
  const ref = await db.collection('analytics_events').add(event);

  // 2. Derived roll-ups. Best effort, atomic, never clobbering.
  const rollups = [];

  const profile = {
    visitorId,
    lastSeenAt: serverTimestamp(),
    lastPagePath: pagePath,
    lastEventType: eventType,
    country: event.country,
    language: event.language,
    timezone: event.timezone,
    deviceType: event.deviceType,
    userAgent: event.userAgent,
    ipHash: event.ipHash,
    ipAddress: event.ipAddress,
    eventCount: increment(1),
    pageViewCount: increment(isPageView ? 1 : 0),
    totalValue: increment(value || 0),
    updatedAt: serverTimestamp(),
    expiresAt,
  };
  if (pagePath) profile.pagesSeen = arrayUnion(pagePath.slice(0, 200));
  if (event.country) profile.countriesSeen = arrayUnion(event.country);
  if (event.referrer) profile.lastReferrer = event.referrer;

  rollups.push(
    db.collection('visitor_sessions').doc(visitorId)
      .set(profile, { merge: true })
      .then(() => trimBreadcrumbs(db, visitorId))
  );

  if (sessionId) {
    rollups.push(writeSessionRollup(db, sessionId, {
      sessionId,
      visitorId,
      lastActivityAt: serverTimestamp(),
      lastPagePath: pagePath,
      eventCount: increment(1),
      pageViewCount: increment(isPageView ? 1 : 0),
      totalValue: increment(value || 0),
      country: event.country,
      deviceType: event.deviceType,
      language: event.language,
      timezone: event.timezone,
      userAgent: event.userAgent,
      ipHash: event.ipHash,
      ipAddress: event.ipAddress,
      referrer: event.referrer,
      expiresAt,
    }, { startedAt: serverTimestamp(), entryPage: pagePath, entryReferrer: event.referrer }));
  }

  if (value !== null) {
    rollups.push(db.collection('commercial_events').add({
      eventId: ref.id,
      visitorId,
      sessionId,
      eventType,
      amount: value,
      currency: event.currency || null,
      pagePath,
      country: event.country,
      source: 'website',
      createdAt: serverTimestamp(),
      expiresAt,
      data: cleanData(payload.data),
    }));
  }

  const results = await Promise.allSettled(rollups);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Analytics roll-up failed:', result.reason?.message || result.reason);
    }
  }

  return { eventId: ref.id, visitorId };
}

/**
 * Session roll-up writer.
 *
 * `rolling` fields are merged on every event. `openingOnly` fields (start time,
 * entry page, entry referrer) describe how the visit *began*, so a plain merge
 * would overwrite them on every subsequent event and every session would look
 * like it started on its last page. They are therefore written only when the
 * session document does not exist yet. A process-local set remembers which
 * sessions have been opened so the existence read happens once per session,
 * not once per event.
 */
const openedSessions = new Set();
const MAX_REMEMBERED_SESSIONS = 20_000;

async function writeSessionRollup(db, sessionId, rolling, openingOnly) {
  const docRef = db.collection('analytics_sessions').doc(sessionId);
  let payload = rolling;

  if (!openedSessions.has(sessionId)) {
    const snapshot = await docRef.get();
    if (!snapshot.exists) payload = { ...openingOnly, ...rolling };
    if (openedSessions.size > MAX_REMEMBERED_SESSIONS) openedSessions.clear();
    openedSessions.add(sessionId);
  }

  await docRef.set(payload, { merge: true });
}

/**
 * Keep the profile breadcrumb arrays bounded. arrayUnion cannot cap itself, so
 * once a list crosses the ceiling it is rewritten to its most recent entries.
 * Cheap: one extra read/write only on the events that cross the boundary.
 */
async function trimBreadcrumbs(db, visitorId) {
  const docRef = db.collection('visitor_sessions').doc(visitorId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return;
  const data = snapshot.data() || {};
  const update = {};
  if (Array.isArray(data.pagesSeen) && data.pagesSeen.length > MAX_TRACKED_PAGES) {
    update.pagesSeen = data.pagesSeen.slice(-MAX_TRACKED_PAGES);
  }
  if (Array.isArray(data.countriesSeen) && data.countriesSeen.length > MAX_TRACKED_COUNTRIES) {
    update.countriesSeen = data.countriesSeen.slice(-MAX_TRACKED_COUNTRIES);
  }
  if (Object.keys(update).length) await docRef.update(update);
}

module.exports = {
  recordEvent,
  createVisitorId,
  PAGE_VIEW_EVENTS,
  MAX_TRACKED_PAGES,
  MAX_TRACKED_COUNTRIES,
};
