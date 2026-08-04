const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema(
  {
    disasterType: {
      type: String,
      required: true,
      enum: ['earthquake', 'flood', 'landslide'],
    },
    probability: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    riskLevel: {
      type: String,
      required: true,
      enum: ['low', 'moderate', 'high', 'critical'],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number], // [longitude, latitude]
      address: String,
      city: String,
      country: String,
    },
    inputData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    modelVersion: {
      type: String,
      default: '1.0.0',
    },
    alertTriggered: {
      type: Boolean,
      default: false,
    },
    alertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Alert',
    },
    predictedBy: {
      type: String,
      enum: ['scheduled', 'manual', 'sensor', 'csv-import', 'external'],
      default: 'manual',
    },
    // Independent cross-check of this prediction (rainfall-rule vs model class).
    // null when no rule applies (e.g. earthquake) or the check was not run.
    verification: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

predictionSchema.index({ location: '2dsphere' });
predictionSchema.index({ disasterType: 1, createdAt: -1 });
predictionSchema.index({ riskLevel: 1 });

module.exports = mongoose.model('Prediction', predictionSchema);
