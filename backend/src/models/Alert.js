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
      enum: ['low', 'moderate', 'high'],
    },
    probability: {
      type: Number,
      required: true,
    },
    location: {
      coordinates: [Number],
      address: String,
      city: String,
      district: String,
      municipality: String,
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
    // Cross-check status copied from the source prediction at creation time
    // (method, ruleAgreed, ruleRiskLevel, modelRiskLevel). Lets the UI show
    // "cross-verified" without joining back to the prediction.
    verification: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Human ground truth: responders mark an alert confirmed/not-confirmed
    // against what happened on the ground. Powers the "model confidence vs
    // confirmed events" view (predictions cross-check the rule; alerts check
    // reality).
    groundTruth: {
      status: {
        type: String,
        enum: ['pending', 'confirmed', 'not-confirmed'],
        default: 'pending',
      },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: Date,
      note: String,
    },
    isActive: { type: Boolean, default: true },
    resolvedAt: Date,
  },
  { timestamps: true }
);

alertSchema.index({ disasterType: 1, createdAt: -1 });
alertSchema.index({ isActive: 1 });

module.exports = mongoose.model('Alert', alertSchema);
