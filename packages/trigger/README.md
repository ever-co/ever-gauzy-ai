# @packages/trigger

Folder: `packages/trigger`. The Trigger.dev integration inside the API: it configures the Trigger.dev SDK when Trigger.dev scheduling is enabled so the API can enqueue event tasks. The tasks themselves live in `src/trigger/` and run on Trigger.dev workers.

## What it does

`TriggerService` checks at startup whether the `trigger-dev` plugin is on, `TRIGGER_DEV_ENABLED=true` and `TRIGGER_SECRET_KEY` is set; only then it calls `configure({ secretKey })` and `trigger(taskId, payload)` can enqueue a task (returning the run id, or `null` when disabled). It registers no tasks at runtime.

## Why it exists

The platform's periodic jobs can run either on the in-process cron (`SchedulerService`, `@packages/ops`) or on Trigger.dev workers, which gives retries, observability and horizontal scaling. The API needs a small, switchable client for the second mode, and the decision must be visible in one place (`GET /api/plugins`, `GET /api/ops/schedule`).

## How it works

- `src/trigger.service.ts` — `TriggerService` (`OnModuleInit`): `isEnabled()`, `trigger(taskId, payload, { delay? })` using `tasks.trigger` from `@trigger.dev/sdk/v3`. When the plugin is off or `TRIGGER_DEV_ENABLED` is not `true` it logs that the in-process scheduler runs the jobs; when the secret is missing it warns that event tasks cannot be triggered.
- `src/trigger.module.ts` — `TriggerModule` provides `ConfigurationService` and `TriggerService`, exports the service.
- `src/trigger.tasks.ts` — `TRIGGER_TASKS` (`scoreMatches: 'score-matches'`, `processApplication: 'process-application'`): the event-task ids, shared by the API and the task definitions (no NestJS imports, so `src/trigger/ai-scoring.ts` imports it by relative path).
- The tasks, outside this package, in `src/trigger/`:
  - `crawl-jobs.ts` — scheduled `crawl-jobs` (`POST /api/crawler/crawl`) and `liveness-check` (`POST /api/crawler/liveness`);
  - `daily-digest.ts` — scheduled `daily-digest` (`POST /api/ops/digest`) and `cleanup-stale-tasks` (`POST /api/ops/cleanup-stale-tasks`);
  - `ai-scoring.ts` — scheduled `score-pending-matches` and the event tasks `score-matches` (`POST /api/ops/score`) and `process-application` (`POST /api/employee/job/application/process` with a tenant API key);
  - `schedule.ts` — `cronOf(jobName)` from `packages/config/src/schedules.ts`, so the schedules equal the in-process ones;
  - `api-client.ts` — `callApi()`, `serviceHeaders()` (`X-SERVICE-TOKEN`), `tenantHeaders()` (`X-APP-ID` / `X-API-KEY`); every callback carries `X-Scheduler: trigger-dev`. `ExternalSchedulerGuard` (`@packages/plugin`) answers it with 409 when the plugin is off, but the guard is applied only to the maintenance controllers `/api/ops/*` and `/api/crawler/*`; `/api/employee/job/application/process` is not guarded, so the `process-application` event task still runs against a deployment that switched `trigger-dev` off.

Caller in the API: `MatchJobPostsToEmployeesCommandHandler` (`@packages/employeeJobPost`, it imports `TriggerModule`). After the matching pass of a crawl (new posts, or re-matched known ones) it enqueues `score-matches` once with `{ limit }` = the matches the pass stored without an AI score (scoring failed), capped at `SCORE_PENDING_LIMIT`, delayed by 5 minutes (`trigger(taskId, payload, { delay })`) — only when `isEnabled()`, and not at all when every match was scored. The run calls `POST /api/ops/score`, so a transient AI failure (rate limit, short outage) is retried minutes later instead of at the next scheduled `score-pending-matches` run. The task's own `retry` covers a failed call to the API only; matches that fail again are reported in its result and retried by later runs within `MAX_SCORING_ATTEMPTS` (3), which quick task retries would use up. With Trigger.dev disabled nothing changes: scoring stays in-process and the in-process `score-pending-matches` cron picks the unscored matches up. A failed enqueue is only logged. `process-application` is still enqueued from outside the API only.

## Wiring

- `AppModule` imports `TriggerModule`.
- Environment variables of the API: `TRIGGER_DEV_ENABLED`, `TRIGGER_SECRET_KEY`. `LOCAL_CRON_ENABLED` unset means the in-process cron is on exactly when Trigger.dev is disabled (`ConfigurationService.localCronEnabled()`), so a job runs once.
- Environment variables of the Trigger.dev workers (set in the Trigger.dev dashboard): `GAUZY_AI_API_URL`, `SERVICE_API_TOKEN`, `GAUZY_AI_APP_ID` / `GAUZY_AI_API_KEY` for tenant tasks, plus the same schedule variables as the API (`CRAWL_CRON`, `SCORE_PENDING_LIMIT`, `STALE_TASK_TIMEOUT_HOURS`, ...).
- The `trigger-dev` entry of `src/plugins.ts` is on when `TRIGGER_DEV_ENABLED=true`.
- No endpoints of its own; the tasks call `/api/ops/*`, `/api/crawler/*` and `/api/employee/job/application/process`.

## Using / extending

- Develop tasks locally with `yarn trigger:dev`, deploy with `yarn trigger:deploy`.
- Enqueue from the API: import `TriggerModule`, inject `TriggerService` (`@Optional()` keeps the caller usable without it) and call `await this.triggerService.trigger(TRIGGER_TASKS.scoreMatches, { limit: 50 })` when `isEnabled()`.
- New scheduled job: add it to `packages/config/src/schedules.ts` and to `SchedulerService`, then a `schedules.task({ id, cron: cronOf('<job>') })` in `src/trigger/` that calls the API endpoint running the job.

## Tests

No spec files in this package. Related tests: `packages/ops/src/scheduler.service.spec.ts` (in-process scheduler takes over when the plugin is off), `packages/plugin/src/external-scheduler.guard.spec.ts` and `packages/employee-job-post/src/handlers/matchJobPostsToEmployees.handler.spec.ts` (`score-matches` is enqueued only when Trigger.dev is enabled and the pass stored unscored matches).
