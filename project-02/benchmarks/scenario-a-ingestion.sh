#!/usr/bin/env bash
# Scenario A — Massive Sensor Ingestion.
# Maksimalni throughput (msg/s) i % izgubljenih poruka pri 100 / 1000 / 10000 "uređaja".
# MQTT: emqtt-bench (QoS 0/1/2).  Kafka: kafka-producer-perf-test.sh (acks 0/1/all).
#
# PREPORUKA: pokreni stack sa STORAGE_WRITE_ENABLED=false da disk I/O ne bude usko grlo.
#   STORAGE_WRITE_ENABLED=false docker compose --profile <broker> up -d --build
# % gubitka = (emqtt-bench poslato) − (storage primljeno, iz logova) / poslato.
#
# Upotreba:  ./scenario-a-ingestion.sh [mqtt|kafka]
set -euo pipefail

BROKER="${1:-mqtt}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RESULTS="$HERE/results"; mkdir -p "$RESULTS"
NETWORK="${NETWORK:-project-02_default}"
DURATION="${DURATION:-30}"          # trajanje jednog merenja (s) — za MQTT
COMPOSE="docker compose -f $ROOT/docker-compose.yml"

echo ">>> Scenario A ($BROKER) — rezultati u $RESULTS/"

if [ "$BROKER" = "mqtt" ]; then
  read -ra CLIENTS_LIST <<< "${CLIENTS_LIST:-100 1000 10000}"
  read -ra QOS_LIST     <<< "${QOS_LIST:-0 1 2}"
  for c in "${CLIENTS_LIST[@]}"; do
    for q in "${QOS_LIST[@]}"; do
      out="$RESULTS/scenario-a-mqtt-c${c}-q${q}.txt"
      echo "--- emqtt-bench pub: clients=$c qos=$q dur=${DURATION}s ---" | tee "$out"
      timeout "${DURATION}" docker run --rm --network "$NETWORK" emqtt-bench \
        pub -h mosquitto -p 1883 -t iot/measurements -c "$c" -I 10 -q "$q" -s 200 \
        2>&1 | tee -a "$out" || true
    done
  done
else
  read -ra ACKS_LIST <<< "${ACKS_LIST:-0 1 all}"
  RECORDS="${RECORDS:-1000000}"
  for a in "${ACKS_LIST[@]}"; do
    out="$RESULTS/scenario-a-kafka-acks${a}.txt"
    echo "--- kafka-producer-perf-test: acks=$a records=$RECORDS ---" | tee "$out"
    $COMPOSE exec -T kafka /opt/kafka/bin/kafka-producer-perf-test.sh \
      --topic iot-measurements --num-records "$RECORDS" --record-size 200 --throughput -1 \
      --producer-props bootstrap.servers=localhost:9092 acks="$a" \
      2>&1 | tee -a "$out" || true
  done
fi

echo ">>> Gotovo. Uporedi 'poslato' (alat) sa 'primljeno' (docker compose logs storage-$BROKER)."
