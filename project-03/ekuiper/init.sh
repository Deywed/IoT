#!/bin/sh
# ── ekuiper-init ─────────────────────────────────────────────────────────────
# Sidecar koji čeka da eKuiper REST API postane dostupan, pa registruje
# stream (iot_measurements) i CEP pravila preko REST-a (/streams, /rules).
# Idempotentno: ako stream/pravilo već postoji, greška se ignoriše.

EK="${EKUIPER_URL:-http://ekuiper:9081}"

echo "[ekuiper-init] čekam eKuiper REST API na $EK ..."
until curl -sf "$EK/streams" >/dev/null 2>&1; do
  sleep 2
done
echo "[ekuiper-init] eKuiper je dostupan."

echo "[ekuiper-init] kreiram stream iot_measurements ..."
curl -sS -X POST "$EK/streams" \
  -H 'Content-Type: application/json' \
  -d @/init/streams/iot_measurements.json
echo

for f in /init/rules/*.json; do
  echo "[ekuiper-init] kreiram pravilo iz $f ..."
  curl -sS -X POST "$EK/rules" \
    -H 'Content-Type: application/json' \
    -d @"$f"
  echo
done

echo "[ekuiper-init] registrovana pravila:"
curl -sS "$EK/rules"
echo
echo "[ekuiper-init] gotovo."
