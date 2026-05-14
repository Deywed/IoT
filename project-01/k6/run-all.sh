#!/bin/bash
# Pokreće sva tri k6 scenarija redom i čuva JSON rezultate u k6/results/

set -e

RESULTS_DIR="$(dirname "$0")/results"
mkdir -p "$RESULTS_DIR"

echo "============================================"
echo " IoT Microservices – k6 Load Test Suite"
echo "============================================"
echo ""

echo "▶ Scenario A: High-Frequency Ingestion"
k6 run \
  --out "json=${RESULTS_DIR}/scenario-a.json" \
  "$(dirname "$0")/scenario-a-ingestion.js"

echo ""
echo "▶ Scenario B: Selective Monitoring"
k6 run \
  --out "json=${RESULTS_DIR}/scenario-b.json" \
  "$(dirname "$0")/scenario-b-selective.js"

echo ""
echo "▶ Scenario C: Heavy Querying / Aggregation"
k6 run \
  --out "json=${RESULTS_DIR}/scenario-c.json" \
  "$(dirname "$0")/scenario-c-aggregation.js"

echo ""
echo "============================================"
echo " Svi testovi završeni. Rezultati u: ${RESULTS_DIR}/"
echo "============================================"
