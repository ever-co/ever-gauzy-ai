# @packages/jobPost

Folder: `packages/job-post`. The job-post catalog: the `JobPost` rows gathered from every source, their REST and GraphQL CRUD, the CQRS command that stores what the crawler found (and starts matching), and the liveness check that closes postings that are gone.

## What it does

`JobPostCreateCommand` carries the posts of one crawl; its handler inserts the new ones, updates the known ones (by `providerCode` + `providerJobId`) and publishes `JobPostCreatedEvent` with the new posts and `JobPostUpdatedEvent` with the known ones, which the saga turns into matching (new posts) and re-matching (known posts, for the employees whose criteria or profile changed since). `JobPostService` also finds the open posts due for a liveness check (never checked, or last checked more than `LIVENESS_RECHECK_HOURS` ago) and asks the provider that verifies each one (by the channel it came through, `ingestedBy`) whether a posting is still open. Clients read the catalog through `GET /api/job` and the GraphQL `jobPosts` queries.

## Why it exists

Job posts come from public sources and are the one thing shared by all tenants: the same posting found for two tenants is one row, matched separately per tenant through `EmployeeJobPost`. The write path has to be an upsert that never blocks the crawler, and the catalog needs its own maintenance (expiry) independent of who searched for it.

## How it works

- `src/jobPost.service.ts` — `JobPostService` extends `TypeOrmCrudService<JobPost>` (`@dataui/crud-typeorm`; not tenant-scoped on purpose): `saveMany()`, `updateMany()`, `findStaleJobs(limit = 50, now = new Date())` (`isExpired = false` and `expiryCheckedAt` either `NULL` or older than `LIVENESS_RECHECK_HOURS`, default 24, so a post found open or without a verdict is checked again later; never-checked posts first, then the oldest `expiryCheckedAt`, then `createdAt`), `checkLiveness(jobPostId)` (uses `url` or `sourceUrl`; the verifier is the first provider among `JOB_PROVIDERS_TOKEN` with `verifyJob()` whose `canVerify(post)` is true, or, for a provider without `canVerify`, whose `providerCode` equals the post's `ingestedBy` (its `providerCode` when `ingestedBy` is null) when the post has a URL. So a `linkedin` / `indeed` post stored by Ever Jobs goes to `EverJobsProvider` (pinned `HEAD` check) and every `upwork` posting, whether the Upwork provider or Ever Jobs stored it, to `UpworkProvider` (official API only, by id, so also without a URL; credentials: on a request only the requesting tenant's own, in a background check a matched tenant's own — `tenantIds('upwork')` reads, on demand, the post's `EmployeeJobPost` tenants that have an active `upwork` source config of their own with credentials, filtered in SQL before the limit of 10 — else the deployment-wide ones). The verdict sets `isExpired` and `expiryCheckedAt`; no verifier (a post created through the API with an unknown code, or no URL for a URL-based check), an error or a result with `verified: false` only stamps `expiryCheckedAt` and leaves `isExpired` as it is — a failure never closes a job).
- `src/commands/jobPostCreate.command.ts`, `src/handlers/jobPostCreate.handler.ts` — `JobPostCreateCommandHandler.execute()`: per post, look up `providerCode` + `providerJobId`; new → insert, existing → update with the existing `id`; then `eventBus.publish(new JobPostCreatedEvent(newJobs))` and, when some posts were known, `eventBus.publish(new JobPostUpdatedEvent(existedJobsToUpdate))` — the posts a live provider found again and those the `source-db` provider re-offers.
- `src/events/jobPostCreated.event.ts`, `src/events/jobPostUpdated.event.ts`, `src/handlers/jobPostCreated.handler.ts` — `JobPostCreatedEventHandler` is a no-op placeholder; the work happens in the saga: `src/sagas/app.saga.ts` maps `JobPostCreatedEvent` → `MatchJobPostsToEmployeesCommand(posts)` (`EmployeeJobPostService.match()`: every employee) and `JobPostUpdatedEvent` → `MatchJobPostsToEmployeesCommand(posts, { existing: true })` (`EmployeeJobPostService.rematch()`: only employees whose criteria or profile changed after the post was stored, each pair once per version of those inputs, so a pair is not AI-scored again on every crawl). Both skip employee ↔ post pairs that already have a match, and the unique index on `employee_job_post` (`employeeId`, `jobPostId`) rules out duplicates (see `@packages/employeeJobPost`).
- `src/jobPost.controller.ts` — `JobPostController`, `@Crud` from `@dataui/crud` at `/api/job` (the standard generated routes: list, get by id, create, bulk create, update, replace, delete).
- `src/resolvers/jobPost.resolver.ts` — `JobPostResolver` (nestjs-query `CRUDResolver` on `JobPostDTO`, aggregates and total count on) plus the mutation `verifyJobLiveness(jobPostId)`.
- `src/jobPost.module.ts` — `JobPostModule`: `CqrsModule`, the `JobPost` repository, `NestjsQueryGraphQLModule.forFeature` for `JobPostDTO` with subscriptions and delete enabled, the handlers; exports `JobPostService`.

## Wiring

- `AppModule` imports `JobPostModule` and lists it in the GraphQL `include`; `CrawlerModule`, `EmployeeJobPostModule`, `EmployeeJobApplicationModule`, `AutomationTaskModule` provide `JobPostService` for their own use.
- GraphQL (from `src/schemas/schema.graphql`): `jobPosts`, `jobPost`, `jobPostAggregate`, `createOneJobPost`, `createManyJobPosts`, `updateOneJobPost`, `updateManyJobPosts`, `deleteOneJobPost`, `deleteManyJobPosts`, `verifyJobLiveness`, subscriptions `createdJobPost`, `updatedOneJobPost`, `updatedManyJobPosts`, `deletedOneJobPost`, `deletedManyJobPosts`.
- REST: `/api/job` (tenant credential required; reads are not filtered by tenant because the catalog is shared).
- Environment variable: `LIVENESS_RECHECK_HOURS` (default 24; see `.env.sample`) — after how many hours an open post is liveness-checked again.

## Using / extending

```graphql
query { jobPosts(filter: { providerCode: { eq: "upwork" } }, paging: { first: 20 }) { edges { node { id title budget url isExpired } } } }
mutation { verifyJobLiveness(jobPostId: "…") { id isExpired expiryCheckedAt } }
```

A new column: entity (`@packages/entities`) + `JobPostDTO` (`@packages/dto`) + migration. A provider that wants its posts liveness-checked sets `ingestedBy` to its `providerCode` on the posts it maps and implements `verifyJob()` (plus `canVerify()` when it must claim posts by another rule). `ingestedBy` (migration `AddJobPostIngestedBy1793562302557`, which backfilled the existing rows whose provider is recognizable: `upwork` with a non-`upwork-…` `providerJobId` → `upwork`, a `providerJobId` of the Ever Jobs form `<providerCode>-…` → `ever-jobs`; anything else stays null) is on the entity and the REST routes, not on `JobPostDTO`.

## Tests

`src/jobPost.service.spec.ts` (liveness: expired / open, missing URL, `sourceUrl` fallback, no provider, provider errors, provider selection; routing over the real providers: an Ever Jobs post under its site code, an Upwork API post through the official API with a matched tenant's credentials in a background check and only the requester's on a request, a URL-less Upwork posting checked by id, an Upwork posting relayed by Ever Jobs, no credentials / no verdict keeping `isExpired`, `source-db`, an unknown channel; the recheck selection of `findStaleJobs`) and `src/jobPost.service.tenants.spec.ts` (the credential tenants of a background check against an in-memory sql.js database: only matched tenants with a usable source config of their own, filtered before the limit), and `src/handlers/jobPostCreate.handler.spec.ts` (new posts → `JobPostCreatedEvent`, known ones → `JobPostUpdatedEvent`) — run `yarn test packages/job-post`.
