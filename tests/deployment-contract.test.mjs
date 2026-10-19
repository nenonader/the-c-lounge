// Made By Eng Nayer Nader
// The C Lounge — deployment contract checks.
//
// These guard the class of defect that costs the most time on this project:
// configuration that is syntactically fine, passes every unit test, deploys
// without error, and produces a website that is quietly wrong.
//
// Run: node tests/deployment-contract.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

let passed = 0;
const failures = [];

function check(name, condition, hint = '') {
  if (condition) {
    passed += 1;
  } else {
    failures.push(hint ? `${name}\n     -> ${hint}` : name);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. The AI service must actually be installable                             */
/* -------------------------------------------------------------------------- */

const requirements = read('ai-service/requirements.txt');

check(
  'anthropic SDK is not pinned to a non-existent 1.x release',
  !/^anthropic==1\./m.test(requirements),
  'V57 pinned anthropic==1.3.0, which does not exist on PyPI. pip fails, the '
  + 'clounge-ai build never starts, and the site silently serves the '
  + 'deterministic fallback instead of Claude.'
);

check(
  'anthropic SDK requirement is present and bounded',
  /^anthropic>=0\.\d+/m.test(requirements) && /<1\.0\.0/.test(requirements),
  'Expected a floor on the current 0.x line and a ceiling below 1.0.0.'
);

/* -------------------------------------------------------------------------- */
/* 2. The Render blueprint must match the model's API contract                 */
/* -------------------------------------------------------------------------- */

const blueprint = read('render.yaml');
const aiBlock = blueprint.slice(blueprint.indexOf('name: clounge-ai'));
const modelMatch = /key: ANTHROPIC_MODEL\s*\n\s*value:\s*(\S+)/.exec(aiBlock);
const configuredModel = modelMatch ? modelMatch[1] : '';

check('render.yaml declares an AI model', Boolean(configuredModel));

const modelOmitsSampling = /^claude-(sonnet-5|opus-4-7|opus-4-8|opus-5|fable|mythos)/.test(configuredModel);

check(
  'render.yaml does not set a sampling parameter the model would reject',
  !(modelOmitsSampling && /key: (TEMPERATURE|TOP_P|TOP_K)\b/.test(aiBlock)),
  `${configuredModel} returns HTTP 400 for a non-default temperature/top_p/top_k. `
  + 'engine.py swallows provider errors, so this fails as a silent downgrade to '
  + 'the deterministic concierge rather than as a visible error.'
);

check(
  'render.yaml and ai-service/.env.example agree on the model',
  read('ai-service/.env.example').includes(`ANTHROPIC_MODEL=${configuredModel}`),
  'A blueprint/template mismatch means local testing and production run '
  + 'different models with different API contracts.'
);

/* -------------------------------------------------------------------------- */
/* 3. Secrets must never be declared as plaintext blueprint values             */
/* -------------------------------------------------------------------------- */

for (const secret of [
  'ANTHROPIC_API_KEY',
  'SERVICE_API_KEY',
  'AI_SERVICE_KEY',
  'SMTP_PASS',
  'LOG_HASH_SALT',
  'FIREBASE_SERVICE_ACCOUNT_BASE64',
]) {
  const declaration = new RegExp(`key: ${secret}\\s*\\n\\s*(value|sync):`, 'm').exec(blueprint);
  check(
    `render.yaml marks ${secret} as sync:false, not a literal value`,
    Boolean(declaration) && declaration[1] === 'sync',
    'A secret with a literal `value:` is committed to git the moment the '
    + 'blueprint is pushed.'
  );
}

check(
  'render.yaml contains no Anthropic key material',
  !/sk-ant-[A-Za-z0-9]/.test(blueprint)
);

/* -------------------------------------------------------------------------- */
/* 4. The two services must share one key under two different names           */
/* -------------------------------------------------------------------------- */

check(
  'web service declares AI_SERVICE_KEY',
  /key: AI_SERVICE_KEY/.test(blueprint),
  'Without it the Node backend cannot authenticate to clounge-ai and every '
  + 'chat turn returns the fallback.'
);
check('AI service declares SERVICE_API_KEY', /key: SERVICE_API_KEY/.test(aiBlock));

/* -------------------------------------------------------------------------- */
/* 5. Secrets must be git-ignored                                              */
/* -------------------------------------------------------------------------- */

const rootIgnore = read('.gitignore');
for (const secretPath of ['.env', 'serviceAccountKey.json']) {
  check(
    `.gitignore covers ${secretPath}`,
    rootIgnore.includes(secretPath),
    'This repository is private, but a private repository is not a secret store.'
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Signature / copyright                                                    */
/* -------------------------------------------------------------------------- */

const SIGNATURE = 'Made By Eng Nayer Nader';
for (const file of [
  'render.yaml',
  'backend/server.js',
  'backend/config/validateEnv.js',
  'backend/utils/analytics.js',
  'ai-service/app/brain.py',
  'ai-service/app/main.py',
  'ai-service/.env.example',
  'backend/.env.example',
  'ai-service/requirements.txt',
  'public/assets/js/mobile-elite.js',
  'public/assets/css/mobile-elite.css',
]) {
  check(`${file} carries the owner signature`, read(file).includes(SIGNATURE));
}


/* -------------------------------------------------------------------------- */
/* 7. v73 — the outage of 06-09-2026 must not be able to hide again           */
/* -------------------------------------------------------------------------- */

const brain = read('ai-service/app/brain.py');
const brainConfig = read('ai-service/app/config.py');
const mainPy = read('ai-service/app/main.py');
const serverJs = read('backend/server.js');

check(
  'brain.py can name a workspace-unscoped key',
  /workspace_unscoped/.test(brain),
  'The live 400 ("This API key is not scoped to a workspace") matched no error '
  + 'signature, was logged as "unknown", and 24 doomed calls later every '
  + 'visitor got the holding reply with nothing in the log naming the cause.'
);

check(
  'the service can send anthropic-workspace-id for an organisation key',
  /anthropic-workspace-id/.test(brain) && /ANTHROPIC_WORKSPACE_ID/.test(brainConfig),
  'Without this, only a workspace-scoped key works and the failure mode is a '
  + 'silent, total degradation.'
);

check(
  'render.yaml declares ANTHROPIC_WORKSPACE_ID as a secret, not a value',
  /key: ANTHROPIC_WORKSPACE_ID\s*\n\s*sync: false/.test(blueprint)
);

check(
  'startup makes one real Claude call instead of trusting a key string',
  /def self_test/.test(brain) && /STARTUP_SELF_TEST/.test(mainPy),
  'v72 printed "Claude engine connected" whenever a key string existed, which '
  + 'is how a fully broken engine looked healthy in the deploy log for days.'
);

check(
  'the AI service answers on / instead of 404',
  /@app\.get\("\/"\)/.test(mainPy),
  'Render probes, uptime monitors and the external cron all knock on the root '
  + 'first. GET / returning {"detail":"Not Found"} reads as a dead service.'
);

for (const [label, source, needle] of [
  ['AI service', mainPy, /_keepalive_loop/],
  ['web service', serverJs, /startKeepAlive/],
]) {
  check(`${label} runs a keep-alive loop`, needle.test(source),
    'Render frees an idle instance after ~15 minutes and the next visitor waits '
    + '30-60s for a cold boot. Both services must stay warm.');
}

for (const [label, source] of [['AI service', mainPy], ['web service', serverJs]]) {
  check(`${label} exposes a cheap /keepalive target`, /keepalive/i.test(source));
}

check(
  'neither .env.example contains real key material',
  !/sk-ant-api03-/.test(read('ai-service/.env.example'))
    && !/sk-ant-api03-/.test(read('backend/.env.example')),
  'A template is committed; a secret is not.'
);

check(
  'the model fallback chain ends on a cheap model',
  /MODEL_FALLBACK_CHAIN[\s\S]{0,200}haiku/.test(blueprint),
  'A chain of four premium models can burn the whole request budget before the '
  + 'visitor gets any answer at all.'
);

check(
  'the front end and the API agree on the message length limit',
  read('public/assets/js/main.js').includes('CHAT_MAX_CHARS = 1200')
    && read('backend/routes/chat.js').includes('message.length > 1200'),
  'A textarea capped below the API limit silently truncates a long brief; '
  + 'capped above it, the visitor writes a paragraph and gets a 400.'
);

/* -------------------------------------------------------------------------- */

if (failures.length) {
  console.error(`\n${failures.length} deployment contract check(s) FAILED:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log(`${passed}/${passed} deployment contract checks passed`);
console.log(SIGNATURE);
