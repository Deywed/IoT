import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useAnalytics } from "./useAnalytics";
import type { CepEvent } from "./types";

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("sr-RS");

const EVENT_COLORS: Record<string, string> = {
  HIGH_TEMP: "#ef4444",
  WINDOW_HIGH_ENERGY: "#f59e0b",
  RAIN_LIKELY: "#38bdf8",
};

function eventDetail(e: CepEvent): string {
  const parts: string[] = [];
  if (e.device_id) parts.push(String(e.device_id));
  if (typeof e.temperature === "number") parts.push(`${(e.temperature as number).toFixed(1)}°C`);
  if (typeof e.avg_usage === "number") parts.push(`avg=${(e.avg_usage as number).toFixed(1)}kW`);
  if (typeof e.max_usage === "number") parts.push(`max=${(e.max_usage as number).toFixed(1)}kW`);
  if (typeof e.avg_humidity === "number") parts.push(`vlaga=${(e.avg_humidity as number).toFixed(0)}%`);
  if (typeof e.avg_solar === "number") parts.push(`solar=${(e.avg_solar as number).toFixed(2)}kW`);
  return parts.join(" · ");
}

export default function App() {
  const { data, connected } = useAnalytics();
  const lastWin = data.windows[data.windows.length - 1];
  const chartData = data.readings.map((r) => ({
    ts: r.ts,
    temperature: r.temperature,
    overall_usage: r.overall_usage,
  }));

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>IoT Analytics <span className="tag">Projekat 3</span></h1>
          <p className="sub">
            Tumbling window · eKuiper CEP · MaaS (ML klasifikacija vremena)
          </p>
        </div>
        <div className={`status ${connected ? "on" : "off"}`}>
          <span className="dot" /> {connected ? "povezan" : "nije povezan"}
        </div>
      </header>

      <section className="kpis">
        <Kpi label="Poruke (prozor)" value={lastWin ? String(lastWin.count) : "—"} />
        <Kpi
          label="Prosečna temp."
          value={lastWin ? `${lastWin.avgTemp.toFixed(1)}°C` : "—"}
        />
        <Kpi
          label="ML tačnost (uživo)"
          value={data.ml.total ? `${(data.ml.accuracy * 100).toFixed(0)}%` : "—"}
          hint={`${data.ml.correct}/${data.ml.total} pogodaka`}
        />
        <Kpi label="CEP događaji" value={String(data.events.length)} accent="amber" />
        <Kpi label="Alarmi" value={String(data.alerts.length)} accent="red" />
      </section>

      <div className="grid">
        <div className="card chart-card">
          <h2>Živa merenja</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="ts"
                tickFormatter={fmtTime}
                stroke="#64748b"
                fontSize={11}
                minTickGap={48}
              />
              <YAxis yAxisId="t" stroke="#f97316" fontSize={11} width={40} />
              <YAxis yAxisId="e" orientation="right" stroke="#22d3ee" fontSize={11} width={40} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1f2937", borderRadius: 8 }}
                labelFormatter={(v) => fmtTime(v as number)}
              />
              <Line
                yAxisId="t"
                type="monotone"
                dataKey="temperature"
                name="Temp (°C)"
                stroke="#f97316"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                yAxisId="e"
                type="monotone"
                dataKey="overall_usage"
                name="Potrošnja (kW)"
                stroke="#22d3ee"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>Statistika prozora</h2>
          {lastWin ? (
            <table className="stats">
              <tbody>
                <tr><td>Broj poruka</td><td>{lastWin.count}</td></tr>
                <tr><td>Prosečna temp.</td><td>{lastWin.avgTemp.toFixed(2)} °C</td></tr>
                <tr><td>Maks. temp.</td><td>{lastWin.maxTemp.toFixed(2)} °C</td></tr>
                <tr><td>Latencija p50</td><td>{lastWin.p50} ms</td></tr>
                <tr><td>Latencija p95</td><td>{lastWin.p95} ms</td></tr>
                <tr>
                  <td>Alarm</td>
                  <td className={lastWin.alert ? "bad" : "good"}>
                    {lastWin.alert ? "DA" : "ne"}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="empty">Čekam prvi prozor…</p>
          )}
        </div>

        <div className="card">
          <h2>MaaS predikcije <span className="muted">predviđeno / stvarno</span></h2>
          <ul className="feed">
            {[...data.predictions].reverse().map((p, i) => (
              <li key={i}>
                <span className={`pill ${p.correct ? "ok" : "no"}`}>
                  {p.correct ? "✓" : "✗"}
                </span>
                <span className="pred">{p.predicted}</span>
                <span className="muted"> / {p.actual}</span>
                <span className="conf">{(p.confidence * 100).toFixed(0)}%</span>
                <span className="time">{fmtTime(p.ts)}</span>
              </li>
            ))}
            {data.predictions.length === 0 && <li className="empty">Nema predikcija još…</li>}
          </ul>
        </div>

        <div className="card">
          <h2>eKuiper CEP događaji</h2>
          <ul className="feed">
            {[...data.events].reverse().map((e, i) => {
              const type = String(e.event_type ?? "?");
              return (
                <li key={i}>
                  <span className="badge" style={{ background: EVENT_COLORS[type] ?? "#475569" }}>
                    {type}
                  </span>
                  <span className="detail">{eventDetail(e)}</span>
                  <span className="time">{fmtTime(e.ts)}</span>
                </li>
              );
            })}
            {data.events.length === 0 && <li className="empty">Čekam CEP događaje…</li>}
          </ul>
        </div>

        <div className="card">
          <h2>Alarmi</h2>
          <ul className="feed">
            {[...data.alerts].reverse().map((a, i) => (
              <li key={i}>
                <span className="badge" style={{ background: "#ef4444" }}>{a.type}</span>
                <span className="detail">{a.message}</span>
                <span className="time">{fmtTime(a.ts)}</span>
              </li>
            ))}
            {data.alerts.length === 0 && <li className="empty">Nema alarma.</li>}
          </ul>
        </div>
      </div>

      <footer className="foot">
        Podaci uživo preko SSE (<code>/api/stream</code>) sa Analytics servisa · Projekat 3 — IoT
      </footer>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "red" | "amber";
}) {
  return (
    <div className={`kpi ${accent ?? ""}`}>
      <div className="kpi-val">{value}</div>
      <div className="kpi-label">{label}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}
