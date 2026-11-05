# @packages/entities

Folder: `packages/entities`. The TypeORM entities of the Gauzy AI database: tenants and their API keys, organizations, users, employees and their search criteria, the shared job-post catalog, matches, applications, automation tasks and per-source credentials.

## What it does

Defines the eleven tables the API owns (`src/*.entity.ts`), with the Swagger (`@ApiProperty*`) and class-validator decorators the REST layer uses. The GraphQL types are separate (`@packages/dto`); the schema itself is created by the migrations in `@packages/config`.

## Why it exists

Gauzy AI keeps its own database, separate from the Ever Gauzy API. It does not own business entities such as tenants, organizations, users or employees: it stores shadow records with `external*Id` columns pointing at the integrating platform, plus the data it produces itself (job posts, matches, applications, tasks). One package for all entities keeps the `Entities` list in `packages/config/src/database.ts` and the relations between them in one place.

## How it works

Every entity extends a base class from `@packages/core`:

| Entity (table) | Base class | Notes |
| --- | --- | --- |
| `Tenant` (`tenant`) | `Base` | `name`, `logo`, `externalTenantId` |
| `TenantApiKey` (`tenant_api_key`) | `TenantBaseEntity` | `apiKey`, `apiSecret` (SHA-256 hash), optional `openAiSecretKey` / `openAiOrganizationId` |
| `Organization` (`organization`) | `TenantBaseEntity` | `name`, `externalOrgId` |
| `User` (`user`) | `TenantBaseEntity` | `email`, `username`, `hash` (excluded from serialization), `externalUserId`, `externalTenantId`; one-to-one `employee`; expression index `IDX_user_email_lower` declared with `synchronize: false` (created by a migration) |
| `Employee` (`employee`) | `TenantOrganizationBaseEntity` | names, `externalEmployeeId`, `jobType`, AI profile fields `bio`, `skillsSummary`, `preferredRate`, `experienceSummary`, `customFields`; one-to-many `jobSearchCriteria`; unique on (`tenantId`, `orgId`, `firstName`, `lastName`) |
| `JobSearchCriterion` (`job_search_criterion`) | `TenantOrganizationBaseEntity` | `keyword`, `location`, `country`, `jobType`, `isRemote`, `hoursOld`, legacy `category` / `occupation` fields; many-to-one `employee` |
| `JobPost` (`job_post`) | `Base` | **shared by all tenants**; unique on (`providerCode`, `providerJobId`); title, description, budget and structured compensation, company fields, search metadata, liveness fields `isExpired` / `expiryCheckedAt` |
| `EmployeeJobPost` (`employee_job_post`) | `TenantOrganizationBaseEntity` | the match of an employee to a job post; AI fields `matchScore`, `skillsEvidence`, `riskFlags`, `budgetFit`, `recommendedAction`, `explanation`, `modelUsed`, `scoredAt`, plus scoring bookkeeping `scoringAttempts`, `scoringStartedAt`, `scoringError`; `isApplied`, `appliedStatus`, `appliedDate`; unique on (`tenantId`, `orgId`, `employeeId`, `jobPostId`) |
| `EmployeeJobApplication` (`employee_job_application`) | `TenantOrganizationBaseEntity` | the proposal: `proposal`, `isProposalGeneratedByAI`, `proposalTemplate`, `qa`, `attachments`, `rate`, `terms`, `providerJobApplicationId`, `appliedDate` / `appliedStatus`; many-to-one `employee`, `jobPost`, `employeeJobPost` |
| `AutomationTask` (`automation_task`) | `TenantOrganizationBaseEntity` | a command for the client-side automation companion: `commandType`, `command` (JSON), `commandResult`, `status`, `executionTime`, `executedDate`, `isBroadcast`, `employeeId`, `executedByEmployeeId` |
| `SourceConfig` (`source_config`) | `TenantOrganizationBaseEntity` | per-source credentials and settings: `sourceCode`, `sourceOrgId`, `grantType`, `clientId`, `clientSecret`, `accessToken`, `refreshToken`, `useProxy`, `cacheTtlSeconds`, `resultsWanted` |

`TenantBaseEntity` gives `tenant` / `tenantId` (cascade delete), `TenantOrganizationBaseEntity` adds `org` / `orgId`; `Base` gives `id`, `createdAt`, `updatedAt`, `isActive`, `isArchived`. See `docs/data-model.md` for the relationship diagram.

## Wiring

- `packages/config/src/database.ts` lists every entity in `Entities` and passes it to TypeORM (`TypeOrmConfigService`); the CLI data source `typeorm.config.ts` uses the same list.
- Feature modules register what they need with `TypeOrmModule.forFeature([...])` and `NestjsQueryTypeOrmModule.forFeature([...])`.
- On PostgreSQL the schema is owned by the migrations in `packages/config/src/migrations/` (run at startup with `DB_MIGRATIONS_RUN=true`); on sql.js / SQLite set `DB_SYNCHRONIZE=true` to let TypeORM create the tables from these classes.
- No environment variables, no endpoints of its own.

## Using / extending

1. Add or change a column on the entity (keep the Swagger and class-validator decorators).
2. Mirror it in the GraphQL DTO (`@packages/dto`) when it must be queryable.
3. Generate a migration: `yarn migration:generate:ephemeral <Name>` (disposable embedded PostgreSQL) or `yarn migration:generate <Name>` (your `DB_*`), then add the class to `packages/config/src/migrations/index.ts`. Migrations after the baseline must be idempotent (`IF NOT EXISTS`).
4. A new entity is added to `Entities` in `packages/config/src/database.ts` as well.

## Tests

This package has no spec files of its own. `yarn test:e2e:ephemeral` runs the migrations on an empty embedded PostgreSQL and asserts that the entities match the resulting schema (`test/migrations.e2e-spec.ts`).
