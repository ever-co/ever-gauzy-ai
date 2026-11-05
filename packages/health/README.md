# @packages/health

Folder: `packages/health`. The health check of the API: database connectivity with a deadline, process uptime and the application version, served as the REST probe `GET /api/health` and the GraphQL query `healthCheck`.

## What it does

`HealthService.check()` runs `SELECT 1` on the TypeORM `DataSource` and answers `status: 'ok'` when the database replies within `HEALTH_DB_TIMEOUT_MS` (default 3000 ms), `status: 'degraded'` otherwise, together with `uptime`, `version` (from the root `package.json`), `dbConnected` and `timestamp`.

## Why it exists

Kubernetes liveness and readiness probes and uptime monitors must get an answer even when the database pool is exhausted or the network stalls; a probe that hangs would be worse than one that reports `degraded`. Only one database query is in flight at a time, so repeated probes share it instead of piling up work on a stalled connection.

## How it works

- `src/health.service.ts` — `HealthService`: `probeDatabase()` keeps a single in-flight `SELECT 1` promise; `check()` races it against the timeout, reads the version and returns the status object.
- `src/health.type.ts` — `HealthStatus` GraphQL object type (`status`, `uptime`, `version`, `dbConnected`, `timestamp`).
- `src/health.resolver.ts` — `HealthResolver` with the `healthCheck` query.
- `src/health.module.ts` — `HealthModule` provides the service and the resolver, exports `HealthService`.

## Wiring

- `AppModule` imports `HealthModule` and lists it in the GraphQL `include`; `src/app.controller.ts` (`@Public()`) serves `GET /api/health` with `HealthService` (and `GET /api` returns the API name). `SchemaModule` (`src/schema.module.ts`, used by `yarn sdk:generate`) includes it as well, so `healthCheck` stays in `src/schemas/schema.graphql` and the SDK.
- `HealthResolver` is the only declaration of `healthCheck` (it used to be declared on `EmployeeResolver` too, with its own `HealthService` instance).
- Environment variable: `HEALTH_DB_TIMEOUT_MS`.
- Endpoints: `GET /api/health` (no credential needed), GraphQL `healthCheck` (needs a tenant credential like every other resolver).

## Using / extending

```bash
curl http://localhost:3005/api/health
# {"status":"ok","uptime":12.3,"version":"0.1.0","dbConnected":true,"timestamp":"..."}
```

A new check (for example an external dependency) is added to `check()` with its own deadline so that the probe never hangs; add the field to `HealthStatus` for GraphQL.

## Tests

`src/health.service.spec.ts` (ok, failing query, deadline, shared probe) — run `yarn test packages/health`.
