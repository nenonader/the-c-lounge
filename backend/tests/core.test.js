// Made By Eng Nayer Nader
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateSubmission, SERVICES } = require('../utils/validate');
const { deterministicDesk, normalizeAiDecision, resolveRecipients } = require('../config/routing');
const { buildInquirySummary, whatsappUrl } = require('../utils/whatsapp');

const contact = {
  request_type: 'Private enquiry',
  name: 'Alex Morgan',
  email: 'alex@example.com',
  whatsapp: '+20 111 222 3333',
  service: 'Private Aviation',
  preferred_channel: 'WhatsApp',
  urgency: 'Within 30 days',
  privacy_consent: 'yes',
};

test('the public offer contains exactly nine services', () => {
  assert.equal(SERVICES.length, 9);
  assert.equal(SERVICES.includes('Security & Discreet Mobility'), false);
});

test('contact brief is normalized and accepted', () => {
  const value = validateSubmission(contact);
  assert.equal(value.email, 'alex@example.com');
  assert.equal(value.service, 'Private Aviation');
});

test('privacy consent and allowlisted services are enforced', () => {
  assert.throws(() => validateSubmission({ ...contact, privacy_consent: '' }), /consent/i);
  assert.throws(() => validateSubmission({ ...contact, service: 'Unknown service' }), /nine available/i);
});

test('AI may select only an allowlisted desk above confidence threshold', () => {
  const routing = resolveRecipients(contact, {
    desk: 'PRIVATE', confidence: 0.91, priority: 'priority', summary: 'Principal flight request', rationale: 'Sensitive timing',
  });
  assert.equal(routing.deskId, 'PRIVATE');
  assert.equal(routing.source, 'ai');
  assert.equal(normalizeAiDecision({ desk: 'attacker@example.com', confidence: 1 }), null);
});

test('low-confidence AI and urgent requests are safely governed', () => {
  assert.equal(deterministicDesk(contact), 'EXECUTIVE');
  assert.equal(resolveRecipients(contact, { desk: 'PRIVATE', confidence: 0.2 }).deskId, 'EXECUTIVE');
  assert.equal(resolveRecipients({ ...contact, urgency: 'Immediate' }, { desk: 'CONCIERGE', confidence: 0.99 }).deskId, 'PRIVATE');
});

test('chat and form routing use the same governed desk IDs', () => {
  const chatBrief = { request_type: 'Private concierge chat', service: 'Private Aviation', urgency: 'Within 30 days' };
  const formBrief = { request_type: 'Private enquiry', service: 'Private Aviation', urgency: 'Within 30 days' };
  assert.equal(deterministicDesk(chatBrief), deterministicDesk(formBrief));
  assert.equal(resolveRecipients(chatBrief, { desk: 'EXECUTIVE', confidence: 0.95 }).deskId, resolveRecipients(formBrief, { desk: 'EXECUTIVE', confidence: 0.95 }).deskId);
});

test('WhatsApp handoff contains the reference and an encoded prepared summary', () => {
  const summary = buildInquirySummary(contact, 'CL-20260825-ABCD1234', { ai: { summary: 'Private aviation request' } });
  const url = whatsappUrl(summary);
  assert.match(summary, /CL-20260825-ABCD1234/);
  assert.match(url, /^https:\/\/wa\.me\/\d+\?text=/);
  assert.match(decodeURIComponent(url), /Private Aviation/);
});
