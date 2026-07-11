require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const errorHandler = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./utils/logger');

// Route imports
const authRoutes = require('./routes/auth.routes');
const predictionRoutes = require('./routes/prediction.routes');
const alertRoutes = require('./routes/alert.routes');
const sensorRoutes = require('./routes/sensor.routes');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(globalLimiter);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP request logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'Disaster Prediction API',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/predictions', predictionRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/sensors', sensorRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
