# @packages/crawler

Folder: `packages/crawler`. The job crawler: runs every employee's search criteria against every enabled job source, stores the results as job posts through the CQRS pipeline that matches and scores them, and verifies that stored job posts are still open.

## What it does

`CrawlerService.crawl()` loads the active employees with their `JobSearchCriterion` rows, reduces them to unique searches per tenant, asks each `IJobProvider` for the postings of each search, removes duplicates and dispatches one `JobPostCreateCommand`. `CrawlerService.runLivenessChecks()` takes up to 50 open job posts due for a check (never checked first, then those last checked more than `LIVENESS_RECHECK_HOURS` ago, oldest check first) and asks their verifier whether the posting is still open. Both are started by the scheduler (`@packages/ops`), by Trigger.dev tasks, or by the two service-token endpoints of this package.

## Why it exists

Job sources differ (the Ever Jobs API, Upwork's official API, the local catalog) but the loop around them is the same: which searches to run, with whose credentials, how to avoid duplicate API calls and duplicate rows, and how to hand the results to matching without blocking. Keeping that loop here lets a provider be a thin adapter.

## How it works

Data flow of a crawl:

1. `EmployeeService.getActiveWithJobSearchCriteria()` — all active employees and their criteria. With none at all, `CRAWL_DEFAULT_KEYWORDS` (comma-separated) is searched per tenant; if that is empty too the crawl is skipped.
2. `deduplicateCriteria()` — one `SearchCriterion` per (`tenantId`, `keyword`, `location`, `country`, `jobType`, `isRemote`). Searches are never shared across tenants because providers run them with the tenant's own source credentials.
3. For every provider from `JOB_PROVIDERS_TOKEN` whose `isEnabled()` is true: `getJobsForCriteria(criterion)` once per unique criterion (providers without it fall back to one `getJobs()` call). A provider error is logged and the others continue.
4. `deduplicateJobs()` — one `JobPost` per (`providerCode`, `providerJobId`); the search metadata (`searchKeyword`, `searchCategory`, `searchOccupation`) of the copies is merged so the relevance filter still matches every keyword that found the posting.
5. `commandBus.execute(new JobPostCreateCommand(jobs))` without awaiting: `JobPostCreateCommandHandler` (`@packages/jobPost`) inserts new posts and updates known ones, then publishes `JobPostCreatedEvent` with the newly inserted posts and `JobPostUpdatedEvent` with the known ones; the saga in `src/sagas/app.saga.ts` turns them into `MatchJobPostsToEmployeesCommand`, which runs `EmployeeJobPostService.match()` for new posts (every employee: relevance filter, AI scoring, notifications) and `EmployeeJobPostService.rematch()` for known ones (only employees whose criteria or profile changed after the post was stored, each pair once per version of those inputs — this is how criteria added later, and the posts the `source-db` provider re-offers, get matches). A pair that already has a match is never stored twice.
6. When the pass stored matches without an AI score (scoring failed) and Trigger.dev is enabled, `MatchJobPostsToEmployeesCommandHandler` enqueues the `score-matches` task once, delayed by 5 minutes (`@packages/trigger`); otherwise they wait for the scheduled `score-pending-matches` job. A crawl sends no notification of its own: employees get per-match alerts (`NOVU_MATCH_NOTIFY_THRESHOLD`) and the daily digest.

A crawl never overlaps itself (`_isCrawling`); `setEnabled(false)` pauses crawling and liveness checks; `getProviders()` lists the registered providers.

Liveness: `JobPostService.findStaleJobs(50)` (open posts never checked or last checked more than `LIVENESS_RECHECK_HOURS` ago, default 24; never-checked first, then the oldest `expiryCheckedAt`) → `JobPostService.checkLiveness(id)` → the `verifyJob()` of the provider that verifies the post (by the channel it came through, `ingestedBy`: `EverJobsProvider` for the sites Ever Jobs brought in, `UpworkProvider` through the official API for every Upwork posting) → `isExpired` / `expiryCheckedAt` on the post; no verdict leaves `isExpired` as it is (see `packages/job-providers/README.md`).

Files: `src/crawler.service.ts`, `src/crawler.controller.ts` (`CrawlerController`, `@Public()` + `ServiceTokenOnlyGuard` + `ExternalSchedulerGuard`), `src/crawler.module.ts` (`CrawlerModule`: imports `CqrsModule`, `ScheduleModule.forRoot()`, `AiModule`; provides `CrawlerService`, `JobPostService`, `EmployeeService`, `EmployeeJobPostService`, `NovuService` and a `PubSub`; exports `CrawlerService`).

## Wiring

- `AppModule` imports `CrawlerModule`; `OpsModule` imports it for the scheduler; `AppService.onApplicationBootstrap()` runs one crawl at start-up when `NODE_ENV` is not `production`.
- Providers come from the plugins: `PluginsModule.forRoot(INSTALLED_PLUGINS)` aggregates the `IJobProvider`s of the enabled job-source plugins under `JOB_PROVIDERS_TOKEN` (`@packages/core-providers`), which `CrawlerService` injects as an optional array.
- Endpoints (service token only, `X-SERVICE-TOKEN`): `POST /api/crawler/crawl`, `POST /api/crawler/liveness`.
- Environment variables: `CRAWL_DEFAULT_KEYWORDS`, `SERVICE_API_TOKEN`; the schedule comes from `CRAWL_INTERVAL_MINUTES` / `CRAWL_CRON` and `LIVENESS_CHECK_INTERVAL_MINUTES` / `LIVENESS_CRON` (`@packages/config`); how soon an open post is checked again, from `LIVENESS_RECHECK_HOURS` (`@packages/jobPost`).

## Using / extending

```bash
curl -X POST http://localhost:3005/api/crawler/crawl -H "X-SERVICE-TOKEN: $SERVICE_API_TOKEN"
```

To add a source, write a provider (see `packages/job-providers/README.md`); nothing changes here. To change what counts as the same search, edit the key in `deduplicateCriteria()`; to change the relevance of a stored post to an employee, see `EmployeeJobPostService.findRelevantJobs()`.

## Tests

`src/crawler.service.spec.ts` (enabled/disabled providers, per-tenant searches with single dispatch, merged search metadata, provider errors, liveness checks, default keywords) — run `yarn test packages/crawler`. What follows a crawl is tested where it lives: `packages/job-post/src/handlers/jobPostCreate.handler.spec.ts`, `src/sagas/app.saga.spec.ts`, `packages/employee-job-post/src/employeeJobPost.rematch.spec.ts` (re-matching without duplicates or repeated scoring) and `packages/employee-job-post/src/handlers/*.spec.ts` (insert without duplicates, `score-matches` only with Trigger.dev).
