# @packages/core

Folder: `packages/core`. Shared building blocks that every other package relies on: the per-request context, tenant scoping helpers, the base entity and DTO classes, the tenant-aware CRUD service, the nestjs-query tenant hooks, the `@Public()` decorator and the guards for server-side requests to external URLs.

## What it does

`@packages/core` holds the code that makes the API multi-tenant without every feature package repeating it. It establishes a `RequestContext` for each HTTP request and GraphQL operation, exposes the authenticated tenant to services through `AsyncLocalStorage`, and provides base classes and hooks that stamp, filter and verify `tenantId` on reads and writes. It also contains the network guard used whenever the API fetches a URL that came from outside (screenshot links, stored job URLs).

## Why it exists

Tenant isolation is a cross-cutting concern: REST controllers, GraphQL resolvers, CQRS handlers and background services all need "the current tenant" and must never read or write another tenant's rows. Keeping the request context, the scoping helpers and the base entities in one package gives every feature the same rules and keeps packages such as `employee`, `job-search-criteria` or `source-config` small.

## How it works

- `src/core.module.ts` — `CoreModule` applies `RequestContextMiddleware` to every route and registers `RequestContextInterceptor` as a global interceptor.
- `src/context/request-context.ts` — `RequestContext`, backed by Node's `AsyncLocalStorage`: `RequestContext.run()`, `currentRequestContext()`, `currentRequest()`, `currentTenantId()` and `currentTenantApiKey()` (the authenticated tenant's `TenantApiKey`, used for per-tenant OpenAI credentials).
- `src/context/request-context.middleware.ts` — establishes the context for HTTP requests; `src/context/request-context.interceptor.ts` does the same for GraphQL operations that arrive over WebSocket (they never pass through the middleware).
- `src/context/tenant-scope.ts` — helpers for services that look rows up by id: `requireCurrentTenantId()` (401 without a tenant), `currentTenantWhere()` (`{ tenantId }` for a TypeORM `where`), `resolveTenantId(requested?)` (403 when a caller names another tenant) and `assertOwnedByCurrentTenant()` (another tenant's row is reported as 404).
- `src/entities/base.ts` — `Base` (uuid `id`, `createdAt`, `updatedAt`, `isActive`, `isArchived`); `src/entities/tenant-base.entity.ts` — `TenantBaseEntity` adds the `tenant` relation and an indexed `tenantId`; `src/entities/tenant-organization-base.entity.ts` — `TenantOrganizationBaseEntity` adds `org` / `orgId`. The concrete entities live in `@packages/entities`.
- `src/crud/tenant-aware-crud.service.ts` — `TenantAwareCrudService<T>` extends `TypeOrmCrudService` (`@dataui/crud-typeorm`): `getMany`, `getOne` and `findAll` add the current tenant to the `where`, `createOne` / `createMany` / `updateOne` / `replaceOne` stamp `tenantId`, `deleteOne` loads the row through `getOne` first. When the request carries no tenant the filter is simply not added (the guards reject such requests before a service runs).
- `src/crud/watched-columns-query.service.ts` — `WatchedColumnsQueryService<T>` (a nestjs-query `TypeOrmQueryService`) and `watchedColumnsQueryServiceProvider(Entity, columns)`, which replaces the entity's query service in `NestjsQueryGraphQLModule.forFeature({ services })`: when the update writes a watched column, `updateMany` selects the matching rows in a transaction (locked where the database has row locks) and saves each with only its id and the requested values, so a TypeORM subscriber sees each row's stored value (a bulk UPDATE reaches subscribers without the rows) and no other column is written back. Used for `AutomationTask.status` and `EmployeeJobApplication.appliedStatus`.
- `src/persistence/after-commit-queue.ts` — `AfterCommitQueue`: a TypeORM subscriber queues side effects (event publication) per QueryRunner and they run once the outermost transaction commits; work of a rolled-back transaction or savepoint is dropped, and without a transaction it runs at once. The subscriber forwards its `afterTransactionStart` / `Commit` / `Rollback` events. `src/persistence/row-lock.ts` — `supportsRowLocks(manager)` (PostgreSQL and the other server databases, not SQLite), `rowLockOption(manager)` (the `lock` of a `find`) and `lockedRow(manager, Entity, id, columns)`, which a subscriber's `beforeUpdate` uses to read a stored value again under a row lock inside the save's transaction (TypeORM loads `databaseEntity` before that transaction starts).
- `src/hooks/*` — nestjs-query hooks used by the GraphQL DTOs: `FindManyByTenantHook` (filters queries), `CreateOneByTenantHook` / `CreateManyByTenantHook` (stamp `tenantId`, drop a client-supplied `id`), `UpdateOneByTenantHook` / `UpdateManyByTenantHook` (pin the payload to the tenant, keep the primary key read-only), `DeleteManyByTenantHook` (restricts the filter), `ServerTimestamps{CreateOne,CreateMany,UpdateOne,UpdateMany}Hook` (drop a client-supplied `createdAt` / `updatedAt`: the database stamps them, and re-matching relies on them; used by the employee and search-criteria DTOs; `withoutTimestamps()` does the same for `EmployeeService`'s REST writes). `merge-hooks.ts` offers `MergeHooks()` to chain hooks.
- `src/dto/tenant-base.dto.ts` — `TenantBaseDTO` (filterable `tenantId`); `src/dto/base.dto.ts` — `IBaseDTO`.
- `src/decorators/public.decorator.ts` — `@Public()` sets `PUBLIC_METHOD_METADATA` (`src/constants.ts`), which the global `AuthGuard` (`@packages/auth`) honors.
- `src/enums/auth-method.enum.ts` — `AuthMethod` (`ApiKey`, `BearerToken`, `EverId`, `ServiceToken`); `src/interfaces/*` — `CustomRequest` (`authMethod`, `tenant`, `tenantApiKey`, `user`), `ITenant`, `ITenantApiKey`, `IBaseEntityModel`, `IBasePerTenantEntityModel`.
- `src/interceptors/transform.interceptor.ts` — `TransformInterceptor`, a pass-through interceptor registered as `APP_INTERCEPTOR` in `src/app.module.ts`.
- `src/net/public-url.ts` — `resolvePublicUrl()`, `pinnedRequest()`, `isPrivateAddress()`, `normalizeAddress()`, `withDeadline()` and `UnsafeUrlError`: a URL is accepted only when it is `http(s)`, carries no credentials and resolves to public addresses; the request is pinned to the validated address and never follows a redirect. Used by `@packages/ai` (`image-fetch.ts`) and `@packages/provider-ever-jobs` (`verifyJob`). Not re-exported by `src/index.ts`; import it as `@packages/core/net/public-url`.

## Wiring

- `CoreModule` is imported by `AppModule` (`src/app.module.ts`); `TransformInterceptor` is registered there as `APP_INTERCEPTOR`.
- Everything else is imported directly: `@packages/core/context`, `@packages/core/crud`, `@packages/core/persistence`, `@packages/core/hooks`, `@packages/core/entities/...`, `@packages/core/decorators/public.decorator`, `@packages/core/net/public-url`.
- No environment variables, no endpoints.

## Using / extending

- A service that loads a row by id: `repo.findOne({ where: { id, ...currentTenantWhere() } })`; a service that accepts an optional `tenantId` argument: `tenantId = resolveTenantId(tenantId)`.
- A new tenant-scoped entity extends `TenantOrganizationBaseEntity` (or `TenantBaseEntity` when it has no organization) and its DTO extends `TenantBaseDTO` with the hooks above (see `@packages/dto` for the pattern).
- A service that must be tenant-scoped on its CRUD paths extends `TenantAwareCrudService<T>`.
- Any new server-side fetch of an external URL goes through `resolvePublicUrl()` + `pinnedRequest()`.

## Tests

`src/context/request-context.spec.ts`, `src/context/tenant-scope.spec.ts`, `src/hooks/tenant-hooks.spec.ts`, `src/persistence/after-commit-queue.spec.ts` — run `yarn test packages/core`. `WatchedColumnsQueryService` is exercised on a real database by the subscriber specs of `@packages/automationTask` and `@packages/employeeJobApplication`.
