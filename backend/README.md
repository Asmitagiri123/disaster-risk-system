# Nepal FLDS — Backend

Flood & landslide early-warning system for Nepal's 77 districts. Real weather
(Open-Meteo) is pulled on a schedule, run through XGBoost risk models, and
turned into alerts on a live dashboard. Every alert is cross-checked against
the documented monsoon rainfall rule, and responders can record field
confirmations against predictions — so the system tracks "model confidence vs
confirmed events" with real numbers.

---

## Architecture

```
Open-Meteo (free weather API)
        │  polled every 10 min (fast-track) / 30 min (calm districts)
        ▼
Node/Express backend (:5000)  ──►  Python ML service (:8000)
  ├─ schedules polling               FastAPI + XGBoost (flood / landslide)
  ├─ stores sensors/predictions         77-district models, v1.2.0
  ├─ raises alerts when risk ≥ threshold
  ├─ cross-checks every alert vs rainfall rule (labelRule)
  └─ serves the frontend (static) + SSE live feed
```

- **Backend** — Node.js + Express + MongoDB (Mongoose). Owns the API, the
  polling scheduler, alerts, notifications and the SSE feed.
- **ML service** — Python FastAPI service in `../models` that loads the
  trained XGBoost pickles and serves `/predict` and `/models/info`.
- **Frontend** — plain HTML/JS/CSS (Chart.js + Leaflet) served by the backend,
  no build step.

### ML model architecture

Two XGBoost classifiers (one per disaster type) classify each district into a
3-class risk band (0 low / 1 moderate / 2 high). District + terrain are
label-encoded; the model sees 12 features (flood) / 11 features (landslide)
built from live weather plus rolling rain sums. The alert decision is
class-based (`predictedClass >= 1`), the stored probability is the class
confidence, and the displayed probability is capped to its risk band so the
number can never contradict the risk label.

```
live weather ──► feature builders ──► XGBoost predict_proba ──► argmax
                                                                   │
     riskLabel (low/moderate/high) ◄──── predictedClass ────────┘
     probability  = confidence of that class
     shouldAlert  = predictedClass >= ALERT_MIN_CLASS (1)
          │
          ▼ backend
     cross-verify vs monsoon rainfall rule → "✓ verified" badge
     alert + notify + SSE (class >= 1)
```

The full design — model cards (hyperparameters, features, class balance,
per-class metrics), the monsoon label rule, the training pipeline and the
step-by-step inference flow — is documented as the **model blueprint** in
`../models/README.md`.

---

## Quick start

Requires Node 18+, MongoDB running locally, and Python 3.10+ with the deps in
`models/requirements.txt`.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env    # fill in MONGO_URI, JWT_SECRET, ML_SERVICE_URL

# 2. ML service (from the repo root)
pip install -r models/requirements.txt
python models/predict_service.py     # serves on :8000

# 3. Start the backend (from backend/)
npm run dev            # nodemon, or: npm start

# 4. Seed the demo admin (admin@flds.demo / demo12345)
npm run seed:demo

# 5. Open the dashboard
#    http://localhost:5000
```

On Windows, `../start-services.ps1` starts both services idempotently (only
when the port is free) and `../setup-scheduled-tasks.ps1` registers a 2-minute
watchdog + logon auto-start task. See the root README.

---

## How the pipeline works

1. **Poll** — `predictionScheduler` runs `externalDataService.pollAll()` every
   `EXTERNAL_POLL_INTERVAL` min. Each district's live weather is fetched from
   Open-Meteo (rain, humidity, temperature, wind, soil moisture, 3/7-day rain
   sums) and stored as a sensor reading.
2. **Predict** — the backend calls the ML service, which classifies the
   district into a risk class (low/moderate/high) with class confidence. The
   probability shown in the UI is capped to its risk band so a "moderate"
   alert never displays as ~100%.
3. **Alert** — when the risk class is moderate or higher, an alert is created,
   users in the affected radius are notified (email/SMS if configured), and
   the live feed (SSE) pushes it to every open dashboard.
4. **Cross-verify** — each prediction is independently checked against the
   same rainfall thresholds used to build the training labels. When model and
   rule agree, the alert gets the "✓ verified" badge. Mismatches are logged
   but never suppress the alert.
5. **Confirm** — responders mark alerts confirmed / not-confirmed against
   field reports. The confirmation rate by risk band is shown on the alerts
   and reports pages (model confidence vs confirmed events).
6. **Resolve** — alerts auto-resolve when a newer poll supersedes them (one
   active alert per district+type), or manually via the UI.

Fast-track polling: districts with an active moderate+ alert are re-evaluated
every `EXTERNAL_FAST_TRACK_WINDOW_MIN` min instead of the normal
`EXTERNAL_POLL_WINDOW_MIN` min.

---

## API endpoints

All routes are prefixed `/api/v1` and (except `/auth/login|register` and
`/health`) require `Authorization: Bearer <jwt>`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Get a JWT |
| GET  | `/auth/me` | Current user |
| PUT  | `/auth/profile` | Update profile |
| PUT  | `/auth/change-password` | Change password |

### Predictions
| Method | Endpoint | Description |
|---|---|---|
| POST | `/predictions` | Run a prediction (manual) |
| GET  | `/predictions` | History (filters + pagination) |
| GET  | `/predictions/stats` | By-type/by-risk stats (admin/responder) |
| GET  | `/predictions/models/info` | ML model provenance + metrics |
| GET  | `/predictions/:id` | One prediction |

### Alerts
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/alerts` | List alerts (`?active=&disasterType=&riskLevel=&limit=`) |
| GET  | `/alerts/stats` | Counts + ground-truth breakdown (admin/responder) |
| GET  | `/alerts/:id` | One alert |
| PATCH | `/alerts/:id/resolve` | Resolve an alert (admin/responder) |
| PATCH | `/alerts/:id/confirm` | Record field report: `{status: confirmed\|not-confirmed, note}` (admin/responder) |

### Sensors
| Method | Endpoint | Description |
|---|---|---|
| POST | `/sensors/data` | Ingest a reading (JWT or `x-sensor-api-key`) |
| GET  | `/sensors/data` | Reading history |
| GET  | `/sensors/latest` | Latest reading per sensor |

### Dashboard / live
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/dashboard/overview` | Stat-card counts + recent predictions/sensors |
| GET  | `/events/stream` | SSE live feed (`?token=`) |

### Example: run a flood prediction
```bash
curl -X POST http://localhost:5000/api/v1/predictions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "disasterType": "flood",
    "sensorData": { "rainfall": 180, "humidity": 92, "temperature": 24,
                    "rainfall_roll3": 120, "rainfall_roll7": 300 },
    "location": { "coordinates": [84.0, 28.1], "city": "Kathmandu", "country": "Nepal" }
  }'
```

---

## Environment variables

See `.env.example` for the full list. Key ones:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `ML_SERVICE_URL` | Python ML service, e.g. `http://localhost:8000` |
| `SENSOR_API_KEY` | Shared key for sensor ingestion without JWT |
| `EXTERNAL_POLL_INTERVAL` | Scheduler run interval (min), default 10 |
| `EXTERNAL_POLL_WINDOW_MIN` | Re-evaluation window for calm districts (min), default 30 |
| `EXTERNAL_FAST_TRACK_WINDOW_MIN` | Window for districts with an active alert (min), default 10 |
| `EMAIL_*` / `TWILIO_*` | Optional notification channels (skipped when unset) |
| `FLOOD_THRESHOLD` / `LANDSLIDE_THRESHOLD` | Local fallback alert thresholds (external ML path uses class-based alerts) |

---

## Scripts

| Command | What it does |
|---|---|
| `npm run poll:external` | One-off Open-Meteo poll through the full pipeline |
| `npm run import:csv -- path.csv` | Import sensor CSV and predict each row |
| `npm run seed:demo` | Create the demo admin + sample readings |
| `npm test` | Jest test suite |

---

## User roles

- `user` — view dashboard, run predictions
- `responder` — everything above + stats, resolve alerts, confirm field reports
- `admin` — everything above

---

## Model honesty

- The ML models are **risk classifiers**, not event reporters. A "high risk"
  alert means the model (and, when cross-verified, the rainfall rule) judges
  current weather as dangerous — it does not claim flooding has occurred.
- Training labels come from observed rainfall using documented monsoon trigger
  thresholds; validation metrics (flood 99.8% / landslide 99.7% accuracy) are
  stored in `models/training_metadata.json` and shown on the Predictions page.
- Read those accuracies honestly: classes are imbalanced (low dominates) and
  the model partly reconstructs the rainfall rule it was labelled with. The
  per-class F1 for the rare **high** class (0.991 flood / 0.974 landslide) is
  the meaningful number — see the blueprint in `../models/README.md`.
- The gap between "model says high" and "flood actually happened" is exactly
  what the ground-truth confirmation feature tracks.
