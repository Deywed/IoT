# MaaS — Model as a Service (Python + FastAPI + scikit-learn)
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY weather_gen.py train.py app.py ./

# Trening modela u build koraku -> model.joblib + metrics.json ostaju u image-u.
# (Metrike su vidljive u `docker compose build` logu i preko GET /info.)
RUN python train.py

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
