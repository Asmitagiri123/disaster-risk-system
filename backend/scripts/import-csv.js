const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const dotenv = require('dotenv');
const connectDB = require('../src/config/db');
const SensorData = require('../src/models/SensorData');
const predictionService = require('../src/services/predictionService');

dotenv.config();

async function importCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  await connectDB();

  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  for (const row of rows) {
    const disasterType = row.disasterType || row.type || 'flood';
    const sensorId = row.sensorId || row.id || `sensor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const readings = {};
    const knownFields = ['magnitude', 'depth', 'seismicActivity', 'groundVibration', 'rainfall', 'waterLevel', 'riverFlow', 'soilMoisture', 'slopeAngle', 'soilType', 'vegetationCover', 'groundDisplacement', 'humidity', 'elevation', 'temperature'];

    for (const field of knownFields) {
      if (row[field] !== undefined && row[field] !== '') {
        readings[field] = Number(row[field]);
      }
    }

    const location = {
      type: 'Point',
      coordinates: [
        Number(row.longitude ?? row.lon ?? row.lng ?? 0),
        Number(row.latitude ?? row.lat ?? 0),
      ],
      address: row.address || `${row.location || 'Unknown'}`,
    };

    const sensorData = await SensorData.create({
      sensorId,
      sensorType: row.sensorType || 'meteorological',
      disasterType,
      location,
      readings,
      rawData: row,
      processedAt: new Date(),
    });

    const { prediction } = await predictionService.predict(
      disasterType,
      readings,
      location,
      { predictedBy: 'csv-import', affectedRadius: 30 }
    );

    sensorData.predictionTriggered = true;
    sensorData.predictionId = prediction._id;
    await sensorData.save();
  }

  console.log(`Imported ${rows.length} rows from ${filePath}`);
  process.exit(0);
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: npm run import:csv -- path/to/file.csv');
  process.exit(1);
}

const absolutePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
importCsv(absolutePath).catch((err) => {
  console.error('CSV import failed:', err.message);
  process.exit(1);
});
