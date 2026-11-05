# @packages/ops

Folder: `packages/ops`. Operations: the cross-tenant maintenance jobs (`OpsService`), the service-token endpoints that start them (`/api/ops/*`) and the in-process scheduler that runs every periodic job on a cron when Trigger.dev does not (`SchedulerService`).

## What it does

Three jobs act on all tenants at once: the daily digest (one Novu notification per employee with new matches or application activity), the clean-up of automation tasks that stayed pending too long, and the AI scoring of matches that were saved without a score. The scheduler registers these three plus the crawler's `crawl` and `liveness-check` as cron jobs; the controller lets Trigger.dev tasks, Kubernetes CronJobs or an operator start any of them with the service token and reports the effective schedule.

## Why it exists

Tenant requests must never run other tenants' jobs or spend their AI budget, so these jobs work on unscoped repositories behind the service token only. Pending-match scoring is a paid call that several replicas could race on: the claim protocol here guarantees that one run scores a row and that a dismissal or a user's own re-score is never overwritten.

## How it works

- `src/ops.service.ts` — `OpsService`:
  - `sendDailyDigest(since = now - 24h)` → `DigestResult`: for each active employee counts matches created in the window (top 5 by score for the details), applications submitted (`appliedDate`) and status changes (older applications submitted in the window); skips quiet employees and everything when Novu is off; a failed send counts as `skipped`.
  - `cleanupStaleTasks(timeoutHours = STALE_TASK_TIMEOUT_HOURS)` → `CleanupResult`: tasks in `PENDING_TASK_STATUSES` (`open`, `created`, `in_progress`) created before the cutoff get `status = 'timeout'` and `executedDate = now`, each with its own conditional update (still pending), and `AutomationTaskFinishedEvent` (`@packages/automationTask`) is published for every task moved, so the employee gets one `automation-task-complete` notification; a task finished between the read and the write keeps its outcome and is not counted. A non-positive threshold is refused.
  - `scorePendingMatches(limit = SCORE_PENDING_LIMIT)` → `ScoreResult` (`scored`, `failed`, `unscorable`, `skipped`, `remaining`): one run per process (overlapping callers join it); fails before claiming anything when the `match-scoring` plugin is off or `OPENROUTER_API_KEY` is missing; picks candidates without `scoredAt`, fewest attempts and oldest first; claims each with a conditional update (`scoringStartedAt`, `scoringAttempts`) before calling `AiScoringService.scoreMatch()`; writes only the scoring fields and only while the claim is still ours; gives up after `MAX_SCORING_ATTEMPTS` (3) keeping the last `scoringError`; a claim older than `STALE_SCORING_CLAIM_MS` (15 min) belongs to a dead run and is taken over; a match whose job post or employee is gone is marked with `UNSCORABLE_EXPLANATION`.
- `src/scheduler.service.ts` — `SchedulerService` (node-cron through `@nestjs/schedule`): `jobs()` maps the five `JobName`s to runners (`CrawlerService.crawl()`, `CrawlerService.runLivenessChecks()`, `scorePendingMatches()`, `sendDailyDigest()`, `cleanupStaleTasks()`) with the cron expressions from `ConfigurationService.schedules()`; `isEnabled()` follows `LOCAL_CRON_ENABLED`, else on unless Trigger.dev is enabled, and takes over when the `trigger-dev` plugin is switched off; `runJob()` never overlaps a job with itself and logs failures without stopping the schedule; `register()` applies `SCHEDULER_TIMEZONE`.
- `src/ops.controller.ts` — `OpsController` (`@Public()` + `ServiceTokenOnlyGuard` + `ExternalSchedulerGuard`), base path `/api/ops`:

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/ops/schedule` | — | `scheduler` (`in-process`, `trigger-dev`, `none`), `localCron`, `triggerDev`, `timezone`, `jobs[]` |
| `POST` | `/api/ops/digest` | `{ since?: ISO-8601 }` | `DigestResult` |
| `POST` | `/api/ops/cleanup-stale-tasks` | `{ timeoutHours?: number }` | `CleanupResult` |
| `POST` | `/api/ops/score` | `{ limit?: integer }` | `ScoreResult` |

- `src/ops.module.ts` — `OpsModule` imports `AiModule`, `CrawlerModule`, `NovuModule` and the repositories of `EmployeeJobPost`, `EmployeeJobApplication`, `AutomationTask`, `Employee`; exports `OpsService` and `SchedulerService`.

## Wiring

- `AppModule` imports `OpsModule`. The Trigger.dev tasks in `src/trigger/` call the same endpoints with `X-SERVICE-TOKEN` and `X-Scheduler: trigger-dev`.
- Environment variables: `SERVICE_API_TOKEN`; `LOCAL_CRON_ENABLED`, `CRAWL_INTERVAL_MINUTES` / `CRAWL_CRON`, `LIVENESS_CHECK_INTERVAL_MINUTES` / `LIVENESS_CRON`, `SCORE_PENDING_CRON`, `SCORE_PENDING_LIMIT`, `DIGEST_CRON`, `CLEANUP_CRON`, `STALE_TASK_TIMEOUT_HOURS`, `SCHEDULER_TIMEZONE` (parsed in `@packages/config`); `OPENROUTER_API_KEY` and `AI_SCORING_MODEL` for scoring; `NOVU_API_KEY` for the digest.
- Run the in-process cron on one replica only (`LOCAL_CRON_ENABLED=false` on the others) or schedule externally through these endpoints.

## Using / extending

```bash
curl -X POST http://localhost:3005/api/ops/score -H "X-SERVICE-TOKEN: $SERVICE_API_TOKEN" -H "Content-Type: application/json" -d '{"limit": 20}'
curl http://localhost:3005/api/ops/schedule -H "X-SERVICE-TOKEN: $SERVICE_API_TOKEN"
```

A new periodic job: a method on `OpsService` (unscoped repositories, idempotent, returns counts), a `JobName` and default in `packages/config/src/schedules.ts`, a runner in `SchedulerService.jobs()`, a `POST /api/ops/<job>` route and a Trigger.dev task in `src/trigger/`.

## Tests

`src/ops.service.spec.ts` (digest counting, clean-up thresholds, the scoring claim protocol, plugin and key gates, overlapping runs) and `src/scheduler.service.spec.ts` (registration, schedules, non-overlap, take-over when the plugin is off) — run `yarn test packages/ops`.
