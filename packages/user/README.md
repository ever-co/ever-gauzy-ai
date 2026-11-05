# @packages/user

Folder: `packages/user`. Users: shadow records of the integrating platform's users, one per tenant, which the authentication layer uses to map an Ever ID token (by verified e-mail) or a legacy tenant JWT (by external ids) to a tenant and an employee.

## What it does

Serves `User` rows over REST (`/api/user`) and GraphQL (`users`, …) within the tenant, and provides the two lookups `TenantAuthService` (`@packages/auth`) depends on: `findActiveByEmail()` for Ever ID sign-in and `findUserByExternalOptions()` for the legacy bearer path.

## Why it exists

Gauzy AI runs no sign-in of its own. A person authenticates with Ever ID; the API only needs to know which tenant(s) that e-mail belongs to and which employee record it maps to. The integrating platform creates these rows (`createOneUser` / `createManyUsers`) when it registers its users and employees.

## How it works

- `src/user.service.ts` — `UserService` extends `TenantAwareCrudService<User>`: `findActiveByEmail(email)` — active users of active tenants whose e-mail equals the given one case-insensitively (`LOWER(email) = :email`, served on PostgreSQL by the `IDX_user_email_lower` expression index), newest first, never queried with an empty e-mail; `findUserByExternalOptions({ externalUserId, externalEmployeeId, externalTenantId })` — the active user with an active employee and tenant matching the external ids.
- `src/resolvers/user.resolver.ts` — `UserResolver`, nestjs-query CRUD on `UserDTO` with the tenant authorizer interceptor.
- `src/user.controller.ts` — `UserController`, `@Crud` at `/api/user` with `UserDTO` bodies.
- `src/user.subscriber.ts` — `UserSubscriber` fills the virtual `name` after load; registered in `coreSubscribers` (`@packages/config`).
- `src/user.module.ts` — `UserModule`: repository, `NestjsQueryGraphQLModule.forFeature` for `UserDTO` (subscriptions and delete on), `UserService`, `UserResolver`; exports `UserService`.

The `hash` column exists for compatibility and is excluded from serialization; Gauzy AI never verifies passwords.

## Wiring

- `AuthModule` imports `UserModule`; `AppModule` imports it and lists it in the GraphQL `include`.
- GraphQL: `users`, `user`, `userAggregate`, `createOneUser`, `createManyUsers`, `updateOneUser`, `updateManyUsers`, `deleteOneUser`, `deleteManyUsers`, subscriptions `createdUser`, `updatedOneUser`, …
- REST: `/api/user`.
- No environment variables (Ever ID settings live in `@packages/auth`).

## Using / extending

```graphql
mutation { createOneUser(input: { user: { email: "ann@example.com", externalUserId: "…", externalTenantId: "…", isActive: true, isArchived: false } }) { id } }
```

When the same e-mail exists in several tenants, Ever ID callers must send `Tenant-Id`; see `docs/authentication.md`. A new lookup for authentication belongs here, scoped to active users and active tenants like the existing ones.

## Tests

`src/user.service.spec.ts` (case-insensitive e-mail lookup, empty e-mail guard) — run `yarn test packages/user`.
