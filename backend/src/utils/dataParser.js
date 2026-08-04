const { DISASTER_TYPES } = require('../config/constants');

// Feature order: [magnitude, depth, latitude, longitude, seismicActivity, groundVibration]
const parseEarthquakeData = (data) => {
  return [
    normalizeValue(data.magnitude, 0, 10),
    normalizeValue(data.depth, 0, 700),
    normalizeValue(data.latitude, -90, 90),
    normalizeValue(data.longitude, -180, 180),
    normalizeValue(data.seismicActivity || 0, 0, 100),
    normalizeValue(data.groundVibration || 0, 0, 100),
  ];
};

// Feature order: [rainfall, waterLevel, soilMoisture, riverFlow, humidity, elevation]
const parseFloodData = (data) => {
  return [
    normalizeValue(data.rainfall, 0, 500),
    normalizeValue(data.waterLevel, 0, 20),
    normalizeValue(data.soilMoisture, 0, 100),
    normalizeValue(data.riverFlow || 0, 0, 10000),
    normalizeValue(data.humidity, 0, 100),
    normalizeValue(data.elevation || 0, 0, 8000),
  ];
};

// Feature order: [rainfall, soilMoisture, slopeAngle, soilType, vegetationCover, groundDisplacement]
const parseLandslideData = (data) => {
  return [
    normalizeValue(data.rainfall, 0, 500),
    normalizeValue(data.soilMoisture, 0, 100),
    normalizeValue(data.slopeAngle, 0, 90),
    normalizeValue(data.soilType || 5, 1, 10),
    normalizeValue(data.vegetationCover || 50, 0, 100),
    normalizeValue(data.groundDisplacement || 0, 0, 100),
  ];
};

const normalizeValue = (value, min, max) => {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
};

const getParser = (disasterType) => {
  const parsers = {
    [DISASTER_TYPES.EARTHQUAKE]: parseEarthquakeData,
    [DISASTER_TYPES.FLOOD]: parseFloodData,
    [DISASTER_TYPES.LANDSLIDE]: parseLandslideData,
  };
  return parsers[disasterType] || null;
};

module.exports = { parseEarthquakeData, parseFloodData, parseLandslideData, getParser };
