const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/', alertController.getAlerts);
router.get('/stats', restrictTo('admin', 'responder'), alertController.getAlertStats);
router.get('/:id', alertController.getAlertById);
router.patch('/:id/resolve', restrictTo('admin', 'responder'), alertController.resolveAlert);

module.exports = router;
