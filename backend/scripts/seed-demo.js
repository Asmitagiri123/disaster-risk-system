// Demo admin user + sample sensor readings that flow through the real
// prediction pipeline. Usage: npm run seed:demo
require('dotenv').config();
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const SensorData = require('../src/models/SensorData');
const predictionService = require('../src/services/predictionService');
const logger = require('../src/utils/logger');

// district -> [lat, lon] sample coordinates (lon, lat for GeoJSON)
const SAMPLE_LOCATIONS = {
  Kathmandu: [85.324, 27.7172],
  Sindhupalchok: [85.68, 27.95],
  Ilam: [87.93, 26.91],
  Kaski: [83.98, 28.21],
  Dang: [82.30, 28.05],
  Myagdi: [83.57, 28.35],
};

const SAMPLE_READINGS = {
  flood: (scale = 1) => ({
    rainfall: 180 * scale,
    riverFlow: 4200 * scale,
    humidity: 92,
    waterLevel: 8.5 * scale,
  }),
  landslide: (scale = 1) => ({
    rainfall: 200 * scale,
    soilMoisture: 85,
    slopeAngle: 35,
  }),
};

const SEED_PLAN = [
  { district: 'Kathmandu', type: 'flood', scale: 1.4 },
  { district: 'Sindhupalchok', type: 'landslide', scale: 1.6 },
  { district: 'Ilam', type: 'landslide', scale: 1.2 },
  { district: 'Kaski', type: 'landslide', scale: 1.0 },
  { district: 'Dang', type: 'flood', scale: 1.1 },
  { district: 'Myagdi', type: 'landslide', scale: 1.3 },
];

async function seed() {
  await connectDB();

  // 1. Demo admin user
  let admin = await User.findOne({ email: 'admin@flds.demo' });
  if (!admin) {
    admin = await User.create({
      name: 'Bagale Dada',
      email: 'admin@flds.demo',
      password: 'demo12345',
      role: 'admin',
      location: {
        type: 'Point',
        coordinates: SAMPLE_LOCATIONS.Kathmandu,
        city: 'Kathmandu',
        country: 'Nepal',
      },
    });
    logger.info(`Created demo admin: admin@flds.demo / demo12345`);
  } else {
    logger.info('Demo admin already exists — skipping');
  }

  // 2. Sample sensor readings -> predictions + alerts
  let created = 0;
  for (const { district, type, scale } of SEED_PLAN) {
    const [lon, lat] = SAMPLE_LOCATIONS[district];
    const existing = await SensorData.findOne({ sensorId: `demo-${type}-${district.toLowerCase()}` });
    if (existing) continue;

    const readings = SAMPLE_READINGS[type](scale);
    const sensorData = await SensorData.create({
      sensorId: `demo-${type}-${district.toLowerCase()}`,
      sensorType: type === 'flood' ? 'hydrological' : 'geotechnical',
      disasterType: type,
      location: {
        type: 'Point',
        coordinates: [lon, lat],
        address: `${district} District`,
        city: district,
        country: 'Nepal',
      },
      readings,
      rawData: { source: 'demo-seed' },
      processedAt: new Date(),
    });

    try {
      const { prediction } = await predictionService.predict(
        type,
        readings,
        { coordinates: [lon, lat], city: district, country: 'Nepal' },
        { predictedBy: 'sensor', affectedRadius: 40 }
      );
      sensorData.predictionTriggered = true;
      sensorData.predictionId = prediction._id;
      await sensorData.save();
      logger.info(`Seeded ${type} reading for ${district}: ${(prediction.probability * 100).toFixed(1)}% (${prediction.riskLevel})`);
      created += 1;
    } catch (err) {
      logger.error(`Seed prediction failed for ${district}: ${err.message}`);
    }
  }

  logger.info(`Demo seed complete — created ${created} new sensor readings`);
  process.exit(0);
}

seed().catch((err) => {
  logger.error(`Demo seed failed: ${err.message}`);
  process.exit(1);
});
