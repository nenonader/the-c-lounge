// Made By Eng Nayer Nader
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SERVICES = Object.freeze([
  'Airport VIP & Meet and Assist',
  'Private Aviation',
  'Luxury Ground Transportation',
  'Luxury Accommodation',
  'Concierge & Lifestyle Management',
  'Yacht Charter & Marine',
  'Events, Access & Experiences',
  'Corporate & Executive Travel',
  'Private Membership',
]);
const TIERS = Object.freeze(['Signature', 'Privé', 'Sovereign']);
const CHANNELS = Object.freeze(['WhatsApp', 'Private email', 'Telephone']);
const URGENCY = Object.freeze(['Immediate', 'This week', 'Within 30 days', 'Exploring privately', 'Routine']);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value, max = 300) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)
    : '';
}

function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function requireAllowed(value, allowed, message) {
  if (!allowed.includes(value)) fail(message);
}

function validateSubmission(body) {
  const requestType = clean(body.request_type, 60);
  const isMembership = requestType === 'Membership application';
  const isContact = requestType === 'Private enquiry';
  if (!isMembership && !isContact) fail('Unrecognized form submission type.');

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const whatsapp = clean(body.whatsapp, 40);
  if (name.length < 2) fail('Your full name is required.');
  if (!EMAIL_RE.test(email)) fail('A valid private email is required.');
  if (!whatsapp || whatsapp.replace(/\D/g, '').length < 7) fail('A valid contact number is required.');
  if (clean(body.privacy_consent, 10) !== 'yes') fail('Privacy consent is required.');

  const service = clean(body.service, 100);
  const tier = clean(body.tier, 30);
  const preferredChannel = clean(body.preferred_channel, 30);
  const urgency = clean(body.urgency, 40);

  if (isContact) {
    requireAllowed(service, SERVICES, 'Please select one of the nine available privileges.');
    requireAllowed(preferredChannel, CHANNELS, 'Please choose how the desk should reply.');
    requireAllowed(urgency, URGENCY, 'Please choose the desired timing.');
  }
  if (isMembership) {
    requireAllowed(tier, TIERS, 'Please select a valid membership tier.');
    if (!clean(body.country, 100)) fail('Country of residence is required.');
  }

  return {
    request_type: requestType,
    title: clean(body.title, 100),
    name,
    organization: clean(body.organization, 160),
    email,
    whatsapp,
    preferred_channel: preferredChannel,
    service,
    destination: clean(body.destination, 180),
    date: clean(body.date, 120),
    passengers: clean(body.passengers, 10),
    urgency,
    tier,
    country: clean(body.country, 100),
    message: clean(body.message, 3000),
    privacy_consent: 'yes',
    _hp: clean(body._hp, 200),
  };
}

module.exports = { validateSubmission, escapeHtml, EMAIL_RE, SERVICES, TIERS, CHANNELS };
