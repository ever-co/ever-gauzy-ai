# @packages/employeeJobApplication

Folder: `packages/employee-job-application`. Applications: the `EmployeeJobApplication` record (proposal, screening answers, rate, terms, outcome) created from a match, the AI proposal generation around it, and the REST flow the Ever Gauzy integration uses to prepare an application and hand it to the person.

## What it does

An application is created from a match, gets an AI-written proposal when none was supplied, and is finalized (`appliedDate`, `appliedStatus`, the platform's application id) once the person has submitted it through the job platform's own interface. Nothing is submitted by this API; the employee is notified (Novu `application-status`) when the status of an application changes.

- **Submit** — `POST /api/employee/job/application/process` and the GraphQL mutation `applyToJob` take the same path: `EmployeeJobApplicationCreateCommand`, whose handler stores the application (reusing the one already made for the match), generates the AI proposal when it has none and publishes `EmployeeJobApplicationCreatedEvent`; the saga turns that into one `apply_job` `AutomationTask` for the employee's client application. Each submission makes at most one task, and the proposal is generated once, in the handler, and copied into the task unchanged.
- **Only complete applications are sent** — the task is queued only when the application has what the automation needs (`src/automationTaskReadiness.ts`, `automationTaskBlockers()`): a proposal, an answer for every screening question in `qa`, the platform (`providerCode`) and the job (`providerJobId`, taken from the job post when the application has none), and an existing employee. Otherwise the application stays a draft without a task, the reasons are logged, `/process` answers with `automationTaskQueued: false` and `automationTaskBlockers: [...]` (both added to its response; `true` / `[]` when the task was queued), and GraphQL `applicationStatus(id) { automationTaskBlockers }` lists them. Nothing is sent by completing the application alone (an edit, or `generate-proposal`, which only stores the proposal and answers): the next submission (`/process` or `applyToJob`) of the complete application queues the task.
- **Draft** — `POST /api/employee/job/application/pre-process` prepares an application for review (proposal generated synchronously) and saves it directly, without a task: it is not sent yet. Submitting it afterwards with `/process` for the same match reuses the draft and its proposal (no second generation), stores what the submission sends (`proposal`, `qa`, `rate`, `terms`, `attachments`, `proposalTemplate`, `isProposalGeneratedByAI` when given) so the application and its task carry the same values, and creates the task.

## Why it exists

The proposal must be reviewed by the person; the API's job is to prepare it well (template + job details + screening answers), keep the record of what was sent and when, and keep every row inside the tenant and employee it belongs to.

## How it works

- `src/employeeJobApplication.service.ts` — `EmployeeJobApplicationService` (`TenantAwareCrudService`): `apply(employeeJobPostId)` builds the application from the tenant's match (whose employee must belong to the tenant too: 403 otherwise), executes `EmployeeJobApplicationCreateCommand` (the `/process` path: proposal, event, automation task) and returns the stored row with its proposal (without one if the AI call failed); `generateProposal(id, { proposalTemplate?, qa? })` builds a `GenerateProposalRequest` from the job post and the given or stored `proposalTemplate` / `qa`, calls `AiService.generateProposal()` and stores `proposal`, `isProposalGeneratedByAI = true` and the screening answers from `src/screeningAnswers.ts` (`completeScreeningAnswers()`: the caller's questions and answers kept, blank answers filled by the AI, matched by question then position; the AI answers as they are when the caller sent none); `finalize(id, dto)` reads the application under a row lock (where the database has row locks) and updates it and its match (`isApplied = true`) within the tenant in one transaction, then publishes `EmployeeJobApplicationStatusChangedEvent` when `appliedStatus` really changed (see below), so two concurrent calls never both notify the same change; `getApplicationStatus(id)` returns a status summary.
- `src/employeeJobApplication.controller.ts` — `EmployeeJobApplicationController`, `@Crud` at `/api/employee/job/application` plus:
  - `POST /api/employee/job/application/generate-proposal/:id` — starts proposal generation in the background and returns at once; poll the application for `isProposalGeneratedByAI`;
  - `POST /api/employee/job/application/finalize/:id` — body `EmployeeJobApplicationFinalizeDto` (`appliedDate`, `appliedStatus`, `providerJobApplicationId`);
  - `POST /api/employee/job/application/process` — finds or creates the job post (by `providerJobId`, else from the nested `jobPost`), verifies that the employee belongs to the tenant (`assertOwnedEmployee`), finds or creates the match pinned to the tenant and employee (`pinToCaller`; a match given by id must also be for the resolved job post: 400 otherwise, here and in `pre-process`), reuses an existing application of the same tenant, employee, job post and match, then `commandBus.execute(new EmployeeJobApplicationCreateCommand(...))`;
  - `POST /api/employee/job/application/pre-process` — same lookups, but generates the proposal synchronously when `proposal` is empty and `isProposalGeneratedByAI` is false, and saves the application directly as a draft (no command, no automation task until it is submitted with `/process`).
  - The all-zero UUID `00000000-0000-0000-0000-000000000000` means "unknown" for `providerJobId` / `employeeJobPostId`.
- `src/handlers/employeeJobApplicationCreate.handler.ts` — `EmployeeJobApplicationCreateCommandHandler`: find-or-create the row within the application's tenant (an `id` sent with the request must be that tenant's application for the same employee, job post and match: 404 otherwise, so no other application is overwritten or sent; values the submission leaves out are taken from the stored application), load `employee`, `jobPost`, `employeeJobPost`; when the application carries no proposal it uses the one stored for it (a `pre-process` draft) or calls `generateProposal()` (stored on the row; an AI failure is logged and the flow goes on without a proposal); then publishes `EmployeeJobApplicationCreatedEvent`. `employeeJobApplicationCreated.handler.ts` only logs. The saga `src/sagas/app.saga.ts` maps each event to one `AutomationTaskCreateCommand` (`commandType: 'apply_job'`, status `open`, the application's proposal); it calls no AI.
- Status notifications — `src/applicationStatus.ts` maps the free-text `appliedStatus` to the statuses of the Novu `application-status` workflow (`applied`: `applied`, `submitted`, `succeed`, `succeeded`, `success`; `viewed`; `shortlisted`; `rejected`: `rejected`, `declined`; `won`: `won`, `hired`; `withdrawn`; case-insensitive). Other values (`failed`, ...) are stored but not notified, and a change between two values of the same status (`applied` to `succeed`) is not a change. `EmployeeJobApplicationStatusChangedEvent` is published once per real change, after the write is stored: by `finalize()` (a bulk update) and, for every entity save (REST `PATCH` / `PUT`, GraphQL `updateOneEmployeeJobApplication`, and `updateManyEmployeeJobApplications`, which saves row by row when it writes `appliedStatus` through `WatchedColumnsQueryService`), by `src/employeeJobApplication.subscriber.ts` (`EmployeeJobApplicationSubscriber`, a TypeORM subscriber created by Nest; for any raw change to a notified value it reads the stored status again under a row lock before the update and decides from that value, and nothing is published for a rolled-back write). Creating an application is not a status change. `src/handlers/employeeJobApplicationStatusChanged.handler.ts` loads the employee and the job title and calls `NovuService.sendApplicationStatus()` (skipped when Novu is not configured or the `novu` plugin is off, and when the employee belongs to another tenant than the application).
- `src/resolvers/employeeJobApplication.resolver.ts` — nestjs-query CRUD on `EmployeeJobApplicationDTO` plus `applicationStatus(id)` (`ApplicationStatusResponse`), `applyToJob(employeeJobPostId)`, `generateApplicationProposal(applicationId)`.
- `src/employeeJobApplication.module.ts` — `EmployeeJobApplicationModule`: `CqrsModule`, `AiModule`, repositories, `NestjsQueryGraphQLModule.forFeature` (subscriptions and delete on; the query service watches `appliedStatus`), the handlers, the subscriber, `EmployeeJobPostService`, `EmployeeService`, `JobPostService`, `NovuService`; exports the four services.

## Wiring

- `AppModule` imports the module and lists it in the GraphQL `include`; `AutomationTaskModule` provides `EmployeeJobApplicationService` as well.
- The Trigger.dev event task `process-application` (`src/trigger/ai-scoring.ts`) calls `/process` with a tenant API key.
- Environment variables: `OPENROUTER_API_KEY`, `OPENAI_MODEL` (proposal generation, through `@packages/ai`); `NOVU_API_KEY` for the status notification.
- GraphQL: `employeeJobApplications`, `employeeJobApplication`, `employeeJobApplicationAggregate`, `applicationStatus`, `applyToJob`, `generateApplicationProposal`, `createOneEmployeeJobApplication` … `deleteManyEmployeeJobApplications`, subscriptions `createdEmployeeJobApplication`, `updatedOneEmployeeJobApplication`, …
- REST: `/api/employee/job/application` and the four custom routes above.

## Using / extending

```graphql
mutation { applyToJob(employeeJobPostId: "…") { id proposal isProposalGeneratedByAI qa } }
query { applicationStatus(id: "…") { appliedStatus hasProposal providerJobApplicationId jobTitle automationTaskBlockers } }
```

```bash
curl -X POST http://localhost:3005/api/employee/job/application/finalize/<id> -H "X-APP-ID: $APP_ID" -H "X-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" -d '{"appliedDate":"2026-11-01T10:00:00Z","appliedStatus":"succeed"}'
```

New fields of an application: entity + `EmployeeJobApplicationDTO` + migration, and the `process` / `pre-process` payload mapping in the controller.

## Tests

`src/employeeJobApplication.service.spec.ts` (apply, finalize, proposal generation, status), `src/employeeJobApplication.controller.spec.ts` (tenant isolation of `process` / `pre-process`) and `src/employeeJobApplication.subscriber.spec.ts` (status mapping; one notification per real change through `finalize`, entity saves and GraphQL `updateMany`, on an in-memory sql.js database) — run `yarn test packages/employee-job-application`. The flow across the command handler and the saga (`applyToJob` and `/process`: one task, one proposal) is tested in `src/sagas/app.saga.spec.ts`.
