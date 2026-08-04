// One-off migration: recalibrate stored probabilities to match their risk label
// and regenerate alert messages (old data showed e.g. "moderate ... 100%").
// Idempotent. Usage: node scripts/recalibrate-alert-probabilities.js
require('dotenv').config();
const connectDB = require('../src/config/db');
const Prediction = require('../src/models/Prediction');
const Alert = require('../src/models/Alert');
const { calibrateProbability } = require('../src/config/constants');
const { buildAlertMessage } = require('../src/services/alertService');
const logger = require('../src/utils/logger');

(async () => {
  try {
    await connectDB();

    // 1. Recalibrate every prediction's probability against its risk level
    const predictions = await Prediction.find({}, 'riskLevel probability').lean();
    const predOps = [];
    for (const p of predictions) {
      const calibrated = calibrateProbability(p.probability, p.riskLevel);
      if (calibrated !== p.probability) {
        predOps.push({
          updateOne: { filter: { _id: p._id }, update: { $set: { probability: calibrated } } },
        });
      }
    }
    const predRes = predOps.length ? await Prediction.bulkWrite(predOps) : null;
    logger.info(`Predictions recalibrated: ${predRes ? predRes.modifiedCount : 0} / ${predictions.length}`);

    // 2. Recalibrate alert probabilities + regenerate messages (same wording
    //    as newly-created alerts, so history and live alerts stay consistent)
    const alerts = await Alert.find({}, 'disasterType riskLevel probability location message').lean();
    const alertOps = [];
    for (const a of alerts) {
      const probability = calibrateProbability(a.probability, a.riskLevel);
      const message = buildAlertMessage(a.disasterType, a.riskLevel, a.probability, a.location);
      if (probability !== a.probability || message !== a.message) {
        alertOps.push({
          updateOne: { filter: { _id: a._id }, update: { $set: { probability, message } } },
        });
      }
    }
    const alertRes = alertOps.length ? await Alert.bulkWrite(alertOps) : null;
    logger.info(`Alerts recalibrated: ${alertRes ? alertRes.modifiedCount : 0} / ${alerts.length}`);

    console.log(JSON.stringify({
      predictions: { total: predictions.length, modified: predRes ? predRes.modifiedCount : 0 },
      alerts: { total: alerts.length, modified: alertRes ? alertRes.modifiedCount : 0 },
    }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Recalibration failed:', err.message);
    process.exit(1);
  }
})();
