# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This git repo holds coursework assignments side by side:

- **`project-01/`** — the implemented assignment: a benchmark comparing **REST vs gRPC vs GraphQL** for an IoT sensor workload. All code below lives here.
- **`project-02/`** — currently empty (only `.claude/`); a future assignment.

Code comments, commit messages, and report (`izvestaj.pdf`) are written in Serbian.

## Big-picture architecture (project-01)

The same IoT measurement domain is implemented three times, once per protocol, all backed by **one shared PostgreSQL database**. The point is an apples-to-apples performance comparison under identical load, not three independent apps.

Shared data model: a single table `sensor_measurements` (energy + meteorological readings), defined in `project-01/init.sql` and seeded into Postgres on first container start. The same 10 columns reappear in every service's model — the REST `Measurement` class, the gRPC `.proto` messages, and the GraphQL `Measurement` type must stay in sync with `init.sql`.

The three services and how they map the same operations:

| Service | Lang/Stack | Port | Read all | Selective read | Aggregation | Write |
|---|---|---|---|---|---|---|
| `rest-service` | C# / ASP.NET Core (net10.0), Dapper + Npgsql | 8080 | `GET /api/measurements` | `GET /api/measurements/selective` | `GET /api/measurements/average-stats` | `POST /api/measurements` |
| `grpc-service` | Go, `database/sql` + pgx, google.golang.org/grpc | 50051 | `GetMeasurements` | `GetSelectiveData` | `GetStats` | `SaveMeasurement` |
| `graphql-service` | TypeScript / Apollo Server, `pg` | 4000 | `getAllMeasurements` | (field selection in query) | `getAverageTemperature` | `createMeasurement` |

Three benchmark scenarios drive all services concurrently (defined in `project-01/k6/`):
- **Scenario A — ingestion**: high-frequency writes (serialization/write overhead).
- **Scenario B — selective**: client wants only 2 of 10 fields. The key contrast: REST needs a dedicated `/selective` endpoint, gRPC needs a dedicated `GetSelectiveData` RPC, but GraphQL lets the client pick fields in the query. The GraphQL resolver (`graphql-service/src/resolvers.ts`) reflects on `GraphQLResolveInfo` to build a `SELECT` of only the requested columns.
- **Scenario C — aggregation**: heavy `AVG`/`MAX`/`COUNT` queries.

`dotnet-client/` is a small standalone gRPC client (sanity check / demo), not part of the benchmark; it generates C# stubs from the proto via `Grpc.Tools` at build time.

### Cross-cutting consistency gotchas

- **Field name mismatch (REST/proto):** the DB column and REST JSON use `overall_usage` / `OverallUsage`, but the proto field is `usage_overall`. k6 scripts and the Go server use `usage_overall`; the REST POST body uses `overallUsage`. Keep these distinctions when editing.
- **gRPC generated code is committed** (`grpc-service/proto/iot_grpc.pb.go`, `iot.pb.go`). After editing `iot.proto`, regenerate (see below) or the Go build will be out of date.
- DB credentials are hardcoded for the assignment (`myuser`/`mypassword`/`mydb`) across docker-compose, appsettings, and service defaults.

## Common commands

### Run the whole stack (DB + all 3 services)
```bash
cd project-01
docker compose up --build
```
Postgres is on 5432 with a healthcheck; the three services wait for it before starting.

### Run a single service locally (Postgres must be up)
```bash
# REST  (http://localhost:5297 locally, 8080 in Docker; Swagger at /swagger)
cd project-01/rest-service && dotnet run

# gRPC  (:50051, reflection enabled)
cd project-01/grpc-service && go run .

# GraphQL  (:4000)
cd project-01/graphql-service && npm install && npm run dev
```

### Regenerate gRPC code after editing `proto/iot.proto`
```bash
cd project-01/grpc-service
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       proto/iot.proto
```
(The C# client regenerates automatically on `dotnet build`.)

### GraphQL build/start
```bash
cd project-01/graphql-service
npm run build   # tsc -> dist/
npm start       # node dist/index.js
```

### Load tests (requires `k6` installed and the stack running)
```bash
cd project-01/k6
./run-all.sh                          # all three scenarios -> results/*.json
k6 run scenario-a-ingestion.js        # single scenario
```
k6 scripts reference the proto via a relative path (`grpcClient.load(['../grpc-service'], 'proto/iot.proto')`), so run them from `project-01/k6/`.

## Notes

- `.NET 10.0` is the target framework for both `rest-service` and `dotnet-client`; `project-01.sln` only references `dotnet-client`.
- There is no test suite — verification is done via the k6 load tests and Swagger/gRPC reflection.
