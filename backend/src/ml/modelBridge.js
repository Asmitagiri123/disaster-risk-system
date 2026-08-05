let tf;

try {
  tf = require('@tensorflow/tfjs-node');
} catch (err) {
  tf = null;
}

const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');
const { getParser } = require('../utils/dataParser');
const { DISASTER_TYPES, getRiskLevel, calibrateProbability, getRuleRiskClass } = require('../config/constants');

// Disaster types served by the Python XGBoost ML service
const EXTERNAL_MODEL_TYPES = ['flood', 'landslide'];

class MLService {
  constructor() {
    this.tf = tf;
    this.models = {};
    this.mlServiceUrl = process.env.ML_SERVICE_URL || '';
    this.mlServiceDownUntil = 0; // circuit-breaker: skip dead service for a window
    this.modelPaths = {
      [DISASTER_TYPES.EARTHQUAKE]: process.env.EARTHQUAKE_MODEL_PATH,
      [DISASTER_TYPES.FLOOD]: process.env.FLOOD_MODEL_PATH,
      [DISASTER_TYPES.LANDSLIDE]: process.env.LANDSLIDE_MODEL_PATH,
    };
    this.thresholds = {
      [DISASTER_TYPES.EARTHQUAKE]: parseFloat(process.env.EARTHQUAKE_THRESHOLD) || 0.70,
      [DISASTER_TYPES.FLOOD]: parseFloat(process.env.FLOOD_THRESHOLD) || 0.65,
      [DISASTER_TYPES.LANDSLIDE]: parseFloat(process.env.LANDSLIDE_THRESHOLD) || 0.60,
    };
  }

  async loadModels() {
    if (!this.tf) {
      logger.warn('TensorFlow runtime unavailable. Using mock predictions for all disasters.');
      Object.keys(this.modelPaths).forEach((type) => {
        this.models[type] = null;
      });
      return;
    }

    for (const [type, modelPath] of Object.entries(this.modelPaths)) {
      try {
        const resolvedPath = path.resolve(modelPath);
        this.models[type] = await this.tf.loadLayersModel(`file://${resolvedPath}`);
        logger.info(`Loaded ${type} model from ${resolvedPath}`);
      } catch (err) {
        logger.warn(`Could not load ${type} model: ${err.message}. Using mock predictions.`);
        this.models[type] = null;
      }
    }
  }

  async predict(disasterType, inputData, location = {}) {
    // Prefer the Python ML service; on failure, fall back to the local predictor
    // (a short circuit-breaker stops us hammering a dead service).
    const mlDown = Date.now() < this.mlServiceDownUntil;
    if (this.mlServiceUrl && EXTERNAL_MODEL_TYPES.includes(disasterType) && !mlDown) {
      try {
        const external = await this._externalPredict(disasterType, inputData, location);
        logger.info(`Prediction from external ML service for ${disasterType}: ${external.probability}`);
        return external;
      } catch (err) {
        this.mlServiceDownUntil = Date.now() + 30 * 1000; // retry in 30s
        logger.warn(`External ML service unavailable (${err.message}). Falling back to local predictor.`);
      }
    }

    const parser = getParser(disasterType);
    if (!parser) throw new Error(`Unsupported disaster type: ${disasterType}`);

    const features = parser(inputData);
    let probability;

    if (this.models[disasterType]) {
      probability = await this._runModel(disasterType, features);
    } else {
      // Mock prediction for development/testing
      probability = this._mockPredict(disasterType, inputData);
      logger.debug(`Using mock prediction for ${disasterType}: ${probability}`);
    }

    const riskLevel = getRiskLevel(probability);
    const shouldAlert = probability >= this.thresholds[disasterType];
    // Cap to a risk-consistent band so a "high" alert never displays as ~100%.
    probability = calibrateProbability(probability, riskLevel);

    // Same rainfall-rule cross-check as the external path, for fallback runs.
    const rule = getRuleRiskClass(disasterType, inputData);
    const modelClass = ({ low: 0, moderate: 1, high: 2 })[riskLevel];
    const ruleAgreed = rule ? rule.riskClass === modelClass : null;

    return {
      disasterType,
      probability: parseFloat(probability.toFixed(4)),
      riskLevel,
      shouldAlert,
      threshold: this.thresholds[disasterType],
      features,
      verification: rule
        ? {
            method: 'rainfall-rule',
            ruleClass: rule.riskClass,
            ruleRiskLevel: rule.riskLevel,
            modelClass,
            modelRiskLevel: riskLevel,
            ruleAgreed,
            checkedAt: new Date().toISOString(),
          }
        : null,
    };
  }

  async _externalPredict(disasterType, inputData, location) {
    const url = `${this.mlServiceUrl.replace(/\/$/, '')}/predict`;
    const { data } = await axios.post(url, {
      disasterType,
      sensorData: inputData,
      location,
    }, { timeout: 5000 });

    if (data.districtInferred) {
      logger.warn(`District not matched explicitly; using inferred district: ${data.district}`);
    }

    const confidence = parseFloat(data.probability);
    const riskLevel = data.riskLevel;

    // Cross-check: does the model's class match the rainfall rule it was
    // trained against? null if either is unavailable; a mismatch is logged but
    // never suppresses the alert.
    const rule = getRuleRiskClass(disasterType, inputData);
    const modelClass = Number(data.predictedClass);
    const hasModelClass = Number.isInteger(modelClass) && modelClass >= 0;
    const ruleAgreed = rule && hasModelClass ? rule.riskClass === modelClass : null;
    if (ruleAgreed === false) {
      logger.warn(
        `Cross-check MISMATCH (informational — alert kept): ${disasterType} ${data.district} ` +
        `model=${data.riskLevel} vs rainfall rule=${rule.riskLevel} ` +
        `(rain=${inputData.rainfall}, r3=${inputData.rainfall_roll3}, r7=${inputData.rainfall_roll7})`
      );
    }

    return {
      disasterType,
      // Class confidence is often ~1.0; cap to the risk band (raw kept below).
      probability: calibrateProbability(confidence, riskLevel),
      confidence,
      riskLevel,
      shouldAlert: data.shouldAlert,
      threshold: this.thresholds[disasterType],
      features: data.features || null,
      modelVersion: data.modelVersion || 'xgboost-77districts',
      district: data.district,
      terrain: data.terrain,
      predictedClass: data.predictedClass,
      // null when the rule can't be applied (e.g. earthquake)
      verification: rule
        ? {
            method: 'rainfall-rule',
            ruleClass: rule.riskClass,
            ruleRiskLevel: rule.riskLevel,
            modelClass: hasModelClass ? modelClass : null,
            modelRiskLevel: riskLevel,
            ruleAgreed,
            checkedAt: new Date().toISOString(),
          }
        : null,
    };
  }

  async _runModel(disasterType, features) {
    const tensor = this.tf.tensor2d([features]);
    const output = this.models[disasterType].predict(tensor);
    const result = await output.data();
    tensor.dispose();
    output.dispose();
    return result[0];
  }

  _mockPredict(disasterType, data) {
    // Deterministic mock based on input values — useful for dev testing
    const values = Object.values(data).filter(v => typeof v === 'number');
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);

    const seeds = {
      [DISASTER_TYPES.EARTHQUAKE]: (data.magnitude || 0) / 10,
      [DISASTER_TYPES.FLOOD]: (data.waterLevel || 0) / 20,
      [DISASTER_TYPES.LANDSLIDE]: (data.soilMoisture || 0) / 100,
    };

    const base = seeds[disasterType] || 0.3;
    return Math.min(0.99, Math.max(0.01, base + (avg % 0.3)));
  }

  async getModelInfo() {
    if (!this.mlServiceUrl) return null;
    try {
      const { data } = await axios.get(
        `${this.mlServiceUrl.replace(/\/$/, '')}/models/info`,
        { timeout: 4000 }
      );
      return data;
    } catch (err) {
      logger.warn(`Could not fetch ML model info: ${err.message}`);
      return null;
    }
  }

  isLoaded(disasterType) {
    return !!this.models[disasterType];
  }
}

module.exports = new MLService();
