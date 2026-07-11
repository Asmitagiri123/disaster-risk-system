const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Token invalid — user not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({ success: false, message: 'Password was changed. Please log in again.' });
    }

    req.user = user;
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
