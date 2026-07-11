# Projekat 3 — IoT Analytics: eKuiper (CEP) + MaaS (ML)

Nadogradnja **Analytics** mikroservisa iz [Projekta 2](../project-02) tako da analizu
senzorskog toka radi kombinovanjem dva nova servisa:

- **eKuiper** — streaming/CEP servis pretplaćen na isti MQTT topic kao Analytics
  (`iot/measurements`); pravilima detektuje **događaje od interesa** i šalje ih na
  **novi** topic (`iot/events`) koji Analytics preuzima.
- **MaaS** (*Model as a Service*) — Python/FastAPI mikroservis sa istreniranim
  **scikit-learn** modelom za **klasifikaciju vremenskog uslova**; Analytics ga poziva
  preko REST-a (`/predict`).

Ceo sistem ide preko **MQTT**-a (Mosquitto) i pokreće se kao Docker kontejneri, uz
**React** web dashboard koji sve prikazuje uživo.

## Arhitektura

```
                          ┌───────────► [storage] ──COPY(500)──► [PostgreSQL]
                          │
[ingestion] ─publish──► [mosquitto] ─┼───────────► [eKuiper CEP] ─publish──► iot/events
 simulira uređaje   iot/measurements  │              SQL pravila                  │
 (koherentno vreme)                   └───────────► [analytics] ◄─────────────────┘
                                                       │  ├─ tumbling window (temp/latencija)
                                                       │  ├─ prima eKuiper CEP događaje
                                                       │  ├─ REST ─► [MaaS /predict] (ML vreme)
                                                       │  └─ HTTP + SSE (:8080)
                                                       ▼
                                             [web dashboard]  (React + nginx, :8081)
```

| Servis | Tehnologija | Uloga |
|---|---|---|
| **ingestion** | .NET / C# | simulira uređaje; generiše **koherentno vreme** (temp/vlaga/solar/summary povezani) i publikuje na `iot/measurements` |
| **storage** | .NET / C# (Npgsql) | pretplata + grupni upis (500) u PostgreSQL |
| **eKuiper** | lfedge/ekuiper | CEP: pretplata na `iot/measurements`, pravila, publikuje događaje na `iot/events` |
| **analytics** | Node.js / TypeScript | tumbling window + prima CEP događaje + poziva **MaaS** + izlaže HTTP/SSE dashboard-u |
| **MaaS** | Python / FastAPI / scikit-learn | REST model za klasifikaciju vremena (`/predict`, `/info`, `/health`) |
| **web** | React + Vite (nginx) | live dashboard: merenja, CEP događaji, ML predikcije, alarmi |
| **db** | PostgreSQL 16 | `sensor_measurements` (isti model kao Projekat 1/2) |

## MQTT topici

| Topic | Producer | Consumer(i) |
|---|---|---|
| `iot/measurements` | ingestion | storage, eKuiper, analytics |
| `iot/events` | **eKuiper** | analytics |
| `iot/alerts` | analytics (opciono) | — |

## Brzi start

```bash
cd project-03
cp .env.example .env      # već postoji; demo default je nizak protok (5 uređaja, 1 msg/s)
docker compose up --build
```

Zatim:

- **Web dashboard** → http://localhost:8081
- **MaaS** (Swagger) → http://localhost:8000/docs · metrike → http://localhost:8000/info
- **eKuiper REST** → http://localhost:9081/rules
- **Analytics API** → http://localhost:8080/api/summary

> Za demonstraciju **alarma i CEP `HIGH_TEMP` događaja**, postavi `CRITICAL_MODE=true` u
> `.env` (visoke temperature) i restartuj: `docker compose up -d ingestion`.

## eKuiper CEP pravila (`ekuiper/rules/`)

| Pravilo | Tip | Detektuje |
|---|---|---|
| `rule_high_temp` | instant filter | `temperature > 45` (kritični režim) |
| `rule_window_energy` | tumbling 10s | `AVG(overall_usage) > 10` po uređaju |
| `rule_rain_likely` | tumbling 10s | `AVG(humidity) > 78 AND AVG(solar) < 1.5` (kiša) |

`ekuiper-init` sidecar registruje stream i pravila preko REST-a pri startu.

## MaaS model

- **Zadatak:** klasifikacija (`summary`: Clear / Partly Cloudy / Cloudy / Rainy)
- **Ulazi:** `temperature`, `humidity`, `solar_generation`
- **Model:** `RandomForestClassifier` (scikit-learn), trening/validacija/test 60/20/20
- Model se **trenira u Docker build koraku** (`train.py`) → `model.joblib` + `metrics.json`
- Endpointi: `GET /health`, `GET /info` (metrike), `POST /predict`, `POST /predict/batch`

```bash
curl -X POST http://localhost:8000/predict \
  -H 'content-type: application/json' \
  -d '{"temperature":30,"humidity":30,"solar_generation":7}'
# -> {"predicted_summary":"Clear","confidence":...}
```

## Provera (verifikacija)

```bash
# eKuiper pravila su registrovana i "running"
curl -s http://localhost:9081/rules

# eKuiper CEP izlaz uživo
docker compose exec mosquitto mosquitto_sub -t 'iot/events' -v

# Analytics logovi (prozor + CEP + MaaS)
docker compose logs -f analytics

# Broj upisanih merenja raste
docker compose exec db psql -U myuser -d mydb -c "SELECT count(*) FROM sensor_measurements;"
```

Detaljan opis, rezultati i diskusija su u [izvestaj.md](izvestaj.md).

## Konfiguracija (`.env`)

| Promenljiva | Default | Opis |
|---|---|---|
| `DEVICE_COUNT` / `MSG_RATE` | `5` / `1` | broj uređaja / poruka/s po uređaju |
| `CRITICAL_MODE` | `false` | `true` → >50°C (alarmi + `HIGH_TEMP`) |
| `WINDOW_SECONDS` | `10` | dužina tumbling prozora |
| `ALERT_THRESHOLD` | `50` | °C prag za prosečnu temp. (alarm) |
| `EVENTS_TOPIC` | `iot/events` | topic za eKuiper događaje |
