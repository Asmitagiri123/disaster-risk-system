const alertService = require('../services/alertService');
const Alert = require('../models/Alert');
const logger = require('../utils/logger');

exports.getAlerts = async (req, res) => {
  try {
    const { disasterType, riskLevel, active } = req.query;
    const filters = {};
    if (disasterType) filters.disasterType = disasterType;
    if (riskLevel) filters.riskLevel = riskLevel;
    if (active !== undefined) filters.isActive = active === 'true';

    const alerts = await alertService.getActiveAlerts(filters);
    res.json({ success: true, count: alerts.length, data: { alerts } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

exports.getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate('predictionId');

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    res.json({ success: true, data: { alert } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alert' });
  }
};

exports.resolveAlert = async (req, res) => {
  try {
    const alert = await alertService.resolveAlert(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    logger.info(`Alert ${req.params.id} resolved by user ${req.user.id}`);
    res.json({ success: true, message: 'Alert resolved', data: { alert } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to resolve alert' });
  }
};

exports.getAlertStats = async (req, res) => {
  try {
    const [total, active, byType] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ isActive: true }),
      Alert.aggregate([
        { $group: { _id: '$disasterType', count: { $sum: 1 }, totalNotified: { $sum: '$totalNotified' } } },
      ]),
    ]);

    res.json({ success: true, data: { total, active, byType } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alert stats' });
  }
};
