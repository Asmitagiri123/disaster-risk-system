module.exports = {
  DISASTER_TYPES: {
    EARTHQUAKE: 'earthquake',
    FLOOD: 'flood',
    LANDSLIDE: 'landslide',
  },

  RISK_LEVELS: {
    LOW: 'low',
    MODERATE: 'moderate',
    HIGH: 'high',
    CRITICAL: 'critical',
  },

  ALERT_STATUS: {
    SENT: 'sent',
    FAILED: 'failed',
    PENDING: 'pending',
  },

  getRiskLevel(probability) {
    if (probability >= 0.85) return this.RISK_LEVELS.CRITICAL;
    if (probability >= 0.65) return this.RISK_LEVELS.HIGH;
    if (probability >= 0.40) return this.RISK_LEVELS.MODERATE;
    return this.RISK_LEVELS.LOW;
  },
};
