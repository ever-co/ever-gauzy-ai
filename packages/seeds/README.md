# @packages/seeds

Folder: `packages/seeds`. Database seeding for development and demos: sample employees with profiles and their job search criteria, run automatically on an empty database at start-up or on demand from the command line.

## What it does

`SeedDataService.run()` checks the database: with no employees it resets every table and seeds employees and criteria; with employees but no criteria it re-saves the employees and seeds the criteria; otherwise it does nothing. `runUpdate()` always re-applies the seed data. `yarn seed` and `yarn seed:update` bootstrap a small Nest application (`SeedAppModule`) to run them.

## Why it exists

A fresh checkout should produce matches within minutes: the crawler needs employees with criteria, and AI scoring needs profiles with skills and rates. The seed gives both without touching an integrating platform.

## How it works

- `src/seed.service.ts` — `SeedDataService`: reuses the application's TypeORM `DataSource` when one is initialized (so sql.js / SQLite seeding writes into the database the API reads), otherwise opens its own from `TypeOrmConfigService`; `run(isDefault)`, `runUpdate(isDefault)`, `seedData()` (calls `createEmployees()` from `@packages/employee/employee.seed` and `createJobSearchCriteria()`), `resetDatabase()` (`DELETE FROM` on sql.js / SQLite, `TRUNCATE … RESTART IDENTITY CASCADE` on PostgreSQL, for **every** entity table), `tryExecute()` logs a failing step and continues.
- `src/jobSearchCriteria.seed.ts` — `createJobSearchCriteria(connection)`: a map from employee name to criteria (`keyword`, `location`, `country`, `jobType`, `isRemote`, `hoursOld`) saved for the seeded employees.
- `src/seed.module.ts` — `SeedAppModule`: `ConfigModule`, `CqrsModule`, `TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService })`, `UserModule`, `EmployeeModule`, `EmployeeJobPostModule`, `JobPostModule`, `CrawlerModule`, `AiModule`; provides `SeedDataService`.
- `src/seed.ts`, `src/seed-update.ts` — CLI entry points (`NestFactory.create(SeedAppModule)` → `run(true)` / `runUpdate(true)` → exit); never import them.

## Wiring

- `AppModule` provides `SeedDataService`, and `AppService.onApplicationBootstrap()` (`src/app.service.ts`) calls `run(true)` at every start, so an empty database is seeded automatically; `SchemaModule` (`src/schema.module.ts`, used by `yarn sdk:generate`) provides it as well.
- Scripts (root `package.json`): `yarn seed` → `packages/seeds/src/seed.ts`, `yarn seed:update` → `packages/seeds/src/seed-update.ts`, both with `NODE_ENV=development` and the `DB_*` variables of your `.env`.
- No endpoints. Environment: the database variables from `@packages/config`; `NODE_ENV=production` only changes the log line, it does not prevent seeding.

## Using / extending

```bash
yarn seed          # empty database → employees + criteria; existing employees → criteria backfill only
yarn seed:update   # re-apply the seed data (resets the database first when it has no employees)
```

`resetDatabase()` truncates all tables: never run the seed against a database you care about. Add sample people in `packages/employee/src/employee.seed.ts` (give them `isActive: true` to have them crawled) and their criteria in `src/jobSearchCriteria.seed.ts`, keyed by `firstName lastName`.

## Tests

No spec files in this package.
