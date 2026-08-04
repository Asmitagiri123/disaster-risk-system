const { validationResult } = require('express-validator');
const predictionService = require('../services/predictionService');
const mlService = require('../ml/modelBridge');
const { DISASTER_TYPES } = require('../config/constants');
const logger = require('../utils/logger');

exports.predict = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { disasterType, sensorData, location, affectedRadius } = req.body;

    if (!Object.values(DISASTER_TYPES).includes(disasterType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid disaster type. Use: ${Object.values(DISASTER_TYPES).join(', ')}`,
      });
    }

    const { prediction, mlResult } = await predictionService.predict(
      disasterType,
      sensorData,
      location,
      {
        userId: req.user?.id,
        predictedBy: 'manual',
        affectedRadius: affectedRadius || 50,
      }
    );

    res.status(201).json({
      success: true,
      data: {
        predictionId: prediction._id,
        disasterType: prediction.disasterType,
        probability: prediction.probability,
        riskLevel: prediction.riskLevel,
        alertTriggered: prediction.alertTriggered,
        location: prediction.location,
        modelResult: {
          shouldAlert: mlResult.shouldAlert,
          threshold: mlResult.threshold,
          modelVersion: mlResult.modelVersion,
          district: mlResult.district || location?.city || null,
          terrain: mlResult.terrain || null,
          riskLevel: mlResult.riskLevel || prediction.riskLevel,
          predictedClass: mlResult.predictedClass ?? null,
          verification: mlResult.verification || null,
        },
        createdAt: prediction.createdAt,
      },
    });
  } catch (err) {
    logger.error(`Prediction error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Prediction failed', error: err.message });
  }
};

exports.getPredictions = async (req, res) => {
  try {
    const { disasterType, riskLevel, startDate, endDate, page = 1, limit = 20 } = req.query;

    const result = await predictionService.getHistory(
      { disasterType, riskLevel, startDate, endDate },
      parseInt(page),
      parseInt(limit)
    );

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Get predictions error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch predictions' });
  }
};

exports.getPredictionById = async (req, res) => {
  try {
    const Prediction = require('../models/Prediction');
    const prediction = await Prediction.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('alertId');

    if (!prediction) {
      return res.status(404).json({ success: false, message: 'Prediction not found' });
    }

    res.json({ success: true, data: { prediction } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch prediction' });
  }
};

exports.getModelInfo = async (req, res) => {
  try {
    const info = await mlService.getModelInfo();
    if (!info) {
      return res.status(503).json({ success: false, message: 'ML service unavailable' });
    }
    res.json({ success: true, data: info });
  } catch (err) {
    logger.error(`Get model info error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch model info' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const stats = await predictionService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};
