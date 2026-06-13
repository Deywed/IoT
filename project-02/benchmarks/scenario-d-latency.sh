#!/usr/bin/env bash
# Scenario D — Real-Time Alerting.
# Meri end-to-end latenciju: od generisanja kritične vrednosti (>50°C) u simulatoru
# do ispisa alarma u Analytics servisu. Ingestion se pokreće u CRITICAL_MODE.
#
# Upotreba:  ./scenario-d-latency.sh [mqtt|kafka]
set -euo pipefail

BROKER="${1:-mqtt}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RESULTS="$HERE/results"; mkdir -p "$RESULTS"
COMPOSE="docker compose -f $ROOT/docker-compose.yml"
out="$RESULTS/scenario-d-$BROKER.txt"
WATCH="${WATCH:-60}"

echo ">>> Scenario D ($BROKER): pokrećem stack u CRITICAL modu…"
CRITICAL_MODE=true $COMPOSE --profile "$BROKER" up -d --build

echo ">>> Hvatam alarme i latenciju iz Analytics logova ${WATCH}s -> $out"
timeout "$WATCH" $COMPOSE logs -f "analytics-$BROKER" 2>/dev/null \
  | grep --line-buffered "ALERT" | tee "$out" || true

echo ">>> Gotovo. Latencije alarma (e2e) su u $out"
