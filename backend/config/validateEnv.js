// Made By Eng Nayer Nader
// The C Lounge — boot-time configuration audit.
//
// Why this file exists: almost every production failure this project has had so
// far was a *silent* one. A missing AI_SERVICE_KEY produced a working site with
// a dead concierge. A missing LOG_HASH_SALT collapsed every visitor into the
// same 'not-configured' hash, quietly destroying the analytics. Nothing
// crashed, so nothing got noticed.
//
// This module turns those into a loud, specific line in the Render deploy log
// — and, for the errors that make the service actively wrong rather than merely
// degraded, refuses to boot in production.

const REQUIRED_IN_PRODUCTION = [
  ['AI_SERVICE_KEY', 'the private concierge cannot authenticate to clounge-ai'],
  ['LOG_HASH_SALT', 'every visitor would share one IP hash and analytics would be meaningless'],
  ['SMTP_HOST', 'inquiry emails cannot be delivered to the desks'],
  ['SMTP_USER', 'inquiry emails cannot be delivered to the desks'],
  ['SMTP_PASS', 'inquiry emails cannot be delivered to the desks'],
];

const RECOMMENDED = [
  ['AI_SERVICE_URL', 'defaults to http://127.0.0.1:8001, which is wrong on Render'],
  ['ALLOWED_ORIGINS', 'defaults to localhost only, so the live site is blocked by CORS'],
  ['WHATSAPP_NUMBER', 'handoff links fall back to the hardcoded desk number'],
  ['DESK_CONCIERGE', 'desk routing falls back to hardcoded addresses'],
  ['DESK_EXECUTIVE', 'desk routing falls back to hardcoded addresses'],
  ['DESK_PRIVATE', 'desk routing falls back to hardcoded addresses'],
];

const HEX_64 = /^[0-9a-f]{64}$/i;

function present(name) {
  return String(process.env[name] || '').trim().length > 0;
}

function hasFirebaseCredential() {
  return present('FIREBASE_SERVICE_ACCOUNT_BASE64')
    || present('FIREBASE_SERVICE_ACCOUNT_JSON')
    || present('FIREBASE_SERVICE_ACCOUNT_PATH')
    || present('GOOGLE_APPLICATION_CREDENTIALS');
}

/**
 * Inspect the environment and return { errors, warnings }.
 * Pure: does no logging and never exits, so it is trivially testable.
 */
function auditEnvironment(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  const check = (name) => String(env[name] || '').trim().length > 0;

  // v73 keep-alive. Render injects RENDER_EXTERNAL_URL on every service, so
  // either variable satisfies the self-ping; only warn when BOTH are absent.
  if (!check('SELF_URL') && !check('RENDER_EXTERNAL_URL')) {
    warnings.push('Neither SELF_URL nor RENDER_EXTERNAL_URL is set — the self-ping half '
      + 'of the keep-alive is disabled and this instance can still be spun down when idle.');
  }

  for (const [name, consequence] of REQUIRED_IN_PRODUCTION) {
    if (check(name)) continue;
    const line = `${name} is not set — ${consequence}.`;
    if (isProduction) errors.push(line);
    else warnings.push(line);
  }

  for (const [name, consequence] of RECOMMENDED) {
    if (!check(name)) warnings.push(`${name} is not set — ${consequence}.`);
  }

  if (!hasFirebaseCredential()) {
    const line = 'No Firebase credential is configured — inquiries and analytics cannot be recorded.';
    if (isProduction) errors.push(line); else warnings.push(line);
  }

  // Shape checks: a key that is present but obviously wrong is worse than a
  // missing one, because it fails at request time instead of at boot.
  if (check('LOG_HASH_SALT') && !HEX_64.test(String(env.LOG_HASH_SALT).trim())) {
    warnings.push('LOG_HASH_SALT is set but is not 64 hex characters — regenerate it with: openssl rand -hex 32');
  }
  if (check('AI_SERVICE_KEY') && String(env.AI_SERVICE_KEY).trim().length < 32) {
    warnings.push('AI_SERVICE_KEY is shorter than 32 characters — use a 64-hex shared secret.');
  }
  if (check('AI_SERVICE_KEY') && /REPLACE_WITH/i.test(String(env.AI_SERVICE_KEY))) {
    errors.push('AI_SERVICE_KEY still contains the placeholder value from .env.example.');
  }
  if (check('SMTP_PASS') && /REPLACE_WITH/i.test(String(env.SMTP_PASS))) {
    errors.push('SMTP_PASS still contains the placeholder value from .env.example.');
  }

  // A relative Firebase path is the classic Render trap: it works locally and
  // silently fails on the host, because Render mounts secret files at the
  // service root and /etc/secrets, not wherever the repo keeps them.
  const firebasePath = String(env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (isProduction && firebasePath && !firebasePath.startsWith('/')) {
    warnings.push(
      `FIREBASE_SERVICE_ACCOUNT_PATH="${firebasePath}" is relative. On Render a Secret File `
      + 'lives at /etc/secrets/<filename>. Prefer FIREBASE_SERVICE_ACCOUNT_BASE64, or set an absolute path.'
    );
  }

  if (isProduction && (env.TEMPERATURE || env.TOP_P || env.TOP_K)) {
    warnings.push(
      'TEMPERATURE / TOP_P / TOP_K are set. Sonnet-5-class models reject non-default '
      + 'sampling parameters with HTTP 400; the AI service ignores them, but delete them to avoid confusion.'
    );
  }

  // SMTP over a blocked port does not fail -- it hangs until the request
  // deadline, so the visitor sees a network error on a brief that was in fact
  // saved. Flag the configuration that produces it.
  const smtpPort = Number(env.SMTP_PORT || 465);
  const httpMail = check('RESEND_API_KEY') || check('BREVO_API_KEY');
  if (isProduction && !httpMail && [25, 465, 587].includes(smtpPort)) {
    warnings.push(
      `Mail is configured for SMTP on port ${smtpPort}. Render blocks outbound SMTP on `
      + '25/465/587 for FREE web services (and port 25 on every plan). If this service is on '
      + 'the free tier, either upgrade the instance or set RESEND_API_KEY / BREVO_API_KEY to '
      + 'send over HTTPS, which is never blocked.'
    );
  }

  if (isProduction && env.TRUST_PROXY !== 'true') {
    warnings.push('TRUST_PROXY is not "true" — behind Render every visitor will appear to share one IP address, breaking rate limiting and analytics.');
  }
  if (isProduction && env.FORCE_HTTPS !== 'true') {
    warnings.push('FORCE_HTTPS is not "true" in production.');
  }
  if (isProduction && String(env.ALLOWED_ORIGINS || '').includes('localhost')) {
    warnings.push('ALLOWED_ORIGINS contains localhost in production — remove it.');
  }
  if (env.LOG_PROMPTS === 'true') {
    warnings.push('LOG_PROMPTS is enabled — visitor messages will be written to the log. Never leave this on in production.');
  }

  return { errors, warnings, isProduction };
}

/**
 * Audit, print, and (in production, on a hard error) refuse to start.
 * A service that boots into a broken state is harder to diagnose than one that
 * refuses to boot and says exactly why.
 */
function assertEnvironment({ exitOnError = true, logger = console } = {}) {
  const { errors, warnings, isProduction } = auditEnvironment(process.env);

  for (const warning of warnings) logger.warn(`[config] WARNING  ${warning}`);
  for (const error of errors) logger.error(`[config] ERROR    ${error}`);

  if (!errors.length && !warnings.length) {
    logger.log('[config] Environment audit passed.');
  }

  if (errors.length && isProduction && exitOnError) {
    logger.error('[config] Refusing to start with an invalid production configuration.');
    logger.error('[config] Fix these in Render → clounge-web → Environment, then redeploy.');
    process.exit(1);
  }

  return { errors, warnings };
}

module.exports = { auditEnvironment, assertEnvironment, REQUIRED_IN_PRODUCTION, RECOMMENDED };
