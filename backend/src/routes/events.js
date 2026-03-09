const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { subscribe } = require('../services/eventBus');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const writeEvent = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  writeEvent('connected', { ok: true, at: Date.now() });

  const unsubscribe = subscribe('demandas:update', (payload) => {
    writeEvent('demandas:update', payload);
  });

  const heartbeat = setInterval(() => {
    res.write(`: keepalive ${Date.now()}\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

module.exports = router;
