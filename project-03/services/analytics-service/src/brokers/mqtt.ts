import mqtt from "mqtt";

/** MQTT potrošač sa trajnom sesijom (clean=false) i auto-reconnect-om (Scenario B). */
export function startMqttConsumer(onMessage: (payload: string) => void): void {
  const host = process.env.MQTT_HOST || "mosquitto";
  const port = parseInt(process.env.MQTT_PORT || "1883");
  const qos = parseInt(process.env.MQTT_QOS || "1") as 0 | 1 | 2;
  const topic = process.env.TOPIC || "iot/measurements";

  const client = mqtt.connect(`mqtt://${host}:${port}`, {
    clientId: "analytics-mqtt",
    clean: false, // trajna pretplata
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    client.subscribe(topic, { qos }, (err) => {
      if (err) console.error("[MQTT] greška pri pretplati:", err.message);
      else console.log(`[MQTT] Analytics pretplaćen: ${host}:${port}, QoS=${qos}, topic=${topic}`);
    });
  });

  client.on("reconnect", () => console.log("[MQTT] ponovno povezivanje…"));
  client.on("error", (e) => console.error("[MQTT] error:", e.message));
  client.on("message", (_t, payload) => onMessage(payload.toString()));
}
