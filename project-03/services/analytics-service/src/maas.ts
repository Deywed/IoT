// ── MaaS klijent (Model as a Service preko REST-a) ───────────────────────────
// Analytics poziva MaaS /predict za klasifikaciju vremenskog uslova na osnovu
// senzorskih atributa. Koristi ugrađeni fetch iz Node 22 (bez dodatnih zavisnosti).

const MAAS_URL = process.env.MAAS_URL || "http://maas:8000";

export interface WeatherFeatures {
  temperature: number;
  humidity: number;
  solar_generation: number;
}

export interface WeatherPrediction {
  predicted_summary: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export async function predictWeather(f: WeatherFeatures): Promise<WeatherPrediction> {
  const res = await fetch(`${MAAS_URL}/predict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(f),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`MaaS HTTP ${res.status}`);
  return (await res.json()) as WeatherPrediction;
}
