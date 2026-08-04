const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.get('/overview', protect, dashboardController.getDashboardOverview);

module.exports = router;
