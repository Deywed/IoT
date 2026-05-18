/**
 * SCENARIO A – High-Frequency Ingestion
 * Simulira IoT uređaj koji šalje merenja u kratkim intervalima.
 * Testira sva 3 protokola i meri overhead serijalizacije/upisa.
 *
 * Pokretanje:
 *   k6 run k6/scenario-a-ingestion.js
 */

import http from 'k6/http';
import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10  },
    { duration: '60s', target: 100 },
    { duration: '60s', target: 500 },
    { duration: '15s', target: 0   },
  ],
  thresholds: {
    'http_req_duration{protocol:rest}':    ['avg<1000', 'p(95)<2000'],
    'http_req_duration{protocol:graphql}': ['avg<1000', 'p(95)<2000'],
    'grpc_req_duration':                   ['avg<1000', 'p(95)<2000'],
    'checks':                              ['rate>0.95'],
  },
};

const grpcClient = new grpc.Client();
grpcClient.load(['../grpc-service'], 'proto/iot.proto');

// Realistični podaci IoT uređaja — kuća sa solarnim panelima
function randomReading() {
  const summaries = ['Clear', 'Cloudy', 'Rainy', 'Partly Cloudy'];
  return {
    temperature:      parseFloat((5  + Math.random() * 30).toFixed(2)),
    humidity:         parseFloat((30 + Math.random() * 50).toFixed(2)),
    overall_usage:    parseFloat((1  + Math.random() * 14).toFixed(2)),
    solar_generation: parseFloat((Math.random() * 8).toFixed(2)),
    fridge_kw:        parseFloat((0.1 + Math.random() * 0.4).toFixed(3)),
    furnace_kw:       parseFloat((Math.random() * 3).toFixed(2)),
    home_office_kw:   parseFloat((Math.random() * 0.5).toFixed(3)),
    summary:          summaries[Math.floor(Math.random() * summaries.length)],
  };
}

export default function () {
  const r = randomReading();

  // ── REST ─────────────────────────────────────────────────────────────────
  const restRes = http.post(
    'http://localhost:8080/api/measurements',
    JSON.stringify({
      temperature:     r.temperature,
      humidity:        r.humidity,
      overallUsage:    r.overall_usage,
      solarGeneration: r.solar_generation,
      fridgeKw:        r.fridge_kw,
      furnaceKw:       r.furnace_kw,
      homeOfficeKw:    r.home_office_kw,
      summary:         r.summary,
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { protocol: 'rest' } }
  );
  check(restRes, { '[REST] 201 Created': (r) => r.status === 201 });

  // ── GraphQL ───────────────────────────────────────────────────────────────
  const gqlRes = http.post(
    'http://localhost:4000/',
    JSON.stringify({
      query: `mutation {
        createMeasurement(
          temperature: ${r.temperature}, humidity: ${r.humidity},
          overall_usage: ${r.overall_usage}, solar_generation: ${r.solar_generation},
          fridge_kw: ${r.fridge_kw}, furnace_kw: ${r.furnace_kw},
          home_office_kw: ${r.home_office_kw}, summary: "${r.summary}"
        ) { id }
      }`,
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { protocol: 'graphql' } }
  );
  check(gqlRes, {
    '[GraphQL] 200 OK':    (r) => r.status === 200,
    '[GraphQL] no errors': (r) => r.body != null && !JSON.parse(r.body).errors,
  });

  // ── gRPC ──────────────────────────────────────────────────────────────────
  grpcClient.connect('localhost:50051', { plaintext: true });
  const grpcRes = grpcClient.invoke('SensorService/SaveMeasurement', {
    temperature:      r.temperature,
    humidity:         r.humidity,
    usage_overall:    r.overall_usage,
    solar_generation: r.solar_generation,
    fridge_kw:        r.fridge_kw,
    furnace_kw:       r.furnace_kw,
    home_office_kw:   r.home_office_kw,
    summary:          r.summary,
  });
  check(grpcRes, { '[gRPC] StatusOK': (r) => r && r.status === grpc.StatusOK });

  sleep(0.1);
}
