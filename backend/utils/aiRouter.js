// Made By Eng Nayer Nader
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY || '';

async function routeWithAI(payload) {
  if (process.env.AI_ROUTING_ENABLED === 'false') return null;
  const inquiry = Object.fromEntries(
    ['request_type', 'organization', 'service', 'destination', 'date', 'urgency', 'tier', 'country', 'message']
      .filter((key) => payload[key])
      .map((key) => [key, payload[key]])
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_ROUTING_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': AI_SERVICE_KEY },
      body: JSON.stringify({ inquiry }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI route returned ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('AI routing unavailable; deterministic routing used:', error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { routeWithAI };
