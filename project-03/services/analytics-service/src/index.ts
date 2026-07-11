// ── Analytics Service (Projekat 3) ───────────────────────────────────────────
// Nadograđeni Analytics: analizu radi kombinovanjem TRI izvora:
//   1) sirovi tok merenja (iot/measurements)  -> tumbling window (temp/latencija)
//   2) eKuiper CEP događaji (iot/events)       -> detektovani događaji od interesa
//   3) MaaS REST (/predict)                    -> ML klasifikacija vremena
// Rezultate objedinjuje i izlaže dashboard-u preko HTTP/SSE (:8080), a kritične
// alarme (opciono) publikuje nazad na MQTT (iot/alerts).

import mqtt from "mqtt";
import { TumblingWindow } from "./window";
import { startMqttConsumer } from "./brokers/mqtt";
import { startCepConsumer } from "./cep";
import { predictWeather } from "./maas";
import { startApiServer } from "./api";
import { store } from "./state";

const threshold = parseFloat(process.env.ALERT_THRESHOLD || "50");
const windowSeconds = parseInt(process.env.WINDOW_SECONDS || "10");
const apiPort = parseInt(process.env.API_PORT || "8080");
const alertsTopic = process.env.ALERTS_TOPIC || "iot/alerts";

const win = new TumblingWindow(threshold);

interface Payload {
  device_id?: string;
  temperature?: number;
  humidity?: number;
  solar_generation?: number;
  overall_usage?: number;
  summary?: string;
  produced_at?: number;
}

let lastFull: Payload | null = null;
let lastReadingPush = 0;

function onMessage(payload: string): void {
  let p: Payload;
  try {
    p = JSON.parse(payload) as Payload;
  } catch {
    return; // nevalidna poruka
  }
  if (typeof p.temperature !== "number") return;

  win.add({
    temperature: p.temperature,
    producedAt: p.produced_at ?? Date.now(),
    receivedAt: Date.now(),
  });
  lastFull = p;

  // Uzorkovanje za dashboard (najviše ~2x/s bez obzira na protok).
  const now = Date.now();
  if (now - lastReadingPush > 500) {
    lastReadingPush = now;
    store.addReading({
      ts: now,
      temperature: p.temperature,
      overall_usage: p.overall_usage ?? 0,
      humidity: p.humidity ?? 0,
      solar_generation: p.solar_generation ?? 0,
    });
  }
}

// ── MQTT producer za obogaćene alarme (Analytics kao izvor) ──────────────────
const publisher = mqtt.connect(
  `mqtt://${process.env.MQTT_HOST || "mosquitto"}:${parseInt(process.env.MQTT_PORT || "1883")}`,
  { clientId: "analytics-producer", clean: true, reconnectPeriod: 2000 }
);
publisher.on("error", (e) => console.error("[Analytics] MQTT producer error:", e.message));

function publishAlert(obj: Record<string, unknown>): void {
  if (publisher.connected) publisher.publish(alertsTopic, JSON.stringify(obj), { qos: 1 });
}

// ── Zatvaranje prozora + MaaS predikcija (svakih WINDOW_SECONDS) ──────────────
setInterval(async () => {
  const res = win.flush();
  if (res.count === 0) {
    console.log(`[Analytics] prozor ${windowSeconds}s: nema poruka`);
    return;
  }

  const stat = {
    ts: Date.now(),
    count: res.count,
    avgTemp: +res.avgTemp.toFixed(2),
    maxTemp: +res.maxTemp.toFixed(2),
    p50: res.p50LatencyMs,
    p95: res.p95LatencyMs,
    alert: res.alert,
  };
  store.addWindow(stat);

  console.log(
    `[Analytics] prozor ${windowSeconds}s: count=${res.count}, ` +
      `avgTemp=${stat.avgTemp}°C, maxTemp=${stat.maxTemp}°C, ` +
      `latencija p50=${res.p50LatencyMs}ms p95=${res.p95LatencyMs}ms`
  );

  if (res.alert) {
    const message = `KRITIČNO: prosečna temperatura ${stat.avgTemp}°C > ${threshold}°C`;
    store.addAlert({ ts: Date.now(), type: "HIGH_AVG_TEMP", message, e2eLatencyMs: res.e2eLatencyMs });
    publishAlert({
      type: "HIGH_AVG_TEMP",
      avgTemp: stat.avgTemp,
      threshold,
      e2eLatencyMs: res.e2eLatencyMs,
      ts: Date.now(),
    });
    console.log(`🚨 [ALERT] ${message} | end-to-end latencija=${res.e2eLatencyMs}ms`);
  }

  // MaaS: klasifikuj vreme na osnovu poslednjeg (koherentnog) očitavanja u prozoru.
  if (
    lastFull &&
    typeof lastFull.temperature === "number" &&
    typeof lastFull.humidity === "number" &&
    typeof lastFull.solar_generation === "number"
  ) {
    try {
      const pred = await predictWeather({
        temperature: lastFull.temperature,
        humidity: lastFull.humidity,
        solar_generation: lastFull.solar_generation,
      });
      const actual = lastFull.summary ?? "?";
      const correct = pred.predicted_summary === actual;
      store.addPrediction({
        ts: Date.now(),
        predicted: pred.predicted_summary,
        actual,
        confidence: pred.confidence,
        correct,
      });
      console.log(
        `[MaaS] predviđeno=${pred.predicted_summary} (${(pred.confidence * 100).toFixed(0)}%) ` +
          `stvarno=${actual} -> ${correct ? "✓" : "✗"} | running acc=${store.mlAccuracy().toFixed(2)}`
      );
    } catch (e) {
      console.error("[MaaS] greška pri predikciji:", (e as Error).message);
    }
  }
}, windowSeconds * 1000);

async function main(): Promise<void> {
  console.log(
    `[Analytics] start: prag=${threshold}°C, prozor=${windowSeconds}s, ` +
      `MaaS=${process.env.MAAS_URL || "http://maas:8000"}, API port=${apiPort}`
  );

  // 1) HTTP/SSE API za dashboard
  startApiServer(apiPort);

  // 2) eKuiper CEP događaji (novi topic)
  startCepConsumer((evt) => {
    const item = { ts: Date.now(), ...(evt as Record<string, unknown>) };
    store.addEvent(item);
    console.log(`[CEP] eKuiper događaj: ${evt.event_type ?? "?"} ${JSON.stringify(evt)}`);
    if (evt.event_type === "HIGH_TEMP") {
      store.addAlert({
        ts: Date.now(),
        type: "CEP_HIGH_TEMP",
        message: `eKuiper CEP: visoka temperatura ${evt.temperature}°C (${evt.device_id})`,
      });
    }
  });

  // 3) Sirovi tok merenja
  startMqttConsumer(onMessage);
}

main().catch((e) => {
  console.error("[Analytics] fatalna greška:", e);
  process.exit(1);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
