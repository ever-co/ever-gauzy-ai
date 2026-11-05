# @packages/automationTask

Folder: `packages/automation-task`. The automation task queue: `AutomationTask` rows are commands for the employee's client-side companion (the Ever Gauzy AI Automation extension / desktop app), which presents the prepared proposal to the person and reports the outcome back.

## What it does

Exposes the queue over REST (`/api/automation/task`) and GraphQL (`automationTasks`, subscriptions), creates tasks through `AutomationTaskCreateCommand`, and notifies the employee through Novu (`automation-task-complete`) once when a task finishes (`completed`, `failed`, `timeout`). Tasks are generic: `commandType` (today `apply_job`) and a JSON `command` payload with the task-specific details; `status` and `commandResult` are written by the client that executes it.

## Why it exists

The API never acts on a job platform on a person's behalf. What it can do is prepare everything (proposal, answers, rate, terms) and queue it for the person's own client, then record what happened. A generic task table keeps that hand-over independent of the job platform.

## How it works

- `src/automationTask.service.ts` — `AutomationTaskService` extends `TenantAwareCrudService<AutomationTask>` (all REST reads and writes are tenant-scoped).
- `src/commands/automationTaskCreate.command.ts`, `src/handlers/automationTaskCreate.handler.ts` — `AutomationTaskCreateCommandHandler` saves the task and publishes `AutomationTaskCreatedEvent`; log lines never include `command` (a login task would carry credentials).
- `src/handlers/automationTaskCreated.handler.ts` — `AutomationTaskCreatedEventHandler` only logs; the outcome is notified when the task finishes (below).
- Outcome notification — `src/automationTask.status.ts` (`TERMINAL_TASK_STATUSES`: `completed`, `failed`, `timeout`). A transition is a write whose new `status` is terminal and differs from the stored one (a task created already finished counts too); for each one `AutomationTaskFinishedEvent` (`src/events/automationTaskFinished.event.ts`) is published once, after the write is committed:
  - `src/automationTask.subscriber.ts` — `AutomationTaskSubscriber`, a TypeORM subscriber created by Nest (it uses the EventBus and adds itself to the DataSource once), compares the saved `status` with the stored one (`databaseEntity`) on every entity save: REST `POST` / `PATCH` / `PUT /api/automation/task/:id` (`@dataui/crud` saves the entity), GraphQL `createOneAutomationTask` / `createManyAutomationTasks` / `updateOneAutomationTask`, `AutomationTaskCreateCommand`. `updateManyAutomationTasks` goes through `WatchedColumnsQueryService` (`@packages/core`), which, when the update writes `status`, selects the matching rows in a transaction (locked where the database has row locks) and saves each with only its id and the requested values, so each row is compared too and no other column is written. TypeORM loads `databaseEntity` before it opens the save's transaction, so the subscriber reads the stored status again under a row lock in `beforeUpdate` (`lockedRow()`, which also reads the stored result): of two concurrent saves of the same transition only one publishes (on PostgreSQL; SQLite has no row locks). The event carries the error of the write that made a `failed` transition (`error` / `errorMessage` / `message` of its `commandResult`, at most 500 characters). The event waits for the commit (`AfterCommitQueue`); a rolled-back write publishes nothing. A non-terminal change, a save that repeats the stored status or does not write `status` publishes nothing. A query-builder update (`repository.update()`) reaches the subscriber without the rows and is ignored, so a writer that uses one publishes the event itself;
  - `OpsService.cleanupStaleTasks()` (`@packages/ops`) times out stale tasks one by one with a conditional update and publishes the event (status `timeout`) for each task it moved; a task finished in the meantime keeps its outcome and is not notified twice.
  - `src/handlers/automationTaskFinished.handler.ts` — `AutomationTaskFinishedEventHandler` loads the task and its employee and calls `NovuService.sendAutomationTaskComplete()` (`taskId`, `commandType`, `status`, `employeeId`, the `jobTitle` of an `apply_job` command, and for `failed` the event's error; nothing else of `command` is read). Nothing is loaded or sent when Novu is not configured or the `novu` plugin is off; a task without an employee, or whose employee belongs to another tenant than the task (the CRUD pins `tenantId`, not `employeeId`), is not notified.
- `src/automationTask.controller.ts` — `AutomationTaskController`, `@Crud` at `/api/automation/task` with `AutomationTaskDTO` as the create / update / replace body.
- `src/resolvers/automationTask.resolver.ts` — `AutomationTaskResolver`, nestjs-query CRUD on `AutomationTaskDTO` with the tenant authorizer interceptor.
- `src/automationTask.module.ts` — `AutomationTaskModule`: `CqrsModule`, `AiModule`, repositories, `NestjsQueryGraphQLModule.forFeature` (subscriptions and delete on; its query service is `watchedColumnsQueryServiceProvider(AutomationTask, ['status'])`, used by both resolvers), the handlers, the subscriber and the services it shares with the application flow; exports `AutomationTaskService`.

Where tasks come from and go: the saga `src/sagas/app.saga.ts` creates one `apply_job` task (status `open`, payload with job, the application's proposal, `qa`, rate, terms, attachments, employee names) for every `EmployeeJobApplicationCreatedEvent`, i.e. for every submission through REST `/process` or GraphQL `applyToJob` (`@packages/employeeJobApplication`) of an application that has what the automation needs (proposal, answered screening questions, platform and job; an incomplete one stays a draft without a task); `OpsService.cleanupStaleTasks()` (`@packages/ops`) marks tasks still `open` / `created` / `in_progress` after `STALE_TASK_TIMEOUT_HOURS` as `timeout`.

## Wiring

- `AppModule` imports `AutomationTaskModule` and lists it in the GraphQL `include`.
- GraphQL: `automationTasks`, `automationTask`, `automationTaskAggregate`, `createOneAutomationTask`, `createManyAutomationTasks`, `updateOneAutomationTask`, `updateManyAutomationTasks`, `deleteOneAutomationTask`, `deleteManyAutomationTasks`, subscriptions `createdAutomationTask`, `updatedOneAutomationTask`, …
- REST: `/api/automation/task`.
- Environment variables: `NOVU_API_KEY` for the completion notification; `STALE_TASK_TIMEOUT_HOURS` is read by the ops job.

## Using / extending

A client polls or subscribes for its employee's open tasks, executes them with the person, then updates `status`, `commandResult`, `executedDate`, `executionTime` (and the application through `finalize`). A new task kind is a new `commandType` with its payload documented on the `AutomationTask` entity; producers dispatch `AutomationTaskCreateCommand`.

```graphql
query { automationTasks(filter: { status: { eq: "open" }, employeeId: { eq: "…" } }) { edges { node { id commandType command createdAt } } } }
```

## Tests

`src/automationTask.subscriber.spec.ts` runs the write paths on an in-memory sql.js database: one event per terminal transition through the REST update, GraphQL `updateOne` / `updateMany`, a task created finished and the stale-task clean-up (including a task finished between its read and its write), none for non-terminal changes, repeats, a concurrent second save of the same transition, rolled-back writes or savepoints; `updateMany` writes only the requested values; the handler's Novu payload and its tenant check — run `yarn test packages/automation-task`. The clean-up itself is tested in `packages/ops/src/ops.service.spec.ts`; the tenant hooks on the DTO in `packages/core/src/hooks/tenant-hooks.spec.ts`.
