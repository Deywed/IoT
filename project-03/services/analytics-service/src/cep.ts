// ── eKuiper CEP potrošač ─────────────────────────────────────────────────────
// Analytics je pretplaćen na NOVI topic (iot/events) na koji eKuiper publikuje
// detektovane događaje od interesa (HIGH_TEMP, WINDOW_HIGH_ENERGY, RAIN_LIKELY).
// Poseban MQTT klijent od strim-potrošača merenja (clean sesija — događaji su
// tranzijentni, nije potrebna redelivery garancija).

import mqtt from "mqtt";

export function startCepConsumer(onEvent: (evt: Record<string, unknown>) => void): void {
  const host = process.env.MQTT_HOST || "mosquitto";
  const port = parseInt(process.env.MQTT_PORT || "1883");
  const qos = parseInt(process.env.MQTT_QOS || "1") as 0 | 1 | 2;
  const topic = process.env.EVENTS_TOPIC || "iot/events";

  const client = mqtt.connect(`mqtt://${host}:${port}`, {
    clientId: "analytics-cep",
    clean: true,
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    client.subscribe(topic, { qos }, (err) => {
      if (err) console.error("[CEP] greška pri pretplati:", err.message);
      else console.log(`[CEP] Analytics pretplaćen na eKuiper događaje: topic=${topic}`);
    });
  });

  client.on("error", (e) => console.error("[CEP] error:", e.message));
  client.on("message", (_t, payload) => {
    try {
      onEvent(JSON.parse(payload.toString()) as Record<string, unknown>);
    } catch {
      /* nevalidan događaj — ignoriši */
    }
  });
}
