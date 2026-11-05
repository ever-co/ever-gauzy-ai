# API Reference

Quick reference for all REST and GraphQL endpoints exposed by the Ever Gauzy AI API.

---

## Table of Contents

-   [Base URL & Authentication](#base-url--authentication)
-   [REST Endpoints](#rest-endpoints)
    -   [Job Posts](#job-posts)
    -   [Employee Job Posts](#employee-job-posts)
    -   [Employee Job Applications](#employee-job-applications)
    -   [Automation Tasks](#automation-tasks)
    -   [Source Configuration](#source-configuration)
    -   [AI](#ai)
    -   [Crawler](#crawler)
    -   [Ops (periodic jobs)](#ops-periodic-jobs)
    -   [Image Analysis](#image-analysis)
    -   [Employees](#employees)
    -   [Tenants](#tenants)
    -   [Users](#users)
-   [GraphQL API](#graphql-api)
-   [Common Response Codes](#common-response-codes)
-   [Pagination & Filtering](#pagination--filtering)
-   [Swagger Documentation](#swagger-documentation)

---

## Base URL & Authentication

**Base URL:** `http(s)://<host>:<port>`

All endpoints (except those marked `@Public`) require authentication via one of two methods:

| Method           | Headers                                          |
| ---------------- | ------------------------------------------------ |
| API Key + Secret | `X-APP-ID: <key>`, `X-API-KEY: <secret>`         |
| Bearer Token     | `tenant-id: <id>`, `Authorization: Bearer <jwt>` |

See [Authentication](./authentication.md) for full details.

---

## REST Endpoints

### Job Posts

CRUD operations for job postings aggregated from external sources.

| Method   | Path                 | Description                                      |
| -------- | -------------------- | ------------------------------------------------ |
| `GET`    | `/api/job`     | List job posts (filters: status, provider, etc.) |
| `GET`    | `/api/job/:id` | Get a single job post                            |
| `POST`   | `/api/job`     | Create a job post                                |
| `PUT`    | `/api/job/:id` | Update a job post                                |
| `DELETE` | `/api/job/:id` | Delete a job post                                |

**Key fields:** `providerCode`, `providerJobId`, `title`, `description`, `jobStatus`, `jobType`, `budget`, `skills`, `country`

---

### Employee Job Posts

Match records linking employees to job posts.

| Method   | Path                          | Description               |
| -------- | ----------------------------- | ------------------------- |
| `GET`    | `/api/employee/job`     | List employee-job matches |
| `GET`    | `/api/employee/job/:id` | Get a single match        |
| `POST`   | `/api/employee/job`     | Create a match            |
| `PUT`    | `/api/employee/job/:id` | Update a match            |
| `DELETE` | `/api/employee/job/:id` | Delete a match            |

**Key fields:** `employeeId`, `jobPostId`, `providerCode`, `isApplied`, `appliedStatus`

---

### Employee Job Applications

Job application (proposal) records.

| Method   | Path                                 | Description              |
| -------- | ------------------------------------ | ------------------------ |
| `GET`    | `/api/employee/job/application`     | List applications        |
| `GET`    | `/api/employee/job/application/:id` | Get a single application |
| `POST`   | `/api/employee/job/application`     | Create an application    |
| `PUT`    | `/api/employee/job/application/:id` | Update an application    |
| `DELETE` | `/api/employee/job/application/:id` | Delete an application    |

**Key fields:** `employeeJobPostId`, `proposal`, `isProposalGeneratedByAI`, `qa`, `rate`, `terms`, `appliedStatus`

---

### Automation Tasks

Automation command queue for the client-side automation system.

| Method   | Path                        | Description                                   |
| -------- | --------------------------- | --------------------------------------------- |
| `GET`    | `/api/automation/task`     | List tasks (filter by status, employee, etc.) |
| `GET`    | `/api/automation/task/:id` | Get a single task                             |
| `POST`   | `/api/automation/task`     | Create a task                                 |
| `PUT`    | `/api/automation/task/:id` | Update task status/result                     |
| `DELETE` | `/api/automation/task/:id` | Delete a task                                 |

**Key fields:** `commandType`, `command` (JSON), `commandResult` (JSON), `status`, `providerCode`, `employeeId`

---

### Source Configuration

Generic per-source configuration management (**GraphQL only**). See [Source Integration](./source-integration.md) for detailed docs.

| Operation                                       | Type     | Description                |
| ----------------------------------------------- | -------- | -------------------------- |
| `createSourceConfig(input)`                     | Mutation | Create a source config     |
| `sourceConfigs(sourceCode?, tenantId?, orgId?)` | Query    | List source configs        |
| `sourceConfig(id)`                              | Query    | Get a single source config |
| `updateSourceConfig(id, input)`                 | Mutation | Update a source config     |
| `removeSourceConfig(id)`                        | Mutation | Delete a source config     |

**Key inputs:** `sourceCode`, `auth` (nested `SourceAuthInput`), `settings` (nested `SourceSettingsInput`)

> [!NOTE]
> Secrets in responses are always masked (e.g., `"***cret"`). See [Secret Masking](./source-integration.md#secret-masking).

---

### AI

AI-written proposal for an application. The endpoint is **asynchronous**: it starts the generation and returns at once (`201`, empty body — Nest's default for a `POST` handler); the result lands on the application record.

| Method | Path                                                     | Description                                                                 |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/employee/job/application/generate-proposal/:id`   | Start proposal generation for the application `:id` (no request body)      |
| `GET`  | `/api/employee/job/application/:id`                      | Read the application: `isProposalGeneratedByAI` turns `true`, `proposal` holds the text |

```bash
curl -X POST -H "X-APP-ID: $APP_ID" -H "X-API-KEY: $API_KEY"   https://api.gauzy.ai/api/employee/job/application/generate-proposal/5b2f...
# 201, empty body — then poll:
curl -H "X-APP-ID: $APP_ID" -H "X-API-KEY: $API_KEY" https://api.gauzy.ai/api/employee/job/application/5b2f...
```

```json
{ "id": "5b2f...", "isProposalGeneratedByAI": true, "proposal": "Hello, I'm an experienced TypeScript developer..." }
```

Polling caveats: `isProposalGeneratedByAI` only signals completion when it was `false` before the call — on a **regeneration** it stays `true` and the old `proposal` is returned until the new one is written, so compare the `proposal` text (or `updatedAt`) instead. A failed generation is only logged on the server and leaves both fields unchanged: there is no per-request completion or failure status, so bound your polling (e.g. 60 s) and treat a timeout as "not generated".

The proposal is written from the job post and the person's own template; the person reviews and sends it themselves.

---

### Crawler

Controls the job crawling service. Cross-tenant: requires the service token (`X-SERVICE-TOKEN: $SERVICE_API_TOKEN`) instead of a tenant credential.

| Method | Path                    | Description                                       |
| ------ | ----------------------- | ------------------------------------------------- |
| `POST` | `/api/crawler/crawl`    | Run a crawl of all providers now                  |
| `POST` | `/api/crawler/liveness` | Check the open job posts due for a check (never checked, or last checked more than `LIVENESS_RECHECK_HOURS` ago) and close the ones that are gone |

---

### Ops (periodic jobs)

Entry points for schedulers (in-process cron, Trigger.dev tasks, Kubernetes CronJobs). Cross-tenant: the service token (`X-SERVICE-TOKEN: $SERVICE_API_TOKEN`) is the only accepted credential; tenant API keys and user tokens get `401`.

| Method | Path                           | Body                      | Description                                                                 |
| ------ | ------------------------------ | ------------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/ops/schedule`            |                           | The jobs, their effective cron expressions and time zone, and the active `scheduler` (`in-process`, `trigger-dev`, `none`) |
| `POST` | `/api/ops/digest`              | `{ since?: ISO-8601 }`    | Daily digest to every employee with new matches / application activity      |
| `POST` | `/api/ops/cleanup-stale-tasks` | `{ timeoutHours?: n }`    | Time out automation tasks pending for longer than the threshold (default 24) |
| `POST` | `/api/ops/score`               | `{ limit?: n }`           | AI-score matches that were saved without a score (default 50 per call)      |

```bash
curl -X POST https://api.gauzy.ai/api/ops/digest -H "X-SERVICE-TOKEN: $SERVICE_API_TOKEN" -H "Content-Type: application/json" -d '{}'
```

---

### Image Analysis

OpenAI Vision-powered screenshot analysis (work-related or not, description, applications seen).

| Method | Path                      | Body                                   | Description                                                                                       |
| ------ | ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST` | `/api/image/process`      | multipart, field `files` (1..n images) | Analyze uploaded images                                                                           |
| `POST` | `/api/image/process-urls` | `{ "urls": ["https://..."] }` (1..10)  | Analyze images the API downloads itself (signed storage links work); public hosts and images only, `IMAGE_FETCH_MAX_BYTES` / `IMAGE_FETCH_TIMEOUT_MS` limits; an unreachable URL yields `success: false` with the reason |

---

### Employees

Employee management within Gauzy AI.

| Method   | Path                 | Description           |
| -------- | -------------------- | --------------------- |
| `GET`    | `/api/employee`     | List employees        |
| `GET`    | `/api/employee/:id` | Get a single employee |
| `POST`   | `/api/employee`     | Create an employee    |
| `PUT`    | `/api/employee/:id` | Update an employee    |
| `DELETE` | `/api/employee/:id` | Delete an employee    |

---

### Tenants

Tenants have no REST endpoints: they are read through the GraphQL API (`tenant`, `tenants`, `tenantAggregate`, scoped to the caller's own tenant) and created by the Ever Gauzy integration; see `docs/authentication.md`.

### Users

User management.

| Method   | Path             | Description       |
| -------- | ---------------- | ----------------- |
| `GET`    | `/api/user`     | List users        |
| `GET`    | `/api/user/:id` | Get a single user |
| `POST`   | `/api/user`     | Create a user     |
| `PUT`    | `/api/user/:id` | Update a user     |
| `DELETE` | `/api/user/:id` | Delete a user     |

---

## GraphQL API

Gauzy AI exposes a code-first GraphQL API via Apollo Server:

-   **Endpoint:** `POST /graphql`
-   **Playground:** Available at `/graphql` in non-production environments
-   **Schema:** Auto-generated from TypeScript decorators (`@ObjectType`, `@Resolver`, `@Query`, `@Mutation`)

GraphQL resolvers exist for most entities and support the same operations as the REST endpoints. The schema is generated automatically from `@nestjs/graphql` decorators — see `schema.module.ts` for the full list of included modules.

**Example query:**

```graphql
query {
	jobPosts(filter: { providerCode: "upwork" }) {
		id
		title
		description
		skills
		budget
	}
}
```

---

## Common Response Codes

| Code  | Meaning                                                    |
| ----- | ---------------------------------------------------------- |
| `200` | Success                                                    |
| `201` | Created (POST)                                             |
| `400` | Bad Request — validation error or unknown source code      |
| `401` | Unauthorized — missing or invalid credentials              |
| `403` | Forbidden — valid credentials but insufficient permissions |
| `404` | Not Found                                                  |
| `500` | Internal Server Error                                      |

---

## Pagination & Filtering

Most list endpoints support standard query parameters:

| Param     | Type   | Description           |
| --------- | ------ | --------------------- |
| `limit`   | number | Max results to return |
| `offset`  | number | Offset for pagination |
| `orderBy` | string | Field to sort by      |
| `order`   | string | `ASC` or `DESC`       |

Additionally, most entities support filtering by `isActive` and `isArchived` status.

---

## Swagger Documentation

Interactive API documentation is available at:

```
http(s)://<host>:<port>/swagger
```

Generated automatically from NestJS `@Api*` decorators on all controllers and DTOs.
