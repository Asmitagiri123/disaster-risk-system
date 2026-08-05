// Live weather for all 77 districts from Open-Meteo (free, no key), fed through
// the same prediction pipeline as real sensors. No earthquake polling: there is
// no quake model, so quake predictions would be fabricated. Quakes stay manual.
const axios = require('axios');
const SensorData = require('../models/SensorData');
const Alert = require('../models/Alert');
const predictionService = require('./predictionService');
const alertService = require('./alertService');
const logger = require('../utils/logger');

// All 77 districts with headquarters coordinates. Names must match the ML
// location encoder exactly (models/location_encoder_77districts.pkl).
const NEPAL_DISTRICTS = [
  { city: 'Bhojpur', lat: 27.1691, lon: 87.0506 },
  { city: 'Dhankuta', lat: 26.9808, lon: 87.3411 },
  { city: 'Ilam', lat: 26.9095, lon: 87.9254 },
  { city: 'Jhapa', lat: 26.5458, lon: 88.0872 },
  { city: 'Khotang', lat: 27.2025, lon: 86.7828 },
  { city: 'Morang', lat: 26.4525, lon: 87.2718 },
  { city: 'Okhaldhunga', lat: 27.3175, lon: 86.5056 },
  { city: 'Panchthar', lat: 27.1558, lon: 87.7522 },
  { city: 'Sankhuwasabha', lat: 27.3828, lon: 87.2056 },
  { city: 'Solukhumbu', lat: 27.4983, lon: 86.5703 },
  { city: 'Sunsari', lat: 26.5989, lon: 87.1475 },
  { city: 'Taplejung', lat: 27.3522, lon: 87.6692 },
  { city: 'Terhathum', lat: 27.1261, lon: 87.4539 },
  { city: 'Udayapur', lat: 26.7894, lon: 86.8336 },
  { city: 'Bara', lat: 27.0333, lon: 85.05 },
  { city: 'Dhanusa', lat: 26.7288, lon: 85.9221 },
  { city: 'Mahottari', lat: 26.6439, lon: 85.7981 },
  { city: 'Parsa', lat: 27.0123, lon: 84.8774 },
  { city: 'Rautahat', lat: 26.7658, lon: 85.2742 },
  { city: 'Saptari', lat: 26.5447, lon: 86.7469 },
  { city: 'Sarlahi', lat: 26.8583, lon: 85.5597 },
  { city: 'Siraha', lat: 26.6575, lon: 86.1981 },
  { city: 'Bhaktapur', lat: 27.671, lon: 85.4298 },
  { city: 'Chitwan', lat: 27.6833, lon: 84.4333 },
  { city: 'Dhading', lat: 27.8731, lon: 84.8647 },
  { city: 'Dolakha', lat: 27.6744, lon: 86.2239 },
  { city: 'Kathmandu', lat: 27.7172, lon: 85.324 },
  { city: 'Kavrepalanchok', lat: 27.6253, lon: 85.5456 },
  { city: 'Lalitpur', lat: 27.6682, lon: 85.3206 },
  { city: 'Makwanpur', lat: 27.4275, lon: 85.0319 },
  { city: 'Nuwakot', lat: 27.9103, lon: 85.1583 },
  { city: 'Ramechhap', lat: 27.3917, lon: 86.0622 },
  { city: 'Rasuwa', lat: 28.1136, lon: 85.2953 },
  { city: 'Sindhuli', lat: 27.2567, lon: 85.9753 },
  { city: 'Sindhupalchok', lat: 27.785, lon: 85.7094 },
  { city: 'Baglung', lat: 28.2711, lon: 83.5956 },
  { city: 'Gorkha', lat: 28.0, lon: 84.63 },
  { city: 'Kaski', lat: 28.2096, lon: 83.9856 },
  { city: 'Lamjung', lat: 28.2333, lon: 84.3833 },
  { city: 'Manang', lat: 28.55, lon: 84.2333 },
  { city: 'Mustang', lat: 28.7833, lon: 83.7333 },
  { city: 'Myagdi', lat: 28.35, lon: 83.5667 },
  { city: 'Nawalparasi East', lat: 27.6397, lon: 84.1256 },
  { city: 'Parbat', lat: 28.2217, lon: 83.6761 },
  { city: 'Syangja', lat: 27.9833, lon: 83.8667 },
  { city: 'Tanahu', lat: 27.9667, lon: 84.2667 },
  { city: 'Arghakhanchi', lat: 27.95, lon: 83.1333 },
  { city: 'Banke', lat: 28.05, lon: 81.6167 },
  { city: 'Bardiya', lat: 28.2333, lon: 81.3833 },
  { city: 'Dang', lat: 28.0, lon: 82.5 },
  { city: 'Gulmi', lat: 28.0667, lon: 83.25 },
  { city: 'Kapilbastu', lat: 27.55, lon: 83.05 },
  { city: 'Nawalparasi West', lat: 27.5333, lon: 83.6667 },
  { city: 'Palpa', lat: 27.8667, lon: 83.55 },
  { city: 'Pyuthan', lat: 28.1, lon: 82.85 },
  { city: 'Rolpa', lat: 28.2667, lon: 82.6167 },
  { city: 'Rukum East', lat: 28.6, lon: 82.6833 },
  { city: 'Rupandehi', lat: 27.5, lon: 83.45 },
  { city: 'Dailekh', lat: 28.8333, lon: 81.7167 },
  { city: 'Dolpa', lat: 28.9333, lon: 82.9167 },
  { city: 'Humla', lat: 29.9667, lon: 81.8333 },
  { city: 'Jajarkot', lat: 28.7, lon: 82.2667 },
  { city: 'Jumla', lat: 29.2833, lon: 82.1833 },
  { city: 'Kalikot', lat: 29.15, lon: 81.6 },
  { city: 'Mugu', lat: 29.5333, lon: 82.15 },
  { city: 'Salyan', lat: 28.3833, lon: 82.1667 },
  { city: 'Surkhet', lat: 28.6, lon: 81.6333 },
  { city: 'Rukum West', lat: 28.63, lon: 82.49 },
  { city: 'Achham', lat: 29.1114, lon: 81.2989 },
  { city: 'Baitadi', lat: 29.5833, lon: 80.55 },
  { city: 'Bajhang', lat: 29.55, lon: 81.2167 },
  { city: 'Bajura', lat: 29.5, lon: 81.4333 },
  { city: 'Dadeldhura', lat: 29.3, lon: 80.5833 },
  { city: 'Darchula', lat: 29.85, lon: 80.5333 },
  { city: 'Doti', lat: 29.2667, lon: 80.9333 },
  { city: 'Kailali', lat: 28.6833, lon: 80.5833 },
  { city: 'Kanchanpur', lat: 28.9667, lon: 80.3333 },
];

const API_TIMEOUT = 10000;
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Per-district poll parallelism, so we don't hammer Open-Meteo or the ML service.
const POLL_CONCURRENCY = parseInt(process.env.EXTERNAL_POLL_CONCURRENCY, 10) || 8;

// Min minutes between re-evaluations of a district (stays within the free tier).
const POLL_WINDOW_MIN = parseInt(process.env.EXTERNAL_POLL_WINDOW_MIN, 10) || 30;

// Districts with an active moderate+ alert are re-checked more often, so
// dangerous conditions get near-real-time attention within the free budget.
const FAST_TRACK_WINDOW_MIN = parseInt(process.env.EXTERNAL_FAST_TRACK_WINDOW_MIN, 10) || 15;
const FAST_TRACK_RISKS = ['moderate', 'high'];

// Run async fn over items with a bounded worker pool
async function mapWithConcurrency(items, concurrency, fn) {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (queue.length) {
        const item = queue.shift();
        await fn(item);
      }
    }
  );
  await Promise.all(workers);
}

// Dedup key for the poll window, so weather is only fetched once per window.
function pollBucket(windowMin, date = new Date()) {
  const bucketStart = Math.floor(date.getTime() / (windowMin * 60000)) * windowMin * 60000;
  return new Date(bucketStart).toISOString().slice(0, 16);
}

// True when the district has an active moderate+ alert (gets the fast window).
async function isFastTrack(city) {
  try {
    return await Alert.exists({
      isActive: true,
      'location.city': city,
      riskLevel: { $in: FAST_TRACK_RISKS },
    });
  } catch (err) {
    logger.warn(`Fast-track check failed for ${city}: ${err.message}`);
    return false;
  }
}

// Resolve stale external alerts so each district+type keeps at most one alert
// reflecting current conditions. Manual and real-sensor alerts are untouched.
async function expireStaleAlerts(city, cycleStart) {
  try {
    const active = await Alert.find({ isActive: true, 'location.city': city })
      .populate('predictionId', 'predictedBy createdAt')
      .lean();

    for (const alert of active) {
      const pred = alert.predictionId;
      if (!pred || pred.predictedBy !== 'external') continue;
      if (pred.createdAt >= cycleStart) continue; // this cycle's own alert
      await alertService.resolveAlert(alert._id);
      logger.info(`Auto-resolved stale ${pred.disasterType} alert for ${city} — superseded by fresh evaluation`);
    }
  } catch (err) {
    logger.warn(`Stale-alert expiry failed for ${city}: ${err.message}`);
  }
}

async function fetchWeather(city, lat, lon) {
  const { data } = await axios.get(OPEN_METEO_URL, {
    timeout: API_TIMEOUT,
    params: {
      latitude: lat,
      longitude: lon,
      past_days: 7, // real accumulated rain for the 3/7-day rolling features
      forecast_days: 1,
      current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_moisture_0_to_10cm',
      daily: 'precipitation_sum',
    },
  });

  const current = data.current || {};
  const dailySums = (data.daily && data.daily.precipitation_sum) || [];
  const sumLast = n => dailySums.slice(-n).reduce((a, b) => a + (b ?? 0), 0);
  const soilFraction = current.soil_moisture_0_to_10cm ?? null;

  return {
    source: 'open-meteo',
    city,
    lat,
    lon,
    temperature: current.temperature_2m ?? null,
    humidity: current.relative_humidity_2m ?? null,
    rainfall: current.precipitation ?? null, // current precipitation (mm)
    windSpeed: current.wind_speed_10m ?? null, // km/h
    // Open-Meteo returns soil moisture as a 0–1 fraction; convert to percent.
    soilMoisture: soilFraction !== null ? Math.round(soilFraction * 1000) / 10 : null,
    precipitation24h: dailySums.length ? dailySums[dailySums.length - 1] : null, // today's rain sum
    rainfallRoll3: dailySums.length ? sumLast(3) : null,
    rainfallRoll7: dailySums.length ? sumLast(7) : null,
    rainfallRoll7: dailySums.length ? sumLast(7) : null,
    forecastDate: (data.daily && data.daily.time && data.daily.time[data.daily.time.length - 1]) || null,
  };
}

// Skip already-processed readings. The stored externalId is suffixed per
// disaster type, so match the base id as a prefix.
async function alreadyIngested(externalId) {
  const escaped = externalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return SensorData.exists({ 'rawData.externalId': { $regex: `^${escaped}` } });
}

async function runPrediction(disasterType, readings, location, externalId, sensorId) {    // Record it like an IoT device would
    const sensorData = await SensorData.create({
    sensorId,
    sensorType: disasterType === 'flood' ? 'hydrological' : 'geotechnical',
    disasterType,
    location,
    readings,
    rawData: { source: 'external', externalId },
    processedAt: new Date(),
  });

  const { prediction, mlResult } = await predictionService.predict(
    disasterType,
    readings,
    location,
    { predictedBy: 'external', affectedRadius: 50 }
  );

  sensorData.predictionTriggered = true;
  sensorData.predictionId = prediction._id;
  await sensorData.save();

  return { sensorData, prediction, mlResult };
}

async function pollWeather() {
  const results = { districts: 0, predictions: 0, alerts: 0, errors: 0 };
  const cycleStart = new Date();

  const pollDistrict = async ({ city, lat, lon }) => {
    const windowMin = (await isFastTrack(city)) ? FAST_TRACK_WINDOW_MIN : POLL_WINDOW_MIN;
    const externalId = `open-meteo-${city}-${pollBucket(windowMin)}`;
    try {
      if (await alreadyIngested(externalId)) return;

      const w = await fetchWeather(city, lat, lon);
      if (w.rainfall === null && w.precipitation24h === null) return;

      const readings = {
        rainfall: w.precipitation24h ?? w.rainfall ?? 0,
        humidity: w.humidity ?? 90,
        temperature: w.temperature ?? 25,
        // snake_case keys are what the ML service reads; camelCase mirrors them
        // for display. No riverFlow: there's no free live discharge source for
        // Nepal, so the model's discharge feature keeps its default.
        windSpeed: w.windSpeed,
        wind_speed: w.windSpeed,
        soilMoisture: w.soilMoisture,
        soil_moisture: w.soilMoisture,
        rainfall_roll3: w.rainfallRoll3,
        rainfall_roll7: w.rainfallRoll7,
      };

      const location = { type: 'Point', coordinates: [lon, lat], city, address: `${city}, Nepal`, country: 'Nepal' };

      const types = ['flood', 'landslide']; // both risks key off rainfall
      for (const disasterType of types) {
        const r = await runPrediction(disasterType, readings, location, `${externalId}-${disasterType}`, `external-weather-${city}`);
        results.predictions += 1;
        if (r.prediction.alertTriggered) results.alerts += 1;
      }

      await expireStaleAlerts(city, cycleStart);

      results.districts += 1;
    } catch (err) {
      results.errors += 1;
      logger.warn(`Weather poll failed for ${city}: ${err.message}`);
    }
  };

  await mapWithConcurrency(NEPAL_DISTRICTS, POLL_CONCURRENCY, pollDistrict);

  return results;
}

async function pollAll() {
  const weather = await pollWeather();
  logger.info(`External data poll complete: ${weather.predictions} predictions, ${weather.alerts} alerts`);
  return { weather };
}

module.exports = { pollAll, pollWeather, NEPAL_DISTRICTS };
