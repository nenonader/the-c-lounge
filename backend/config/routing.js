// Made By Eng Nayer Nader
const DESKS = Object.freeze({
  CONCIERGE: process.env.DESK_CONCIERGE || 'Concierge@TheCLoungeWorld.com',
  EXECUTIVE: process.env.DESK_EXECUTIVE || 'Executive@TheCLoungeWorld.com',
  PRIVATE: process.env.DESK_PRIVATE || 'Private@TheCLoungeWorld.com',
});

const ALLOWED_DESK_IDS = Object.freeze(Object.keys(DESKS));

const SERVICE_ROUTING = Object.freeze({
  'Airport VIP & Meet and Assist': 'CONCIERGE',
  'Private Aviation': 'EXECUTIVE',
  'Luxury Ground Transportation': 'CONCIERGE',
  'Luxury Accommodation': 'CONCIERGE',
  'Concierge & Lifestyle Management': 'CONCIERGE',
  'Yacht Charter & Marine': 'EXECUTIVE',
  'Events, Access & Experiences': 'CONCIERGE',
  'Corporate & Executive Travel': 'EXECUTIVE',
  'Private Membership': 'EXECUTIVE',
});

const TIER_ROUTING = Object.freeze({
  Signature: 'CONCIERGE',
  'Privé': 'EXECUTIVE',
  Sovereign: 'PRIVATE',
});

function deterministicDesk(payload) {
  if (payload.urgency === 'Immediate') return 'PRIVATE';
  if (payload.request_type === 'Membership application') {
    return TIER_ROUTING[payload.tier] || 'EXECUTIVE';
  }
  return SERVICE_ROUTING[payload.service] || 'CONCIERGE';
}

function normalizeAiDecision(aiDecision) {
  const desk = String(aiDecision?.desk || '').toUpperCase();
  const confidence = Number(aiDecision?.confidence);
  if (!ALLOWED_DESK_IDS.includes(desk)) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return {
    desk,
    confidence,
    priority: ['routine', 'priority', 'immediate'].includes(aiDecision.priority)
      ? aiDecision.priority
      : 'routine',
    summary: String(aiDecision.summary || '').slice(0, 1200),
    rationale: String(aiDecision.rationale || '').slice(0, 240),
  };
}

function resolveRecipients(payload, aiDecision) {
  const fallbackDesk = deterministicDesk(payload);
  const governedAi = normalizeAiDecision(aiDecision);
  const threshold = Number(process.env.AI_ROUTING_MIN_CONFIDENCE || 0.68);
  const urgentOverride = payload.urgency === 'Immediate';
  const deskId = urgentOverride
    ? 'PRIVATE'
    : governedAi && governedAi.confidence >= threshold
      ? governedAi.desk
      : fallbackDesk;

  const ccIds = [];
  if (deskId !== fallbackDesk && process.env.ROUTING_CC_FALLBACK === 'true') ccIds.push(fallbackDesk);

  return {
    deskId,
    to: DESKS[deskId],
    cc: ccIds.map((id) => DESKS[id]),
    source: urgentOverride ? 'urgent_override' : governedAi && governedAi.confidence >= threshold ? 'ai' : 'deterministic_fallback',
    fallbackDesk,
    ai: governedAi,
  };
}

module.exports = {
  DESKS,
  ALLOWED_DESK_IDS,
  SERVICE_ROUTING,
  deterministicDesk,
  normalizeAiDecision,
  resolveRecipients,
};
