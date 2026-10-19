// Made By Eng Nayer Nader
const nodemailer = require('nodemailer');
const { escapeHtml } = require('./validate');

let transporter = null;

// Render blocks outbound SMTP on ports 25, 465 and 587 for FREE web services,
// and port 25 on every plan. A blocked port does not refuse the connection --
// it black-holes it, so nodemailer sits on its 2-minute default timeout while
// Express kills the request at 30s. The visitor sees "could not reach our
// server" even though their brief was already saved to Firestore.
//
// Two defences below:
//   1. Hard, short socket timeouts, so a blocked port fails in seconds with a
//      named error instead of hanging past the request deadline.
//   2. An HTTPS email provider (Resend or Brevo) used in preference to SMTP
//      when configured. HTTPS is never blocked, so this works on the free tier
//      with no upgrade.
const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 10_000);
const MAIL_DEADLINE_MS = Number(process.env.MAIL_DEADLINE_MS || 15_000);

function httpProvider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  return null;
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** What the mail layer will actually do, for /api/health and for diagnosis. */
function mailerStatus() {
  const provider = httpProvider();
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    transport: provider || (smtpConfigured() ? 'smtp' : 'none'),
    httpProvider: provider,
    smtpConfigured: smtpConfigured(),
    smtpPort: port,
    smtpTimeoutMs: SMTP_TIMEOUT_MS,
    // Surfaced because this is the single most common cause of "the form
    // does not work" on this host, and it is invisible from the code.
    smtpLikelyBlockedOnRenderFreeTier: !provider && [25, 465, 587].includes(port),
  };
}

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!smtpConfigured()) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in backend/.env'
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: Number(SMTP_PORT) === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  return transporter;
}

/** Reject after ms rather than inheriting a library's long default. */
function withDeadline(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms (outbound port blocked?)`)),
      ms
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function sendOverHttp(provider, { from, fromName, to, cc, replyTo, subject, html }) {
  const recipients = (Array.isArray(to) ? to : String(to).split(',')).map((a) => a.trim()).filter(Boolean);
  const copies = (cc || []).filter(Boolean);

  if (provider === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${from}>`,
        to: recipients,
        cc: copies.length ? copies : undefined,
        reply_to: replyTo || undefined,
        subject,
        html,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return { provider, messageId: (await response.json()).id || null };
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: fromName },
      to: recipients.map((email) => ({ email })),
      cc: copies.length ? copies.map((email) => ({ email })) : undefined,
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject,
      htmlContent: html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Brevo responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return { provider, messageId: (await response.json()).messageId || null };
}

/** One message, over whichever transport is configured, with a hard deadline. */
async function deliver(message) {
  const provider = httpProvider();
  if (provider) {
    return withDeadline(sendOverHttp(provider, message), MAIL_DEADLINE_MS, `${provider} API`);
  }
  const t = getTransporter();
  return withDeadline(
    t.sendMail({
      from: `"${message.fromName}" <${message.from}>`,
      to: message.to,
      cc: message.cc && message.cc.length ? message.cc : undefined,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
    }),
    MAIL_DEADLINE_MS,
    'SMTP send'
  );
}

async function verifyTransport() {
  const provider = httpProvider();
  if (provider) {
    console.log(`Mail transport: ${provider} HTTPS API (SMTP not used).`);
    return;
  }
  const t = getTransporter();
  await withDeadline(t.verify(), SMTP_TIMEOUT_MS, 'SMTP verify');
}

const FIELD_LABELS = {
  title: 'Title',
  name: 'Full Name',
  organization: 'Company / Organization',
  email: 'Email Address',
  whatsapp: 'Primary Contact',
  preferred_channel: 'Preferred Reply',
  service: 'Service Required',
  destination: 'Preferred Destination / Route',
  date: 'Local Date / Time',
  passengers: 'Number of Passengers',
  urgency: 'Urgency Level',
  tier: 'Membership Tier',
  country: 'Country of Residence',
  message: 'Notes',
};

function buildInternalHtml(payload, reference, routing) {
  const isMembership = payload.request_type === 'Membership application';
  const order = isMembership
    ? ['name', 'title', 'tier', 'country', 'whatsapp', 'email', 'message']
    : [
        'title',
        'name',
        'organization',
        'email',
        'whatsapp',
        'preferred_channel',
        'service',
        'destination',
        'date',
        'passengers',
        'urgency',
        'message',
      ];

  const rows = order
    .filter((key) => payload[key])
    .map(
      (key) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#8c7143;font-weight:600;white-space:nowrap;vertical-align:top">${
          FIELD_LABELS[key] || key
        }</td><td style="padding:6px 0;color:#111">${escapeHtml(payload[key]).replace(/\n/g, '<br/>')}</td></tr>`
    )
    .join('');

  const heading = isMembership ? 'New Membership Application' : 'New Private Enquiry';

  return `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto">
      <p style="margin:0 0 8px;color:#8c7143;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(reference)}</p>
      <h2 style="color:#111;border-bottom:2px solid #c9a467;padding-bottom:10px">${heading}</h2>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      <div style="margin-top:22px;padding:16px;background:#f6f3ed;border-left:2px solid #c9a467">
        <strong style="display:block;margin-bottom:7px">Routing</strong>
        <span>${escapeHtml(routing.deskId)} · ${escapeHtml(routing.source)}</span>
        ${routing.ai?.summary ? `<p style="margin:9px 0 0">${escapeHtml(routing.ai.summary)}</p>` : ''}
      </div>
      <p style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;color:#888;font-size:13px">
        Submitted via thecloungeworld.com &middot; Reply directly to this email to respond to ${escapeHtml(
          payload.name
        )}.
      </p>
    </div>`;
}

function buildConfirmationHtml(payload, reference) {
  const isMembership = payload.request_type === 'Membership application';
  return `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#222">
      <h2 style="color:#111">Thank you, ${escapeHtml(payload.name)}.</h2>
      <p>${
        isMembership
          ? 'Your membership application has been placed with the desk. A member of The C Lounge will contact you in strict confidence.'
          : 'Your enquiry has been placed with the desk. A member of The C Lounge will contact you in strict confidence.'
      }</p>
      <p style="margin:20px 0;padding:12px 14px;background:#f6f3ed;color:#8c7143;font-size:12px;letter-spacing:.08em">Private reference: ${escapeHtml(reference)}</p>
      <p style="margin-top:24px;color:#888;font-size:13px">The C Lounge &middot; Beyond Access. Beyond Borders.</p>
    </div>`;
}

   
                                                                     
                                                                 
                                                                      
                                              
   
async function sendInquiryEmails({ payload, to, cc, reference, routing }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const isMembership = payload.request_type === 'Membership application';

  // The desk notification is the one that must succeed; a failure here is
  // thrown so the route can mark the inquiry notification_failed.
  const internal = await deliver({
    from: fromAddress,
    fromName: 'The C Lounge Website',
    to,
    cc,
    replyTo: payload.email,
    subject: isMembership
      ? `New Membership Application — ${payload.tier} (${payload.name})`
      : `New Private Enquiry — ${payload.service || 'General'} (${payload.name})`,
    html: buildInternalHtml(payload, reference, routing),
  });

  // The visitor's receipt is a courtesy. Never let it fail the submission.
  let confirmation = null;
  try {
    confirmation = await deliver({
      from: fromAddress,
      fromName: 'The C Lounge',
      to: payload.email,
      subject: isMembership
        ? 'The C Lounge — Application Received'
        : 'The C Lounge — Enquiry Received',
      html: buildConfirmationHtml(payload, reference),
    });
  } catch (err) {
    console.error('Confirmation email failed to send:', err.message);
  }

  return { internal, confirmation };
}

module.exports = { getTransporter, verifyTransport, sendInquiryEmails, mailerStatus, deliver };
