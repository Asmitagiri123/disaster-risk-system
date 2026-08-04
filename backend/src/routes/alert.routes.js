const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { protect, restrictTo } = require('../middleware/auth');

// TEMPORARY - remove after testing
router.post('/test-email-alert', async (req, res) => {
  const notificationService = require('../services/notificationService');

  const fakeAlert = {
    disasterType: 'flood',
    riskLevel: 'high',
    probability: 0.82,
    message: 'This is a test flood alert to verify email delivery.',
    location: { city: 'Biratnagar', country: 'Nepal' },
    affectedRadius: 25,
    createdAt: new Date(),
  };

  const subject = `⚠️ TEST ${fakeAlert.riskLevel.toUpperCase()} ${fakeAlert.disasterType.toUpperCase()} Alert`;
  const html = notificationService.buildAlertEmail(fakeAlert);

  const result = await notificationService.sendEmail(
    process.env.ALERT_RECEIVER,
    subject,
    html
  );

  res.json(result);
});

router.use(protect);

router.get('/', alertController.getAlerts);
router.get('/stats', restrictTo('admin', 'responder'), alertController.getAlertStats);
router.get('/:id', alertController.getAlertById);
router.patch('/:id/resolve', restrictTo('admin', 'responder'), alertController.resolveAlert);
// Record human ground truth: mark an alert confirmed / not-confirmed by
// field report (model confidence vs confirmed events).
router.patch('/:id/confirm', restrictTo('admin', 'responder'), alertController.confirmAlert);

module.exports = router;
