// One-off poll of real Open-Meteo weather through the prediction pipeline.
// Usage: npm run poll:external
require('dotenv').config();
const connectDB = require('../src/config/db');
const externalDataService = require('../src/services/externalDataService');

(async () => {
  try {
    await connectDB();
    console.log('Polling real external sources (Open-Meteo weather)...');
    const result = await externalDataService.pollAll();
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Poll failed:', err.message);
    process.exit(1);
  }
})();
