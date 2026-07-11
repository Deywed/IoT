// Tipovi koji preslikavaju stanje koje Analytics servis šalje preko /api (state.ts).

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

export interface CepEvent {
  ts: number;
  event_type?: string;
  device_id?: string;
  [k: string]: unknown;
}

export interface Ml {
  correct: number;
  total: number;
  accuracy: number;
}

export interface Snapshot {
  readings: Reading[];
  windows: WindowStat[];
  events: CepEvent[];
  predictions: Prediction[];
  alerts: AlertItem[];
  ml: Ml;
}
