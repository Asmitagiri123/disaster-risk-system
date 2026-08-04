const nodemailer = require('nodemailer');
const Alert = require('../models/Alert');
const User = require('../models/User');
const notificationService = require('./notificationService');
const { getUsersInRadius } = require('../utils/geoHelper');
const { normalizeDistrict, provinceOfDistrict } = require('../utils/nepalRegions');
const { calibrateProbability } = require('../config/constants');
const liveBus = require('./liveEventBus');
const logger = require('../utils/logger');

// Message text; probability is capped to its risk band before formatting.
function buildAlertMessage(disasterType, riskLevel, probability, location) {
  const pct = Math.round((calibrateProbability(probability, riskLevel) || 0) * 100);
  const place = location?.city || location?.address || 'your region';
  const messages = {
    earthquake: `A ${riskLevel} risk earthquake has been detected near ${place} with ${pct}% probability. Please take immediate precautions.`,
    flood: `Flooding conditions have been predicted near ${place} with ${pct}% probability (${riskLevel} risk). Move to higher ground if necessary.`,
    landslide: `A ${riskLevel} risk landslide has been predicted near ${place} with ${pct}% probability. Evacuate slope areas immediately.`,
  };
  return messages[disasterType] || `A ${riskLevel} risk disaster has been detected near ${place}.`;
}

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

    const alert = await Alert.create({
      predictionId: prediction._id,
      disasterType,
      riskLevel,
      probability,
      location,
      message,
      affectedRadius,
      verification: prediction.verification || null,
    });

    logger.info(`Alert created: ${alert._id} for ${disasterType} (${riskLevel})`);

    // Notify users subscribed to this location (district/province) AND users
    // physically within range when coordinates exist.
    const coords = location?.coordinates;
    const hasCoords = Array.isArray(coords) && coords.length === 2 && coords.every(c => Number.isFinite(c));
    const district = normalizeDistrict(location?.city);
    const province = provinceOfDistrict(location?.city);
    const [geoUsers, locationUsers] = await Promise.all([
      hasCoords ? getUsersInRadius(User, coords[1], coords[0], affectedRadius) : [],
      (district || province)
        ? User.find({
            isActive: true,
            $or: [
              ...(district ? [{ district }] : []),
              ...(province ? [{ province }] : []),
            ],
          })
        : [],
    ]);
    const seen = new Set();
    const usersToNotify = [...geoUsers, ...locationUsers].filter(u => {
      if (seen.has(String(u._id))) return false;
      seen.add(String(u._id));
      return true;
    });

    logger.info(
      `Notifying ${usersToNotify.length} users (${locationUsers.length} by location, ${geoUsers.length} in radius)`
    );

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

    liveBus.emit('alert:new', {
      alert: {
        id: alert._id,
        disasterType: alert.disasterType,
        riskLevel: alert.riskLevel,
        probability: alert.probability,
        message: alert.message,
        location: alert.location || {},
        affectedRadius: alert.affectedRadius,
        createdAt: alert.createdAt,
        verification: alert.verification || null,
      },
    });

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
    return buildAlertMessage(disasterType, riskLevel, probability, location);
  }

  async getActiveAlerts(filters = {}, limit) {
    const query = { isActive: true, ...filters };
    // No hard cap by default so list, map, badges and stats all agree on the
    // count. Callers that only need a bounded sample pass a limit.
    let q = Alert.find(query)
      .sort({ createdAt: -1 })
      // inputData + predictedBy feed the UI's "live evidence"; verification
      // (rainfall-rule cross-check) powers the "cross-verified" badge.
      .populate('predictionId', 'inputData modelVersion predictedBy verification');
    if (limit) q = q.limit(limit);
    return q;
  }

  async resolveAlert(alertId) {
    const alert = await Alert.findByIdAndUpdate(
      alertId,
      { isActive: false, resolvedAt: new Date() },
      { new: true }
    );

    if (alert) {
      liveBus.emit('alert:resolved', {
        alertId: alert._id,
        resolvedAt: alert.resolvedAt,
      });
    }

    return alert;
  }

  // Record a field report against an alert (confirmed / not-confirmed).
  // Write-forward only: a report happened, so it's not reversible.
  async confirmAlert(alertId, status, user, note = '') {
    const valid = ['confirmed', 'not-confirmed'];
    if (!valid.includes(status)) {
      throw new Error(`groundTruth status must be one of: ${valid.join(', ')}`);
    }

    const alert = await Alert.findByIdAndUpdate(
      alertId,
      {
        groundTruth: {
          status,
          by: user ? user._id : null,
          at: new Date(),
          note: String(note || '').slice(0, 500),
        },
      },
      { new: true }
    );

    if (alert) {
      logger.info(`Alert ${alert._id} marked ${status} by ${user ? user.id : 'unknown'}`);
      liveBus.emit('alert:confirmed', {
        alertId: alert._id,
        status,
        by: user ? user.id : null,
        at: alert.groundTruth.at || new Date().toISOString(),
        note: String(note || '').slice(0, 500),
      });
    }

    return alert;
  }

  // Confirmed vs not-confirmed vs pending counts, per risk band. Answers
  // "do high-probability alerts actually happen?" with real field data.
  async getGroundTruthStats() {
    const [total, confirmed, notConfirmed, pending, byRisk] = await Promise.all([
      Alert.countDocuments({ 'groundTruth.status': { $exists: true, $ne: 'pending' } }),
      Alert.countDocuments({ 'groundTruth.status': 'confirmed' }),
      Alert.countDocuments({ 'groundTruth.status': 'not-confirmed' }),
      // "Pending" includes legacy alerts created before ground truth existed.
      Alert.countDocuments({
        $or: [
          { groundTruth: { $exists: false } },
          { 'groundTruth.status': 'pending' },
        ],
      }),
      Alert.aggregate([
        {
          $group: {
            _id: { riskLevel: '$riskLevel', status: { $ifNull: ['$groundTruth.status', 'pending'] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.riskLevel': 1 } },
      ]),
    ]);

    return {
      reviewed: total,
      confirmed,
      notConfirmed,
      pending,
      confirmationRate: total > 0 ? Math.round((confirmed / total) * 1000) / 10 : null,
      byRisk,
    };
  }
}

module.exports = new AlertService();
// Exported so scripts can regenerate messages with the same wording.
module.exports.buildAlertMessage = buildAlertMessage;
