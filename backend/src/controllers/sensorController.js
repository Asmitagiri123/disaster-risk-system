const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const SensorData = require('../models/SensorData');
const predictionService = require('../services/predictionService');
const logger = require('../utils/logger');
const { addSensorData, getSensorData: getStoredSensorData, getLatestSensorData } = require('../utils/inMemoryStore');

exports.ingestSensorData = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { sensorId, sensorType, disasterType, location, readings } = req.body;

    const sensorData = mongoose.connection.readyState === 1
      ? await SensorData.create({
        sensorId,
        sensorType,
        disasterType,
        location,
        readings,
        rawData: req.body,
        processedAt: new Date(),
      })
      : addSensorData({
        sensorId,
        sensorType,
        disasterType,
        location,
        readings,
        rawData: req.body,
        processedAt: new Date(),
      });

    logger.info(`Sensor data ingested: ${sensorId} (${disasterType})`);

    // Auto-trigger prediction from sensor data
    const { prediction, mlResult } = await predictionService.predict(
      disasterType,
      readings,
      location,
      { predictedBy: 'sensor', affectedRadius: 30 }
    );

    sensorData.predictionTriggered = true;
    sensorData.predictionId = prediction._id;
    if (mongoose.connection.readyState === 1) {
      await sensorData.save();
    }

    res.status(201).json({
      success: true,
      message: 'Sensor data ingested and prediction triggered',
      data: {
        sensorDataId: sensorData._id,
        prediction: {
          id: prediction._id,
          disasterType: prediction.disasterType,
          riskLevel: prediction.riskLevel,
          probability: prediction.probability,
          alertTriggered: prediction.alertTriggered,
        },
      },
    });
  } catch (err) {
    logger.error(`Sensor ingest error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to ingest sensor data' });
  }
};

exports.getSensorData = async (req, res) => {
  try {
    const { sensorId, disasterType, limit = 50 } = req.query;
    const query = {};
    if (sensorId) query.sensorId = sensorId;
    if (disasterType) query.disasterType = disasterType;

    if (mongoose.connection.readyState !== 1) {
      const data = getStoredSensorData(query, parseInt(limit));
      return res.json({ success: true, count: data.length, data: { sensorReadings: data } });
    }

    const data = await SensorData.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('predictionId', 'riskLevel probability alertTriggered');

    res.json({ success: true, count: data.length, data: { sensorReadings: data } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch sensor data' });
  }
};

exports.getLatestReadings = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const latest = getLatestSensorData();
      return res.json({ success: true, count: latest.length, data: { sensors: latest } });
    }

    const latest = await SensorData.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$sensorId', latestReading: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latestReading' } },
    ]);

    res.json({ success: true, count: latest.length, data: { sensors: latest } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch latest readings' });
  }
};
