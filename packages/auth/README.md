# @packages/auth

Folder: `packages/auth`. Authentication and authorization of every request: the credential kinds the API accepts, the middleware and guards that enforce them, and the equivalent handling for GraphQL subscriptions over WebSocket.

## What it does

Authenticates each HTTP request and each `graphql-ws` connection with one of four credentials — tenant API key, Ever ID (OpenID Connect) user token, legacy tenant JWT, or the service token — and attaches the result (`authMethod`, `tenant`, `tenantApiKey`, `user`) to the request. A global guard then refuses anything that carries no tenant unless the route is `@Public()`; two more guards admit the service token on cross-tenant operational endpoints.

## Why it exists

The API serves machines (the Ever Gauzy API through its integration plugin), people (signed in with Ever ID) and schedulers (Trigger.dev tasks, cron jobs) that act across tenants. Each needs a different credential, but tenant isolation must be identical for all of them and for both transports (HTTP and WebSocket). Gauzy AI runs no sign-in or password store of its own: people come from Ever ID, machines use per-tenant API keys.

## How it works

- `src/auth.service.ts` — `TenantAuthService.authenticate(headers)` tries the branches below in order. Headers that **select** a branch are verified there, and a rejected credential throws `ForbiddenException` (403). Headers that select **no** branch yield `null` and the request continues anonymous to the route's guards: no credentials at all, an incomplete API-key pair (`X-APP-ID` without `X-API-KEY` or the reverse), a bearer token that is not an Ever ID token and comes without `Tenant-Id` (or while `JWT_SECRET` is unset), or an `X-SERVICE-TOKEN` while `SERVICE_API_TOKEN` is unset. The branches:
  1. **API key** — `X-APP-ID` + `X-API-KEY`: looks up `TenantApiKey` by `apiKey`, compares the SHA-256 hash of the secret in constant time → `AuthMethod.ApiKey`, the tenant and its `tenantApiKey` (per-tenant OpenAI credentials);
  2. **Ever ID** — `Authorization: Bearer <OpenID Connect token>` whose `iss` is `EVER_ID_ISSUER_URL`: verified by `EverIdService`, the user is matched by verified e-mail (`UserService.findActiveByEmail`), `Tenant-Id` picks the tenant when the e-mail exists in several → `AuthMethod.EverId`, `user`, `expiresAt`;
  3. **Legacy tenant JWT** — `Tenant-Id` + bearer token signed with `JWT_SECRET`, `id` and `tenantId` claims required, user looked up by external ids → `AuthMethod.BearerToken`;
  4. **Service token** — `X-SERVICE-TOKEN` equal to `SERVICE_API_TOKEN` (constant-time compare) → `AuthMethod.ServiceToken`, no tenant.
- `src/ever-id.service.ts` — `EverIdService`: discovers the issuer's JWKS from `/.well-known/openid-configuration` (deadline `EVER_ID_DISCOVERY_TIMEOUT_MS`, default 10 s), verifies signature, issuer, `exp` and, when `EVER_ID_AUDIENCE` is set, the audience; requires `email_verified: true`. `isEverIdToken()` decides which bearer path handles a token. Tests inject `EVER_ID_OPTIONS`.
- `src/tenant-api-key.service.ts` — `TenantApiKeyService` (a `TenantAwareCrudService`) with `findApiKeyByOptions()`, which only returns active keys of active tenants.
- `src/auth.middleware.ts` — `AuthMiddleware` runs on every route, lower-cases the headers, calls `authenticate()` and attaches the result. Two outcomes: a `null` result (headers that selected no branch, see above) is passed on as anonymous and the guard decides (401 unless the route is `@Public()`); a credential that selected a branch and was **rejected** makes `authenticate()` throw `ForbiddenException`, which the middleware does not catch, so the request ends with 403 before any guard runs — `@Public()` routes included. `IS_DISABLE_AUTH=true` skips the middleware entirely.
- `src/tenant-auth.guard.ts` — `TenantAuthGuard` refuses requests without `request.tenant.id` (401), for HTTP and GraphQL contexts; `src/auth.guard.ts` — `AuthGuard` extends it and lets `@Public()` handlers or classes through. It is registered as `APP_GUARD` in `AuthModule` and again globally in `src/main.ts`.
- `src/service-token.guard.ts` — `ServiceTokenGuard` admits the service token **or** any tenant credential (used by `GET /api/plugins`); `ServiceTokenOnlyGuard` admits the service token only (used by `/api/ops/*` and `/api/crawler/*`, which act across tenants).
- `src/graphql-ws-auth.ts` — `createGraphqlWsAuth(authService)` returns the `onConnect` and `context` functions for `graphql-ws`: `connectionParams` are authenticated like headers, every operation re-authenticates, and an authenticated connection is re-validated every `WS_REVALIDATE_INTERVAL_MS` (default 5 min) and at the token's `exp`; the socket is closed with code `4401` (`WS_CLOSE_UNAUTHORIZED`) when the credentials stop validating or identify a different tenant or user.
- `src/auth.interfaces.ts` — `TenantContext` and `AuthorizeMethod`, the types the nestjs-query authorizers in `@packages/tenant` implement.
- `src/auth.module.ts` — `AuthModule` imports `UserModule` and the `TenantApiKey` repository, applies the middleware to `*`, registers `AuthGuard` as `APP_GUARD` and exports `TenantApiKeyService`, `TenantAuthService`, `EverIdService`, `ServiceTokenGuard`.

## Wiring

- `AppModule` imports `AuthModule` and passes `TenantAuthService` to `GraphQLModule.forRootAsync` so that `createGraphqlWsAuth` authenticates subscriptions with the same rules.
- Environment variables: `EVER_ID_ISSUER_URL`, `EVER_ID_AUDIENCE`, `EVER_ID_DISCOVERY_TIMEOUT_MS`, `JWT_SECRET`, `SERVICE_API_TOKEN`, `WS_REVALIDATE_INTERVAL_MS`, `IS_DISABLE_API_KEY_AUTH`, `IS_DISABLE_BEARER_TOKEN_AUTH`, `IS_DISABLE_AUTH` (local development only).
- No endpoints of its own; it protects all of them. See `docs/authentication.md` for the request pipeline and integration examples.

## Using / extending

- Mark a route or class public with `@Public()` from `@packages/core/decorators/public.decorator`; combine it with `@UseGuards(ServiceTokenOnlyGuard)` for a cross-tenant job endpoint, or `@UseGuards(ServiceTokenGuard)` when a tenant may call it too.
- Inside services read the tenant from the request context (`@packages/core/context`), never from headers.
- A new credential kind is a new branch in `TenantAuthService.authenticate()` plus a value in `AuthMethod` (`@packages/core/enums`); both transports pick it up automatically.
- Credentials are never logged: keep it that way in new code.

## Tests

`src/auth.middleware.spec.ts`, `src/ever-id.service.spec.ts`, `src/graphql-ws-auth.spec.ts`, `src/service-token.guard.spec.ts`, `src/tenant-api-key.service.spec.ts`, `src/tenant-auth.guard.spec.ts` — run `yarn test packages/auth`.
