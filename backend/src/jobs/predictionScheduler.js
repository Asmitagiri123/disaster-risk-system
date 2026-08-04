const cron = require('node-cron');
const SensorData = require('../models/SensorData');
const predictionService = require('../services/predictionService');
const externalDataService = require('../services/externalDataService');
const logger = require('../utils/logger');

// Predict for unprocessed sensor readings every SENSOR_POLL_INTERVAL min
const schedulePredictions = () => {
  const interval = parseInt(process.env.SENSOR_POLL_INTERVAL) || 15;
  const cronExpression = `*/${interval} * * * *`;

  cron.schedule(cronExpression, async () => {
    logger.info('Running scheduled prediction job...');

    try {
      const unprocessed = await SensorData.find({
        predictionTriggered: false,
        createdAt: { $gte: new Date(Date.now() - interval * 60 * 1000) },
      }).limit(100);

      logger.info(`Found ${unprocessed.length} unprocessed sensor readings`);

      for (const sensor of unprocessed) {
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

// Daily 2:00 AM job — drop sensor data older than 90 days
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

// Pull Open-Meteo weather through the ML pipeline every EXTERNAL_POLL_INTERVAL min
const scheduleExternalData = () => {
  const interval = parseInt(process.env.EXTERNAL_POLL_INTERVAL) || 10;
  const cronExpression = `*/${interval} * * * *`;

  cron.schedule(cronExpression, async () => {
    logger.info('Polling external data sources (Open-Meteo weather)...');
    try {
      await externalDataService.pollAll();
    } catch (err) {
      logger.error(`External data poll failed: ${err.message}`);
    }
  });

  logger.info(`External data scheduler started — polls weather every ${interval} minutes`);
};

const startAllJobs = () => {
  schedulePredictions();
  scheduleCleanup();
  scheduleExternalData();
};

module.exports = { startAllJobs };
