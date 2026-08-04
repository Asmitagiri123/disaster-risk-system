const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { users: inMemoryUsers, addUser, findUserByEmail } = require('../utils/inMemoryStore');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const sendTokenResponsePlain = (userPlain, statusCode, res) => {
  const token = jwt.sign({ id: userPlain._id }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const userObj = { ...userPlain };
  delete userObj.password;
  res.status(statusCode).json({ success: true, token, data: { user: userObj } });
};

const signToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  const userObj = user.toObject();
  delete userObj.password;

  res.status(statusCode).json({
    success: true,
    token,
    data: { user: userObj },
  });
};

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, password, phone, location } = req.body;

    // If MongoDB not connected, use in-memory store
    if (mongoose.connection.readyState !== 1) {
      const existing = findUserByEmail(email);
      if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });
      const hashed = await bcrypt.hash(password, 10);
      const newUser = { _id: String(Date.now()), name, email, password: hashed, phone, location, role: 'user', isActive: true };
      addUser(newUser);
      logger.info(`New in-memory user registered: ${email}`);
      return sendTokenResponsePlain(newUser, 201, res);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, phone, location });
    logger.info(`New user registered: ${email}`);
    sendTokenResponse(user, 201, res);
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;
    // If MongoDB not connected, use in-memory users
    if (mongoose.connection.readyState !== 1) {
      const userPlain = findUserByEmail(email);
      if (!userPlain) return res.status(401).json({ success: false, message: 'Invalid email or password' });
      const match = await bcrypt.compare(password, userPlain.password);
      if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password' });
      if (!userPlain.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
      userPlain.lastLogin = new Date();
      logger.info(`In-memory user logged in: ${email}`);
      return sendTokenResponsePlain(userPlain, 200, res);
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    logger.info(`User logged in: ${email}`);
    sendTokenResponse(user, 200, res);
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

exports.getMe = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const userPlain = inMemoryUsers.find(u => u._id === req.user.id);
      return res.json({ success: true, data: { user: userPlain || null } });
    }
    const user = await User.findById(req.user.id);
    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const allowedFields = ['name', 'phone', 'location', 'alertPreferences'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Profile update failed' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Password change failed' });
  }
};
