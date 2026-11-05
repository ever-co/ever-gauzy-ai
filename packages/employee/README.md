# @packages/employee

Folder: `packages/employee`. Employees: the people the platform searches and matches jobs for — shadow records of the integrating platform's employees with the profile fields AI scoring reads — with their REST and GraphQL CRUD, the profile mutation and the sample data used by the seeder.

## What it does

Stores and serves `Employee` rows per tenant, provides the two lookups the pipeline needs (`getActiveWithJobSearchCriteria()` for the crawler and matching, `updateProfile()` for the AI enrichment fields) and exposes them as `/api/employee` and the `employees` GraphQL operations plus `updateEmployeeProfile`.

## Why it exists

Gauzy AI does not own employees: the Ever Gauzy API registers them (with `externalEmployeeId`, `externalTenantId`, `externalOrgId`) and users sign in through Ever ID. What the platform adds is the matching profile — `bio`, `skillsSummary`, `experienceSummary`, `preferredRate`, `jobType` — and the link to search criteria and matches.

## How it works

- `src/employee.service.ts` — `EmployeeService` extends `TenantAwareCrudService<Employee>`: `getActiveWithJobSearchCriteria()` returns every active, non-archived employee with their `jobSearchCriteria` across all tenants (it serves the cross-tenant crawl, so it reads the repository directly); `updateProfile(id, input)` updates only the provided enrichment fields of an employee of the current tenant (404 otherwise). The REST writes (`createOne`, `createMany`, `replaceOne`, `updateOne`) drop a client-supplied `createdAt` / `updatedAt` (`withoutTimestamps()`, `@packages/core/hooks`): the database stamps them, and re-matching relies on them; the GraphQL mutations do the same through `ServerTimestamps*Hook` on `EmployeeDTO`.
- `src/resolvers/employee.resolver.ts` — `EmployeeResolver`: nestjs-query CRUD on `EmployeeDTO` with the tenant authorizer interceptor, the mutation `updateEmployeeProfile(id, input)` (`src/dto/updateEmployeeProfile.input.ts`: `bio`, `skillsSummary`, `preferredRate >= 0`, `experienceSummary`). The `healthCheck` query is served by `HealthResolver` (`@packages/health`).
- `src/employee.controller.ts` — `EmployeeController`, `@Crud` at `/api/employee` with `EmployeeDTO` bodies.
- `src/employee.subscriber.ts` — `EmployeeSubscriber` (TypeORM `afterLoad`) fills the virtual `name` from first and last name; registered in `coreSubscribers` (`@packages/config`).
- `src/employee.seed.ts` — `createEmployees(connection)`: ten sample employees with profiles (one of them active); used by `@packages/seeds`.
- `src/employee.module.ts` — `EmployeeModule`: the repository, `NestjsQueryGraphQLModule.forFeature` for `EmployeeDTO` (subscriptions and delete on), `EmployeeService`, `EmployeeResolver`; exports `EmployeeService`.

## Wiring

- `AppModule` imports `EmployeeModule` and lists it in the GraphQL `include`; `CrawlerModule`, `EmployeeJobPostModule`, `EmployeeJobApplicationModule`, `AutomationTaskModule` provide `EmployeeService` directly.
- GraphQL: `employees`, `employee`, `employeeAggregate`, `createOneEmployee`, `createManyEmployees`, `updateOneEmployee`, `updateManyEmployees`, `deleteOneEmployee`, `deleteManyEmployees`, `updateEmployeeProfile`, subscriptions `createdEmployee`, `updatedOneEmployee`, …
- REST: `/api/employee`.
- No environment variables.

## Using / extending

```graphql
mutation { createOneEmployee(input: { employee: { firstName: "Ann", lastName: "Lee", externalEmployeeId: "…", preferredRate: 60, isActive: true, isArchived: false } }) { id } }
mutation { updateEmployeeProfile(id: "…", input: { skillsSummary: "NestJS, PostgreSQL", preferredRate: 75 }) { id skillsSummary } }
```

The scoring prompt (`AiScoringService.buildUserPrompt`) reads `bio`, `skillsSummary` (falling back to the active criteria), `experienceSummary`, `preferredRate` and `jobType`; the rate rule in `@packages/employeeJobPost` reads `preferredRate` as a USD hourly minimum. A new profile field goes into the entity, `EmployeeDTO`, `UpdateEmployeeProfileInput`, `updateProfile()` and a migration.

## Tests

`src/employee.service.spec.ts` (active employees with criteria, partial profile updates) and `src/employee.service.timestamps.spec.ts` (REST writes ignore client timestamps) — run `yarn test packages/employee`.
