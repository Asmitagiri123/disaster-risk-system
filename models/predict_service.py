"""
HTTP service for the pre-trained flood/landslide XGBoost models (77 districts).

Called by the Node backend (backend/src/ml/modelBridge.js).

Run: pip install -r requirements.txt && uvicorn predict_service:app --port 8000

Endpoints:
  GET  /health    -> status + loaded models
  POST /predict   -> {disasterType, sensorData, location} -> risk prediction
"""

import os
import pickle
import json
import math
import csv
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Dict, Any

import joblib
import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Paths (relative to this file)
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATHS = {
    "flood": os.path.join(BASE_DIR, "flood_xgboost_model_77districts.pkl"),
    "landslide": os.path.join(BASE_DIR, "landslide_xgboost_model_77districts.pkl"),
}
THRESHOLD_PATHS = {
    "flood": os.path.join(BASE_DIR, "flood_xgboost_threshold_77districts.pkl"),
    "landslide": os.path.join(BASE_DIR, "landslide_xgboost_threshold_77districts.pkl"),
}
LOCATION_ENCODER_PATH = os.path.join(BASE_DIR, "location_encoder_77districts.pkl")
TERRAIN_ENCODER_PATH = os.path.join(BASE_DIR, "terrain_encoder_77districts.pkl")
COORDINATES_CSV_PATH = os.path.join(BASE_DIR, "7places_coordinates_terrain.csv")

# Alert when the predicted risk class is >= this value (0=low, 1=moderate, 2=high)
ALERT_MIN_CLASS = int(os.environ.get("ALERT_MIN_CLASS", "1"))

# Default values for model features the API request does not supply
DEFAULTS = {
    "temperature": 25.0,
    "wind_speed": 5.0,
    "humidity": 75.0,
    "slope": 25.0,
    "soil_moisture": 50.0,
    "terrain": "Hilly",
}

RISK_NAMES = {0: "low", 1: "moderate", 2: "high"}


def _num(sd: Dict[str, Any], *keys, default: float) -> float:
    """First present numeric value for the given keys, else the default.

    Unlike `dict.get(k) or default`, this preserves legitimate 0 values.
    """
    for k in keys:
        v = sd.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    return default


# ---------------------------------------------------------------------------
# App lifecycle (lifespan context manager, replaces deprecated on_event)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.models, app.state.thresholds = _load_models()
    app.state.loc_encoder, app.state.terrain_encoder = _load_encoders()
    app.state.coords = _load_coordinates()
    loaded = ", ".join(k for k, v in app.state.models.items() if v is not None)
    print(f"[ML Service] Models loaded: {loaded} | alert min class = {ALERT_MIN_CLASS}", flush=True)
    yield


app = FastAPI(title="Disaster Prediction ML Service", version="1.0.0", lifespan=lifespan)


class PredictRequest(BaseModel):
    disasterType: str
    sensorData: Dict[str, Any] = Field(default_factory=dict)
    location: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------
def _load_models() -> Dict[str, Any]:
    models = {}
    thresholds = {}
    for dtype, path in MODEL_PATHS.items():
        with open(path, "rb") as fh:
            models[dtype] = pickle.load(fh)
        with open(THRESHOLD_PATHS[dtype], "rb") as fh:
            thresholds[dtype] = pickle.load(fh)
    return models, thresholds


def _load_encoders():
    loc_encoder = joblib.load(LOCATION_ENCODER_PATH)
    terrain_encoder = joblib.load(TERRAIN_ENCODER_PATH)
    return loc_encoder, terrain_encoder


def _load_training_metadata() -> Optional[Dict[str, Any]]:
    """Training provenance (data source, date range, metrics) from train.py."""
    path = os.path.join(BASE_DIR, "training_metadata.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _load_coordinates() -> Dict[str, Dict[str, Any]]:
    """district -> {lat, lon, terrain, place_name} from the CSV."""
    coords = {}
    if not os.path.exists(COORDINATES_CSV_PATH):
        return coords
    with open(COORDINATES_CSV_PATH, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            coords[row["district"].strip().lower()] = {
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "terrain": row["terrain"].strip(),
                "place_name": row["place_name"].strip(),
            }
    return coords


# ---------------------------------------------------------------------------
# Request mapping helpers
# ---------------------------------------------------------------------------
def _find_district(location: Optional[Dict[str, Any]], loc_encoder, coords):
    """Resolve a district name from the request, coordinates, or default.

    Returns (district, inferred) where inferred=True means the district was
    guessed (nearest by coordinates or the Kathmandu default) rather than
    explicitly provided and matched.
    """
    if location:
        district = location.get("district") or location.get("city")
        if district:
            d = str(district).strip()
            known = {str(c).lower(): c for c in loc_encoder.classes_}
            if d.lower() in known:
                return known[d.lower()], False
            # fuzzy: substring match against known districts
            for k, canonical in known.items():
                if d.lower() in k or k in d.lower():
                    return canonical, False

    # Fallback: nearest known place by coordinates (haversine)
    coords_list = location.get("coordinates") if location else None
    if coords_list and len(coords_list) == 2:
        lon, lat = float(coords_list[0]), float(coords_list[1])
        best, best_dist = None, float("inf")
        for dkey, info in coords.items():
            d = _haversine(lat, lon, info["lat"], info["lon"])
            if d < best_dist:
                best, best_dist = dkey, d
        known = {str(c).lower(): c for c in loc_encoder.classes_}
        if best and best in known:
            return known[best], True

    return "Kathmandu", True


def _find_terrain(district: str, location: Optional[Dict[str, Any]], terrain_encoder, coords) -> str:
    """Terrain from request, CSV lookup, or default."""
    known = {str(c).lower() for c in terrain_encoder.classes_}
    if location and location.get("terrain"):
        t = str(location["terrain"]).strip()
        if t.lower() in known:
            return t
    info = coords.get(district.lower())
    if info and info["terrain"].lower() in known:
        return info["terrain"]
    return DEFAULTS["terrain"]


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _month_of(location: Optional[Dict[str, Any]], sensor_data: Dict[str, Any]) -> int:
    for src in (sensor_data, location or {}):
        if src.get("month") is not None:
            try:
                return int(src["month"])
            except (TypeError, ValueError):
                pass
        if src.get("date"):
            try:
                return datetime.fromisoformat(str(src["date"])).month
            except ValueError:
                pass
    return datetime.now().month


# ---------------------------------------------------------------------------
# Feature builders (columns exactly match the trained models' feature_names_in_)
# ---------------------------------------------------------------------------
def _build_flood_features(sd: Dict[str, Any], month: int, loc_enc_val: int, ter_enc_val: int) -> pd.DataFrame:
    rainfall = _num(sd, "rainfall", default=0.0)
    discharge = _num(sd, "discharge", "riverFlow", "waterLevel", default=0.0)
    features = {
        "temperature": _num(sd, "temperature", default=DEFAULTS["temperature"]),
        "rainfall": rainfall,
        "humidity": _num(sd, "humidity", default=DEFAULTS["humidity"]),
        "wind_speed": _num(sd, "wind_speed", default=DEFAULTS["wind_speed"]),
        "discharge": discharge,
        "rainfall_roll3": _num(sd, "rainfall_roll3", default=rainfall),
        "rainfall_roll7": _num(sd, "rainfall_roll7", default=rainfall),
        "discharge_roll3": _num(sd, "discharge_roll3", default=discharge),
        "discharge_roll7": _num(sd, "discharge_roll7", default=discharge),
        "month": month,
        "location_encoded": loc_enc_val,
        "terrain_encoded": ter_enc_val,
    }
    return pd.DataFrame([features])


def _build_landslide_features(sd: Dict[str, Any], month: int, loc_enc_val: int, ter_enc_val: int) -> pd.DataFrame:
    rainfall = _num(sd, "rainfall", default=0.0)
    features = {
        "temperature": _num(sd, "temperature", default=DEFAULTS["temperature"]),
        "rainfall": rainfall,
        "humidity": _num(sd, "humidity", default=DEFAULTS["humidity"]),
        "wind_speed": _num(sd, "wind_speed", default=DEFAULTS["wind_speed"]),
        "rain_3day": _num(sd, "rain_3day", "rainfall_roll3", default=rainfall),
        "rain_7day": _num(sd, "rain_7day", "rainfall_roll7", default=rainfall),
        "soil_moisture": _num(sd, "soil_moisture", "soilMoisture", default=DEFAULTS["soil_moisture"]),
        "slope": _num(sd, "slope", "slopeAngle", default=DEFAULTS["slope"]),
        "month": month,
        "terrain_encoded": ter_enc_val,
        "location_encoded": loc_enc_val,
    }
    return pd.DataFrame([features])


_BUILDERS = {
    "flood": _build_flood_features,
    "landslide": _build_landslide_features,
}


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------
def _predict_one(dtype: str, df: pd.DataFrame, model, prob_threshold: float) -> Dict[str, Any]:
    proba = model.predict_proba(df)[0]  # [P(class0), P(class1), P(class2)]
    predicted_class = int(np.argmax(proba))
    probability = float(proba[predicted_class])
    return {
        "disasterType": dtype,
        "probability": round(probability, 4),
        "predictedClass": predicted_class,
        "riskLevel": RISK_NAMES.get(predicted_class, "low"),
        # Alert decision is class-based (moderate+); the probability threshold
        # from training is exposed below for reference only.
        "shouldAlert": predicted_class >= ALERT_MIN_CLASS,
        "probabilityThreshold": float(prob_threshold),
        "alertBasis": f"predictedClass >= {ALERT_MIN_CLASS}",
        "features": df.iloc[0].to_dict(),
    }


@app.get("/health")
def health():
    return {
        "success": True,
        "service": "disaster-ml-service",
        "models": list(app.state.models.keys()),
        "status": "ok",
    }


@app.get("/models/info")
def models_info():
    """Loaded models, their features, and training provenance from metadata."""
    meta = _load_training_metadata()
    return {
        "success": True,
        "service": "disaster-ml-service",
        "alertMinClass": ALERT_MIN_CLASS,
        "riskNames": RISK_NAMES,
        "training": meta,
        "models": {
            dtype: {
                "features": list(model.feature_names_in_),
                "nEstimators": int(getattr(model, "n_estimators", 0)),
                "classes": [int(c) for c in model.classes_],
                "threshold": app.state.thresholds.get(dtype, 0.0),
            }
            for dtype, model in app.state.models.items()
            if model is not None
        },
    }


@app.post("/predict")
def predict(req: PredictRequest):
    dtype = req.disasterType
    if dtype not in _BUILDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported disasterType: {dtype}. Use flood or landslide.")

    model = app.state.models.get(dtype)
    if model is None:
        raise HTTPException(status_code=503, detail=f"Model for {dtype} not loaded.")

    loc_encoder = app.state.loc_encoder
    terrain_encoder = app.state.terrain_encoder

    district, inferred = _find_district(req.location, loc_encoder, app.state.coords)
    terrain = _find_terrain(district, req.location, terrain_encoder, app.state.coords)

    try:
        loc_enc_val = int(loc_encoder.transform([district])[0])
        ter_enc_val = int(terrain_encoder.transform([terrain])[0])
    except ValueError:
        loc_enc_val = int(loc_encoder.transform(["Kathmandu"])[0])
        ter_enc_val = int(terrain_encoder.transform(["Hilly"])[0])

    month = _month_of(req.location, req.sensorData)
    df = _BUILDERS[dtype](req.sensorData, month, loc_enc_val, ter_enc_val)

    # Guarantee exact column order expected by the trained model
    expected = model.feature_names_in_
    df = df[list(expected)]

    result = _predict_one(dtype, df, model, app.state.thresholds.get(dtype, 0.0))
    result["district"] = district
    result["districtInferred"] = inferred
    result["terrain"] = terrain
    # Version from training_metadata.json when present (train.py writes it)
    meta = _load_training_metadata()
    result["modelVersion"] = (meta or {}).get("version", "xgboost-77districts")
    result["success"] = True
    return result


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("ML_SERVICE_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=int(os.environ.get("ML_SERVICE_PORT", "8000")))
