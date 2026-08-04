const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const User = require('../models/User');
const notificationService = require('./notificationService');
const { getUsersInRadius } = require('../utils/geoHelper');
const logger = require('../utils/logger');
const { addAlert, getAlerts, findAlertById, updateAlert, getAlertStats } = require('../utils/inMemoryStore');

class AlertService {
  async createAndDispatch(prediction) {
    const {
      disasterType,
      probability,
      riskLevel,
      location,
      affectedRadius = 50,
    } = prediction;

    const message = this._buildMessage(disasterType, riskLevel, probability, location);

    if (mongoose.connection.readyState !== 1) {
      const alert = addAlert({
        predictionId: prediction._id,
        disasterType,
        riskLevel,
        probability,
        location,
        message,
        affectedRadius,
      });
      logger.info(`In-memory alert created: ${alert._id} for ${disasterType} (${riskLevel})`);
      return alert;
    }

    const alert = await Alert.create({
      predictionId: prediction._id,
      disasterType,
      riskLevel,
      probability,
      location,
      message,
      affectedRadius,
    });

    logger.info(`Alert created: ${alert._id} for ${disasterType} (${riskLevel})`);

    // Find all users in the affected radius
    const [lon, lat] = location?.coordinates || [0, 0];
    const usersToNotify = await getUsersInRadius(User, lat, lon, affectedRadius);

    logger.info(`Notifying ${usersToNotify.length} users within ${affectedRadius}km`);

    const notificationResults = await Promise.allSettled(
      usersToNotify.map(user => this._notifyUser(user, alert, disasterType))
    );

    const notifications = notificationResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    alert.notifications = notifications;
    alert.totalNotified = notifications.filter(
      n => n.emailStatus === 'sent' || n.smsStatus === 'sent'
    ).length;

    await alert.save();

    return alert;
  }

  async _notifyUser(user, alert, disasterType) {
    const prefs = user.alertPreferences || {};
    const wantsThisType = !prefs.disasterTypes || prefs.disasterTypes.includes(disasterType);

    const result = {
      userId: user._id,
      email: user.email,
      phone: user.phone,
      emailStatus: 'skipped',
      smsStatus: 'skipped',
      sentAt: new Date(),
    };

    if (!wantsThisType) return result;

    const subject = `⚠️ ${alert.riskLevel.toUpperCase()} ${disasterType.toUpperCase()} Alert`;
    const emailHtml = notificationService.buildAlertEmail(alert);
    const smsText = notificationService.buildAlertSMS(alert);

    if (prefs.email !== false && user.email) {
      const emailResult = await notificationService.sendEmail(user.email, subject, emailHtml);
      result.emailStatus = emailResult.success ? 'sent' : 'failed';
    }

    if (prefs.sms === true && user.phone) {
      const smsResult = await notificationService.sendSMS(user.phone, smsText);
      result.smsStatus = smsResult.success ? 'sent' : 'failed';
    }

    return result;
  }

  _buildMessage(disasterType, riskLevel, probability, location) {
    const pct = Math.round(probability * 100);
    const place = location?.city || location?.address || 'your region';
    const messages = {
      earthquake: `A ${riskLevel} risk earthquake has been detected near ${place} with ${pct}% probability. Please take immediate precautions.`,
      flood: `Flooding conditions have been predicted near ${place} with ${pct}% probability (${riskLevel} risk). Move to higher ground if necessary.`,
      landslide: `A ${riskLevel} risk landslide has been predicted near ${place} with ${pct}% probability. Evacuate slope areas immediately.`,
    };
    return messages[disasterType] || `A ${riskLevel} risk disaster has been detected near ${place}.`;
  }

  async getActiveAlerts(filters = {}) {
    const query = { isActive: true, ...filters };

    if (mongoose.connection.readyState !== 1) {
      return getAlerts(query).slice(0, 50);
    }

    return Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('predictionId', 'inputData modelVersion');
  }

  async getAlertStats() {
    if (mongoose.connection.readyState !== 1) {
      return getAlertStats();
    }

    const [total, active, byType] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ isActive: true }),
      Alert.aggregate([
        { $group: { _id: '$disasterType', count: { $sum: 1 }, totalNotified: { $sum: '$totalNotified' } } },
      ]),
    ]);

    return { total, active, byType };
  }

  async resolveAlert(alertId) {
    if (mongoose.connection.readyState !== 1) {
      return updateAlert(alertId, { isActive: false, resolvedAt: new Date() });
    }

    return Alert.findByIdAndUpdate(
      alertId,
      { isActive: false, resolvedAt: new Date() },
      { new: true }
    );
  }
}

module.exports = new AlertService();
