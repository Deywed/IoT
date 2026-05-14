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
    { duration: '30s', target: 10  },   // zagrevanje – 10 VU
    { duration: '60s', target: 100 },   // srednje opterećenje – 100 VU
    { duration: '60s', target: 500 },   // visoko opterećenje – 500 VU
    { duration: '15s', target: 0   },   // hlađenje
  ],
  thresholds: {
    'http_req_duration{protocol:rest}':    ['avg<1000', 'p(95)<2000'],
    'http_req_duration{protocol:graphql}': ['avg<1000', 'p(95)<2000'],
    'grpc_req_duration':                   ['avg<1000', 'p(95)<2000'],
    'checks':                              ['rate>0.95'],
  },
};

// gRPC klijent se kreira jednom po VU – konekcija se drži otvorenom tokom testa
const grpcClient = new grpc.Client();
grpcClient.load(['../grpc-service'], 'proto/iot.proto');

export default function () {
  const temperature = parseFloat((15 + Math.random() * 20).toFixed(2));
  const usage      = parseFloat((Math.random() * 10).toFixed(2));

  // ── REST ─────────────────────────────────────────────────────────────────
  const restRes = http.post(
    'http://localhost:8080/api/measurements',
    JSON.stringify({ temperature, overallUsage: usage, summary: 'Clear' }),
    { headers: { 'Content-Type': 'application/json' }, tags: { protocol: 'rest' } }
  );
  check(restRes, { '[REST] 201 Created': (r) => r.status === 201 });

  // ── GraphQL ───────────────────────────────────────────────────────────────
  const gqlRes = http.post(
    'http://localhost:4000/',
    JSON.stringify({
      query: `mutation {
        createMeasurement(temperature: ${temperature}, overall_usage: ${usage}, summary: "Clear") {
          id
        }
      }`,
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { protocol: 'graphql' } }
  );
  check(gqlRes, {
    '[GraphQL] 200 OK':    (r) => r.status === 200,
    '[GraphQL] no errors': (r) => r.body != null && !JSON.parse(r.body).errors,
  });

  // ── gRPC ──────────────────────────────────────────────────────────────────
  grpcClient.connect('localhost:50051', { plaintext: true }); // reuse-uje konekciju
  const grpcRes = grpcClient.invoke('SensorService/SaveMeasurement', {
    temperature,
    usage_overall: usage,
    summary: 'Clear',
  });
  check(grpcRes, { '[gRPC] StatusOK': (r) => r && r.status === grpc.StatusOK });

  sleep(0.1); // kratka pauza između iteracija (simulira senzor koji šalje svakih 100ms)
}
