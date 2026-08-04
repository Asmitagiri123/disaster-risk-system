require('dotenv').config();
const path = require('path');
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
const dashboardRoutes = require('./routes/dashboard.routes');
const eventsRoutes = require('./routes/events.routes');

const app = express();

// Frontend uses inline scripts/handlers + CDN libs, so the strict default CSP
// is relaxed for those.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
      // Allow inline event handlers (onclick=, onsubmit=) used across the frontend
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https://*.basemaps.cartocdn.com', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'", 'http://localhost:8000', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
    },
  },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-sensor-api-key', 'sensor-api-key'],
}));
// Rate-limit API routes only, so static assets stay reachable under load
app.use('/api', globalLimiter);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP request logging — redact sensitive query params (e.g. SSE ?token=)
// so JWTs never land in the server log.
morgan.token('safe-url', (req) => {
  if (!req.originalUrl || req.originalUrl.indexOf('token=') === -1) return req.originalUrl;
  return req.originalUrl.replace(/([?&])token=[^&]*/g, '$1token=[REDACTED]');
});
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url" :status :res[content-length] - :response-time ms', {
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

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/predictions', predictionRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/sensors', sensorRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/events', eventsRoutes);

// Serve the frontend (single-app deployment)
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// Root route -> dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

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
