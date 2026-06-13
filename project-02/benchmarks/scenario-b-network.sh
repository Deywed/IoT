#!/usr/bin/env bash
# Scenario B — Edge Connectivity Failures.
# Prekida mrežu simulatora (ingestion) na 30s pa je vraća; posmatra oporavak:
#   MQTT  -> trajna pretplata + re-isporuka QoS 1/2 poruka
#   Kafka -> nastavak od commit-ovanog offset-a (vidljiv consumer lag)
#
# Preduslov: stack je pokrenut, npr.
#   docker compose --profile mqtt up -d --build
# Upotreba:  ./scenario-b-network.sh [mqtt|kafka]
set -euo pipefail

BROKER="${1:-mqtt}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NETWORK="${NETWORK:-project-02_default}"
DOWN="${DOWN:-30}"
SVC="ingestion-$BROKER"
COMPOSE="docker compose -f $ROOT/docker-compose.yml"

CID="$($COMPOSE ps -q "$SVC")"
[ -n "$CID" ] || { echo "Servis $SVC nije pokrenut. Pokreni: docker compose --profile $BROKER up -d"; exit 1; }

echo ">>> Scenario B ($BROKER): prekid mreže za $SVC na ${DOWN}s"
docker network disconnect "$NETWORK" "$CID"
echo "[$(date +%T)] mreža PREKINUTA. Čekam ${DOWN}s…"
sleep "$DOWN"
docker network connect "$NETWORK" "$CID"
echo "[$(date +%T)] mreža VRAĆENA."

if [ "$BROKER" = "kafka" ]; then
  echo "Consumer lag posle oporavka (treba da opadne ka 0):"
  $COMPOSE exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh \
    --bootstrap-server localhost:9092 --describe --all-groups || true
fi

echo ">>> Prati oporavak:  docker compose logs -f storage-$BROKER analytics-$BROKER"
