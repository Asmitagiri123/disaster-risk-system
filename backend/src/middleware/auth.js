const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('../utils/logger');
const { findUserById } = require('../utils/inMemoryStore');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const getTokenFromHeader = (req) => {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

exports.protect = async (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    let user = null;
    if (mongoose.connection.readyState === 1) {
      user = await User.findById(decoded.id);
    } else {
      user = findUserById(decoded.id) || null;
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Token invalid — user not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({ success: false, message: 'Password was changed. Please log in again.' });
    }

    req.user = { ...user, id: user._id || user.id };
    next();
  } catch (err) {
    logger.warn(`Auth failed: ${err.message}`);
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

exports.protectOrApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-sensor-api-key'] || req.headers['sensor-api-key'] || req.query.api_key;

    if (apiKey && process.env.SENSOR_API_KEY && apiKey === process.env.SENSOR_API_KEY) {
      req.user = { role: 'sensor' };
      return next();
    }

    return exports.protect(req, res, next);
  } catch (err) {
    logger.warn(`Sensor auth failed: ${err.message}`);
    res.status(401).json({ success: false, message: 'Invalid or expired token or API key.' });
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
};
