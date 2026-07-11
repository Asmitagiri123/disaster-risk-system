const Prediction = require('../models/Prediction');
const mlService = require('../ml/modelBridge');
const alertService = require('./alertService');
const logger = require('../utils/logger');

class PredictionService {
  async predict(disasterType, inputData, location, options = {}) {
    const result = await mlService.predict(disasterType, inputData);

    const prediction = await Prediction.create({
      disasterType,
      probability: result.probability,
      riskLevel: result.riskLevel,
      location,
      inputData,
      modelVersion: '1.0.0',
      predictedBy: options.predictedBy || 'manual',
      createdBy: options.userId || null,
    });

    logger.info(
      `Prediction created: ${disasterType} | ${result.riskLevel} | ${(result.probability * 100).toFixed(1)}%`
    );

    // Dispatch alert if threshold exceeded
    if (result.shouldAlert) {
      try {
        const alert = await alertService.createAndDispatch({
          ...prediction.toObject(),
          affectedRadius: options.affectedRadius || 50,
        });
        prediction.alertTriggered = true;
        prediction.alertId = alert._id;
        await prediction.save();
        logger.info(`Alert dispatched for prediction ${prediction._id}`);
      } catch (err) {
        logger.error(`Alert dispatch failed: ${err.message}`);
      }
    }

    return {
      prediction,
      mlResult: result,
    };
  }

  async getHistory(filters = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.disasterType) query.disasterType = filters.disasterType;
    if (filters.riskLevel) query.riskLevel = filters.riskLevel;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const [predictions, total] = await Promise.all([
      Prediction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name email'),
      Prediction.countDocuments(query),
    ]);

    return {
      predictions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getStats() {
    const [byType, byRisk, recent] = await Promise.all([
      Prediction.aggregate([
        { $group: { _id: '$disasterType', count: { $sum: 1 }, avgProbability: { $avg: '$probability' } } },
      ]),
      Prediction.aggregate([
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]),
      Prediction.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return { byType, byRisk, recentPredictions: recent };
  }
}

module.exports = new PredictionService();
