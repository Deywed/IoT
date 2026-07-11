// ── Deljeno stanje za dashboard ──────────────────────────────────────────────
// In-memory prsten skorašnjih očitavanja, prozora, CEP događaja, ML predikcija i
// alarma. `bus` emituje "update" na svaku promenu -> SSE stream (api.ts) gura
// događaje ka web dashboard-u u realnom vremenu.

import { EventEmitter } from "events";

export interface Reading {
  ts: number;
  temperature: number;
  overall_usage: number;
  humidity: number;
  solar_generation: number;
}

export interface WindowStat {
  ts: number;
  count: number;
  avgTemp: number;
  maxTemp: number;
  p50: number;
  p95: number;
  alert: boolean;
}

export interface Prediction {
  ts: number;
  predicted: string;
  actual: string;
  confidence: number;
  correct: boolean;
}

export interface AlertItem {
  ts: number;
  type: string;
  message: string;
  e2eLatencyMs?: number | null;
}

export type CepEvent = { ts: number; event_type?: string; [k: string]: unknown };

function capPush<T>(arr: T[], item: T, cap: number): void {
  arr.push(item);
  if (arr.length > cap) arr.shift();
}

class Store {
  readonly bus = new EventEmitter();
  readings: Reading[] = [];
  windows: WindowStat[] = [];
  events: CepEvent[] = [];
  predictions: Prediction[] = [];
  alerts: AlertItem[] = [];
  mlCorrect = 0;
  mlTotal = 0;

  constructor() {
    this.bus.setMaxListeners(200);
  }

  addReading(r: Reading): void {
    capPush(this.readings, r, 300);
    this.bus.emit("update", { kind: "reading", item: r });
  }
  addWindow(w: WindowStat): void {
    capPush(this.windows, w, 100);
    this.bus.emit("update", { kind: "window", item: w });
  }
  addEvent(e: CepEvent): void {
    capPush(this.events, e, 100);
    this.bus.emit("update", { kind: "event", item: e });
  }
  addPrediction(p: Prediction): void {
    this.mlTotal++;
    if (p.correct) this.mlCorrect++;
    capPush(this.predictions, p, 100);
    this.bus.emit("update", { kind: "prediction", item: p, mlAccuracy: this.mlAccuracy() });
  }
  addAlert(a: AlertItem): void {
    capPush(this.alerts, a, 100);
    this.bus.emit("update", { kind: "alert", item: a });
  }

  mlAccuracy(): number {
    return this.mlTotal ? this.mlCorrect / this.mlTotal : 0;
  }

  snapshot() {
    return {
      readings: this.readings.slice(-120),
      windows: this.windows.slice(-30),
      events: this.events.slice(-30),
      predictions: this.predictions.slice(-30),
      alerts: this.alerts.slice(-30),
      ml: { correct: this.mlCorrect, total: this.mlTotal, accuracy: this.mlAccuracy() },
    };
  }
}

export const store = new Store();
