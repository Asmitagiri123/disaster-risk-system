// One-off cleanup of dummy earthquake predictions/alerts/sensor data from the
// removed USGS poll. Manual quake predictions are kept.
// Usage: node scripts/cleanup-dummy-earthquakes.js
require('dotenv').config();
const connectDB = require('../src/config/db');
const Prediction = require('../src/models/Prediction');
const Alert = require('../src/models/Alert');
const SensorData = require('../src/models/SensorData');

(async () => {
  try {
    await connectDB();

    // 1. Find the dummy external earthquake predictions
    const predictions = await Prediction.find({
      disasterType: 'earthquake',
      predictedBy: 'external',
    });

    const alertIds = predictions.map((p) => p.alertId).filter(Boolean);

    // 2. Delete their alerts
    const alertsDeleted = alertIds.length
      ? (await Alert.deleteMany({ _id: { $in: alertIds } })).deletedCount
      : 0;

    // 3. Delete the predictions
    const predictionsDeleted = (await Prediction.deleteMany({
      disasterType: 'earthquake',
      predictedBy: 'external',
    })).deletedCount;

    // 4. Delete the corresponding sensor-data records
    const sensorDeleted = (await SensorData.deleteMany({
      disasterType: 'earthquake',
      'rawData.source': 'external',
    })).deletedCount;

    console.log(
      JSON.stringify({ predictionsDeleted, alertsDeleted, sensorDeleted }, null, 2)
    );
    process.exit(0);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
  }
})();
