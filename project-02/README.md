# Projekat 2 — Event-driven IoT mikroservisi: MQTT vs Kafka

Asinhroni, event-driven mikroservisni sistem koji **istu arhitekturu implementira nad dva
broker-a** (MQTT/Mosquitto i Apache Kafka u KRaft režimu) radi uporedne evaluacije
performansi, skalabilnosti i garancija isporuke za IoT edge/cloud scenarije.

Koristi se **isti model podataka kao u Projektu 1** (`sensor_measurements`), uz prošireni
atribut `device_id` i vremenske oznake za analizu latencije.

## Arhitektura

```
[Ingestion (.NET)] --publish--> [ BROKER ] --subscribe--> [Storage (.NET)]   --batch INSERT (500)--> [PostgreSQL]
  simulira uređaje    MQTT/Kafka topic          \--subscribe--> [Analytics (Node/TS)] --10s tumbling window--> ALERT
```

| Servis | Tehnologija | Uloga |
|---|---|---|
| **Ingestion** | .NET / C# | simulira IoT uređaje, publikuje JSON merenja (`produced_at`, `device_id`) |
| **Storage** | .NET / C# (Npgsql) | pretplata + **grupni upis na 500 poruka** u Postgres (ili bez upisa za stres-test) |
| **Analytics** | Node.js / TypeScript | **tumbling window 10s**: prosek temperature, **alarm** ako > praga, end-to-end latencija |

Broker se bira **profilom** docker compose-a; uvek radi samo jedan (manji otisak — edge):

```bash
docker compose --profile mqtt  up --build     # Mosquitto stek
docker compose --profile kafka up --build     # Kafka (KRaft) stek
```

Isti kod servisa radi sa oba broker-a (adapteri se biraju preko `BROKER` env promenljive).

## Konfiguracija

Kopirati `.env.example` u `.env` i menjati po eksperimentu (compose ih čita automatski):

| Promenljiva | Značenje |
|---|---|
| `MQTT_QOS` | `0` / `1` / `2` (at most / at least / exactly once) |
| `KAFKA_ACKS` | `0` / `1` / `all` |
| `ALERT_THRESHOLD` | prag °C za alarm (default 50) |
| `WINDOW_SECONDS` | dužina tumbling prozora (default 10) |
| `STORAGE_WRITE_ENABLED` | `false` = bez upisa u bazu (Scenariji A i C) |
| `STORAGE_BATCH_SIZE` / `STORAGE_FLUSH_MS` | batching: na N poruka ili na N ms |
| `DEVICE_COUNT` / `MSG_RATE` / `CRITICAL_MODE` | parametri simulatora |

## Brzi start (provera pipeline-a)

```bash
cd project-02
docker compose --profile mqtt up --build      # ili --profile kafka
# Drugi terminal:
docker compose logs -f analytics-mqtt          # statistika prozora + alarmi
docker compose exec db psql -U myuser -d mydb -c "SELECT count(*) FROM sensor_measurements;"
docker compose --profile mqtt down
```

Za Kafku, consumer lag i particije:
```bash
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --all-groups
```

## Eksperimenti (Scenariji A–D)

Vidi [benchmarks/README.md](benchmarks/README.md). Ukratko, uz `monitor-stats.sh` u
paralelnom terminalu:

```bash
cd benchmarks
./scenario-a-ingestion.sh kafka     # masovna ingestija (100/1000/10000), throughput + gubici
./scenario-b-network.sh   mqtt      # prekid mreže 30s -> oporavak
./scenario-c-burst.sh     kafka     # 50 -> 5000 msg/s, backlog + recovery
./scenario-d-latency.sh   mqtt      # end-to-end latencija alarma
```

## Rezultati i izveštaj

Eksperimentalni podaci se upisuju u `benchmarks/results/`. Tehnički izveštaj sa uporednom
tabelom i odgovorima na inženjerska pitanja je u [izvestaj.md](izvestaj.md).
