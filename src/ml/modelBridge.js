let tf;

try {
  tf = require('@tensorflow/tfjs-node');
} catch (err) {
  tf = null;
}

const path = require('path');
const logger = require('../utils/logger');
const { getParser } = require('../utils/dataParser');
const { DISASTER_TYPES, getRiskLevel } = require('../config/constants');

class MLService {
  constructor() {
    this.tf = tf;
    this.models = {};
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

  async predict(disasterType, inputData) {
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

    return {
      disasterType,
      probability: parseFloat(probability.toFixed(4)),
      riskLevel,
      shouldAlert,
      threshold: this.thresholds[disasterType],
      features,
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

  isLoaded(disasterType) {
    return !!this.models[disasterType];
  }
}

module.exports = new MLService();
