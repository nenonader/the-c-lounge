// Made By Eng Nayer Nader
/**
 * The C Lounge — private concierge chat proxy (v72).
 *
 * Changes from v71
 * ----------------
 * 1. Meaningful document IDs everywhere (see utils/docIds.js). A conversation is
 *    `conv_2026-09-06T10-29-55Z_eg_mobile_a3f9c1` instead of a 20-character
 *    auto-ID, and its messages are `msg_000001_user`, `msg_000002_assistant`,
 *    so a transcript reads in order in the Firestore console.
 * 2. Every turn writes a `chat_turns` record saying WHICH PATH served it —
 *    Claude or the holding reply — with the model, latency and failure cause.
 *    v71 had no way to tell these apart, which is how the site ran fully
 *    degraded for days without anyone noticing.
 * 3. Blocked prompt-injection attempts land in `security_events`.
 * 4. The conversation document carries running totals instead of being
 *    overwritten with the same three fields on every message.
 */

const express = require('express');
const { FieldValue } = require('firebase-admin').firestore;
const { getDb, serverTimestamp } = require('../config/firebaseAdmin');
const { hashIp, safeAgent, publicReference } = require('../utils/privacy');
const { buildChatSummary, whatsappUrl } = require('../utils/whatsapp');
const { resolveRecipients } = require('../config/routing');
const { routeWithAI } = require('../utils/aiRouter');
const ids = require('../utils/docIds');

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY || '';
const RATE_LIMIT_MAX = Number(process.env.CHAT_RATE_LIMIT || 20);
const hits = new Map();
const MAX_TRACKED_IPS = 20_000;
const FALLBACK_SUGGESTIONS = [
  'Arrange private aviation',
  'Prepare an airport arrival',
  'Charter a yacht',
  'Explore private membership',
  'I have a time-sensitive request',
];

// Accepts the v72 meaningful id AND the v71 UUID, so sessions already open in a
// visitor's browser at deploy time keep working instead of erroring out.
const SESSION_ID_RE = /^(?:conv_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z[a-z0-9_-]{0,80}|[0-9a-f-]{36})$/i;

function isRateLimited(ip) {
  const now = Date.now();
  const window = (hits.get(ip) || []).filter((stamp) => now - stamp < 60_000);
  window.push(now);
  hits.set(ip, window);
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [key, stamps] of hits) {
      if (!stamps.length || now - stamps[stamps.length - 1] > 60_000) hits.delete(key);
      if (hits.size <= MAX_TRACKED_IPS / 2) break;
    }
  }
  return window.length > RATE_LIMIT_MAX;
}

const aiHeaders = () => ({ 'Content-Type': 'application/json', 'X-Service-Key': AI_SERVICE_KEY });

function retentionDate(days = Number(process.env.CHAT_RETENTION_DAYS || 30)) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function dbOrNull() {
  try {
    return getDb();
  } catch (error) {
    console.error('Conversation logging unavailable:', error.message);
    return null;
  }
}

/** Coarse device class from the user agent. Stored as a field AND in the ID. */
function deviceTypeOf(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  if (!ua) return 'unknown';
  return 'desktop';
}

/** Country from the CDN/proxy header, matching utils/analytics.js behaviour. */
function countryOf(req) {
  const header = req.get('cf-ipcountry') || req.get('x-vercel-ip-country')
    || req.get('x-render-ip-country') || req.get('x-country-code') || '';
  return String(header).trim().toUpperCase().slice(0, 2) || 'XX';
}

function requestContext(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const userAgent = safeAgent(req.get('user-agent'));
  return {
    ip,
    ipHash: hashIp(ip),
    userAgent,
    deviceType: deviceTypeOf(userAgent),
    country: countryOf(req),
    language: String(req.get('accept-language') || '').split(',')[0].slice(0, 12) || null,
    referrer: String(req.get('referer') || '').slice(0, 500) || null,
    visitorId: String(req.get('x-visitor-id') || req.body?.visitor_id || '').slice(0, 120) || null,
    analyticsSessionId: String(req.get('x-analytics-session') || req.body?.analytics_session_id || '').slice(0, 120) || null,
  };
}

// ---------------------------------------------------------------------------
// Message logging with a real, ordered sequence
// ---------------------------------------------------------------------------

/**
 * Append one message inside a transaction so `messageCount` and the message's
 * own sequence number can never diverge under concurrent turns. The sequence is
 * what makes `msg_000004_assistant` sort correctly in the console — with
 * auto-IDs every transcript appeared shuffled.
 */
async function appendMessage(db, sessionId, role, content, meta = {}) {
  if (!db) return null;
  const sessionRef = db.collection('conversations').doc(sessionId);
  try {
    return await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(sessionRef);
      const current = snapshot.exists ? snapshot.data() : {};
      const sequence = Number(current.messageCount || 0) + 1;
      const messageRef = sessionRef.collection('messages').doc(ids.messageId(sequence, role));

      tx.set(sessionRef, {
        schemaVersion: 2,
        status: meta.status || current.status || 'active',
        service: meta.service ?? current.service ?? null,
        handoffReady: Boolean(meta.handoffReady || current.handoffReady),
        messageCount: sequence,
        visitorTurns: Number(current.visitorTurns || 0) + (role === 'user' ? 1 : 0),
        conciergeTurns: Number(current.conciergeTurns || 0) + (role === 'assistant' ? 1 : 0),
        firstMessageAt: current.firstMessageAt || serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: retentionDate(),
        ...(meta.context ? {
          ipHash: meta.context.ipHash,
          userAgent: meta.context.userAgent,
          deviceType: meta.context.deviceType,
          country: meta.context.country,
          language: meta.context.language,
          visitorId: meta.context.visitorId,
          analyticsSessionId: meta.context.analyticsSessionId,
        } : {}),
      }, { merge: true });

      tx.set(messageRef, {
        sequence,
        role,
        content: String(content || '').slice(0, 4000),
        characters: String(content || '').length,
        createdAt: serverTimestamp(),
        expiresAt: retentionDate(),
      });
      return sequence;
    });
  } catch (error) {
    console.error('Message log failed:', error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suggestions & session creation
// ---------------------------------------------------------------------------

router.get('/suggestions', async (_req, res) => {
  try {
    const upstream = await fetch(`${AI_SERVICE_URL}/api/chat/suggestions`, { headers: aiHeaders() });
    if (!upstream.ok) throw new Error(`AI returned ${upstream.status}`);
    return res.json(await upstream.json());
  } catch (error) {
    console.warn('AI suggestions fallback:', error.message);
    return res.json({ suggestions: FALLBACK_SUGGESTIONS });
  }
});

router.post('/new-session', async (req, res) => {
  const context = requestContext(req);
  // The session id IS the Firestore document id, and it is readable:
  //   conv_2026-09-06T10-29-55Z_eg_mobile_a3f9c1
  const sessionId = ids.conversationId(context);

  warmUpstream();

  const db = dbOrNull();
  if (db) {
    await db.collection('conversations').doc(sessionId).set({
      schemaVersion: 2,
      status: 'active',
      messageCount: 0,
      visitorTurns: 0,
      conciergeTurns: 0,
      claudeTurns: 0,
      fallbackTurns: 0,
      blockedTurns: 0,
      handoffReady: false,
      service: null,
      lastServedBy: null,
      lastModel: null,
      ipHash: context.ipHash,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      deviceType: context.deviceType,
      country: context.country,
      language: context.language,
      entryReferrer: context.referrer,
      visitorId: context.visitorId,
      analyticsSessionId: context.analyticsSessionId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: retentionDate(),
    }).catch((error) => console.error('Conversation session log failed:', error.message));
  }
  res.status(201).json({ session_id: sessionId });
});

// Render spins a service down after idle; the next request pays a cold start.
// Nothing else pings clounge-ai, so the first chat message after a quiet spell
// would hit a sleeping service and time out.
let lastWarmAt = 0;
function warmUpstream() {
  const now = Date.now();
  if (now - lastWarmAt < 60_000) return;
  lastWarmAt = now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  fetch(`${AI_SERVICE_URL}/health`, { signal: controller.signal })
    .catch(() => {}).finally(() => clearTimeout(timer));
}

// The v72 turn contract asks Claude for a JSON envelope, which is a larger
// generation than v71's bare sentence. 12s was already marginal; it would have
// truncated a healthy turn. These budgets still fit inside the 30s request
// deadline with the single retry.
const UPSTREAM_TIMEOUT_MS = Number(process.env.AI_STREAM_TIMEOUT_MS || 20_000);
const UPSTREAM_COLD_TIMEOUT_MS = Number(process.env.AI_STREAM_COLD_TIMEOUT_MS || 25_000);

async function openUpstreamStream(body, attempt = 0) {
  const controller = new AbortController();
  const budget = attempt === 0 ? UPSTREAM_TIMEOUT_MS : UPSTREAM_COLD_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    return await fetch(`${AI_SERVICE_URL}/api/chat/stream`, {
      method: 'POST', headers: aiHeaders(), body: JSON.stringify(body), signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (attempt === 0) {
      console.warn(`AI stream attempt 1 failed (${error.name}: ${error.message}); retrying once.`);
      return openUpstreamStream(body, 1);
    }
    console.error(`AI stream unreachable after retry: ${error.name}: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A complete, well-formed NDJSON turn when the AI service cannot be reached. */
function streamOfflineTurn(res) {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const text = 'The private desk is with another member for a moment. Tell me what you '
    + 'need and I will make sure it reaches them \u2014 or place your brief directly '
    + 'and a member of the desk will respond personally.';
  for (const word of text.split(' ')) {
    res.write(`${JSON.stringify({ type: 'token', text: `${word} ` })}\n`);
  }
  res.write(`${JSON.stringify({ type: 'done', degraded: true })}\n`);
  return res.end();
}

// ---------------------------------------------------------------------------
// The visitor turn
// ---------------------------------------------------------------------------

router.post('/stream', async (req, res) => {
  const context = requestContext(req);
  if (isRateLimited(context.ip)) {
    return res.status(429).json({ error: 'Please allow a moment before sending another message.' });
  }

  const sessionId = String(req.body?.session_id || '');
  const message = String(req.body?.message || '').trim();
  if (!SESSION_ID_RE.test(sessionId) || !message) {
    return res.status(400).json({ error: 'A valid session and message are required.' });
  }
  if (message.length > 1200) {
    return res.status(400).json({ error: 'Please keep this message under 1,200 characters.' });
  }

  const db = dbOrNull();
  await appendMessage(db, sessionId, 'user', message, { context });

  try {
    const upstream = await openUpstreamStream({
      session_id: sessionId,
      message,
      visitor_id: context.visitorId,
      analytics_session_id: context.analyticsSessionId,
    });

    if (!upstream || !upstream.ok || !upstream.body) {
      const status = upstream ? upstream.status : 'no response';
      const detail = upstream ? await upstream.text().catch(() => '') : '';
      console.error('AI stream rejected:', status, String(detail).slice(0, 300));
      await recordTurn(db, sessionId, context, { served_by: 'unreachable', failure: `upstream_${status}` });
      return streamOfflineTurn(res);
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    let handoffMeta = null;
    let turnMeta = null;

    async function processLine(line) {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch (parseError) {
        // A malformed line must not abort a stream already half-delivered.
        console.warn('Skipped malformed AI stream line:', parseError.message);
        return;
      }

      if (event.type === 'token') assistantText += event.text || '';

      // Internal telemetry: recorded here, never forwarded to the browser.
      if (event.type === 'telemetry') {
        turnMeta = event;
        return;
      }

      if (event.type === 'handoff' && event.ready) {
        const reference = publicReference('CLC');
        const fields = event.fields || {};
        const routingPayload = {
          request_type: 'Private concierge chat',
          name: fields.name,
          service: fields.service,
          destination: fields.route,
          date: fields.timing,
          message: event.summary,
          preferred_channel: fields.preferred_contact,
        };
        const aiDecision = await routeWithAI(routingPayload);
        const routing = resolveRecipients(routingPayload, aiDecision);
        handoffMeta = {
          ...event,
          reference,
          deskId: routing.deskId,
          routingSource: routing.source,
          routingConfidence: routing.ai?.confidence ?? null,
        };
        const prepared = buildChatSummary(event, reference, routing);
        event.whatsapp_url = whatsappUrl(prepared);
        event.reference = reference;
        event.desk_id = routing.deskId;
      }

      res.write(`${JSON.stringify(event)}\n`);
    }

    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) await processLine(line);
      if (done) break;
    }
    if (buffer.trim()) await processLine(buffer);
    res.end();

    await appendMessage(db, sessionId, 'assistant', assistantText, {
      context,
      status: handoffMeta ? 'handoff_ready' : 'active',
      service: handoffMeta?.fields?.service || turnMeta?.service || null,
      handoffReady: Boolean(handoffMeta),
    });

    await recordTurn(db, sessionId, context, turnMeta, handoffMeta, assistantText);

    if (handoffMeta && db) {
      const auditId = ids.auditEventId({ type: 'chat-handoff-prepared' });
      await db.collection('audit_events').doc(auditId).set({
        type: 'chat_handoff_prepared',
        conversationId: sessionId,
        reference: handoffMeta.reference,
        service: handoffMeta.fields?.service || null,
        deskId: handoffMeta.deskId || null,
        routingSource: handoffMeta.routingSource || null,
        routingConfidence: handoffMeta.routingConfidence ?? null,
        country: context.country,
        deviceType: context.deviceType,
        createdAt: serverTimestamp(),
        expiresAt: retentionDate(365),
      }).catch((error) => console.error('Handoff audit failed:', error.message));
    }
  } catch (error) {
    console.error('Chat proxy failed:', error.message);
    if (!res.headersSent) {
      return res.status(503).json({ error: 'The private concierge is unavailable right now.' });
    }
    res.write(`${JSON.stringify({ type: 'error', message: 'The private concierge is unavailable right now.' })}\n`);
    res.end();
  }
});

/**
 * One `chat_turns` document per turn. This is the record that would have made
 * the v71 outage visible in minutes rather than days: `servedBy` says plainly
 * whether Claude answered or the visitor got a holding reply, and `failure`
 * says why.
 */
async function recordTurn(db, sessionId, context, turnMeta, handoffMeta = null, assistantText = '') {
  if (!db) return;
  const servedBy = turnMeta?.served_by || 'unknown';
  const turnId = ids.chatTurnId({ servedBy });

  await db.collection('chat_turns').doc(turnId).set({
    conversationId: sessionId,
    servedBy, // claude | fallback | policy | unreachable | unknown
    degraded: servedBy !== 'claude',
    model: turnMeta?.model || null,
    intent: turnMeta?.intent || null,
    service: turnMeta?.service || null,
    failure: turnMeta?.failure || null,
    injectionScore: turnMeta?.injection_score ?? null,
    aiLatencyMs: turnMeta?.latency_ms ?? null,
    replyCharacters: assistantText.length,
    handoffReady: Boolean(handoffMeta),
    reference: handoffMeta?.reference || null,
    deskId: handoffMeta?.deskId || null,
    country: context.country,
    deviceType: context.deviceType,
    visitorId: context.visitorId,
    analyticsSessionId: context.analyticsSessionId,
    ipHash: context.ipHash,
    createdAt: serverTimestamp(),
    expiresAt: retentionDate(90),
  }).catch((error) => console.error('Turn telemetry failed:', error.message));

  // Roll the counters up onto the conversation so a degraded conversation is
  // obvious from the parent document without opening the turn records.
  await db.collection('conversations').doc(sessionId).set({
    claudeTurns: FieldValue.increment(servedBy === 'claude' ? 1 : 0),
    fallbackTurns: FieldValue.increment(servedBy === 'fallback' || servedBy === 'unreachable' ? 1 : 0),
    blockedTurns: FieldValue.increment(servedBy === 'policy' ? 1 : 0),
    lastServedBy: servedBy,
    lastModel: turnMeta?.model || null,
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((error) => console.error('Turn rollup failed:', error.message));

  if (Number(turnMeta?.injection_score || 0) > 0) {
    const blocked = servedBy === 'policy';
    const secId = ids.securityEventId({ kind: blocked ? 'injection-blocked' : 'injection-flagged' });
    await db.collection('security_events').doc(secId).set({
      kind: blocked ? 'injection_blocked' : 'injection_flagged',
      conversationId: sessionId,
      score: turnMeta.injection_score,
      country: context.country,
      deviceType: context.deviceType,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      createdAt: serverTimestamp(),
      expiresAt: retentionDate(365),
    }).catch((error) => console.error('Security event log failed:', error.message));
  }
}

module.exports = router;
