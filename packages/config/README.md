# @packages/config

Folder: `packages/config`. Configuration of the API: typed access to the environment (`ConfigurationService`), the TypeORM connection (`TypeOrmConfigService`), the list of entities and subscribers, the PostgreSQL migrations, and the periodic-job schedules shared by every scheduler.

## What it does

Reads `process.env` once, in well-defined places, and gives the rest of the application typed getters with defaults. It builds the database options for PostgreSQL, sql.js and SQLite, registers the migrations that own the PostgreSQL schema, and resolves the cron expressions of the five periodic jobs from the same variables whether the in-process cron, a Trigger.dev task or `GET /api/ops/schedule` asks.

## Why it exists

Feature packages must not parse environment variables themselves: a wrong value should be one error in one place (a schedule that cron cannot express throws at startup rather than silently running at a different frequency), and the Trigger.dev tasks (`src/trigger`) must derive exactly the same schedules as the API. Migrations live here because the rspack bundle cannot glob for files, so every migration is imported explicitly.

## How it works

- `src/config.ts` — `registerAs('config', ...)` (`NODE_ENV`, `DB_TYPE` default `postgres`, `IS_NOT_SLS`, `STAGE`, `REGION`, `SERVICE`) and `ConfigurationService` with getters such as `isProduction()`, `dbType()`, `openAIApiKey()`, `openAIModel()`, `openAIVisionPreviewModel()`, `openRouterApiKey()`, `aiScoringModel()`, `aiMatchThreshold()` (default 60), `langfusePublicKey()` / `langfuseSecretKey()` / `langfuseHost()`, `novuApiKey()`, `novuMatchNotifyThreshold()` (default 80), `sourceDbEnabled()`, `sourceDbMaxAgeHours()` (72), `triggerDevEnabled()`, `triggerSecretKey()`, `serviceApiToken()`, `localCronEnabled()`, `schedules()`, `schedulerTimezone()`, `crawlDefaultKeywords()`, `scorePendingLimit()`, `staleTaskTimeoutHours()`.
- `src/openai.ts` — `registerAs('openAI', ...)`: `OPENAI_API_KEY_CURRENT` or `OPENAI_API_KEY`, `OPENAI_ORGANIZATION_ID(_CURRENT)`, `OPENAI_MODEL(_CURRENT)`, `OPENAI_VISION_PREVIEW_MODEL` (default `gpt-4-vision-preview`), `OPENROUTER_API_KEY`, `AI_SCORING_MODEL` (default `openai/gpt-4o-mini`), `AI_MATCH_THRESHOLD`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` (default `https://cloud.langfuse.com`), `NOVU_API_KEY`, `NOVU_MATCH_NOTIFY_THRESHOLD`.
- `src/database.ts` — `Entities` (all `@packages/entities` classes), `coreSubscribers` (`EmployeeSubscriber`, `UserSubscriber`) and `TypeOrmConfigService.createTypeOrmOptions()`:
  - `DB_TYPE=sqljs`: embedded database persisted to `gauzy-ai.db` in the working directory;
  - `DB_TYPE=sqlite`: file given by `DB_PATH` (default `gauzy.sqlite3`);
  - `DB_TYPE=postgres`: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, optional TLS with `DB_SSL_MODE=true` and a base64 CA in `DB_CA_CERT`; `migrations: Migrations`, `migrationsRun` unless `DB_MIGRATIONS_RUN=false`, one transaction per migration, `uuidExtension: pgcrypto`.
  - On every type `synchronize` is on only with `DB_SYNCHRONIZE=true`; query logging goes to `ormlogs.log`.
- `src/schedules.ts` — pure functions, no Nest: `JobName` (`crawl`, `liveness-check`, `score-pending-matches`, `daily-digest`, `cleanup-stale-tasks`), `DEFAULT_SCHEDULES`, `everyMinutes()` (only intervals cron can express exactly), `positiveNumberVar()` / `positiveIntegerVar()`, `resolveSchedules(env)` (`*_CRON` wins over `*_INTERVAL_MINUTES`, then the default), `scheduleOf()`, `schedulerTimezone()`, `staleTaskTimeoutHours()`, `scorePendingLimit()`.
- `src/migrations/index.ts` — the ordered `Migrations` list: `InitialSchema` (baselines a database that already has the tables), `RenameLegacySearchCriteria` (`employee_upwork_jobs_search_criterion` → `job_search_criterion`), `BackfillTenantOwnership`, `AddMatchScoringAttempts`, `AddUserEmailLowerIndex`.

## Wiring

- `AppModule` loads `config` globally (`ConfigModule.forRoot({ isGlobal: true, load: [config] })`) and creates the connection with `TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService })`; feature modules that need the OpenAI/AI settings load `[config, openai]` themselves and provide `ConfigurationService`.
- `typeorm.config.ts` (root) builds the CLI data source from `Entities` and `Migrations` for `yarn migration:*`.
- Consumers of `schedules.ts`: `SchedulerService` (`@packages/ops`), the Trigger.dev tasks (`src/trigger/schedule.ts`) and `OpsController.schedule()`.
- Environment variables: those listed above plus the scheduling ones — `LOCAL_CRON_ENABLED`, `CRAWL_INTERVAL_MINUTES` / `CRAWL_CRON`, `LIVENESS_CHECK_INTERVAL_MINUTES` / `LIVENESS_CRON`, `SCORE_PENDING_CRON`, `SCORE_PENDING_LIMIT`, `DIGEST_CRON`, `CLEANUP_CRON`, `STALE_TASK_TIMEOUT_HOURS`, `SCHEDULER_TIMEZONE`, `CRAWL_DEFAULT_KEYWORDS`, `SERVICE_API_TOKEN`, `TRIGGER_DEV_ENABLED`, `TRIGGER_SECRET_KEY`, `SOURCE_DB_ENABLED`, `SOURCE_DB_MAX_AGE_HOURS` (see `.env.sample`).

## Using / extending

- New setting: add the variable to `.env.sample`, read it in `config.ts` or `openai.ts`, expose a getter on `ConfigurationService` (with its default) and inject the service instead of touching `process.env`.
- New migration: change the entity, run `yarn migration:generate:ephemeral <Name>` (or `yarn migration:generate <Name>` against your `DB_*`), add the generated class to `src/migrations/index.ts`, keep it idempotent. `yarn migration:run`, `migration:revert` and `migration:show` work on the CLI data source.
- New periodic job: add the `JobName`, a default in `DEFAULT_SCHEDULES` and its resolution in `resolveSchedules()`; then a runner in `SchedulerService` and a Trigger.dev task.

## Tests

`src/schedules.spec.ts` — `yarn test packages/config`. The migrations are verified by `yarn test:e2e:ephemeral` (`test/migrations.e2e-spec.ts`, embedded PostgreSQL) or `yarn test:e2e:migrations` against a database declared disposable with `DB_DISPOSABLE=true`.
