"""
Generativni model meteoroloških podataka (deljena logika sa ingestion simulatorom).

Isti "weather state" model kao u services/ingestion-service/Program.cs:
svako stanje vremena definiše opsege za temperaturu, vlažnost i solarnu proizvodnju.
Zahvaljujući tome (temperature, humidity, solar_generation) nose signal o klasi
`summary`, pa klasifikator može smisleno da uči — i da tačno predviđa nad živim
tokom koji ingestion generiše po istim opsezima.
"""

import numpy as np
import pandas as pd

# Poređano po "vedrini" (isto kao u ingestion Program.cs).
CONDITIONS = ["Clear", "Partly Cloudy", "Cloudy", "Rainy"]

# [lo, hi] opsezi po stanju — MORAJU biti identični ingestion generatoru.
# Opsezi se namerno preklapaju sa susednim stanjima (npr. Clear/Partly Cloudy),
# pa klasifikacija nije trivijalna: model greši uglavnom na susednim klasama
# (realističniji confusion matrix i F1, umesto 100%).
TEMP_RANGE = [(18, 34), (13, 29), (8, 24), (3, 19)]          # °C
HUM_RANGE = [(20, 50), (38, 65), (52, 80), (70, 97)]         # %
SOLAR_RANGE = [(4.0, 8.0), (2.0, 5.5), (0.6, 3.0), (0.0, 1.4)]  # kW

# Ulazni atributi modela (isti redosled se koristi svuda).
FEATURES = ["temperature", "humidity", "solar_generation"]


def generate_dataset(n_per_class: int = 4000, seed: int = 42) -> pd.DataFrame:
    """Vraća izbalansiran, izmešan dataset [temperature, humidity, solar_generation, summary]."""
    rng = np.random.default_rng(seed)
    frames = []
    for ci, cond in enumerate(CONDITIONS):
        t = rng.uniform(*TEMP_RANGE[ci], size=n_per_class)
        h = rng.uniform(*HUM_RANGE[ci], size=n_per_class)
        s = rng.uniform(*SOLAR_RANGE[ci], size=n_per_class)
        frames.append(
            pd.DataFrame(
                {
                    "temperature": np.round(t, 2),
                    "humidity": np.round(h, 2),
                    "solar_generation": np.round(s, 2),
                    "summary": cond,
                }
            )
        )
    df = pd.concat(frames, ignore_index=True)
    return df.sample(frac=1.0, random_state=seed).reset_index(drop=True)
