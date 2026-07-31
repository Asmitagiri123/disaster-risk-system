const mongoose = require('mongoose');

const sensorDataSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
    },
    sensorType: {
      type: String,
      required: true,
      enum: ['seismic', 'hydrological', 'meteorological', 'geotechnical'],
    },
    disasterType: {
      type: String,
      required: true,
      enum: ['earthquake', 'flood', 'landslide'],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number], // [longitude, latitude]
      address: String,
    },
    readings: {
      // Earthquake fields
      magnitude: Number,
      depth: Number,
      seismicActivity: Number,
      groundVibration: Number,
      // Flood fields
      rainfall: Number,
      waterLevel: Number,
      riverFlow: Number,
      // Landslide fields
      soilMoisture: Number,
      slopeAngle: Number,
      soilType: Number,
      vegetationCover: Number,
      groundDisplacement: Number,
      // Shared
      humidity: Number,
      elevation: Number,
      temperature: Number,
    },
    rawData: mongoose.Schema.Types.Mixed,
    processedAt: Date,
    predictionTriggered: { type: Boolean, default: false },
    predictionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prediction' },
  },
  { timestamps: true }
);

sensorDataSchema.index({ location: '2dsphere' });
sensorDataSchema.index({ sensorId: 1, createdAt: -1 });
sensorDataSchema.index({ disasterType: 1, createdAt: -1 });

module.exports = mongoose.model('SensorData', sensorDataSchema);
