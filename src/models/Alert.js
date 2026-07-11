const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prediction',
      required: true,
    },
    disasterType: {
      type: String,
      required: true,
      enum: ['earthquake', 'flood', 'landslide'],
    },
    riskLevel: {
      type: String,
      required: true,
      enum: ['low', 'moderate', 'high', 'critical'],
    },
    probability: {
      type: Number,
      required: true,
    },
    location: {
      coordinates: [Number],
      address: String,
      city: String,
      country: String,
    },
    message: {
      type: String,
      required: true,
    },
    affectedRadius: {
      type: Number, // in kilometers
      default: 50,
    },
    notifications: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        email: String,
        phone: String,
        emailStatus: {
          type: String,
          enum: ['sent', 'failed', 'skipped'],
          default: 'skipped',
        },
        smsStatus: {
          type: String,
          enum: ['sent', 'failed', 'skipped'],
          default: 'skipped',
        },
        sentAt: Date,
      },
    ],
    totalNotified: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    resolvedAt: Date,
  },
  { timestamps: true }
);

alertSchema.index({ disasterType: 1, createdAt: -1 });
alertSchema.index({ isActive: 1 });

module.exports = mongoose.model('Alert', alertSchema);
