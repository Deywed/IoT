/**
 * SCENARIO C – Heavy Querying
 * Složeni upiti i agregacije nad istorijskim podacima.
 * Fokus: CPU/RAM overhead serijalizacije + vreme odgovora na skupim SQL upitima.
 *
 * Pokretanje:
 *   k6 run k6/scenario-c-aggregation.js
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
    'http_req_duration{protocol:rest}':    ['avg<2000', 'p(95)<5000'],
    'http_req_duration{protocol:graphql}': ['avg<2000', 'p(95)<5000'],
    'grpc_req_duration':                   ['avg<2000', 'p(95)<5000'],
    'checks':                              ['rate>0.95'],
  },
};

const grpcClient = new grpc.Client();
grpcClient.load(['../grpc-service'], 'proto/iot.proto');

export default function () {
  // ── REST – GET /average-stats (AVG, MAX, COUNT) ───────────────────────────
  const restRes = http.get(
    'http://localhost:8080/api/measurements/average-stats',
    { tags: { protocol: 'rest' } }
  );
  check(restRes, {
    '[REST] 200 OK':       (r) => r.status === 200,
    '[REST] has AvgTemp':  (r) => JSON.parse(r.body).avgTemp !== undefined,
  });

  // ── GraphQL – query sa agregacijom ────────────────────────────────────────
  const gqlRes = http.post(
    'http://localhost:4000/',
    JSON.stringify({
      query: `query {
        getAverageTemperature
      }`,
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { protocol: 'graphql' } }
  );
  check(gqlRes, {
    '[GraphQL] 200 OK':    (r) => r.status === 200,
    '[GraphQL] no errors': (r) => r.body != null && !JSON.parse(r.body).errors,
  });

  // ── gRPC – GetStats (AVG, MAX, COUNT) ────────────────────────────────────
  grpcClient.connect('localhost:50051', { plaintext: true });
  const grpcRes = grpcClient.invoke('SensorService/GetStats', {});
  check(grpcRes, {
    '[gRPC] StatusOK':        (r) => r && r.status === grpc.StatusOK,
    '[gRPC] has avgTemp':     (r) => r && r.message && r.message.avgTemperature !== undefined,
  });

  sleep(0.5); // agregacioni upiti su skupi – realniji interval između zahteva
}
