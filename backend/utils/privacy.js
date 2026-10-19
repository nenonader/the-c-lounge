// Made By Eng Nayer Nader
const crypto = require('crypto');

function hashIp(ip) {
  const salt = process.env.LOG_HASH_SALT;
  if (!salt) return 'not-configured';
  return crypto.createHmac('sha256', salt).update(String(ip || 'unknown')).digest('hex').slice(0, 24);
}

function safeAgent(value) {
  return String(value || '').replace(/[\r\n]/g, ' ').slice(0, 300);
}

function publicReference(prefix = 'CL') {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefix}-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = { hashIp, safeAgent, publicReference };
