"""
MaaS — Model as a Service (FastAPI).

Servira istrenirani klasifikator vremenskog uslova preko REST-a. Analytics
mikroservis poziva /predict za svako reprezentativno očitavanje iz prozora i
poredi predviđeno vreme sa stvarnim `summary` iz toka (running accuracy).
"""

import json
import os
from typing import Dict, List

import joblib
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

from weather_gen import CONDITIONS, FEATURES

MODEL_PATH = os.getenv("MODEL_PATH", "model.joblib")
METRICS_PATH = os.getenv("METRICS_PATH", "metrics.json")

app = FastAPI(title="MaaS — klasifikacija vremena", version="1.0.0")

model = joblib.load(MODEL_PATH)
try:
    with open(METRICS_PATH) as f:
        METRICS = json.load(f)
except FileNotFoundError:
    METRICS = {}


class Measurement(BaseModel):
    temperature: float
    humidity: float
    solar_generation: float


class BatchRequest(BaseModel):
    items: List[Measurement]


def _predict_one(m: Measurement) -> Dict:
    x = np.array([[m.temperature, m.humidity, m.solar_generation]], dtype=float)
    proba = model.predict_proba(x)[0]
    classes = list(model.classes_)
    idx = int(np.argmax(proba))
    return {
        "predicted_summary": classes[idx],
        "confidence": round(float(proba[idx]), 4),
        "probabilities": {c: round(float(p), 4) for c, p in zip(classes, proba)},
    }


@app.get("/health")
def health() -> Dict:
    return {"status": "ok", "model_loaded": model is not None}


@app.get("/info")
def info() -> Dict:
    return {
        "service": "MaaS — Model as a Service (klasifikacija vremena)",
        "task": "classification",
        "model": METRICS.get("model", "RandomForestClassifier"),
        "features": FEATURES,
        "classes": CONDITIONS,
        "metrics": METRICS,
    }


@app.post("/predict")
def predict(m: Measurement) -> Dict:
    return _predict_one(m)


@app.post("/predict/batch")
def predict_batch(req: BatchRequest) -> Dict:
    return {"predictions": [_predict_one(m) for m in req.items]}
