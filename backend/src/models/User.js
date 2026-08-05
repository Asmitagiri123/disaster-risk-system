const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s\-()]{7,15}$/, 'Please enter a valid phone number'],
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'responder'],
      default: 'user',
    },
    // Alert location picked at login/registration (one of the 77 districts).
    // Drives location-scoped alert views and targeted notifications.
    province: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere',
      },
      address: String,
      city: String,
      country: String,
    },
    alertPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      disasterTypes: {
        type: [String],
        enum: ['earthquake', 'flood', 'landslide'],
        default: ['earthquake', 'flood', 'landslide'],
      },
      minRiskLevel: {
        type: String,
        enum: ['low', 'moderate', 'high'],
        default: 'high',
      },
    },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    passwordChangedAt: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  { timestamps: true }
);

userSchema.index({ location: '2dsphere' });
userSchema.index({ province: 1, district: 1 });

// Drop a location with no usable coordinates so the 2dsphere index stays valid
userSchema.pre('save', function (next) {
  this.location = _normalizeLocation(this.location);
  next();
});

// findOneAndUpdate skips pre('save'), so normalise the location here too
userSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update && update.location) {
    update.location = _normalizeLocation(update.location);
  } else if (update && update.$set && update.$set.location) {
    update.$set.location = _normalizeLocation(update.$set.location);
  }
  next();
});

function _normalizeLocation(location) {
  if (!location) return undefined;
  const coords = Array.isArray(location.coordinates) ? location.coordinates : undefined;
  if (!coords || coords.length === 0 || coords.some(c => !Number.isFinite(c))) {
    return undefined;
  }
  return { ...location, type: 'Point' };
}

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare entered password with stored hash
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Check if password changed after JWT was issued
userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
  if (this.passwordChangedAt) {
    const changedAt = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtTimestamp < changedAt;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);
