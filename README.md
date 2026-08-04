# Nepal FLDS — Flood & Landslide Detection System

Real-time flood and landslide early-warning system covering all 77 Nepal
districts. Live weather from Open-Meteo is polled on a schedule, run through
XGBoost risk models, and surfaced as alerts on a live dashboard. Every alert
is cross-checked against the documented monsoon rainfall rule, and responders
can record field confirmations — so the system tracks **model confidence vs
confirmed events** with real numbers.

## Stack

| Layer | Tech |
|---|---|
| Backend API | Node.js + Express + MongoDB (Mongoose) |
| ML | Python + FastAPI + XGBoost (77-district flood/landslide models) |
| Live data | Open-Meteo weather API (free, no key) |
| Frontend | Plain HTML/JS/CSS + Chart.js + Leaflet (no build step) |
| Real time | Server-Sent Events (SSE) |
| Notifications | Nodemailer / Twilio (optional) |

## Layout

```
backend/     Express API, polling scheduler, alerts, SSE feed, frontend serving
frontend/    Dashboard, alerts, map, predictions, reports pages (static)
models/      XGBoost models, predict_service.py (FastAPI), train.py
dataset/     (reserved for imported datasets)
```

## Running it

Requires Node 18+, MongoDB, Python 3.10+.

```bash
# 1. ML service (repo root)
pip install -r models/requirements.txt
python models/predict_service.py            # :8000

# 2. Backend
cd backend && npm install && cp .env.example .env   # fill in MONGO_URI, JWT_SECRET
npm run dev                                 # :5000 — serves the frontend too

# 3. Seed the demo admin, then open http://localhost:5000
npm run seed:demo                           # admin@flds.demo / demo12345
```

### Windows auto-start (optional)

```powershell
# Registers a 2-minute watchdog + logon task that keep both services up
.\setup-scheduled-tasks.ps1
```

`start-services.ps1` is the idempotent starter the tasks call — it only starts
a service when its port is free and logs the result to `logs/`.

## Documentation

- [backend/README.md](backend/README.md) — API, pipeline, env vars, scripts
- [models/README.md](models/README.md) — ML service, features, training

## What the numbers mean

- **Probability** — the model's confidence in its risk class (low/moderate/
  high), capped to its risk band so a moderate alert never displays as ~100%.
- **✓ verified** — the model's class and the documented rainfall rule agree.
- **✅ confirmed / ❌ not confirmed** — a responder's field report of what
  actually happened on the ground.

The models predict **risk from weather**; only field reports confirm events.
Validation metrics (flood ~99.8%, landslide ~99.7% accuracy) live in
`models/training_metadata.json` and are shown on the Predictions page.
