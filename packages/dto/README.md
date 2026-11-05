# @packages/dto

Folder: `packages/dto`. The GraphQL object and input types of the API (nestjs-query DTOs) and the REST body classes, one per entity, carrying the tenant authorizer and the tenant hooks that keep every GraphQL operation inside the caller's tenant.

## What it does

For each entity of `@packages/entities` there is a DTO class decorated for `@ptc-org/nestjs-query-graphql` (`@ObjectType`, `@InputType`, `@FilterableField`, relations) and for REST (`@ApiProperty*`, class-validator). nestjs-query generates the GraphQL queries, mutations, aggregates and subscriptions from these classes; the `@Crud` REST controllers use them as `create` / `update` / `replace` bodies.

## Why it exists

Entities describe the database; DTOs describe what the API exposes and how it is authorized. Keeping them apart lets a column exist without being queryable, and lets the tenant rules be declared once per type with decorators instead of being repeated in resolvers.

## How it works

- `src/employee.dto.ts` — `EmployeeDTO` (`Employee`), with `@Relation('user')`.
- `src/user.dto.ts` — `UserDTO` (`User`), with `@Relation('employee')`.
- `src/jobPost.dto.ts` — `JobPostDTO` (`JobPost`). Job posts are the shared catalog, so this DTO has **no** tenant authorizer or hooks.
- `src/employeeJobPost.dto.ts` — `EmployeeJobPostDTO` (`EmployeeJobPost`), filterable relations `employee` and `jobPost`.
- `src/employeeJobApplication.dto.ts` — `EmployeeJobApplicationDTO`, filterable relations `employee`, `jobPost`, `employeeJobPost`.
- `src/automationTask.dto.ts` — `AutomationTaskDTO`, filterable relations `employee` and `executedByEmployee`.
- `src/jobSearchCriterion.dto.ts` — `JobSearchCriterionBaseDTO` (abstract) and two concrete types on the same table: `JobSearchCriterionDTO` (`JobSearchCriterion`) and the compatibility alias `UpworkJobsSearchCriterionDTO` (`UpworkJobsSearchCriterion`), which the Ever Gauzy integration plugin still calls (`createManyUpworkJobsSearchCriteria`, `deleteManyUpworkJobsSearchCriteria`).
- `src/employeeJobApplicationFinalize.dto.ts` — `EmployeeJobApplicationFinalizeDto`, the body of `POST /api/employee/job/application/finalize/:id` (`appliedDate`, `appliedStatus`, `providerJobApplicationId`).

Every tenant-scoped DTO extends `TenantBaseDTO` (`@packages/core`) and declares:

- `@Authorize(TenantAuthorizer)` (`@packages/tenant`) — every read is filtered by `tenantId = <authenticated tenant>`;
- `@BeforeQueryMany(FindManyByTenantHook)`, `@BeforeCreateOne(CreateOneByTenantHook)`, `@BeforeCreateMany(CreateManyByTenantHook)`, `@BeforeUpdateOne(UpdateOneByTenantHook)`, `@BeforeUpdateMany(UpdateManyByTenantHook)`, `@BeforeDeleteMany(DeleteManyByTenantHook)` (`@packages/core/hooks`) — writes are stamped with the tenant, client-supplied `id`s are dropped from create and update payloads.

The search-criteria DTOs additionally run the `EmployeeOwned*Hook`s from `@packages/jobSearchCriteria`, which verify that `employeeId` belongs to the caller's tenant, and its owner-touch hooks, which bump an employee's `updatedAt` when one of their criteria is deleted or moved. `EmployeeDTO` and the search-criteria DTOs also run the `ServerTimestamps*Hook`s (`@packages/core/hooks`): `createdAt` / `updatedAt` in a create or update input are ignored, the database stamps them.

## Wiring

- Each feature module registers its DTO with `NestjsQueryGraphQLModule.forFeature({ resolvers: [{ DTOClass, EntityClass, ... }] })` (`employee`, `user`, `job-post`, `employee-job-post`, `employee-job-application`, `automation-task`, `job-search-criteria`); the generated resolvers appear in `src/schemas/schema.graphql` (for example `employees`, `createOneEmployee`, `jobPosts`, `employeeJobPosts`, `createdJobPost`).
- The `@Crud` controllers of the same packages reference the DTOs in `dto: { create, update, replace }`.
- The `TenantDTO` and `TenantApiKeyDTO` live in their own packages (`@packages/tenant`, `@packages/tenantApiKey`).
- No environment variables, no endpoints of its own.

## Using / extending

- To expose a new column: add it to the entity, then a `@FilterableField` (or `@Field`) with the matching `@ApiProperty*` / class-validator decorators here. Regenerate the schema and SDK with `yarn build` (or `yarn sdk:generate`).
- A new tenant-scoped type copies the decorator block above; a type that is not tenant-scoped (like `JobPostDTO`) must be a deliberate decision.

## Tests

No spec files in this package; the hooks are tested in `packages/core/src/hooks/tenant-hooks.spec.ts` and `packages/job-search-criteria/src/hooks/employee-owned.hook.spec.ts`.
