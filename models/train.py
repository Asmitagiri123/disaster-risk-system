"""
Retrain the flood/landslide XGBoost models on real Open-Meteo weather.

Daily weather for all 77 Nepal districts (2018 → TRAIN_END) is labelled
low/moderate/high with the monsoon rainfall thresholds below, then XGBoost is
trained to recognise that risk from the weather features. Outputs are exactly
the files predict_service.py loads at startup, plus training_metadata.json
(also served via /models/info).

Districts that fail to download are retried every TRAIN_RETRY_INTERVAL_MIN
minutes until covered or TRAIN_RETRY_MAX_WAIT_MIN minutes elapse
(defaults: 5 / 60). Set TRAIN_RETRY_MAX_WAIT_MIN=0 to fail fast.

Run: python train.py
"""

import json
import os
import pickle
import time
import urllib.request
from datetime import datetime, date

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COORDINATES_CSV = os.path.join(BASE_DIR, "7places_coordinates_terrain.csv")
CACHE_DIR = os.path.join(BASE_DIR, "weather_cache")

# Weather window
START_DATE = os.environ.get("TRAIN_START", "2018-01-01")
END_DATE = os.environ.get("TRAIN_END", "2026-07-31")
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = (
    "precipitation_sum,temperature_2m_mean,"
    "relative_humidity_2m_mean,wind_speed_10m_mean"
)

# Model config
N_ESTIMATORS = 300
MAX_DEPTH = 6
LEARNING_RATE = 0.1
RANDOM_STATE = 42

# Model version (written to metadata, reported on /models/info and every prediction)
# meaningfully (new training data, features, or config).
MODEL_VERSION = "1.2.0"

# Auto-retry for districts that fail to download
# The archive API enforces an hourly quota (HTTP 429). Instead of leaving those
# districts permanently "pending", keep re-trying them with backoff until they
# download, the quota keeps refusing us, or the max wait elapses. Disable the
# retry phase entirely by setting TRAIN_RETRY_MAX_WAIT_MIN=0.
RETRY_MAX_WAIT_MIN = float(os.environ.get("TRAIN_RETRY_MAX_WAIT_MIN", "60"))   # stop retrying after this long
RETRY_INTERVAL_MIN = float(os.environ.get("TRAIN_RETRY_INTERVAL_MIN", "5"))    # wait between retry passes

# Feature sets — must match predict_service.py's builders exactly
FLOOD_FEATURES = [
    "temperature", "rainfall", "humidity", "wind_speed", "discharge",
    "rainfall_roll3", "rainfall_roll7", "discharge_roll3", "discharge_roll7",
    "month", "location_encoded", "terrain_encoded",
]
LANDSLIDE_FEATURES = [
    "temperature", "rainfall", "humidity", "wind_speed",
    "rain_3day", "rain_7day", "soil_moisture", "slope",
    "month", "terrain_encoded", "location_encoded",
]

# Label rules: monsoon rainfall thresholds (mm)
# Flood:  high  = 80+ mm in a day, or 150+ mm accumulated over 7 days
#         mod   = 30+ mm in a day,  or  60+ mm accumulated over 7 days
# Landslide: high = 60+ mm in a day, or 100+ mm over the last 3 days
#            mod  = 20+ mm in a day, or  40+ mm over the last 3 days
FLOOD_LABEL_RULE = {"high_rain_day": 80, "high_roll7": 150, "mod_rain_day": 30, "mod_roll7": 60}
LANDSLIDE_LABEL_RULE = {"high_rain_day": 60, "high_roll3": 100, "mod_rain_day": 20, "mod_roll3": 40}

# Constants for features with no free national dataset (disclosed in metadata).
# Live inference keeps working: the ML service fills these from real sensor
# readings when provided, and the models learn to ignore constant inputs.
SLOPE_DEFAULT = 25.0
DISCHARGE_DEFAULT = 0.0


def soil_moisture_proxy(roll3, roll7):
    """Historical soil moisture proxy, 0–100%.

    The archive API has no soil-moisture data without a key, so for TRAINING
    we approximate it from recent rain (moisture rises after rainfall, drains
    over days). Live inference uses the REAL soil moisture that Open-Meteo's
    forecast API returns per district.
    """
    return min(60.0, 25.0 + 18.0 * min(roll7 / 120.0, 1.0) + 12.0 * min(roll3 / 60.0, 1.0))


def load_districts():
    """district -> {lat, lon, terrain} from the 77-district CSV."""
    districts = {}
    with open(COORDINATES_CSV, newline="", encoding="utf-8") as fh:
        for row in pd.read_csv(fh).to_dict("records"):
            districts[str(row["district"]).strip()] = {
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "terrain": str(row["terrain"]).strip(),
            }
    return districts


def fetch_archive(district, info):
    """One request per district → observed daily arrays, or None on failure.

    Raw responses are cached on disk so interrupted/rate-limited runs resume
    without re-downloading the districts we already have.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, f"{district}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            pass  # corrupt cache — re-download

    url = (
        f"{ARCHIVE_URL}?latitude={info['lat']}&longitude={info['lon']}"
        f"&start_date={START_DATE}&end_date={END_DATE}"
        f"&daily={DAILY_VARS}&timezone=Asia/Katmandu"
    )
    last_err = None
    for attempt in range(3):  # retry with backoff on transient failures/429s
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = json.loads(resp.read().decode())
            if data.get("error"):
                raise RuntimeError(data.get("reason", "archive error"))
            daily = data.get("daily", {})
            n = len(daily.get("time", []))
            if n == 0:
                raise RuntimeError("empty daily block")
            parsed = {
                "time": daily["time"],
                "rain": [x if x is not None else 0.0 for x in daily["precipitation_sum"]],
                "temp": [x if x is not None else 25.0 for x in daily["temperature_2m_mean"]],
                "hum": [x if x is not None else 75.0 for x in daily["relative_humidity_2m_mean"]],
                "wind": [x if x is not None else 5.0 for x in daily["wind_speed_10m_mean"]],
            }
            with open(cache_path, "w", encoding="utf-8") as fh:
                json.dump(parsed, fh)
            return parsed
        except Exception as err:  # noqa: BLE001
            last_err = err
            print(f"  ! attempt {attempt + 1}/3 failed for {district}: {err}")
            msg = str(err)
            # Hourly quota is exhausted — retrying within the hour is pointless,
            # so fail fast; the disk cache resumes this district on the next run.
            if "429" in msg or "limit" in msg.lower():
                print(f"  ! quota exhausted for {district} — cached districts will be reused next run")
                return None
            time.sleep(10)
    print(f"  ! fetch failed for {district}: {last_err}")
    return None


def retry_missing_districts(flood_rows, landslide_rows, missing):
    """Re-try districts that failed to download until covered or the max wait elapses.

    Runs in passes: each pass waits RETRY_INTERVAL_MIN, then re-fetches every
    still-missing district (cached on success). Stops when nothing is missing or
    the total wait reaches RETRY_MAX_WAIT_MIN. Disabled when RETRY_MAX_WAIT_MIN
    is 0 (the old behaviour: train on whatever downloaded, report the rest).
    Mutates `flood_rows`, `landslide_rows` and `missing` in place.
    """
    if not missing or RETRY_MAX_WAIT_MIN <= 0:
        return
    deadline = time.time() + RETRY_MAX_WAIT_MIN * 60
    pass_no = 0
    while missing and time.time() < deadline:
        pass_no += 1
        print(f"[train] {len(missing)} districts still pending — retry pass {pass_no} "
              f"in {RETRY_INTERVAL_MIN:.0f} min (max wait {RETRY_MAX_WAIT_MIN:.0f} min)")
        # Cap the wait to the remaining budget so the run never overshoots
        # RETRY_MAX_WAIT_MIN by a full interval.
        time.sleep(min(RETRY_INTERVAL_MIN * 60, max(0.0, deadline - time.time())))
        for name in list(missing):
            d = fetch_archive(name, missing[name])
            if d is None:
                continue  # still refused — try again on the next pass
            flood_rows += build_flood_rows(name, missing[name], d)
            landslide_rows += build_landslide_rows(name, missing[name], d)
            del missing[name]
            print(f"[train] retried OK: {name} — {len(missing)} still pending")


def build_flood_rows(district, info, d):
    rows = []
    rain = d["rain"]
    for i in range(len(rain)):
        roll3 = sum(rain[max(0, i - 2): i + 1])
        roll7 = sum(rain[max(0, i - 6): i + 1])
        day = rain[i]
        label = 2 if (day >= FLOOD_LABEL_RULE["high_rain_day"] or roll7 >= FLOOD_LABEL_RULE["high_roll7"]) \
            else 1 if (day >= FLOOD_LABEL_RULE["mod_rain_day"] or roll7 >= FLOOD_LABEL_RULE["mod_roll7"]) else 0
        rows.append({
            "temperature": d["temp"][i], "rainfall": day, "humidity": d["hum"][i],
            "wind_speed": d["wind"][i], "discharge": DISCHARGE_DEFAULT,
            "rainfall_roll3": roll3, "rainfall_roll7": roll7,
            "discharge_roll3": DISCHARGE_DEFAULT, "discharge_roll7": DISCHARGE_DEFAULT,
            "month": datetime.strptime(d["time"][i], "%Y-%m-%d").month,
            "location": district, "terrain": info["terrain"],
            "label": label,
        })
    return rows


def build_landslide_rows(district, info, d):
    rows = []
    rain = d["rain"]
    for i in range(len(rain)):
        roll3 = sum(rain[max(0, i - 2): i + 1])
        roll7 = sum(rain[max(0, i - 6): i + 1])
        day = rain[i]
        label = 2 if (day >= LANDSLIDE_LABEL_RULE["high_rain_day"] or roll3 >= LANDSLIDE_LABEL_RULE["high_roll3"]) \
            else 1 if (day >= LANDSLIDE_LABEL_RULE["mod_rain_day"] or roll3 >= LANDSLIDE_LABEL_RULE["mod_roll3"]) else 0
        rows.append({
            "temperature": d["temp"][i], "rainfall": day, "humidity": d["hum"][i],
            "wind_speed": d["wind"][i],
            "rain_3day": roll3, "rain_7day": roll7,
            "soil_moisture": soil_moisture_proxy(roll3, roll7),
            "slope": SLOPE_DEFAULT,
            "month": datetime.strptime(d["time"][i], "%Y-%m-%d").month,
            "location": district, "terrain": info["terrain"],
            "label": label,
        })
    return rows


def train_model(features, X, y, model_name):
    """Train XGBoost on the given feature matrix, return (model, metrics)."""
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    model = XGBClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        learning_rate=LEARNING_RATE,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=RANDOM_STATE,
        tree_method="hist",
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    return model, {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "classificationReport": {k: (v if not isinstance(v, dict) else
                                     {kk: round(float(vv), 4) for kk, vv in v.items() if kk != "support"})
                                 for k, v in report.items()},
    }


def main():
    print(f"[train] Loading districts from {COORDINATES_CSV}")
    districts = load_districts()
    print(f"[train] {len(districts)} districts, window {START_DATE} -> {END_DATE}")

    flood_rows, landslide_rows = [], []
    missing = {}
    for i, (name, info) in enumerate(districts.items(), 1):
        print(f"[train] {i}/{len(districts)} {name}...")
        d = fetch_archive(name, info)
        if d is None:
            missing[name] = info
            continue
        flood_rows += build_flood_rows(name, info, d)
        landslide_rows += build_landslide_rows(name, info, d)
        time.sleep(float(os.environ.get("TRAIN_SLEEP", "0.25")))

    # Auto-retry phase: keep trying the missing districts with backoff so a run
    # that hits the hourly API quota still ends with every district covered.
    retry_missing_districts(flood_rows, landslide_rows, missing)

    if not flood_rows or not landslide_rows:
        raise SystemExit("[train] No data downloaded — aborting. Check network/API.")

    flood_df = pd.DataFrame(flood_rows)
    landslide_df = pd.DataFrame(landslide_rows)
    print(f"[train] flood rows: {len(flood_df)} | landslide rows: {len(landslide_df)}")

    # Encoders cover every district/terrain, not just this run's downloads
    loc_encoder = LabelEncoder().fit(sorted(districts.keys()))
    terrain_encoder = LabelEncoder().fit(sorted({v["terrain"] for v in districts.values()}))

    def encode(df):
        out = df.copy()
        out["location_encoded"] = loc_encoder.transform(out["location"])
        out["terrain_encoded"] = terrain_encoder.transform(out["terrain"])
        return out

    flood_df, landslide_df = encode(flood_df), encode(landslide_df)

    # Train both models
    flood_model, flood_metrics = train_model(
        FLOOD_FEATURES,
        flood_df[FLOOD_FEATURES], flood_df["label"], "flood"
    )
    landslide_model, landslide_metrics = train_model(
        LANDSLIDE_FEATURES,
        landslide_df[LANDSLIDE_FEATURES], landslide_df["label"], "landslide"
    )
    print(f"[train] flood accuracy: {flood_metrics['accuracy']}")
    print(f"[train] landslide accuracy: {landslide_metrics['accuracy']}")

    # Save in the exact format predict_service.py loads
    out = {
        "flood_xgboost_model_77districts.pkl": flood_model,
        "landslide_xgboost_model_77districts.pkl": landslide_model,
        "flood_xgboost_threshold_77districts.pkl": 0.5,
        "landslide_xgboost_threshold_77districts.pkl": 0.5,
    }
    for fname, obj in out.items():
        with open(os.path.join(BASE_DIR, fname), "wb") as fh:
            pickle.dump(obj, fh)
    joblib.dump(loc_encoder, os.path.join(BASE_DIR, "location_encoder_77districts.pkl"))
    joblib.dump(terrain_encoder, os.path.join(BASE_DIR, "terrain_encoder_77districts.pkl"))

    trained = sorted(flood_df["location"].unique())
    pending = sorted(set(districts.keys()) - set(trained))
    metadata = {
        "version": MODEL_VERSION,
        "trainedAt": datetime.utcnow().isoformat() + "Z",
        "dataSource": "Open-Meteo Archive API (free, no key) — observed daily weather",
        "dateRange": {"start": START_DATE, "end": END_DATE},
        "districts": len(districts),
        "districtsTrained": len(trained),
        "districtsPending": pending,  # empty once the cache fills up
        "rows": {"flood": len(flood_df), "landslide": len(landslide_df)},
        "labelRule": {
            "description": "Risk class labels derived from real rainfall with documented monsoon trigger thresholds.",
            "flood": FLOOD_LABEL_RULE,
            "landslide": LANDSLIDE_LABEL_RULE,
        },
        "featureNotes": {
            "soil_moisture": "Training uses a rain-driven proxy (no free historical soil data); LIVE inference uses real Open-Meteo soil moisture.",
            "discharge": "Constant 0 — no free live river-discharge source for Nepal.",
            "slope": "Constant 25 — no free national slope dataset.",
        },
        "retryPolicy": {
            "description": "Districts that fail to download (API quota/network) are auto-retried with backoff until covered or the max wait elapses.",
            "maxWaitMin": RETRY_MAX_WAIT_MIN,
            "intervalMin": RETRY_INTERVAL_MIN,
        },
        "classBalance": {
            "flood": {str(k): int(v) for k, v in flood_df["label"].value_counts().items()},
            "landslide": {str(k): int(v) for k, v in landslide_df["label"].value_counts().items()},
        },
        "models": {
            "flood": {"nEstimators": N_ESTIMATORS, "maxDepth": MAX_DEPTH, "features": FLOOD_FEATURES, "metrics": flood_metrics},
            "landslide": {"nEstimators": N_ESTIMATORS, "maxDepth": MAX_DEPTH, "features": LANDSLIDE_FEATURES, "metrics": landslide_metrics},
        },
    }
    with open(os.path.join(BASE_DIR, "training_metadata.json"), "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)

    print(f"[train] Done. Trained {len(trained)}/{len(districts)} districts"
          + (f" — pending: {', '.join(pending)} (re-run after the API quota resets)" if pending else " — all districts covered."))


if __name__ == "__main__":
    main()
