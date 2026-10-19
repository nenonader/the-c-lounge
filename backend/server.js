// Made By Eng Nayer Nader
// The C Lounge — private API + static site host (clounge-web).
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const inquiriesRouter = require('./routes/inquiries');
const chatRouter = require('./routes/chat');
const analyticsRouter = require('./routes/analytics');
const { verifyTransport, mailerStatus } = require('./utils/mailer');
const { assertEnvironment } = require('./config/validateEnv');
const {
  SIGNATURE,
  requestContext,
  securityHeaders,
  forceHttps,
  rateLimit,
  sanitizeBody,
  requestFirewall,
  accessLog,
} = require('./middleware/security');

const app = express();
const SERVICE_VERSION = '73.0.0';
const PORT = Number(process.env.PORT || 3001);
const SITE_ROOT = path.resolve(__dirname, process.env.STATIC_SITE_ROOT || '../public');
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
  .split(',').map((value) => value.trim()).filter(Boolean);

app.disable('x-powered-by');
app.set('etag', 'strong');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

/* --- Keep-alive ----------------------------------------------------------
 * Render frees an idle instance after ~15 minutes; the next caller waits
 * 30-60s for a cold boot. A visitor opening the concierge does not wait that
 * long, which is why the site felt "off every quarter hour".
 *
 * v73 makes sleeping structurally hard rather than merely unlikely:
 *   1. this service pings ITSELF        (its own public URL keeps it warm)
 *   2. this service pings clounge-ai    (so the concierge never cold-starts)
 *   3. clounge-ai pings back            (see ai-service/app/main.py)
 *   4. ops/keepalive/* gives an external cron as an independent fourth path
 * Every ping is jittered, retried twice on failure, and bounded by a timeout,
 * so one flaky sweep can never open the 15-minute window.
 * -------------------------------------------------------------------------- */
const keepAliveState = {
  enabled: false,
  intervalMinutes: null,
  targets: [],
  pings: 0,
  failures: 0,
  lastOkAt: null,
  lastError: null,
};

async function pingOnce(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'clounge-web-keepalive/73' },
      redirect: 'follow',
    });
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    keepAliveState.lastOkAt = new Date().toISOString();
    if (keepAliveState.lastError) keepAliveState.lastError = null;
    return true;
  } catch (error) {
    // A cold start is a *slow* success, not a failure. Knock twice more before
    // calling it down.
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      return pingOnce(url, attempt + 1);
    }
    keepAliveState.failures += 1;
    keepAliveState.lastError = `${url}: ${error.message}`;
    console.warn(`[keepalive] ${url} unreachable after 3 attempts (${error.message}).`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function keepAliveTargets() {
  const self = String(process.env.SELF_URL || process.env.RENDER_EXTERNAL_URL || '')
    .trim().replace(/\/$/, '');
  const ai = String(process.env.AI_SERVICE_URL || '').trim().replace(/\/$/, '');
  const targets = [];
  const usable = (value) => /^https?:\/\//.test(value) && !/localhost|127\.0\.0\.1/.test(value);
  if (usable(self)) targets.push(`${self}/keepalive`);
  if (usable(ai)) targets.push(`${ai}/keepalive`);
  return targets;
}

function startKeepAlive() {
  if (String(process.env.KEEPALIVE_ENABLED || 'true') === 'false') return;
  const minutes = Number(process.env.AI_KEEPALIVE_MINUTES || 4);
  const targets = keepAliveTargets();
  if (minutes <= 0 || !targets.length) {
    console.log('[keepalive] disabled (no usable SELF_URL / AI_SERVICE_URL).');
    return;
  }
  keepAliveState.enabled = true;
  keepAliveState.intervalMinutes = minutes;
  keepAliveState.targets = targets;

  const jitter = Number(process.env.KEEPALIVE_JITTER_SECONDS || 45);
  const sweep = async () => {
    for (const target of targets) {
      keepAliveState.pings += 1;
      await pingOnce(target);
    }
  };
  const schedule = () => {
    const delay = minutes * 60_000 + Math.random() * jitter * 1000;
    setTimeout(() => { sweep().finally(schedule); }, delay).unref();
  };
  setTimeout(() => { sweep().finally(schedule); }, 5_000).unref();
  console.log(`[keepalive] every ~${minutes} min -> ${targets.join(', ')}`);
}

/* --- Edge hardening ------------------------------------------------------ */
app.use(requestContext());
app.use(accessLog());
app.use(forceHttps());
app.use(requestFirewall());
app.use(securityHeaders({ connectSrc: allowedOrigins }));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Accept', 'X-Request-Id', 'X-Visitor-Id', 'X-Analytics-Session'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(sanitizeBody());

/* --- API ----------------------------------------------------------------- */
// The analytics beacon fires many times per page. Give it its own bucket so a
// normal browsing session can never exhaust the budget that the contact form
// and the concierge need — previously one busy visitor could 429 their own
// inquiry submission.
app.use('/api/analytics', rateLimit({
  name: 'analytics',
  windowMs: 60_000,
  max: Number(process.env.ANALYTICS_RATE_LIMIT || 240),
  message: 'Too many analytics events.',
}));
app.use('/api', rateLimit({ name: 'api', windowMs: 60_000, max: Number(process.env.API_RATE_LIMIT || 90) }));
app.use('/api', inquiriesRouter);
// The chat router declares '/suggestions', '/new-session' and '/stream'. It
// MUST be mounted at '/api/chat' so the composed URLs match what
// public/assets/js/config.js builds (CL_CHAT_ENDPOINT = '/api/chat').
// Mounting it at '/api' yields /api/stream and every chat call 404s, which the
// browser reports as "I cannot reach the private concierge at this moment".
app.use('/api/chat', chatRouter);
app.use('/api', analyticsRouter);

/**
 * The cheapest wake target on the service. Uptime monitors and the external
 * cron hit this; it touches nothing but the clock, so a monitor can poll it
 * every few minutes for free.
 */
app.get('/keepalive', keepAliveHandler);
app.head('/keepalive', keepAliveHandler);
app.get('/api/keepalive', keepAliveHandler);

function keepAliveHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.json({
    ok: true,
    awakeForSeconds: Math.round(process.uptime()),
    keepalive: keepAliveState,
    signature: SIGNATURE,
  });
}

app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'the-c-lounge-private-api',
    version: SERVICE_VERSION,
    mail: mailerStatus(),
    keepalive: keepAliveState,
    aiService: process.env.AI_SERVICE_URL || null,
    uptimeSeconds: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
    signature: SIGNATURE,
  });
});

app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found.', request_id: req.requestId });
});

/* --- Static site --------------------------------------------------------- */
app.use(express.static(SITE_ROOT, {
  etag: true,
  dotfiles: 'ignore',
  index: 'index.html',
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (/\.(?:jpg|jpeg|png|webp|avif|svg|mp4|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    if (/\.(?:css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
    if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.use((req, res) => {
  res.status(404).sendFile(path.join(SITE_ROOT, '404.html'), (error) => {
    if (error) res.status(404).send('Not found');
  });
});

/* --- Error boundary ------------------------------------------------------ */
app.use((error, req, res, _next) => {
  console.error(`[${req.requestId}] Request failed:`, error.message);
  const status = error.statusCode || (error.message === 'Origin not allowed' ? 403 : 500);
  res.status(status).json({
    success: false,
    message: status < 500 ? error.message : 'The private desk could not process this request.',
    request_id: req.requestId,
  });
});

/* --- Lifecycle ----------------------------------------------------------- */
function start() {
  // Audit configuration before binding the port. In production a hard error
  // stops the boot with a specific reason instead of serving a broken site.
  assertEnvironment();

  const server = app.listen(PORT, () => {
    console.log(`${SIGNATURE}`);
    console.log(`The C Lounge private API listening on :${PORT}`);
  });
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;

  if (process.env.SMTP_VERIFY_ON_START !== 'false') {
    const mail = mailerStatus();
    console.log(`[mail] transport=${mail.transport} port=${mail.smtpPort}`);
    verifyTransport()
      .then(() => console.log('[mail] transport verified.'))
      .catch((error) => {
        console.warn('[mail] transport NOT ready:', error.message);
        if (mail.smtpLikelyBlockedOnRenderFreeTier) {
          console.warn(
            '[mail] Render blocks outbound SMTP ports 25/465/587 on FREE web services '
            + '(port 25 on every plan). Either upgrade this service to a paid instance, '
            + 'or set RESEND_API_KEY / BREVO_API_KEY to send over HTTPS instead.'
          );
        }
      });
  }

  startKeepAlive();

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      console.log(`${signal} received — closing the private desk.`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  }
  process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
  return server;
}

if (require.main === module) start();

module.exports = { app, start };
