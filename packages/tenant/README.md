# @packages/tenant

Folder: `packages/tenant`. Tenants: the read-only GraphQL view of the caller's own tenant and, more importantly, the two nestjs-query authorizers that scope every tenant-owned GraphQL type to the authenticated tenant.

## What it does

`TenantAuthorizer` adds `tenantId = <authenticated tenant>` to every query of the DTOs that declare `@Authorize(TenantAuthorizer)`; `SelfTenantAuthorizer` restricts the `Tenant` type itself to the caller's own row. `TenantModule` exposes `tenants`, `tenant` and `tenantAggregate`; create, update and delete are disabled.

## Why it exists

Tenants are shadow records of the integrating platform (`externalTenantId`); the API only needs to recognize them and to make tenant isolation a declaration on each type rather than code in each resolver.

## How it works

- `src/tenant.authorizer.ts` — `TenantAuthorizer<T extends TenantBaseDTO>` implements nestjs-query's `CustomAuthorizer`: `authorize(context)` returns `{ tenantId: { eq: context.req.tenant?.id } }`.
- `src/self-tenant.authorizer.ts` — `SelfTenantAuthorizer`: `{ id: { eq: context.req.tenant?.id ?? '00000000-0000-0000-0000-000000000000' } }`, so a request without a tenant matches nothing.
- `src/tenant.dto.ts` — `TenantDTO` (`Tenant` object type, `@Authorize(SelfTenantAuthorizer)`): `id`, `name`, `logo`, `externalTenantId`, `isActive`, `isArchived`, timestamps.
- `src/resolvers/tenant.resolver.ts` — `TenantResolver`, a nestjs-query `CRUDResolver` on `TenantDTO` with create / update / delete disabled, aggregates and total count on.
- `src/tenant.module.ts` — `TenantModule`: the repository, `NestjsQueryGraphQLModule.forFeature` for `TenantDTO` (read only) and `TenantResolver`.

Consumers of `TenantAuthorizer`: every DTO in `@packages/dto` (`EmployeeDTO`, `UserDTO`, `EmployeeJobPostDTO`, `EmployeeJobApplicationDTO`, `AutomationTaskDTO`, `JobSearchCriterionDTO`, `UpworkJobsSearchCriterionDTO`) and `TenantApiKeyDTO` (`@packages/tenantApiKey`). Resolvers apply it with `@UseInterceptors(AuthorizerInterceptor(DTO))`.

## Wiring

- `AppModule` imports `TenantModule` and lists it in the GraphQL `include`.
- GraphQL: `tenants`, `tenant`, `tenantAggregate` (always the caller's own tenant).
- No REST controller, no environment variables.
- There is no create operation for tenants in this API, nor for their API keys (`@packages/tenantApiKey` disables `create`): tenant rows and the first API key are provisioned outside the API (for example directly in the database).

## Using / extending

```graphql
query { tenants { edges { node { id name externalTenantId } } } }
```

A new tenant-scoped GraphQL type declares `@Authorize(TenantAuthorizer)` and the tenant hooks from `@packages/core/hooks` (see `@packages/dto`); a type without `tenantId` that must still be restricted gets its own authorizer modeled on `SelfTenantAuthorizer`.

## Tests

`src/self-tenant.authorizer.spec.ts` — run `yarn test packages/tenant`.
