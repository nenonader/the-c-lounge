// Made By Eng Nayer Nader
// Run: node --test tests/validateEnv.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { auditEnvironment } = require('../config/validateEnv');

const GOOD_PRODUCTION = Object.freeze({
  NODE_ENV: 'production',
  AI_SERVICE_KEY: 'a'.repeat(64),
  LOG_HASH_SALT: 'b'.repeat(64),
  SMTP_HOST: 'smtp.zoho.com',
  SMTP_USER: 'private@thecloungeworld.com',
  SMTP_PASS: 'real-app-password',
  AI_SERVICE_URL: 'https://clounge-ai.onrender.com',
  ALLOWED_ORIGINS: 'https://clounge-web.onrender.com',
  WHATSAPP_NUMBER: '201114399976',
  DESK_CONCIERGE: 'Concierge@TheCLoungeWorld.com',
  DESK_EXECUTIVE: 'Executive@TheCLoungeWorld.com',
  DESK_PRIVATE: 'Private@TheCLoungeWorld.com',
  FIREBASE_SERVICE_ACCOUNT_BASE64: 'eyJ0eXBlIjoic2VydmljZV9hY2NvdW50In0=',
  TRUST_PROXY: 'true',
  FORCE_HTTPS: 'true',
  // HTTPS mail provider: the clean baseline, because SMTP alone draws a
  // warning on Render (ports 25/465/587 are blocked on free web services).
  RESEND_API_KEY: 're_live_placeholder',
  // v73 keep-alive: Render injects RENDER_EXTERNAL_URL, but pin SELF_URL here
  // so the baseline environment is explicit rather than platform-dependent.
  SELF_URL: 'https://clounge-web.onrender.com',
});

// hasFirebaseCredential() reads process.env directly, so mirror the credential
// there for the duration of each case.
function withFirebase(env, run) {
  const previous = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  } else {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  }
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    else process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = previous;
  }
}

const audit = (env) => withFirebase(env, () => auditEnvironment(env));

test('a fully configured production environment is clean', () => {
  const { errors, warnings } = audit(GOOD_PRODUCTION);
  assert.deepEqual(errors, [], `unexpected errors: ${errors.join(' | ')}`);
  assert.deepEqual(warnings, [], `unexpected warnings: ${warnings.join(' | ')}`);
});

test('a missing shared AI key is a hard error in production', () => {
  const { errors } = audit({ ...GOOD_PRODUCTION, AI_SERVICE_KEY: '' });
  assert.ok(errors.some((line) => line.startsWith('AI_SERVICE_KEY')));
});

test('the same gap is only a warning in development', () => {
  const { errors, warnings } = audit({
    ...GOOD_PRODUCTION, NODE_ENV: 'development', AI_SERVICE_KEY: '',
  });
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((line) => line.startsWith('AI_SERVICE_KEY')));
});

test('a missing log salt is caught — it silently ruins every analytics record', () => {
  const { errors } = audit({ ...GOOD_PRODUCTION, LOG_HASH_SALT: '' });
  assert.ok(errors.some((line) => line.startsWith('LOG_HASH_SALT')));
});

test('placeholder values left over from .env.example are rejected', () => {
  const withPlaceholders = audit({
    ...GOOD_PRODUCTION,
    AI_SERVICE_KEY: 'REPLACE_WITH_SHARED_64_HEX_SERVICE_KEY',
    SMTP_PASS: 'REPLACE_WITH_ZOHO_APP_PASSWORD',
  });
  assert.ok(withPlaceholders.errors.some((line) => line.includes('AI_SERVICE_KEY still contains')));
  assert.ok(withPlaceholders.errors.some((line) => line.includes('SMTP_PASS still contains')));
});

test('a malformed log salt warns without blocking the boot', () => {
  const { errors, warnings } = audit({ ...GOOD_PRODUCTION, LOG_HASH_SALT: 'short' });
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((line) => line.includes('64 hex characters')));
});

test('TRUST_PROXY off behind Render is flagged', () => {
  const { warnings } = audit({ ...GOOD_PRODUCTION, TRUST_PROXY: 'false' });
  assert.ok(warnings.some((line) => line.includes('TRUST_PROXY')));
});

test('localhost left in production origins is flagged', () => {
  const { warnings } = audit({
    ...GOOD_PRODUCTION,
    ALLOWED_ORIGINS: 'http://localhost:3001,https://clounge-web.onrender.com',
  });
  assert.ok(warnings.some((line) => line.includes('localhost')));
});

test('prompt logging left on is flagged as a privacy risk', () => {
  const { warnings } = audit({ ...GOOD_PRODUCTION, LOG_PROMPTS: 'true' });
  assert.ok(warnings.some((line) => line.includes('LOG_PROMPTS')));
});

test('SMTP-only mail on a Render-blocked port is flagged', () => {
  const env = { ...GOOD_PRODUCTION };
  delete env.RESEND_API_KEY;
  const { errors, warnings } = audit(env);
  assert.deepEqual(errors, [], 'this is a warning, not a boot blocker');
  assert.ok(
    warnings.some((line) => line.includes('blocks outbound SMTP')),
    'port 465 with no HTTPS provider must warn',
  );
});

test('an HTTPS mail provider clears the SMTP port warning', () => {
  for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY']) {
    const env = { ...GOOD_PRODUCTION };
    delete env.RESEND_API_KEY;
    env[key] = 'configured';
    const { warnings } = audit(env);
    assert.ok(
      !warnings.some((line) => line.includes('blocks outbound SMTP')),
      `${key} should satisfy the mail transport check`,
    );
  }
});

test('port 2525 is not flagged — it is not an SMTP submission port', () => {
  const env = { ...GOOD_PRODUCTION, SMTP_PORT: '2525' };
  delete env.RESEND_API_KEY;
  const { warnings } = audit(env);
  assert.ok(!warnings.some((line) => line.includes('blocks outbound SMTP')));
});

test('a missing Firebase credential blocks a production boot', () => {
  const env = { ...GOOD_PRODUCTION };
  delete env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const { errors } = audit(env);
  assert.ok(errors.some((line) => line.includes('Firebase')));
});

test('v73: keep-alive warns only when both self-URL variables are absent', () => {
  const withNeither = { ...GOOD_PRODUCTION };
  delete withNeither.SELF_URL;
  assert.ok(audit(withNeither).warnings.some((line) => line.includes('keep-alive')));

  const withRenderOnly = { ...withNeither, RENDER_EXTERNAL_URL: 'https://clounge-web.onrender.com' };
  assert.deepEqual(audit(withRenderOnly).warnings, []);
});
