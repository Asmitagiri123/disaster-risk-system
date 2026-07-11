const cron = require('node-cron');
const SensorData = require('../models/SensorData');
const predictionService = require('../services/predictionService');
const logger = require('../utils/logger');

/**
 * Process unprocessed sensor readings and run predictions
 * Runs every N minutes (set via SENSOR_POLL_INTERVAL)
 */
const schedulePredictions = () => {
  const interval = parseInt(process.env.SENSOR_POLL_INTERVAL) || 15;
  const cronExpression = `*/${interval} * * * *`;

  cron.schedule(cronExpression, async () => {
    logger.info('Running scheduled prediction job...');

    try {
      // Find sensor data not yet processed into predictions
      const unprocesed = await SensorData.find({
        predictionTriggered: false,
        createdAt: { $gte: new Date(Date.now() - interval * 60 * 1000) },
      }).limit(100);

      logger.info(`Found ${unprocesed.length} unprocessed sensor readings`);

      for (const sensor of unprocesed) {
        try {
          const { prediction } = await predictionService.predict(
            sensor.disasterType,
            sensor.readings,
            sensor.location,
            { predictedBy: 'scheduled', affectedRadius: 30 }
          );

          sensor.predictionTriggered = true;
          sensor.predictionId = prediction._id;
          await sensor.save();
        } catch (err) {
          logger.error(`Failed to predict for sensor ${sensor.sensorId}: ${err.message}`);
        }
      }

      logger.info('Scheduled prediction job completed');
    } catch (err) {
      logger.error(`Scheduled prediction job failed: ${err.message}`);
    }
  });

  logger.info(`Prediction scheduler started — runs every ${interval} minutes`);
};

/**
 * Daily cleanup job — removes old sensor data older than 90 days
 * Runs daily at 2:00 AM
 */
const scheduleCleanup = () => {
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running daily cleanup job...');
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const result = await SensorData.deleteMany({ createdAt: { $lt: cutoff } });
      logger.info(`Cleanup: removed ${result.deletedCount} old sensor records`);
    } catch (err) {
      logger.error(`Cleanup job failed: ${err.message}`);
    }
  });

  logger.info('Daily cleanup scheduler started (runs at 2:00 AM)');
};

const startAllJobs = () => {
  schedulePredictions();
  scheduleCleanup();
};

module.exports = { startAllJobs };
