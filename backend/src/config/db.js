const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    logger.warn('MONGO_URI not set. Skipping MongoDB connection.');
    return null;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.warn(`MongoDB connection unavailable: ${error.message}. Continuing without database.`);
    return null;
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

module.exports = connectDB;
