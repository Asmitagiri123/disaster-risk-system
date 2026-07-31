const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const sensorController = require('../controllers/sensorController');
const { protect, protectOrApiKey } = require('../middleware/auth');
const { sensorLimiter } = require('../middleware/rateLimiter');

// Sensor data ingest — protected by JWT or sensor API key
router.post(
  '/data',
  sensorLimiter,
  protectOrApiKey,
  [
    body('sensorId').trim().notEmpty().withMessage('sensorId is required'),
    body('disasterType')
      .isIn(['earthquake', 'flood', 'landslide'])
      .withMessage('Valid disasterType is required'),
    body('location.coordinates')
      .isArray({ min: 2, max: 2 })
      .withMessage('location.coordinates must be [longitude, latitude]'),
    body('readings').isObject().withMessage('readings must be provided'),
  ],
  sensorController.ingestSensorData
);
router.get('/data', protect, sensorController.getSensorData);
router.get('/latest', protect, sensorController.getLatestReadings);

module.exports = router;
