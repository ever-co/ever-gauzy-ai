# @packages/sourceConfig

Folder: `packages/source-config`. Per-tenant source configurations: the OAuth2 credentials and settings a tenant stores for a job source (today `upwork`), managed through one set of GraphQL operations and read by the job providers at crawl time.

## What it does

`SourceConfigService` creates, lists, reads, updates and deletes `SourceConfig` rows of the authenticated tenant, masks secrets in every response, and offers `getConfigForSource()` to the providers: the tenant's own configuration first, then a deployment-wide one that belongs to no tenant, never another tenant's.

## Why it exists

Credentials for a source belong to the organization that owns them and must never be shared across tenants or appear in full in API responses. One table and one API for all sources keeps clients simple (`sourceCode` selects the source) while the providers decide what to do with the fields.

## How it works

- `src/sourceConfig.service.ts` — `SourceConfigService`:
  - `create(input)` — stamps `tenantId = requireCurrentTenantId()`, keeps the caller's `tenantId` / `orgId` as `externalTenantId` / `externalOrgId`, `sourceOrgId`, the `auth` fields (`grantType` auto-detected: `authorization_code` when access and refresh tokens are present, else `client_credentials`) and `settings` (`useProxy`, `cacheTtlSeconds`, `resultsWanted`);
  - `findAll(sourceCode?, tenantId?, orgId?)`, `findOne(id)`, `update(id, input)`, `remove(id)` — all within `currentTenantWhere()`; a row of another tenant is a 404;
  - `getConfigForSource(sourceCode, sourceOrgId?, tenantId?)` — lookup order: (`tenantId`, `sourceOrgId`), (`tenantId`), (no tenant, `sourceOrgId`), (no tenant); active, non-archived rows only; returns the raw entity (secrets unmasked) for the provider;
  - `toResponse()` — `clientSecret`, `accessToken`, `refreshToken` are returned as `***` + last four characters; `clientId` is a public identifier and stays visible.
- `src/dto/source-config.dto.ts` — `SourceConfigType` (`SourceConfig`), `SourceAuthType`, `SourceSettingsType`, `CreateSourceConfigInput`, `UpdateSourceConfigInput`, `SourceAuthInput`, `SourceSettingsInput`.
- `src/sourceConfig.resolver.ts` — `SourceConfigResolver`: `createSourceConfig(input)`, `sourceConfigs(sourceCode?, tenantId?, orgId?)`, `sourceConfig(id)`, `updateSourceConfig(id, input)`, `removeSourceConfig(id)`.
- `src/sourceConfig.module.ts` — `SourceConfigModule` provides the resolver and the service, exports the service.

Consumers: `UpworkProvider` (`@packages/provider-upwork`) reads `clientId` / `clientSecret` or `accessToken` and uses `sourceOrgId` as the Upwork organization (sent as the `X-Upwork-API-TenantId` header); `EverJobsProvider` (`@packages/provider-ever-jobs`, `attachSourceAuth()`) forwards only `grantType`, `clientId`, `clientSecret`, `accessToken` and `refreshToken` to the Ever Jobs API as `auth.upwork` — `sourceOrgId` is **not** forwarded, so configuring an organization affects the direct Upwork provider only. Both register `SourceConfigService` in their own modules.

## Wiring

- `AppModule` imports `SourceConfigModule` and lists it in the GraphQL `include`.
- GraphQL only: the five operations above (tenant credential required).
- No environment variables; the `UPWORK_*` variables in `@packages/provider-upwork` are the fallback when no configuration exists.

## Using / extending

```graphql
mutation {
  createSourceConfig(input: { sourceCode: "upwork", sourceOrgId: "…", auth: { clientId: "…", clientSecret: "…" }, settings: { resultsWanted: 50 } }) {
    id auth { clientId clientSecret } settings { resultsWanted }
  }
}
query { sourceConfigs(sourceCode: "upwork") { id sourceOrgId auth { grantType clientId } isActive } }
```

A new source needs no change here: store its credentials with its own `sourceCode` and read them in its provider with `getConfigForSource('<code>', sourceOrgId, criterion.tenantId)`. New credential fields are added to the entity, the DTOs and `toResponse()` (mask anything secret). See `docs/source-integration.md`.

## Tests

`src/sourceConfig.service.spec.ts` (create and grant-type detection, filters, tenant scoping of `getConfigForSource`, update, remove, masking) and `src/sourceConfig.resolver.spec.ts` — run `yarn test packages/source-config`.
