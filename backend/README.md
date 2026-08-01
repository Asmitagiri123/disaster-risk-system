# Disaster Prediction & Early Warning System — Backend

AI-powered backend for predicting earthquakes, floods, and landslides using TensorFlow.js,
with real-time alerts via Email and SMS.

---

## Tech Stack
- **Runtime**: Node.js + Express
- **Database**: MongoDB (Mongoose)
- **ML**: TensorFlow.js (local model files)
- **Notifications**: Nodemailer (Email) + Twilio (SMS)
- **Auth**: JWT
- **Jobs**: node-cron

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Configure your sensor API key for secure ingestion
#    Set SENSOR_API_KEY in .env and include `x-sensor-api-key` in sensor POST requests.

# 4. Add your TF.js model files (or skip — mock predictions will be used)
mkdir -p src/ml/models/earthquake_model
mkdir -p src/ml/models/flood_model
mkdir -p src/ml/models/landslide_model

# 4. Start in development mode
npm run dev

# 5. Start in production
npm start
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register a new user |
| POST | `/api/v1/auth/login` | Login and get JWT |
| GET  | `/api/v1/auth/me` | Get current user (auth) |
| PUT  | `/api/v1/auth/profile` | Update profile (auth) |
| PUT  | `/api/v1/auth/change-password` | Change password (auth) |

### Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/predictions` | Run a prediction (auth) |
| GET  | `/api/v1/predictions` | Get prediction history (auth) |
| GET  | `/api/v1/predictions/stats` | Stats (admin/responder) |
| GET  | `/api/v1/predictions/:id` | Get one prediction (auth) |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/v1/alerts` | List alerts (auth) |
| GET  | `/api/v1/alerts/:id` | Get one alert (auth) |
| PATCH | `/api/v1/alerts/:id/resolve` | Resolve alert (admin) |
| GET  | `/api/v1/alerts/stats` | Alert stats (admin) |

### Sensors
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sensors/data` | Ingest sensor reading (JWT or sensor API key) |
| GET  | `/api/v1/sensors/data` | Get sensor history (auth) |
| GET  | `/api/v1/sensors/latest` | Latest reading per sensor (auth) |

---

## Sample Request: Run a Flood Prediction

```json
POST /api/v1/predictions
Authorization: Bearer <token>
Content-Type: application/json

{
  "disasterType": "flood",
  "sensorData": {
    "rainfall": 180,
    "waterLevel": 8.5,
    "soilMoisture": 85,
    "riverFlow": 4200,
    "humidity": 92,
    "elevation": 15
  },
  "location": {
    "coordinates": [85.3240, 27.7172],
    "city": "Kathmandu",
    "country": "Nepal"
  },
  "affectedRadius": 50
}
```

### Sample Response
```json
{
  "success": true,
  "data": {
    "predictionId": "...",
    "disasterType": "flood",
    "probability": 0.8742,
    "riskLevel": "critical",
    "alertTriggered": true,
    "location": { "city": "Kathmandu", "country": "Nepal" }
  }
}
```

## Sample Sensor Ingestion
```http
POST /api/v1/sensors/data
Content-Type: application/json
x-sensor-api-key: your_sensor_api_key_here

{
  "sensorId": "sensor-123",
  "sensorType": "weather",
  "disasterType": "flood",
  "location": {
    "coordinates": [85.3240, 27.7172],
    "city": "Kathmandu",
    "country": "Nepal"
  },
  "readings": {
    "rainfall": 180,
    "waterLevel": 8.5,
    "soilMoisture": 85,
    "riverFlow": 4200,
    "humidity": 92,
    "elevation": 15
  }
}
```

---

## ML Model Integration

Place your TensorFlow.js saved model files in:
```
src/ml/models/earthquake_model/model.json  (+ weights)
src/ml/models/flood_model/model.json
src/ml/models/landslide_model/model.json
```

**Input feature shapes:**
- Earthquake: `[magnitude, depth, latitude, longitude, seismicActivity, groundVibration]`
- Flood: `[rainfall, waterLevel, soilMoisture, riverFlow, humidity, elevation]`
- Landslide: `[rainfall, soilMoisture, slopeAngle, soilType, vegetationCover, groundDisplacement]`

All values are normalized to `[0, 1]` before inference. Models without files fall back to a
deterministic mock predictor for development.

---

## User Roles
- `user` — can register, run predictions, view alerts
- `responder` — can view stats and sensor data
- `admin` — can resolve alerts, access all stats

## Alert Thresholds (configurable in .env)
- Earthquake: 0.70 (70% probability triggers alert)
- Flood: 0.65
- Landslide: 0.60
