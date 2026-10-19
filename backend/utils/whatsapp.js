// Made By Eng Nayer Nader
const DEFAULT_NUMBER = '201114399976';

function cleanLine(value, max = 180) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildInquirySummary(payload, reference, routing) {
  const lines = [
    'The C Lounge · Private Brief',
    `Reference: ${cleanLine(reference)}`,
    `Name: ${cleanLine(payload.name)}`,
    `Service: ${cleanLine(payload.service || payload.tier || 'Private coordination')}`,
  ];
  if (payload.destination) lines.push(`Route / destination: ${cleanLine(payload.destination)}`);
  if (payload.date) lines.push(`Timing: ${cleanLine(payload.date)}`);
  if (payload.urgency) lines.push(`Priority: ${cleanLine(payload.urgency)}`);
  if (payload.preferred_channel) lines.push(`Preferred reply: ${cleanLine(payload.preferred_channel)}`);
  if (payload.message) lines.push(`Brief: ${cleanLine(payload.message, 420)}`);
  if (routing?.ai?.summary) lines.push(`Desk summary: ${cleanLine(routing.ai.summary, 420)}`);
  lines.push('I consent to send this prepared summary to The C Lounge on WhatsApp.');
  return lines.join('\n');
}

function buildChatSummary(summary, reference, routing = null) {
  const fields = summary?.fields || {};
  const lines = [
    'The C Lounge · Concierge Handoff',
    `Reference: ${cleanLine(reference)}`,
    `Request: ${cleanLine(summary?.summary, 520)}`,
  ];
  if (fields.name) lines.push(`Name: ${cleanLine(fields.name)}`);
  if (fields.service) lines.push(`Service: ${cleanLine(fields.service)}`);
  if (fields.route) lines.push(`Route / destination: ${cleanLine(fields.route)}`);
  if (fields.timing) lines.push(`Timing: ${cleanLine(fields.timing)}`);
  if (fields.party_size) lines.push(`Passengers / party: ${cleanLine(fields.party_size)}`);
  if (fields.preferences) lines.push(`Preferences / requirements: ${cleanLine(fields.preferences, 360)}`);
  if (fields.preferred_contact) lines.push(`Preferred contact: ${cleanLine(fields.preferred_contact)}`);
  if (routing?.deskId) lines.push(`C Lounge desk: ${cleanLine(routing.deskId)}`);
  lines.push('Customer confirmation: The customer reviewed this brief and authorised it to be sent to The C Lounge via WhatsApp.');
  lines.push('Please review and advise on the next available options.');
  return lines.join('\n');
}

function whatsappUrl(text) {
  const number = String(process.env.WHATSAPP_NUMBER || DEFAULT_NUMBER).replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

module.exports = { buildInquirySummary, buildChatSummary, whatsappUrl };
