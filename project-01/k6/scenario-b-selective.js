/**
 * SCENARIO B – Selective Monitoring
 * Klijent (mobilna app sa lošom vezom) traži samo 2 od 10 senzorskih vrednosti:
 * temperature i humidity.
 *
 * Ključna razlika između protokola:
 *  - REST:    mora imati poseban endpoint /selective (ne može dinamički)
 *  - GraphQL: klijent bira polja u samom upitu – server vraća SAMO tražena polja
 *  - gRPC:    GetSelectiveData RPC vraća samo 2 polja (definisano u .proto)
 *
 * Poredi: veličinu odgovora i latenciju po protokolu.
 *
 * Pokretanje:
 *   k6 run k6/scenario-b-selective.js
 */

import http from 'k6/http';
import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Prati veličinu odgovora po protokolu (u bajtovima)
const responseSizeRest    = new Trend('response_bytes_rest',    true);
const responseSizeGraphQL = new Trend('response_bytes_graphql', true);

export const options = {
  stages: [
    { duration: '30s', target: 10  },
    { duration: '60s', target: 100 },
    { duration: '60s', target: 500 },
    { duration: '15s', target: 0   },
  ],
  thresholds: {
    'http_req_duration{protocol:rest}':    ['avg<500', 'p(95)<1500'],
    'http_req_duration{protocol:graphql}': ['avg<500', 'p(95)<1500'],
    'grpc_req_duration':                   ['avg<500', 'p(95)<1500'],
    'checks':                              ['rate>0.95'],
  },
};

const grpcClient = new grpc.Client();
grpcClient.load(['../grpc-service'], 'proto/iot.proto');

export default function () {
  // ── REST – poseban /selective endpoint, vraća 2 polja ────────────────────
  const restRes = http.get(
    'http://localhost:8080/api/measurements/selective',
    { tags: { protocol: 'rest' } }
  );
  check(restRes, { '[REST] 200 OK': (r) => r.status === 200 });
  responseSizeRest.add(restRes.body.length);

  // ── GraphQL – klijent bira SAMO 2 polja, server ne šalje ostalo ──────────
  const gqlRes = http.post(
    'http://localhost:4000/',
    JSON.stringify({
      query: `query {
        getAllMeasurements {
          temperature
          humidity
        }
      }`,
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { protocol: 'graphql' } }
  );
  check(gqlRes, {
    '[GraphQL] 200 OK':    (r) => r.status === 200,
    '[GraphQL] no errors': (r) => r.body != null && !JSON.parse(r.body).errors,
  });
  responseSizeGraphQL.add(gqlRes.body.length);

  // ── gRPC – GetSelectiveData vraća samo temperature + humidity ─────────────
  grpcClient.connect('localhost:50051', { plaintext: true });
  const grpcRes = grpcClient.invoke('SensorService/GetSelectiveData', { limit: 50 });
  check(grpcRes, { '[gRPC] StatusOK': (r) => r && r.status === grpc.StatusOK });

  sleep(0.1);
}
