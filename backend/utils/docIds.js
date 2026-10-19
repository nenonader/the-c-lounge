// Made By Eng Nayer Nader
/**
 * The C Lounge — meaningful Firestore document IDs.
 *
 * Why this exists
 * ---------------
 * Every collection used Firestore auto-IDs: `5lItQaoXBcO0Tsiocu9w`,
 * `14dd231d-ff57-4d99-a38d-47d69020ad51`. Opening the console told you nothing.
 * Finding "the conversation from Sunday morning that reached a handoff" meant
 * clicking documents one at a time.
 *
 * Every ID produced here is:
 *   readable   — you can tell what a document is from the ID alone
 *   sortable   — the timestamp is first, so lexical order is chronological
 *   unique     — a random suffix removes collision risk under concurrency
 *   safe       — ASCII, no "/", no "..", under Firestore's 1500-byte limit
 *
 * Shape:  <kind>_<YYYY-MM-DD>T<HH-MM-SS>Z_<facet>_<rand6>
 *   conv_2026-09-06T10-29-55Z_yacht_a3f9c1
 *   msg_000004_assistant
 *   evt_2026-09-06T10-29-55Z_scroll-depth_7b21ae
 *   inq_2026-09-06T10-31-02Z_CLC-20260906-9F3A2B1C
 *
 * IMPORTANT: an ID is a label, never a key. Nothing in the application may
 * parse an ID to recover data — every field encoded here is also stored as a
 * real, queryable field on the document.
 */

const crypto = require('crypto');

/** Firestore forbids "/", "." on its own, "__*__", and caps IDs at 1500 bytes. */
function slug(value, max = 28) {
  return String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** Sortable UTC stamp, filesystem- and URL-safe. */
function stamp(date = new Date()) {
  const iso = new Date(date).toISOString();          // 2026-09-06T10:29:55.123Z
  return `${iso.slice(0, 10)}T${iso.slice(11, 19).replaceAll(':', '-')}Z`;
}

function rand(bytes = 5) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Assemble an ID from parts, dropping any that are empty. */
// 3 bytes of entropy produced ~2 collisions per 5,000 IDs minted in the same
// second. 5 bytes takes that to effectively zero at any traffic this site will
// ever see, at the cost of four characters.
function build(kind, parts = [], { date, entropy = 5 } = {}) {
  const pieces = [kind, stamp(date), ...parts.map((p) => slug(p)).filter(Boolean)];
  if (entropy > 0) pieces.push(rand(entropy));
  const id = pieces.filter(Boolean).join('_');
  // Defensive: never emit something Firestore will reject.
  return id.replace(/\/+/g, '-').replace(/^__|__$/g, '').slice(0, 400) || `${kind}_${rand(8)}`;
}

// ---------------------------------------------------------------------------
// Per-collection builders
// ---------------------------------------------------------------------------

/**
 * conversations/{id}
 * A conversation is created before its service is known, so the facet is the
 * device and country the visitor arrived on — the two things you actually want
 * when scanning the console.
 */
const conversationId = ({ deviceType, country, date } = {}) =>
  build('conv', [country || 'xx', deviceType || 'unknown'], { date });

/**
 * conversations/{id}/messages/{id}
 * Zero-padded sequence FIRST so the console lists a transcript in the order it
 * was spoken. This is the single biggest readability win in the whole schema:
 * auto-IDs made every transcript appear shuffled.
 */
const messageId = (sequence, role) =>
  `msg_${String(Math.max(0, Number(sequence) || 0)).padStart(6, '0')}_${slug(role || 'unknown', 12)}`;

/** chat_turns/{id} — one record per concierge turn, with the path that served it. */
const chatTurnId = ({ servedBy, date } = {}) =>
  build('turn', [servedBy || 'unknown'], { date });

/** analytics_events/{id} */
const analyticsEventId = ({ eventType, date } = {}) =>
  build('evt', [eventType || 'event'], { date });

/** analytics_sessions/{id} */
const analyticsSessionId = ({ country, deviceType, date } = {}) =>
  build('asess', [country || 'xx', deviceType || 'unknown'], { date });

/** visitor_sessions/{id} */
const visitorSessionId = ({ country, deviceType, date } = {}) =>
  build('vsess', [country || 'xx', deviceType || 'unknown'], { date });

/**
 * inquiries/{id}
 * The public reference is embedded verbatim. When a member quotes
 * "CLC-20260906-9F3A2B1C" on the phone, the desk pastes it into the console
 * search and lands on the document. No lookup table, no index scan.
 */
const inquiryId = ({ reference, requestType, date } = {}) => {
  // The reference keeps its original case: a member reads "CLC-20260906-9F3A2B1C"
  // off an email and the desk pastes it straight into the console search bar.
  const safeRef = String(reference || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  const tail = [slug(requestType)].filter(Boolean);
  const base = ['inq', stamp(date), safeRef, ...tail].filter(Boolean).join('_');
  return safeRef ? base : build('inq', [requestType], { date });
};

/** audit_events/{id} */
const auditEventId = ({ type, date } = {}) =>
  build('audit', [type || 'event'], { date });

/** routing_logs/{id} */
const routingLogId = ({ deskId, source, date } = {}) =>
  build('route', [deskId || 'unrouted', source], { date });

/** security_events/{id} — blocked injections, lockouts, refused outputs. */
const securityEventId = ({ kind, date } = {}) =>
  build('sec', [kind || 'event'], { date });

module.exports = {
  slug,
  stamp,
  build,
  conversationId,
  messageId,
  chatTurnId,
  analyticsEventId,
  analyticsSessionId,
  visitorSessionId,
  inquiryId,
  auditEventId,
  routingLogId,
  securityEventId,
};
