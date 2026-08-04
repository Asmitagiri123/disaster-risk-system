# Nepal FLDS — ML Models, Architecture & Blueprint

XGBoost risk classifiers for **flood** and **landslide** across all 77 Nepal
districts, trained on observed weather (Open-Meteo archive) and served as a
small FastAPI service that the Node backend calls.

---

## 1. System context — where the models sit

The ML service is one link in a live pipeline. Two branches feed it:

```
                        TRAINING BRANCH (offline, python train.py)
   Open-Meteo archive API ──► per-district daily weather (2018→2026)
        │                       + monsoon rainfall label rule
        ▼
   feature engineering (rain rolls, encoders, constants)
        ▼
   XGBoost classifier (flood)      XGBoost classifier (landslide)
        ▼                                    ▼
   pickles + encoders + training_metadata.json
        ▼
        ┌────────────────────────────────────────────────────────┐
        │                  INFERENCE BRANCH (live)               │
        ▼                                                        ▼
   Open-Meteo forecast API                     Node backend (:5000)
   per district, every 10–30 min               externalDataService → modelBridge
        ▼                                                        │
   weather readings ──────────────► POST /predict ───────────────┤
                                          │                      │
                                          ▼                      ▼
                              feature builders            alert decision
                              district/terrain encoders    class ≥ 1 → alert
                              predict_proba → argmax       cross-verify vs rule
                              (class 0/1/2 + confidence)   notify + SSE
```

The Node backend never re-implements the model: it sends raw weather and
location to `/predict`, receives the risk class + confidence, and owns the
alert/notification/cross-verification layers.

---

## 2. Model architecture

### Design decisions

| Decision | Why |
|---|---|
| One classifier per disaster type | Flood and landslide respond to different signals (river discharge vs slope/soil); separate feature sets avoid dilution |
| 3-class ordinal risk (0 low, 1 moderate, 2 high) | Matches how alert systems act (monitor → warn → evacuate) and keeps alerts explainable |
| `LabelEncoder` for district (77) + terrain | Categorical inputs; encoders are fitted over **all** districts, not just training downloads, so no district is out-of-vocabulary at inference |
| Exact feature-column contract | `predict_service` reorders input to `model.feature_names_in_` — the trained column order is the API contract |
| Class-based alert decision | `shouldAlert = predictedClass >= ALERT_MIN_CLASS` (default 1). The stored probability threshold (0.5) is informational only |
| Fallbacks instead of failure | Missing weather fields use documented defaults; unknown districts resolve by coordinates; models learn to ignore constant features |

### The decision layer

```
predict_proba(features) → [P(low), P(moderate), P(high)]
        │
        ├── predictedClass = argmax(P)          → riskLevel (low/moderate/high)
        ├── probability    = P(predictedClass)  → class confidence
        └── shouldAlert    = predictedClass >= ALERT_MIN_CLASS
```

On the backend the confidence is **calibrated for display** (capped to its risk
band, e.g. moderate ≤ 60%) so a "moderate" alert never reads as ~100%, while
the risk **label always comes from the model's class** — label and number can
never contradict.

### Cross-verification layer (backend, not ML)

Every prediction is independently re-checked against the same monsoon rainfall
rule used to build training labels. When the model class and the rule agree,
the alert gets the **✓ verified** badge. Mismatches are logged but never
suppress an alert (the model is the decision-maker; the rule is a second
opinion).

---

## 3. Model blueprint — Flood

| | |
|---|---|
| **Task** | 3-class risk classification (0 low / 1 moderate / 2 high) |
| **Algorithm** | XGBoost — `XGBClassifier` |
| **Hyperparameters** | `n_estimators=300`, `max_depth=6`, `learning_rate=0.1`, `subsample=0.9`, `colsample_bytree=0.9`, `tree_method="hist"`, `random_state=42` |
| **Training data** | 241,318 district-days · 77 districts · 2018-01-01 → 2026-07-31 (Open-Meteo archive, observed) |
| **Split** | 80/20 stratified, `random_state=42` |
| **Features (12)** | see below |
| **Validation** | accuracy **99.81%** · macro F1 **0.9949** |
| **Model file** | `flood_xgboost_model_77districts.pkl` |

### Feature blueprint — Flood

| Feature | Meaning | Live source | Training source |
|---|---|---|---|
| `rainfall` | 24h precipitation (mm) | Open-Meteo forecast | archive `precipitation_sum` |
| `rainfall_roll3` / `rainfall_roll7` | accumulated rain over 3 / 7 days | Open-Meteo (summed) | rolling sums |
| `discharge` | river flow (m³/s) | **constant 0** — no free live source | constant 0 |
| `discharge_roll3` / `discharge_roll7` | flow accumulation | constant 0 | constant 0 |
| `humidity` | relative humidity (%) | Open-Meteo | archive `relative_humidity_2m_mean` |
| `temperature` | mean temp (°C) | Open-Meteo | archive `temperature_2m_mean` |
| `wind_speed` | 10 m wind (km/h) | Open-Meteo | archive `wind_speed_10m_mean` |
| `month` | calendar month (seasonality) | request/now | date |
| `location_encoded` | district (LabelEncoder, 77) | resolved district | LabelEncoder |
| `terrain_encoded` | terrain class (LabelEncoder) | CSV/request | LabelEncoder |

### Class balance & per-class metrics — Flood

| Class | Samples | Share | Precision | Recall | F1 |
|---|---|---|---|---|---|
| 0 low | 186,851 | 77.4% | 0.9991 | 0.9998 | 0.9995 |
| 1 moderate | 39,011 | 16.2% | 0.9937 | 0.9944 | 0.9940 |
| 2 high | 15,456 | 6.4% | 0.9961 | 0.9864 | 0.9912 |

---

## 4. Model blueprint — Landslide

| | |
|---|---|
| **Task** | 3-class risk classification (0 low / 1 moderate / 2 high) |
| **Algorithm** | XGBoost — `XGBClassifier` |
| **Hyperparameters** | `n_estimators=300`, `max_depth=6`, `learning_rate=0.1`, `subsample=0.9`, `colsample_bytree=0.9`, `tree_method="hist"`, `random_state=42` |
| **Training data** | 241,318 district-days · 77 districts · same window |
| **Split** | 80/20 stratified, `random_state=42` |
| **Features (11)** | see below |
| **Validation** | accuracy **99.74%** · macro F1 **0.9874** |
| **Model file** | `landslide_xgboost_model_77districts.pkl` |

### Feature blueprint — Landslide

| Feature | Meaning | Live source | Training source |
|---|---|---|---|
| `rainfall` | 24h precipitation (mm) | Open-Meteo forecast | archive |
| `rain_3day` / `rain_7day` | accumulated rain over 3 / 7 days | Open-Meteo (summed) | rolling sums |
| `soil_moisture` | soil saturation (%) | **real** Open-Meteo soil moisture | rain-driven proxy (no free historical soil data) |
| `slope` | terrain slope (°) | **constant 25** — no free national dataset | constant 25 |
| `humidity` | relative humidity (%) | Open-Meteo | archive |
| `temperature` | mean temp (°C) | Open-Meteo | archive |
| `wind_speed` | 10 m wind (km/h) | Open-Meteo | archive |
| `month` | calendar month | request/now | date |
| `terrain_encoded` | terrain class (LabelEncoder) | CSV/request | LabelEncoder |
| `location_encoded` | district (LabelEncoder, 77) | resolved district | LabelEncoder |

### Class balance & per-class metrics — Landslide

| Class | Samples | Share | Precision | Recall | F1 |
|---|---|---|---|---|---|
| 0 low | 206,656 | ≈85.6% | 0.9996 | 0.9992 | 0.9994 |
| 1 moderate | 27,343 | ≈11.3% | 0.9855 | 0.9920 | 0.9887 |
| 2 high | 7,319 | ≈3.0% | 0.9820 | 0.9665 | 0.9742 |

---

## 5. Label blueprint (the monsoon rule)

There is no free, labelled "flood/landslide happened" dataset for Nepal, so
training labels are derived from **real observed rainfall** using documented
monsoon trigger thresholds. The same rule is re-applied at runtime to
cross-verify every alert.

| Disaster | Moderate (class 1) | High (class 2) |
|---|---|---|
| Flood | ≥ 30 mm/day **or** ≥ 60 mm / 7d | ≥ 80 mm/day **or** ≥ 150 mm / 7d |
| Landslide | ≥ 20 mm/day **or** ≥ 40 mm / 3d | ≥ 60 mm/day **or** ≥ 100 mm / 3d |

Pseudo-code (identical logic in `train.py` label builders and the backend's
cross-check):

```
flood_label(day, roll7) =
    2  if day ≥ 80 or roll7 ≥ 150
    1  elif day ≥ 30 or roll7 ≥ 60
    0  else

landslide_label(day, roll3) =
    2  if day ≥ 60 or roll3 ≥ 100
    1  elif day ≥ 20 or roll3 ≥ 40
    0  else
```

> **Why accuracy is high (read this before quoting the numbers):** the model
> learns to reconstruct a rainfall threshold from rainfall features, so the
> 99.8% accuracy measures "does the model reproduce the rule" more than "does
> it predict real disasters". The classes are also heavily imbalanced (low
> dominates), which inflates overall accuracy. The per-class F1 for the rare
> **high** class (0.991 flood / 0.974 landslide) is the honest headline. What
> the system cannot claim — that a prediction means an event actually
> happened — is exactly what the ground-truth confirmation feature tracks.

---

## 6. Training pipeline blueprint

1. **Acquire** — for each of the 77 districts, one Open-Meteo archive request
   (`precipitation_sum`, `temperature_2m_mean`, `relative_humidity_2m_mean`,
   `wind_speed_10m_mean`, timezone Asia/Katmandu). Raw responses are cached on
   disk so interrupted runs resume without re-downloading.
2. **Retry with backoff** — districts that fail (hourly API quota / network)
   are re-fetched every `TRAIN_RETRY_INTERVAL_MIN` (5) until covered or
   `TRAIN_RETRY_MAX_WAIT_MIN` (60) elapses. Set the max wait to `0` to fail
   fast.
3. **Label** — every district-day gets a 0/1/2 label from the monsoon rule
   (section 5).
4. **Engineer features** — rolling rain sums (3/7d), soil-moisture proxy,
   slope/discharge constants, month.
5. **Encode** — `LabelEncoder` fitted on **all 77 districts** and all terrain
   classes (so nothing is out-of-vocabulary later).
6. **Train** — `XGBClassifier` per disaster type, 80/20 stratified split,
   evaluated with `classification_report`.
7. **Persist** — model + threshold pickles, both encoders, and
   `training_metadata.json` (version, rows, class balance, per-class metrics)
   in the exact layout `predict_service.py` loads.

---

## 7. Inference blueprint (per request)

`POST /predict` — `{disasterType, sensorData, location}`:

1. **Resolve district** — explicit `district`/`city` match → fuzzy substring
   match → nearest district by coordinates (haversine) → default `Kathmandu`.
   `districtInferred` flags a guessed district.
2. **Resolve terrain** — request `terrain` → coordinates CSV → default
   `Hilly`.
3. **Build features** — the disaster type's feature table (sections 3–4),
   filling missing fields from documented defaults
   (`temperature 25`, `wind_speed 5`, `humidity 75`, `slope 25`,
   `soil_moisture 50`, `terrain Hilly`). Legitimate `0` values are preserved.
4. **Encode + reorder** — transform district/terrain, then reorder columns to
   exactly `model.feature_names_in_`.
5. **Classify** — `predict_proba` → `argmax` → `predictedClass` + confidence
   (`probability`) + `riskLevel`.
6. **Decide** — `shouldAlert = predictedClass >= ALERT_MIN_CLASS` (default 1
   = moderate+).
7. **Respond** — attach `district`, `districtInferred`, `terrain`,
   `modelVersion` (from metadata) and the feature vector used (for the UI's
   "live evidence").

Backend then: calibrates the displayed probability to the risk band,
cross-verifies against the rainfall rule, creates the alert when warranted,
notifies subscribed users, and pushes the event over SSE.

---

## 8. Artifacts & versioning

| File | Contents |
|---|---|
| `flood_xgboost_model_77districts.pkl` | Trained flood classifier |
| `landslide_xgboost_model_77districts.pkl` | Trained landslide classifier |
| `*_threshold_77districts.pkl` | Reference probability threshold (0.5, informational) |
| `location_encoder_77districts.pkl` | District LabelEncoder (77 classes) |
| `terrain_encoder_77districts.pkl` | Terrain LabelEncoder |
| `7places_coordinates_terrain.csv` | District → lat/lon/terrain lookup |
| `training_metadata.json` | Version, date range, rows, class balance, per-class metrics, label rule |
| `weather_cache/` | Raw archive downloads (resume + retrain) |

Versioning: `MODEL_VERSION` in `train.py` (currently **1.2.0**) is written to
`training_metadata.json`, surfaced by `/models/info`, and attached to every
prediction. Note: `train.py` **overwrites** the model/encoder pickles in place
(no automatic backup), so copy the current `.pkl` files aside before a
retrain if you need the old weights. `.gitignore` reserves `models/*.bak` for
exactly that purpose.

---

## 9. Service endpoints & configuration

```bash
pip install -r requirements.txt
python predict_service.py          # or: uvicorn predict_service:app --port 8000
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Status + loaded models |
| POST | `/predict` | `{disasterType, sensorData, location}` → risk class + confidence |
| GET | `/models/info` | Model features, thresholds, training provenance |

Env overrides: `ML_SERVICE_HOST` (default 127.0.0.1), `ML_SERVICE_PORT`
(default 8000), `ALERT_MIN_CLASS` (default 1 — alerts at predicted class ≥ this;
raise to 2 for high-only alerts).

Training overrides: `TRAIN_START`, `TRAIN_END`, `TRAIN_RETRY_MAX_WAIT_MIN`,
`TRAIN_RETRY_INTERVAL_MIN`, `TRAIN_SLEEP`.

---

## 10. Honest caveats

- `soil_moisture` in **training** is a rain-driven proxy (no free historical
  soil data); **live** inference uses real Open-Meteo soil moisture.
- `discharge` (river flow) is constant 0 — no free live source for Nepal; the
  flood model effectively learns from rainfall signals.
- `slope` is constant 25 — no free national slope dataset.
- The models predict **risk class from weather**, not confirmed events. The
  "model confidence vs confirmed events" view on the dashboard tracks that gap
  with real field reports.
