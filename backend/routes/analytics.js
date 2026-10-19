// Made By Eng Nayer Nader
const express = require('express');
const { recordEvent } = require('../utils/analytics');

const router = express.Router();

router.post('/analytics/events', async (req, res) => {
  try {
    const result = await recordEvent(req, req.body || {});
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Analytics event write failed:', error.message);
    return res.status(503).json({ success: false, message: 'Analytics temporarily unavailable.' });
  }
});

module.exports = router;
