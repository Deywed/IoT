#!/usr/bin/env bash
# Beleži docker stats (CPU/RAM/Net/Block I/O) svih kontejnera u CSV.
# Pokrenuti PARALELNO sa scenarijem:  ./monitor-stats.sh <label> [interval_s]
# Zaustaviti sa Ctrl+C.  Rezultat: results/docker-stats-<label>.csv
set -euo pipefail

RESULTS_DIR="$(cd "$(dirname "$0")" && pwd)/results"
mkdir -p "$RESULTS_DIR"

LABEL="${1:-run}"
INTERVAL="${2:-2}"
OUT="$RESULTS_DIR/docker-stats-${LABEL}.csv"

echo "timestamp,container,cpu_perc,mem_usage,mem_perc,net_io,block_io" > "$OUT"
echo "Beležim docker stats svakih ${INTERVAL}s -> $OUT  (Ctrl+C za stop)"

trap 'echo; echo "Zaustavljeno. Snimak: $OUT"; exit 0' INT TERM

while true; do
  ts="$(date +%s)"
  docker stats --no-stream \
    --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}' \
    | sed "s/^/${ts},/" >> "$OUT"
  sleep "$INTERVAL"
done
