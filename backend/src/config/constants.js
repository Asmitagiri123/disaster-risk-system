const RISK_LEVELS = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
};

const DISASTER_TYPES = {
  EARTHQUAKE: 'earthquake',
  FLOOD: 'flood',
  LANDSLIDE: 'landslide',
};

const ALERT_STATUS = {
  SENT: 'sent',
  FAILED: 'failed',
  PENDING: 'pending',
};

const getRiskLevel = (probability) => {
  if (probability >= 0.70) return RISK_LEVELS.HIGH;
  if (probability >= 0.40) return RISK_LEVELS.MODERATE;
  return RISK_LEVELS.LOW;
};

// Keep the displayed probability inside its risk level's band (see getRiskLevel).
const RISK_PROBABILITY_CAPS = {
  [RISK_LEVELS.LOW]: 0.35,
  [RISK_LEVELS.MODERATE]: 0.60,
  [RISK_LEVELS.HIGH]: 0.80,
};

// Cap raw confidence to its risk level's band. Non-numeric passes through.
const calibrateProbability = (probability, riskLevel) => {
  const raw = Number(probability);
  if (!Number.isFinite(raw)) return probability;
  const cap = RISK_PROBABILITY_CAPS[riskLevel];
  if (cap === undefined) return Math.min(0.95, Math.max(0.05, raw));
  return Math.min(raw, cap);
};

// Monsoon rainfall thresholds, matching the labelRule train.py used for labels.
// Alerts are "cross-verified" when the model and this rule agree on risk class.
const RULE_THRESHOLDS = {
  [DISASTER_TYPES.FLOOD]: {
    highRainDay: 80, highRoll7: 150, modRainDay: 30, modRoll7: 60,
  },
  [DISASTER_TYPES.LANDSLIDE]: {
    highRainDay: 60, highRoll3: 100, modRainDay: 20, modRoll3: 40,
  },
};

// Rainfall readings -> risk class (0/1/2), mirroring the training label rule.
const getRuleRiskClass = (disasterType, data = {}) => {
  const t = RULE_THRESHOLDS[disasterType];
  if (!t) return null;
  const rainfall = Number(data.rainfall ?? data.precipitation24h ?? 0);
  const roll3 = Number(data.rainfall_roll3 ?? data.rain_3day ?? rainfall);
  const roll7 = Number(data.rainfall_roll7 ?? data.rain_7day ?? rainfall);

  let riskClass = 0;
  if (disasterType === DISASTER_TYPES.FLOOD) {
    if (rainfall >= t.highRainDay || roll7 >= t.highRoll7) riskClass = 2;
    else if (rainfall >= t.modRainDay || roll7 >= t.modRoll7) riskClass = 1;
  } else {
    if (rainfall >= t.highRainDay || roll3 >= t.highRoll3) riskClass = 2;
    else if (rainfall >= t.modRainDay || roll3 >= t.modRoll3) riskClass = 1;
  }
  return { riskClass, riskLevel: ['low', 'moderate', 'high'][riskClass] };
};

module.exports = {
  RULE_THRESHOLDS,
  getRuleRiskClass,
  DISASTER_TYPES,
  RISK_LEVELS,
  ALERT_STATUS,
  RISK_PROBABILITY_CAPS,
  getRiskLevel,
  calibrateProbability,
};
