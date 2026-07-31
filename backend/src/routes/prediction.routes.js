const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { protect, restrictTo } = require('../middleware/auth');
const { predictionLimiter } = require('../middleware/rateLimiter');

// All prediction routes require authentication
router.use(protect);

router.post(
  '/',
  predictionLimiter,
  [
    body('disasterType').isIn(['earthquake', 'flood', 'landslide']).withMessage('Invalid disaster type'),
    body('sensorData').isObject().withMessage('sensorData must be an object'),
    body('location.coordinates').isArray({ min: 2, max: 2 }).withMessage('coordinates must be [longitude, latitude]'),
  ],
  predictionController.predict
);

router.get('/', predictionController.getPredictions);
router.get('/stats', restrictTo('admin', 'responder'), predictionController.getStats);
router.get('/:id', predictionController.getPredictionById);

module.exports = router;
