// SSE real-time feed. EventSource can't send Authorization headers, so the JWT
// is accepted via ?token= (validated like `protect`). Heartbeats keep proxies
// from closing the idle connection.
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const bus = require('../services/liveEventBus');
const logger = require('../utils/logger');

const router = express.Router();

const authSSE = async (req, res, next) => {
  try {
    let token = req.query.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) return res.status(401).json({ success: false, message: 'Token invalid — user not found.' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({ success: false, message: 'Password was changed. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn(`SSE auth failed: ${err.message}`);
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

router.get('/stream', authSSE, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering if behind a proxy
  });
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Live feed connected', at: new Date().toISOString() })}\n\n`);

  // Subscribe to every event and forward to this client
  const forward = (event) => (payload) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      logger.warn(`SSE write failed (${event}): ${err.message}`);
    }
  };

  const events = ['alert:new', 'alert:resolved', 'alert:confirmed', 'prediction:new', 'sensor:ingest'];
  const listeners = events.map((event) => {
    const fn = forward(event);
    bus.on(event, fn);
    return { event, fn };
  });

  // Heartbeat every 15s so proxies don't kill the idle connection
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (err) { /* client gone */ }
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    listeners.forEach(({ event, fn }) => bus.removeListener(event, fn));
    logger.info(`SSE client disconnected (${req.user.email})`);
  };

  req.on('close', cleanup);
  res.on('close', cleanup);

  logger.info(`SSE client connected (${req.user.email})`);
});

module.exports = router;
