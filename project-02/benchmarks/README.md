# Benchmark skripte — Projekat 2

Namenski alati (po postavci): **emqtt-bench** (MQTT) i **kafka-producer-perf-test.sh** (Kafka,
dolazi uz Kafka image). Praćenje resursa: `docker stats` -> CSV. Rezultati -> `results/`.

## Priprema

```bash
# 1) Obezbedi emqtt-bench (zvanični prebuilt image — bez gradnje iz izvora)
docker pull emqx/emqtt-bench:latest
#    (skripte podrazumevano koriste baš ovaj image; override: BENCH_IMG=...)

# 2) Pokreni odgovarajući stek (iz project-02/). Za Scenarije A i C preporučuje se
#    isključivanje upisa u bazu da disk I/O ne bude usko grlo:
STORAGE_WRITE_ENABLED=false docker compose --profile kafka up -d --build
#    (za MQTT: --profile mqtt)
```

> `NETWORK` promenljiva podrazumevano je `project-02_default` (mreža compose projekta).
> Ako se projekat zove drugačije, postaviti `NETWORK=<naziv>_default`.

## Praćenje resursa (paralelni terminal)

```bash
./monitor-stats.sh kafka-scenario-a 2     # CSV: results/docker-stats-kafka-scenario-a.csv
```

## Scenariji

| Skripta | Šta meri |
|---|---|
| `./scenario-a-ingestion.sh [mqtt\|kafka]` | max throughput i % gubitka pri 100/1000/10000 uređaja (QoS 0/1/2 vs acks 0/1/all) |
| `./scenario-b-network.sh   [mqtt\|kafka]` | oporavak posle 30s prekida mreže (trajna pretplata vs offset) |
| `./scenario-c-burst.sh     [mqtt\|kafka]` | backlog/backpressure i recovery time pri skoku 50 -> 5000 msg/s |
| `./scenario-d-latency.sh   [mqtt\|kafka]` | end-to-end latencija alarma (CRITICAL mod simulatora) |

### Korisni override-i (env)
- Scenario A (MQTT): `CLIENTS_LIST="100 1000"`, `QOS_LIST="0 1 2"`, `DURATION=30`
- Scenario A (Kafka): `ACKS_LIST="0 1 all"`, `RECORDS=1000000`
- Scenario B: `DOWN=30` (trajanje prekida)

### % izgubljenih poruka (Scenario A)
Uporediti broj **poslatih** poruka (izlaz alata) sa brojem **primljenih** u Storage servisu:
```bash
docker compose logs storage-kafka | grep "primljeno"
```

## Napomena o emqtt-bench

Skripte koriste zvanični prebuilt image `emqx/emqtt-bench:latest` (nema gradnje iz izvora —
ona povlači quicer/msquic i traži cmake/C++ toolchain). Na macOS-u skripte ne koriste `timeout`
(kojeg nema), već pokreću bench detached pa ga ugase posle zadatog trajanja.

Alternativa: instalirati emqtt-bench na host i pokrenuti protiv `localhost:1883` (port je izložen).
