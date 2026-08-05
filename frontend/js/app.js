const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('./utils/logger');

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const authRoutes = require('./routes/auth.routes');
const alertRoutes = require('./routes/alert.routes');
const predictionRoutes = require('./routes/prediction.routes');
const sensorRoutes = require('./routes/sensor.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const eventRoutes = require('./routes/events.routes');

const app = express();

// Enable CORS for all routes
app.use(cors());

app.use(express.json());

// Mount Routers
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/predictions', predictionRoutes);
app.use('/api/v1/sensors', sensorRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/events', eventRoutes);

app.get('/health', (req, res) => res.json({ success: true, status: 'ok', service: 'Disaster Prediction API' }));

module.exports = app;