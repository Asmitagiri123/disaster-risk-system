const Alert = require('../models/Alert');
const Prediction = require('../models/Prediction');
const SensorData = require('../models/SensorData');
const logger = require('../utils/logger');

exports.getDashboardOverview = async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 3600000);
    const [alertCount, activeAlertCount, criticalCount, resolved24h, predictionCount, recentPredictions, recentSensors] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ isActive: true }),
      Alert.countDocuments({ isActive: true, riskLevel: { $in: ['high', 'critical'] } }),
      Alert.countDocuments({ isActive: false, resolvedAt: { $gte: since24h } }),
      Prediction.countDocuments(),
      // 50 recent predictions ≈ the last ~8h of weather-driven risk trend
      Prediction.find().sort({ createdAt: -1 }).limit(50).lean(),
      SensorData.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          alerts: alertCount,
          activeAlerts: activeAlertCount,
          criticalZones: criticalCount,
          resolved24h,
          predictions: predictionCount,
        },
        recentPredictions,
        recentSensors,
      },
    });
  } catch (err) {
    logger.error(`Dashboard overview error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard overview' });
  }
};
