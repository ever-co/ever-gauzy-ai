# @packages/tenantApiKey

Folder: `packages/tenant-api-key`. Tenant API keys: the machine credential of a tenant (`X-APP-ID` / `X-API-KEY`) and the optional per-tenant OpenAI credentials, exposed over GraphQL for reading and updating within the tenant.

## What it does

`TenantApiKeyModule` registers a nestjs-query resolver for `TenantApiKeyDTO` with `create` and `delete` disabled: a tenant can list and update its own keys (`tenantApiKeys`, `tenantApiKey`, `updateOneTenantApiKey`, `updateManyTenantApiKeys`). The row stores `apiKey` (the public app id), `apiSecret` (the SHA-256 hash of the secret, never the secret) and `openAiSecretKey` / `openAiOrganizationId`, which the screenshot analysis uses instead of the deployment's OpenAI key.

## Why it exists

Server-to-server callers (the Ever Gauzy API's integration plugin, scripts) need a credential that identifies a tenant without a user, and a tenant may want AI calls billed to its own OpenAI account. Validation lives in `@packages/auth`; this package only exposes the record.

## How it works

- `src/tenantApiKey.dto.ts` — `TenantApiKeyDTO` (`TenantApiKey` object type): `@Authorize(TenantAuthorizer)` and the tenant hooks (`FindManyByTenantHook`, `CreateOneByTenantHook`, `CreateManyByTenantHook`, `UpdateOneByTenantHook`, `UpdateManyByTenantHook`, `DeleteManyByTenantHook`); fields `tenantId`, `id`, `apiKey`, `apiSecret`, `openAiSecretKey`, `openAiOrganizationId`, `isActive`, `isArchived`, timestamps.
- `src/tenantApiKey.module.ts` — `TenantApiKeyModule`: the repository and `NestjsQueryGraphQLModule.forFeature` for the DTO with `create: { disabled: true }`, `delete: { disabled: true }`; the resolver it generates serves every operation (there is no hand-written resolver).
- The entity is `TenantApiKey` in `@packages/entities`; the lookup and the constant-time hash comparison are `TenantApiKeyService` and `TenantAuthService` in `@packages/auth`; the per-request OpenAI credentials reach `ImageAnalyzeService` through `RequestContext.currentTenantApiKey()`.

## Wiring

- `AppModule` imports `TenantApiKeyModule` and lists it in the GraphQL `include`.
- GraphQL: `tenantApiKeys`, `tenantApiKey`, `updateOneTenantApiKey`, `updateManyTenantApiKeys`.
- No REST controller, no environment variables.
- Keys are provisioned outside the API: insert a `tenant_api_key` row with the SHA-256 hex digest of the secret in `apiSecret` (there is no create mutation).

## Using / extending

```graphql
mutation { updateOneTenantApiKey(input: { id: "…", update: { openAiSecretKey: "sk-…", openAiOrganizationId: "org-…" } }) { id } }
```

Responses include `apiSecret` as stored (the hash). A provisioning mutation would belong here, generating the secret, storing its hash and returning the secret once; keep `apiSecret` out of logs.

## Tests

No spec files in this package; the lookup is covered by `packages/auth/src/tenant-api-key.service.spec.ts` and the authentication by `packages/auth/src/auth.middleware.spec.ts`.
