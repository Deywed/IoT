# Tehnički izveštaj — Projekat 3

**IoT analitika toka podataka: eKuiper (CEP) + MaaS (mašinsko učenje)**

## 1. Kratak opis urađenog

Projekat 3 nadograđuje **Analytics** mikroservis iz Projekta 2. Umesto da analizu radi
samostalno (samo tumbling window nad temperaturom), Analytics sada analizu radi kroz dva
nova servisa, tačno kako zadatak traži:

- **eKuiper** — *streaming processing / Complex Event Processing* servis. Pretplaćen je na
  **isti** MQTT topic kao Analytics (`iot/measurements`), primenom **SQL pravila** detektuje
  događaje od interesa i šalje ih na **novi** MQTT topic (`iot/events`) koji Analytics preuzima.
- **MaaS** (*Model as a Service*) — **Python/FastAPI** mikroservis sa istreniranim
  **scikit-learn** modelom za **klasifikaciju** vremenskog uslova nad tokom koji čini
  vremensku seriju. Analytics ga poziva preko **REST** endpointa (`/predict`).

Zadržan je ostatak pipeline-a iz Projekta 2 (**ingestion** simulator, **storage** upis u
PostgreSQL, **Mosquitto** broker) i dodata je **Web aplikacija** (React) koja sve prikazuje
uživo. Svi servisi se pokreću kao **Docker kontejneri** (`docker compose up`). Ceo sistem je
**MQTT-orijentisan** (eKuiper je MQTT-baziran, pa je Kafka profil iz Projekta 2 izostavljen).

Ključne izmene po servisima:

- **Analytics** (Node/TS): dodata pretplata na `iot/events` (eKuiper), REST poziv ka MaaS-u za
  svaki prozor, `express` **HTTP + SSE** sloj za dashboard, i (opciono) publikovanje obogaćenih
  alarma na `iot/alerts`. Zadržan tumbling window i merenje latencije.
- **Ingestion** (.NET/C#): generator sada pravi **koherentno vreme** — temperatura, vlažnost,
  solarna proizvodnja i `summary` potiču iz istog „weather state" modela (vremenska serija sa
  sporim tranzicijama), pa ML klasifikacija nad **živim** tokom ima signal i smisao.

## 2. Arhitektura i tok podataka

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

**MQTT topici:**

| Topic | Producer | Consumer(i) |
|---|---|---|
| `iot/measurements` | ingestion | storage, **eKuiper**, analytics |
| `iot/events` | **eKuiper** | analytics |
| `iot/alerts` | analytics (opciono) | — |

> **Napomena o fan-out-u:** i storage, i eKuiper, i analytics su nezavisno pretplaćeni na
> `iot/measurements` (publish/subscribe). eKuiper i Analytics dakle vide **isti** tok — eKuiper
> radi rule-based detekciju, Analytics objedinjuje CEP događaje i ML predikcije.

**Model podataka** je nepromenjen (`sensor_measurements`, isti kao Projekat 1/2): energetska
polja (`overall_usage`, `solar_generation`, `fridge_kw`, `furnace_kw`, `home_office_kw`) i
meteorološka (`temperature`, `humidity`, `summary`), uz `device_id` i vremenske oznake.

## 3. eKuiper — streaming/CEP servis

eKuiper se pretplaćuje na `iot/measurements` (MQTT source, `server=tcp://mosquitto:1883`) preko
stream-a `iot_measurements`. Pravila i stream se registruju automatski pri startu preko REST API-ja
(`ekuiper-init` sidecar radi `POST /streams` i `POST /rules`). Definisana su tri pravila:

| Pravilo | Tip obrade | Uslov (HAVING/WHERE) | Događaj |
|---|---|---|---|
| `rule_high_temp` | instant filter | `temperature > 45` | `HIGH_TEMP` |
| `rule_window_energy` | **tumbling 10s** po uređaju | `AVG(overall_usage) > 10` | `WINDOW_HIGH_ENERGY` |
| `rule_rain_likely` | **tumbling 10s** po uređaju | `AVG(humidity) > 78 AND AVG(solar_generation) < 1.5` | `RAIN_LIKELY` |

Prva dva pokazuju osnovnu CEP funkcionalnost (filtriranje i **prozorska agregacija sa uslovom**),
treće pokazuje **kompozitni obrazac** (kombinacija dva agregata koji zajedno ukazuju na kišu).

Detektovani događaji stižu na `iot/events` kao JSON i Analytics ih prima. Primeri stvarno
zabeleženih događaja (iz `docker compose logs analytics`):

```json
{"event_type":"RAIN_LIKELY","device_id":"dev-0003","avg_humidity":86.457,"avg_solar":0.726}
{"event_type":"WINDOW_HIGH_ENERGY","device_id":"dev-0001","avg_usage":10.445,"max_usage":14.71,"cnt":10}
{"event_type":"HIGH_TEMP","device_id":"dev-0001","temperature":68.36}   // CRITICAL_MODE=true
```

## 4. MaaS — Model as a Service (mašinsko učenje)

- **Zadatak:** klasifikacija vremenskog uslova `summary` ∈ {Clear, Partly Cloudy, Cloudy, Rainy}.
- **Ulazni atributi (feature):** `temperature`, `humidity`, `solar_generation`.
- **Model:** `RandomForestClassifier` (scikit-learn, 200 stabala, `max_depth=12`).
- **Podaci:** 16.000 uzoraka, generisanih iz istog „weather state" modela kao simulator (opsezi
  po stanju se **preklapaju** sa susednim stanjima → klasifikacija nije trivijalna).
- **Podela:** stratifikovano **60/20/20** (train 9.600 / validacija 3.200 / test 3.200).
- **Serijalizacija:** model se trenira u Docker **build** koraku (`train.py`) i snima kao
  `model.joblib`; metrike u `metrics.json` servira endpoint `/info`.

**Rezultati na test skupu** (`test_accuracy = 0,93`, `macro-F1 = 0,929`, validacija `0,924`):

| Klasa | Preciznost | Odziv (recall) | F1 |
|---|---|---|---|
| Clear | 0,945 | 0,938 | 0,941 |
| Partly Cloudy | 0,931 | 0,854 | 0,891 |
| Cloudy | 0,907 | 0,934 | 0,920 |
| Rainy | 0,939 | 0,995 | 0,966 |

**Confusion matrix** (redovi = stvarno, kolone = predviđeno):

| stvarno \ predviđeno | Clear | Partly Cloudy | Cloudy | Rainy |
|---|---|---|---|---|
| **Clear** | 750 | 50 | 0 | 0 |
| **Partly Cloudy** | 44 | 683 | 73 | 0 |
| **Cloudy** | 0 | 1 | 747 | 52 |
| **Rainy** | 0 | 0 | 4 | 796 |

> **Zapažanje:** greške postoje **isključivo između susednih klasa** (Clear↔Partly Cloudy,
> Partly Cloudy↔Cloudy, Cloudy↔Rainy). Clear se **nikada** ne meša sa Rainy — model je naučio
> smislenu, fizički očekivanu strukturu (vedro = toplo/suvo/sunčano; kišovito = hladno/vlažno/bez sunca).
> Najteža klasa je „Partly Cloudy" (najveći preklop opsega sa oba suseda), što je i očekivano.

**REST endpointi:** `GET /health`, `GET /info` (metrike), `POST /predict`, `POST /predict/batch`.

```bash
curl -X POST http://localhost:8000/predict -H 'content-type: application/json' \
     -d '{"temperature":30,"humidity":30,"solar_generation":7}'
# -> {"predicted_summary":"Clear","confidence":1.0, "probabilities":{...}}
```

## 5. Analytics — nadogradnja

Za svaki tumbling prozor (10s) Analytics:

1. izračuna statistiku (count, prosečna/maks. temperatura, p50/p95 latencija);
2. ako je prosečna temperatura > `ALERT_THRESHOLD` (50°C) → **alarm** + end-to-end latencija;
3. pozove **MaaS** `/predict` sa poslednjim (koherentnim) očitavanjem i uporedi **predviđeno vs
   stvarno** vreme (prati *running accuracy*).

Paralelno prima **eKuiper CEP događaje** sa `iot/events` i sve (merenja, prozori, CEP događaji,
ML predikcije, alarmi) izlaže dashboard-u preko **SSE** (`/api/stream`) i REST-a (`/api/summary`).

Primer objedinjenog izlaza (stvarni log):

```
[Analytics] prozor 10s: count=50, avgTemp=9.78°C, maxTemp=18.86°C, latencija p50=1ms p95=3ms
[MaaS] predviđeno=Rainy (100%) stvarno=Rainy -> ✓ | running acc=1.00
[CEP] eKuiper događaj: WINDOW_HIGH_ENERGY {"avg_usage":10.01,"max_usage":14.75,"device_id":"dev-0001"}
🚨 [ALERT] KRITIČNO: prosečna temperatura 62.19°C > 50°C | end-to-end latencija=9789ms
```

## 6. Web aplikacija

**React + Vite** SPA (servira **nginx**), koja se preko `EventSource('/api/stream')` u realnom
vremenu povezuje na Analytics. nginx radi **reverse-proxy** `/api → analytics:8080` (bez CORS-a,
sa isključenim baferovanjem za SSE). Prikazuje: KPI kartice, grafikon živih merenja
(temperatura + potrošnja), statistiku prozora, feed **eKuiper CEP događaja**, **MaaS predikcije**
(predviđeno/stvarno + *running accuracy*) i alarme.

## 7. Pokretanje i provera

```bash
cd project-03
docker compose up --build          # diže svih 9 servisa (db, mosquitto, ingestion, storage,
                                    #  eKuiper, ekuiper-init, maas, analytics, web)
```

| Interfejs | URL |
|---|---|
| Web dashboard | http://localhost:8081 |
| MaaS (Swagger / metrike) | http://localhost:8000/docs · http://localhost:8000/info |
| eKuiper REST (pravila) | http://localhost:9081/rules |
| Analytics API | http://localhost:8080/api/summary |

**Provereno (stvarni ishodi):**

```bash
curl -s http://localhost:9081/rules            # 3 pravila, status "running"
docker compose exec mosquitto mosquitto_sub -t 'iot/events' -v   # CEP događaji uživo
docker compose exec db psql -U myuser -d mydb -c \
  "SELECT count(*) FROM sensor_measurements;"  # raste (npr. 597 posle ~1 min)
```

Za demonstraciju **alarma i `HIGH_TEMP` CEP događaja**: `CRITICAL_MODE=true docker compose up -d
ingestion` (visoke temperature 55–70°C). Verifikovano je da eKuiper tada emituje `HIGH_TEMP`
događaje, a Analytics diže alarm (`avgTemp 62.19°C > 50°C`).

## 8. Odgovori na inženjerska pitanja

**1. Zašto koristiti eKuiper (CEP) uz Analytics, a ne sve raditi u Analytics-u?**
eKuiper je specijalizovan streaming/CEP engine sa deklarativnim SQL-om, prozorima i obrascima —
pravila se menjaju bez rekompajliranja Analytics-a (samo `POST /rules`), radi na edge-u sa malim
otiskom i rasterećuje Analytics detekcije. Analytics ostaje **orkestrator** koji objedinjuje
CEP i ML rezultate i servira ih aplikaciji.

**2. Rule-based (eKuiper) vs ML-based (MaaS) analiza — čemu obe?**
One su **komplementarne**. eKuiper hvata **eksplicitne, deterministicke** uslove (prag temperature,
prosek potrošnje u prozoru) sa nultom latencijom učenja i punom objašnjivošću. MaaS hvata
**naučene obrasce** iz više atributa istovremeno (klasifikacija vremena iz temperature+vlage+solara)
koje je teško ručno kodirati pravilima. Zajedno pokrivaju i „poznato-sumnjivo" i „naučeno".

**3. Zašto koherentan generator podataka?**
U Projektu 2 simulator je generisao atribute nezavisno-slučajno, pa ne bi postojao signal za
klasifikaciju. Uveden je „weather state" model (vremenska serija sa sporim tranzicijama) iz kog
potiču temperatura/vlaga/solar/`summary`. Isti model koristi i `train.py`, pa MaaS nad **živim**
tokom postiže visoku tačnost (predviđeno ≈ stvarno), dok na težem test skupu (pun preklop klasa)
tačnost realno pada na 0,93.

**4. Zašto MQTT (a ne Kafka) za ovaj projekat?**
eKuiper source/sink u ovom radu su MQTT, a i sam zadatak specificira MQTT broker. Za edge CEP
scenario (jedan broker, publish/subscribe fan-out ka više potrošača) MQTT je dovoljan i lakši;
Kafka profil iz Projekta 2 nije potreban.

## 9. Zaključak

- Analytics je uspešno prebačen sa samostalne analize na **kombinaciju eKuiper CEP-a i MaaS ML
  servisa**, tačno po zahtevima zadatka.
- eKuiper preko MQTT-a detektuje događaje (`HIGH_TEMP`, `WINDOW_HIGH_ENERGY`, `RAIN_LIKELY`) i
  šalje ih na novi topic koji Analytics preuzima — potvrđeno end-to-end.
- MaaS (RandomForest, scikit-learn) klasifikuje vreme sa **93% test tačnosti** (macro-F1 0,93);
  greške su isključivo između susednih klasa.
- Ceo sistem radi kao **9 Docker kontejnera** uz **React** dashboard koji uživo prikazuje merenja,
  CEP događaje, ML predikcije i alarme.
