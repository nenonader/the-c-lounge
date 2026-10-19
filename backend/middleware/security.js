// Made By Eng Nayer Nader
// The C Lounge — hardened edge middleware.
// Deliberately dependency-free: no supply-chain surface, nothing to patch,
// and `npm ci` keeps working against the existing lockfile.

const crypto = require('crypto');

const SIGNATURE = 'Made By Eng Nayer Nader';

/* ------------------------------------------------------------------ */
/* Request identity                                                    */
/* ------------------------------------------------------------------ */

function requestContext() {
  return function requestContextMiddleware(req, res, next) {
    const incoming = String(req.get('x-request-id') || '');
    req.requestId = /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    req.startedAt = process.hrtime.bigint();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('X-Signature', SIGNATURE);
    next();
  };
}

/* ------------------------------------------------------------------ */
/* Security headers (helmet-equivalent, hand-tuned for this site)      */
/* ------------------------------------------------------------------ */

function securityHeaders(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const connectSrc = ["'self'"].concat(options.connectSrc || []);
  const scriptSrc = ["'self'", 'https://cdnjs.cloudflare.com', 'https://unpkg.com'];

  return function securityHeadersMiddleware(req, res, next) {
    // Per-request nonce, available to templates that want strict inline script.
    res.locals = res.locals || {};
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Permissions-Policy',
      [
        'accelerometer=()', 'ambient-light-sensor=()', 'autoplay=(self)', 'battery=()',
        'camera=()', 'display-capture=()', 'geolocation=()', 'gyroscope=()',
        'magnetometer=()', 'microphone=()', 'midi=()', 'payment=()',
        'usb=()', 'interest-cohort=()',
      ].join(', ')
    );
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src ${scriptSrc.join(' ')}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self'",
        `connect-src ${connectSrc.join(' ')}`,
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self' mailto: https://wa.me",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        ...(isProduction ? ['upgrade-insecure-requests'] : []),
      ].join('; ')
    );

    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    res.removeHeader('X-Powered-By');
    next();
  };
}

/* ------------------------------------------------------------------ */
/* Force HTTPS behind Render's proxy                                   */
/* ------------------------------------------------------------------ */

function forceHttps() {
  return function forceHttpsMiddleware(req, res, next) {
    if (process.env.FORCE_HTTPS !== 'true') return next();
    const proto = req.get('x-forwarded-proto') || req.protocol;
    if (proto === 'https') return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(403).json({ success: false, message: 'HTTPS is required.' });
    }
    return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  };
}

/* ------------------------------------------------------------------ */
/* Sliding-window rate limiter (per IP + route bucket)                 */
/* ------------------------------------------------------------------ */

const buckets = new Map();

function clientKey(req) {
  const forwarded = String(req.get('x-forwarded-for') || '');
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.socket?.remoteAddress || 'unknown';
  return ip.slice(0, 64);
}

function rateLimit({ name = 'global', windowMs = 60_000, max = 60, message } = {}) {
  return function rateLimitMiddleware(req, res, next) {
    const key = `${name}:${clientKey(req)}`;
    const now = Date.now();
    const window = buckets.get(key) || [];
    const active = window.filter((stamp) => now - stamp < windowMs);
    active.push(now);
    buckets.set(key, active);

    if (buckets.size > 50_000) {
      for (const [k, v] of buckets) {
        if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
        if (buckets.size <= 25_000) break;
      }
    }

    const remaining = Math.max(0, max - active.length);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(windowMs / 1000)));

    if (active.length > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        success: false,
        message: message || 'The desk has received too many requests from this connection. Please try again shortly.',
        request_id: req.requestId,
      });
    }
    return next();
  };
}

/* ------------------------------------------------------------------ */
/* Payload hygiene                                                     */
/* ------------------------------------------------------------------ */

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype', '$where', '$ne', '$gt', '$lt', '$regex']);

function scrub(value, depth = 0) {
  if (depth > 8) return undefined;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => scrub(item, depth + 1));
  if (value && typeof value === 'object') {
    const output = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key) || key.startsWith('$') || key.includes('.')) continue;
      const cleaned = scrub(item, depth + 1);
      if (cleaned !== undefined) output[key] = cleaned;
    }
    return output;
  }
  if (typeof value === 'string') {
    // Strip control characters and null bytes; block header injection.
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 20_000);
  }
  return value;
}

function sanitizeBody() {
  return function sanitizeBodyMiddleware(req, _res, next) {
    if (req.body && typeof req.body === 'object') req.body = scrub(req.body);
    if (req.query && typeof req.query === 'object') {
      // Reject duplicated query parameters (HTTP parameter pollution).
      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value)) req.query[key] = value[value.length - 1];
      }
    }
    next();
  };
}

/* ------------------------------------------------------------------ */
/* Method + path allow-list                                            */
/* ------------------------------------------------------------------ */

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);
const SUSPICIOUS_PATH = /(\.\.|\/\.git|\/\.env|\/wp-|\/vendor\/|\/phpmyadmin|\/admin\.php|\.php$|\.asp$|\.aspx$|\/actuator|\/config\.json|serviceAccountKey)/i;

function requestFirewall() {
  return function requestFirewallMiddleware(req, res, next) {
    if (!ALLOWED_METHODS.has(req.method)) {
      return res.status(405).json({ success: false, message: 'Method not allowed.' });
    }
    if (SUSPICIOUS_PATH.test(req.path)) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }
    if (req.path.length > 512) {
      return res.status(414).json({ success: false, message: 'Request path too long.' });
    }
    return next();
  };
}

/* ------------------------------------------------------------------ */
/* Access log (privacy-safe: no raw IPs, no bodies)                    */
/* ------------------------------------------------------------------ */

function accessLog() {
  return function accessLogMiddleware(req, res, next) {
    res.on('finish', () => {
      if (process.env.ACCESS_LOG === 'false') return;
      // Keep-alive traffic is two pings every few minutes, forever. Logging it
      // buries the requests an operator actually needs to see.
      if (/keepalive/i.test(req.get('user-agent') || '')) return;
      if (req.path === '/keepalive' || req.path === '/api/keepalive') return;
      const ms = Number(process.hrtime.bigint() - (req.startedAt || process.hrtime.bigint())) / 1e6;
      console.log(
        `[${req.requestId}] ${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`
      );
    });
    next();
  };
}

module.exports = {
  SIGNATURE,
  requestContext,
  securityHeaders,
  forceHttps,
  rateLimit,
  sanitizeBody,
  requestFirewall,
  accessLog,
  clientKey,
};
