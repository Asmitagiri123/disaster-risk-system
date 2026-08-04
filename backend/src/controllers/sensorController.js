const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const SensorData = require('../models/SensorData');
const predictionService = require('../services/predictionService');
const liveBus = require('../services/liveEventBus');
const logger = require('../utils/logger'); // Keep this, it's used

exports.ingestSensorData = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { sensorId, sensorType, disasterType, location, readings } = req.body;

    const sensorData = await SensorData.create({
      sensorId,
      sensorType,
      disasterType,
      location,
      readings,
      rawData: req.body,
      processedAt: new Date(),
    });

    logger.info(`Sensor data ingested: ${sensorId} (${disasterType})`);

    // Auto-trigger a prediction from the sensor reading
    const { prediction, mlResult } = await predictionService.predict(
      disasterType,
      readings,
      location,
      { predictedBy: 'sensor', affectedRadius: 30 }
    );

    sensorData.predictionTriggered = true;
    sensorData.predictionId = prediction._id;
    await sensorData.save();

    liveBus.emit('sensor:ingest', {
      sensorId,
      sensorType,
      disasterType,
      location,
      readings,
      processedAt: sensorData.processedAt,
    });

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

    const parsedLimit = parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 50;

    const data = await SensorData.find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .populate('predictionId', 'riskLevel probability alertTriggered');

    res.json({ success: true, count: data.length, data: { sensorReadings: data } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch sensor data' });
  }
};

exports.getLatestReadings = async (req, res) => {
  try {
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
