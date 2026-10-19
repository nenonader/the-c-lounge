// Made By Eng Nayer Nader
// The C Lounge — browser <-> Node <-> AI URL contract.
//
// WHY THIS FILE WAS REWRITTEN IN V59
// ----------------------------------
// The V57 version asserted the router's declared paths and the browser's base
// URL *independently*, and never composed them. Both halves passed while the
// join was broken: the router declared '/stream' and server.js mounted it at
// '/api', producing /api/stream, while the browser called /api/chat/stream.
// Every chat request 404'd and the site showed "I cannot reach the private
// concierge at this moment" — with 7/7 checks green.
//
// A contract test that never composes the two sides is not a contract test.
// Everything below builds the real URL and compares it to the real caller.

import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const server = read('../backend/server.js');
const chatRoute = read('../backend/routes/chat.js');
const analyticsRoute = read('../backend/routes/analytics.js');
const inquiriesRoute = read('../backend/routes/inquiries.js');
const config = read('../public/assets/js/config.js');
const main = read('../public/assets/js/main.js');
const aiMain = read('../ai-service/app/main.py');

let passed = 0;
const failures = [];

function check(name, condition, hint = '') {
  if (condition) passed += 1;
  else failures.push(hint ? `${name}\n     -> ${hint}` : name);
}

/* -------------------------------------------------------------------------- */
/* Resolve the real mount points from server.js                               */
/* -------------------------------------------------------------------------- */

function mountFor(routerName) {
  const match = new RegExp(`app\\.use\\('([^']+)',\\s*${routerName}\\)`).exec(server);
  return match ? match[1] : null;
}

const chatMount = mountFor('chatRouter');
const analyticsMount = mountFor('analyticsRouter');
const inquiriesMount = mountFor('inquiriesRouter');

check('server.js mounts the chat router', Boolean(chatMount));
check('server.js mounts the analytics router', Boolean(analyticsMount));
check('server.js mounts the inquiries router', Boolean(inquiriesMount));

/* -------------------------------------------------------------------------- */
/* Compose mount + declared path into the URL Express will actually serve      */
/* -------------------------------------------------------------------------- */

function declaredPaths(source) {
  return [...source.matchAll(/router\.(?:get|post)\('([^']+)'/g)].map((m) => m[1]);
}

function join(mount, path) {
  return `${mount}${path}`.replace(/\/{2,}/g, '/');
}

const servedChatUrls = declaredPaths(chatRoute).map((path) => join(chatMount || '', path));
const servedAnalyticsUrls = declaredPaths(analyticsRoute).map((p) => join(analyticsMount || '', p));
const servedInquiryUrls = declaredPaths(inquiriesRoute).map((p) => join(inquiriesMount || '', p));

/* -------------------------------------------------------------------------- */
/* Resolve the URLs the browser actually requests                             */
/* -------------------------------------------------------------------------- */

function frontendBase(name) {
  const match = new RegExp(`${name} = base \\+ '([^']+)'`).exec(config);
  return match ? match[1] : null;
}

const chatBase = frontendBase('CL_CHAT_ENDPOINT');
const formEndpoint = frontendBase('CL_FORM_ENDPOINT');
const analyticsEndpoint = frontendBase('CL_ANALYTICS_ENDPOINT');
const healthEndpoint = frontendBase('CL_HEALTH_ENDPOINT');

check('config.js defines a chat endpoint base', Boolean(chatBase));
check('config.js defines a form endpoint', Boolean(formEndpoint));
check('config.js defines an analytics endpoint', Boolean(analyticsEndpoint));
check('config.js defines a health endpoint', Boolean(healthEndpoint));

// main.js calls CHAT_ENDPOINT + '<suffix>'. Extract every suffix it uses.
const chatSuffixes = [...main.matchAll(/CHAT_ENDPOINT \+ '([^']+)'/g)].map((m) => m[1]);
check('main.js issues at least three chat calls', chatSuffixes.length >= 3);

const requestedChatUrls = chatSuffixes.map((suffix) => `${chatBase}${suffix}`);

/* -------------------------------------------------------------------------- */
/* THE JOIN — every URL the browser requests must be one Express serves        */
/* -------------------------------------------------------------------------- */

for (const url of requestedChatUrls) {
  check(
    `browser calls ${url} and Express serves it`,
    servedChatUrls.includes(url),
    `Express serves: ${servedChatUrls.join(', ') || '(nothing)'}. `
    + `Mount is '${chatMount}'. Either the mount or the declared path is wrong — `
    + 'the browser will get a 404 and the site will show the offline concierge.'
  );
}

check(
  'the browser reaches every chat route the backend exposes',
  servedChatUrls.every((url) => requestedChatUrls.includes(url)),
  `Unreachable: ${servedChatUrls.filter((u) => !requestedChatUrls.includes(u)).join(', ')}`
);

check(
  'analytics endpoint is served',
  servedAnalyticsUrls.includes(analyticsEndpoint),
  `Express serves: ${servedAnalyticsUrls.join(', ')}`
);

check(
  'inquiries endpoint is served',
  servedInquiryUrls.includes(formEndpoint),
  `Express serves: ${servedInquiryUrls.join(', ')}`
);

check('health endpoint is declared in server.js', server.includes(`app.get('${healthEndpoint}'`));

/* -------------------------------------------------------------------------- */
/* Node -> AI service contract                                                 */
/* -------------------------------------------------------------------------- */

const upstreamCalls = [...chatRoute.matchAll(/AI_SERVICE_URL\}(\/[^`'"]+)/g)].map((m) => m[1]);
check('the chat proxy calls the AI service', upstreamCalls.length >= 2);

for (const path of upstreamCalls) {
  check(
    `ai-service exposes ${path}`,
    aiMain.includes(`"${path}"`),
    'The Node proxy would get a 404 from clounge-ai and return the fallback.'
  );
}

check('the proxy authenticates with X-Service-Key', /X-Service-Key/.test(chatRoute));
check('the AI service requires that key', /require_service_key/.test(aiMain));

/* -------------------------------------------------------------------------- */
/* Regressions this project has actually shipped                               */
/* -------------------------------------------------------------------------- */

check(
  'no doubled /chat/chat prefix',
  !servedChatUrls.some((url) => url.includes('/chat/chat')),
  'The V55 defect: router paths declared with a /chat prefix under an /api/chat mount.'
);

check(
  'no chat route stranded outside /api/chat',
  !servedChatUrls.some((url) => /^\/api\/(stream|new-session|suggestions)/.test(url)),
  'The V57 defect: the /chat prefix was removed from the router without moving the mount.'
);

check('no Anthropic key in browser code', !/sk-ant-/.test(config + main));
check('no service key in browser code', !/X-Service-Key/i.test(config + main));

/* -------------------------------------------------------------------------- */
/* The success card must not promise what the backend could not do             */
/* -------------------------------------------------------------------------- */

const inquiriesSource = read('../backend/routes/inquiries.js');

check(
  'the backend reports whether the desk was actually notified',
  /notified:\s*false/.test(inquiriesSource),
  'A brief that was saved but not emailed must be distinguishable from one that was.'
);

check(
  'the frontend reads that flag instead of always claiming success',
  /result\.notified === false/.test(main),
  'Showing "a member of The C Lounge will contact you" when the desk was never '
  + 'notified is a promise the site cannot keep.'
);

check(
  'the frontend surfaces the desk address on a partial success',
  /desk_email/.test(main) && /desk_email/.test(inquiriesSource),
  'The visitor needs a channel that works right now.'
);

const SIGNATURE = 'Made By Eng Nayer Nader';
check('config.js carries the signature', config.includes(SIGNATURE));

/* -------------------------------------------------------------------------- */

if (failures.length) {
  console.error(`\n${failures.length} service contract check(s) FAILED:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log(`${passed}/${passed} service contract checks passed`);
console.log(`  chat URLs served: ${servedChatUrls.join(', ')}`);
console.log(SIGNATURE);
