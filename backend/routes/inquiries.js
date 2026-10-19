// Made By Eng Nayer Nader
const express = require('express');
const multer = require('multer');
const { validateSubmission } = require('../utils/validate');
const { resolveRecipients } = require('../config/routing');
const { sendInquiryEmails } = require('../utils/mailer');
const { getDb, serverTimestamp } = require('../config/firebaseAdmin');
const { routeWithAI } = require('../utils/aiRouter');
const { hashIp, safeAgent, publicReference } = require('../utils/privacy');
const { buildInquirySummary, whatsappUrl } = require('../utils/whatsapp');

const router = express.Router();
const parseMultipart = multer({ limits: { fields: 40, fieldSize: 20_000 } }).none();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.INQUIRY_RATE_LIMIT || 8);
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function retentionDate() {
  const days = Number(process.env.PII_RETENTION_DAYS || 180);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function safeAudit(db, data) {
  try {
    await db.collection('audit_events').add({ ...data, createdAt: serverTimestamp(), expiresAt: retentionDate() });
  } catch (error) {
    console.error('Audit event write failed:', error.message);
  }
}

router.post('/inquiries', parseMultipart, async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, message: 'The desk has received too many requests from this connection. Please try again shortly.' });
  }

  let payload;
  try {
    payload = validateSubmission(req.body);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
  if (payload._hp) return res.json({ success: true, message: 'Received.' });

  const reference = publicReference(payload.request_type === 'Membership application' ? 'CLM' : 'CL');
  const context = {
    reference,
    ipHash: hashIp(ip),
    ipAddress: ip,
    visitorId: String(req.get('x-visitor-id') || '').slice(0, 120) || null,
    analyticsSessionId: String(req.get('x-analytics-session') || '').slice(0, 120) || null,
    userAgent: safeAgent(req.get('user-agent')),
    origin: safeAgent(req.get('origin') || req.get('referer')),
  };

  let db;
  try {
    db = getDb();
  } catch (error) {
    console.error('Firebase initialization failed:', error.message);
    return res.status(503).json({ success: false, message: 'The private desk is temporarily unavailable. Please use the direct email option.' });
  }

  const aiDecision = await routeWithAI(payload);
  const routing = resolveRecipients(payload, aiDecision);
  const { _hp, ...storablePayload } = payload;
  const inquiryRef = db.collection('inquiries').doc(reference);

  try {
    await inquiryRef.set({
      ...storablePayload,
      reference,
      status: 'received',
      deskId: routing.deskId,
      routingSource: routing.source,
      routingConfidence: routing.ai?.confidence ?? null,
      source: process.env.SITE_SOURCE || 'thecloungeworld.com',
      metadata: context,
      consent: { privacy: true, receivedAt: serverTimestamp(), policyVersion: '2026-08' },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: retentionDate(),
    });
    await db.collection('routing_logs').add({
      reference,
      chosenDesk: routing.deskId,
      fallbackDesk: routing.fallbackDesk,
      source: routing.source,
      confidence: routing.ai?.confidence ?? null,
      priority: routing.ai?.priority || (payload.urgency === 'Immediate' ? 'immediate' : 'routine'),
      rationale: routing.ai?.rationale || 'Explicit service rule',
      createdAt: serverTimestamp(),
      expiresAt: retentionDate(),
    });
  } catch (error) {
    console.error('Inquiry persistence failed:', error.message);
    return res.status(503).json({ success: false, message: 'Your brief could not be recorded safely. Please try again or use direct email.' });
  }

  try {
    await sendInquiryEmails({ payload, to: routing.to, cc: routing.cc, reference, routing });
    await inquiryRef.update({ status: 'notified', notifiedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await safeAudit(db, { reference, type: 'inquiry_notified', deskId: routing.deskId, actor: 'website' });
  } catch (error) {
    console.error('Desk notification failed:', error.message);
    await inquiryRef.update({ status: 'notification_failed', updatedAt: serverTimestamp() }).catch(() => {});
    await safeAudit(db, { reference, type: 'notification_failed', deskId: routing.deskId, actor: 'website' });
    // The brief IS saved. Do not tell the visitor their submission failed --
    // that is both untrue and invites a duplicate. Report success, give them
    // the reference, and surface the desk address so they can follow up.
    const preparedFallback = buildInquirySummary(payload, reference, routing);
    return res.status(201).json({
      success: true,
      reference,
      notified: false,
      message: 'Your private brief is recorded with the desk under reference '
        + `${reference}. Our notification channel is briefly unavailable, so please quote this `
        + 'reference if you follow up by email or WhatsApp.',
      desk_email: routing.to,
      whatsapp_url: whatsappUrl(preparedFallback),
    });
  }

  const preparedSummary = buildInquirySummary(payload, reference, routing);
  return res.status(201).json({
    success: true,
    message: 'Your private brief is with the desk.',
    reference,
    whatsapp_url: payload.preferred_channel === 'WhatsApp' || payload.urgency === 'Immediate'
      ? whatsappUrl(preparedSummary)
      : null,
  });
});

module.exports = router;
