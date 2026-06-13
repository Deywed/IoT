// ── Analytics Service (Stream Processing) ────────────────────────────────────
// Pretplaćen na tok podataka; svakih WINDOW_SECONDS računa prosek temperature
// (tumbling window). Ako je prosek > ALERT_THRESHOLD -> ispisuje KRITIČAN ALARM.
// Meri i end-to-end latenciju (Scenario D).

import { TumblingWindow, Reading } from "./window";
import { startMqttConsumer } from "./brokers/mqtt";
import { startKafkaConsumer } from "./brokers/kafka";

const broker = (process.env.BROKER || "mqtt").toLowerCase();
const threshold = parseFloat(process.env.ALERT_THRESHOLD || "50");
const windowSeconds = parseInt(process.env.WINDOW_SECONDS || "10");

const win = new TumblingWindow(threshold);

interface Payload {
  temperature?: number;
  produced_at?: number;
}

function onMessage(payload: string): void {
  let p: Payload;
  try {
    p = JSON.parse(payload) as Payload;
  } catch {
    return; // nevalidna poruka
  }
  if (typeof p.temperature !== "number") return;

  const r: Reading = {
    temperature: p.temperature,
    producedAt: p.produced_at ?? Date.now(),
    receivedAt: Date.now(),
  };
  win.add(r);
}

// Zatvaranje prozora na fiksnih WINDOW_SECONDS sekundi.
setInterval(() => {
  const res = win.flush();
  if (res.count === 0) {
    console.log(`[Analytics] prozor ${windowSeconds}s: nema poruka`);
    return;
  }

  console.log(
    `[Analytics] prozor ${windowSeconds}s: count=${res.count}, ` +
      `avgTemp=${res.avgTemp.toFixed(2)}°C, maxTemp=${res.maxTemp.toFixed(2)}°C, ` +
      `latencija p50=${res.p50LatencyMs}ms p95=${res.p95LatencyMs}ms`
  );

  if (res.alert) {
    console.log(
      `🚨 [ALERT] KRITIČNO: prosečna temperatura ${res.avgTemp.toFixed(2)}°C > ${threshold}°C ` +
        `| end-to-end latencija alarma = ${res.e2eLatencyMs}ms`
    );
  }
}, windowSeconds * 1000);

async function main() {
  console.log(`[Analytics] start: broker=${broker}, prag=${threshold}°C, prozor=${windowSeconds}s`);
  if (broker === "kafka") {
    await startKafkaConsumer(onMessage);
  } else {
    startMqttConsumer(onMessage);
  }
}

main().catch((e) => {
  console.error("[Analytics] fatalna greška:", e);
  process.exit(1);
});

// Uredno gašenje na docker stop (SIGTERM).
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
