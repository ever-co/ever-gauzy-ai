# @packages/novu

Folder: `packages/novu`. Notifications to people through Novu: match alerts, application status, automation-task outcomes and the daily digest, as typed workflow triggers that degrade to no-ops when Novu is not configured.

## What it does

`NovuService` wraps the `@novu/api` SDK. Each public method triggers one Novu workflow for one subscriber with a typed payload; without `NOVU_API_KEY`, or with the `novu` plugin switched off, every send is skipped and logged at debug level. A Novu error is logged and swallowed (notifications never block the pipeline); the one exception is `sendDailyDigest()`, which accepts `{ throwOnError: true }` so the digest job can count failed sends.

## Why it exists

The matching and application pipeline must not know how a person is reached. Novu owns channels and templates; this package owns the workflow identifiers and payload shapes so the dashboard configuration and the code stay in step.

## How it works

- `src/novu.workflows.ts` — `NovuWorkflows` (`new-job-match`, `application-status`, `automation-task-complete`, `daily-digest`; the identifiers must match the Novu dashboard exactly), `NovuSubscriber`, and the payload interfaces `MatchAlertPayload`, `ApplicationStatusPayload`, `AutomationTaskCompletePayload`, `DailyDigestPayload`.
- `src/novu.service.ts` — `NovuService`: `isEnabled()`; `sendMatchAlert(employee, jobPost, matchScore, explanation)`, `sendApplicationStatus(employee, payload)`, `sendAutomationTaskComplete(employee, payload)`, `sendDailyDigest(employee, payload, { throwOnError? })`; all delegate to a private `trigger()`. The subscriber id is the employee's `userId` when present, otherwise the employee id.
- `src/novu.recipient.ts` — `employeeRecipient(employeeId, employee?)`: the employee argument of the `send…()` methods from a loaded employee (so the `userId` is used when known).
- `src/novu.module.ts` — `NovuModule` provides and exports `NovuService`.

Callers today: `EmployeeJobPostService.match()` (`@packages/employeeJobPost`) sends a match alert when `matchScore >= NOVU_MATCH_NOTIFY_THRESHOLD`; `EmployeeJobPostCreatedEventHandler` does the same for matches that carry an `aiScore`; `AutomationTaskFinishedEventHandler` (`@packages/automationTask`) sends the task outcome once per transition to `completed` / `failed` / `timeout`, whatever wrote it (REST, GraphQL, the stale-task clean-up); `EmployeeJobApplicationStatusChangedEventHandler` (`@packages/employeeJobApplication`) sends `application-status` once per real change of an application's `appliedStatus` (`finalize`, REST and GraphQL updates), the free-text value mapped to the payload's `status`; `OpsService.sendDailyDigest()` (`@packages/ops`) sends one digest per employee with activity.

There is no crawl-summary notification any more: the former `crawl-complete` workflow (`sendCrawlComplete(adminSubscriberId, payload)`) never had a caller and was removed. Its payload (new jobs, matches, sources searched, duration of a crawl) describes the whole deployment, so it cannot go to employees without exposing other tenants' activity; the platform has no operator subscriber to send it to; and crawls run every 10 minutes, while employees already get per-match alerts and the daily digest. Crawl results are in the logs (`CrawlerService`) and, with Trigger.dev, in the run history of `crawl-jobs`.

## Wiring

- `OpsModule` imports `NovuModule`; `CrawlerModule`, `EmployeeJobPostModule`, `EmployeeJobApplicationModule` and `AutomationTaskModule` provide `NovuService` directly.
- Environment variables: `NOVU_API_KEY` (read by the service itself), `NOVU_MATCH_NOTIFY_THRESHOLD` (read through `ConfigurationService` by the matching code, default 80).
- The `novu` entry of `src/plugins.ts` is on when `NOVU_API_KEY` is set; `GAUZY_AI_PLUGINS_DISABLED=novu` silences all sends.
- No endpoints. `packages/novu/package.json` and `tsconfig.json` are descriptive only; the `@novu/api` dependency is in the root `package.json`.

## Using / extending

- Create the workflows in the Novu dashboard with the identifiers above and the payload fields the templates need (see `docs/novu-setup.md`).
- New notification: add the identifier and payload type to `novu.workflows.ts`, a `send…()` method on `NovuService` that calls `trigger()`, and call it from the handler or service that owns the event.
- Only `sendDailyDigest(employee, payload, options)` accepts `{ throwOnError: true }` (used by `OpsService.sendDailyDigest()`); `sendMatchAlert`, `sendApplicationStatus` and `sendAutomationTaskComplete` take no options and always swallow trigger errors. Add an options parameter to a method when a new caller needs the outcome.

## Tests

`src/novu.service.spec.ts` (disabled mode, every workflow, payload defaults, error handling) — run `yarn test packages/novu`.
