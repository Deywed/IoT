#!/usr/bin/env bash
# Scenario C — Burst Event Load.
# Nagli skok sa ~50 na ~5000 msg/s; prati se formiranje reda (backlog),
# backpressure i vreme oporavka (recovery time) do normale.
#
# Preduslov: stack pokrenut (preporuka STORAGE_WRITE_ENABLED=false).
# Upotreba:  ./scenario-c-burst.sh [mqtt|kafka]
set -euo pipefail

BROKER="${1:-mqtt}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RESULTS="$HERE/results"; mkdir -p "$RESULTS"
NETWORK="${NETWORK:-project-02_default}"
COMPOSE="docker compose -f $ROOT/docker-compose.yml"
out="$RESULTS/scenario-c-$BROKER.txt"

echo ">>> Scenario C ($BROKER) — rezultat u $out"

if [ "$BROKER" = "kafka" ]; then
  echo "[baseline ~50 msg/s, 20s]" | tee "$out"
  $COMPOSE exec -T kafka /opt/kafka/bin/kafka-producer-perf-test.sh \
    --topic iot-measurements --num-records 1000 --record-size 200 --throughput 50 \
    --producer-props bootstrap.servers=localhost:9092 acks=1 2>&1 | tee -a "$out" || true

  echo "[BURST ~5000 msg/s]" | tee -a "$out"
  $COMPOSE exec -T kafka /opt/kafka/bin/kafka-producer-perf-test.sh \
    --topic iot-measurements --num-records 50000 --record-size 200 --throughput 5000 \
    --producer-props bootstrap.servers=localhost:9092 acks=1 2>&1 | tee -a "$out" || true

  echo "[praćenje consumer lag-a do oporavka]" | tee -a "$out"
  for _ in $(seq 1 30); do
    echo "--- $(date +%T) ---" | tee -a "$out"
    $COMPOSE exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh \
      --bootstrap-server localhost:9092 --describe --group storage-group 2>&1 | tee -a "$out" || true
    sleep 2
  done
else
  echo "[baseline ~50 msg/s, 15s]" | tee "$out"
  timeout 15 docker run --rm --network "$NETWORK" emqtt-bench \
    pub -h mosquitto -t iot/measurements -c 5 -I 100 -q 1 -s 200 2>&1 | tee -a "$out" || true

  echo "[BURST ~5000 msg/s, 10s]" | tee -a "$out"
  timeout 10 docker run --rm --network "$NETWORK" emqtt-bench \
    pub -h mosquitto -t iot/measurements -c 100 -I 20 -q 1 -s 200 2>&1 | tee -a "$out" || true

  echo "[oporavak — prati inflight/queue u logovima i mosquitto \$SYS]" | tee -a "$out"
  echo "  docker compose logs -f storage-mqtt" | tee -a "$out"
fi

echo ">>> Gotovo."
