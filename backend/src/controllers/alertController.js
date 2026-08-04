const alertService = require('../services/alertService');
const Alert = require('../models/Alert');
const { districtsOfProvince, districtRegex } = require('../utils/nepalRegions');
const logger = require('../utils/logger');

exports.getAlerts = async (req, res) => {
  try {
    const { disasterType, riskLevel, active, limit, district, province } = req.query;
    const filters = {};
    if (disasterType) filters.disasterType = disasterType;
    if (riskLevel) filters.riskLevel = riskLevel;
    if (active !== undefined) filters.isActive = active === 'true';

    // Location scope: a district, or every district in a province. Alerts store
    // the district name in location.city, so filter on that field.
    if (district) {
      const re = districtRegex(district);
      filters['location.city'] = re ? re : /$^/; // no known district -> no match
    } else if (province) {
      const districts = districtsOfProvince(province);
      filters['location.city'] = districts.length
        ? { $in: districts.map(d => districtRegex(d)) }
        : /$^/;
    }

    // Optional cap — default returns ALL matching alerts so UI counts always
    // match the true database count (no silent 50-row truncation).
    const parsed = parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2000) : null;

    const alerts = await alertService.getActiveAlerts(filters, safeLimit);
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

exports.confirmAlert = async (req, res) => {
  try {
    const { status, note } = req.body;
    const alert = await alertService.confirmAlert(req.params.id, status, req.user, note);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    logger.info(`Alert ${req.params.id} marked ${status} by user ${req.user.id}`);
    res.json({ success: true, data: { alert } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAlertStats = async (req, res) => {
  try {
    const [total, active, byType, groundTruth] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ isActive: true }),
      Alert.aggregate([
        { $group: { _id: '$disasterType', count: { $sum: 1 }, totalNotified: { $sum: '$totalNotified' } } },
      ]),
      alertService.getGroundTruthStats(),
    ]);

    res.json({ success: true, data: { total, active, byType, groundTruth } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alert stats' });
  }
};
