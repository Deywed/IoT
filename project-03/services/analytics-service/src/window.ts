// Tumbling window (fiksni vremenski prozor) — agregacija + detekcija praga (alarm).

export interface Reading {
  temperature: number;
  producedAt: number; // epoch ms (sa uređaja)
  receivedAt: number; // epoch ms (kad je Analytics primio)
}

export interface WindowResult {
  count: number;
  avgTemp: number;
  maxTemp: number;
  alert: boolean;
  // Scenario D: end-to-end latencija = trenutak alarma − najraniji produced_at u prozoru
  e2eLatencyMs: number | null;
  // opšta tranzitna latencija (received − produced) kroz prozor
  p50LatencyMs: number;
  p95LatencyMs: number;
}

export class TumblingWindow {
  private readings: Reading[] = [];
  private readonly cap = 200_000; // odbrana od OOM pri ekstremnom protoku

  constructor(private readonly threshold: number) {}

  add(r: Reading): void {
    if (this.readings.length < this.cap) this.readings.push(r);
  }

  /** Zatvori prozor: izračunaj statistiku i isprazni bafer. */
  flush(): WindowResult {
    const rs = this.readings;
    this.readings = [];

    if (rs.length === 0) {
      return { count: 0, avgTemp: 0, maxTemp: 0, alert: false, e2eLatencyMs: null, p50LatencyMs: 0, p95LatencyMs: 0 };
    }

    let sum = 0, maxTemp = -Infinity, minProduced = Infinity;
    const latencies: number[] = new Array(rs.length);
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      sum += r.temperature;
      if (r.temperature > maxTemp) maxTemp = r.temperature;
      if (r.producedAt < minProduced) minProduced = r.producedAt;
      latencies[i] = r.receivedAt - r.producedAt;
    }

    const avgTemp = sum / rs.length;
    const alert = avgTemp > this.threshold;
    const e2eLatencyMs = alert ? Date.now() - minProduced : null;

    latencies.sort((a, b) => a - b);
    const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];

    return {
      count: rs.length,
      avgTemp,
      maxTemp,
      alert,
      e2eLatencyMs,
      p50LatencyMs: pct(50),
      p95LatencyMs: pct(95),
    };
  }
}
