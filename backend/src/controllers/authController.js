const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { normalizeDistrict, provinceOfDistrict } = require('../utils/nepalRegions');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { users: inMemoryUsers, addUser, findUserByEmail, findUserById, updateUser } = require('../utils/inMemoryStore');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const sendTokenResponsePlain = (userPlain, statusCode, res) => {
  const token = jwt.sign({ id: userPlain._id }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const userObj = { ...userPlain };
  delete userObj.password;
  res.status(statusCode).json({ success: true, token, data: { user: userObj } });
};

// Validate a district/province choice. Returns { district, province } using the
// canonical names, or null when nothing was chosen. Throws on a bad district.
function parseLocationChoice(body) {
  const { district, province } = body || {};
  if (!district && !province) return null;

  if (district) {
    const d = normalizeDistrict(district);
    if (!d) {
      const err = new Error('Unknown district. Pick one from the list.');
      err.code = 400;
      throw err;
    }
    const p = provinceOfDistrict(d);
    if (province && province.toLowerCase() !== p.toLowerCase()) {
      const err = new Error(`${province} is not the province of ${d}`);
      err.code = 400;
      throw err;
    }
    return { district: d, province: p };
  }
  // Province-only scope (all districts in that province)
  return { province: String(province).trim() };
}

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

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Alert location: canonical district + province from the login page picker.
    const choice = parseLocationChoice(req.body);
    const user = await User.create({
      name,
      email,
      password,
      phone,
      ...choice,
      location,
    });

    // Send welcome email
    if (user.email) {
      const welcomeHtml = notificationService.buildWelcomeEmail(user);
      notificationService.sendEmail(user.email, 'Welcome to NepAlert!', welcomeHtml);
    }
    logger.info(`New user registered: ${email}`);
    sendTokenResponse(user, 201, res);
  } catch (err) {
    // Handle errors from parseLocationChoice (e.g., unknown district)
    if (err.code === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }

    // Handle Mongoose validation errors (e.g., password minlength, email format)
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({ success: false, message: `Validation failed: ${errors.join(', ')}` });
    }
    // Handle duplicate key errors (e.g., unique email constraint)
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    logger.error(`Register error: ${err.message}`, err); // Log full error for debugging
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
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    // A location chosen on the login page becomes the account's alert location,
    // so a shared/field account can re-scope its alerts at each sign-in.
    const choice = parseLocationChoice(req.body);
    if (choice) {
      user.district = choice.district;
      user.province = choice.province;
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    logger.info(`User logged in: ${email}`);
    sendTokenResponse(user, 200, res);
  } catch (err) {
    if (err.code === 400) return res.status(400).json({ success: false, message: err.message });
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const allowedFields = ['name', 'phone', 'location', 'alertPreferences', 'province', 'district'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    // Keep district + province canonical and consistent when either is changed.
    // An explicit empty selection (both '') clears the account's location scope.
    if (req.body.district || req.body.province) {
      const choice = parseLocationChoice(req.body);
      updates.province = choice.province;
      updates.district = choice.district || ''; // province-only scope clears any district
    } else if (req.body.district === '' && req.body.province === '') {
      updates.province = '';
      updates.district = '';
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, data: { user } });
  } catch (err) {
    if (err.code === 400) return res.status(400).json({ success: false, message: err.message });
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
