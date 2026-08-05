const dotenv = require('dotenv');
dotenv.config({ path: require('path').resolve(__dirname, '../../.env') });
const app = require('./app');
const connectDB = require('./config/db');
const mlService = require('./ml/modelBridge');
const { startAllJobs } = require('./jobs/predictionScheduler');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Load ML models
    await mlService.loadModels();

    // Start scheduled jobs
    startAllJobs();

    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API base: http://localhost:${PORT}/api/v1`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('Server and database connections closed');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (err) => {
      logger.error(`Unhandled Rejection: ${err.message}`);
      shutdown('unhandledRejection');
    });

  } catch (err) {
    logger.error(`Server startup failed: ${err.message}`);
    process.exit(1);
  }
};

startServer();
