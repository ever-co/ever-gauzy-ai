# Contributing to Ever Gauzy AI

Thank you for considering a contribution. Ever Gauzy AI is part of the [Ever® Platform™](https://ever.co) and is developed in the open under the AGPL-3.0 license.

## Before you start

-   Search the [issues](https://github.com/ever-co/ever-gauzy-ai/issues) first; open one for anything larger than a small fix so we can agree on the approach.
-   Read the [architecture](docs/architecture.md) and, for new capabilities, the [plugins](docs/plugins.md) guide: job sources, AI functions, notifications and integrations are plugins.
-   Security problems go to <security@ever.co>, not to the issue tracker (see [SECURITY.md](SECURITY.md)).

## Development setup

```bash
git clone https://github.com/ever-co/ever-gauzy-ai.git
cd ever-gauzy-ai
yarn install                # Node.js 26 (.nvmrc), Yarn 1
cp .env.sample .env
createdb gauzy_ai           # PostgreSQL: the database named in DB_NAME must exist; migrations create the schema
yarn start                  # http://localhost:3005 (Swagger UI at /swg)
```

No PostgreSQL at hand? `DB_TYPE=sqljs DB_SYNCHRONIZE=true` runs on an embedded sql.js database persisted to `gauzy-ai.db` in the working directory (git-ignored; delete it to reset — it keeps whatever credentials you configured).

## Checks every change must pass

```bash
yarn lint                               # ESLint (0 errors)
npx tsc -p tsconfig.spec.json --noEmit  # types
yarn test                               # unit tests
yarn test:e2e:ephemeral                 # migration tests (embedded PostgreSQL)
npx cspell "**/*.{ts,md}"               # spelling
yarn build                              # bundle
```

CI runs the same on every pull request.

## Guidelines

-   **Tenant isolation is not optional.** Every lookup of tenant data goes through the tenant-scoped services / hooks (`currentTenantWhere()`, `@Authorize(TenantAuthorizer)`); cross-tenant work only behind the service token (`/api/ops/*`).
-   **Never log or commit credentials.** `.env` is ignored; `.env.sample` documents variables with empty values.
-   **Database changes ship with a migration** (`yarn migration:generate:ephemeral <Name>`, add it to `packages/config/src/migrations/index.ts`). Migrations after the baseline must be idempotent (`IF NOT EXISTS`).
-   **Prompts live in the catalog** (`packages/prompts/src/catalog.ts`) and are seeded to Langfuse; do not inline prompt text in services.
-   **Job sources use official APIs or feeds** within the platform's terms; a provider reads postings, it never applies, messages or scrapes behind a login.
-   **Tests**: unit tests next to the code (`*.spec.ts`), mocked HTTP for providers, migration behaviour in `test/migrations.e2e-spec.ts`.
-   **Style**: Prettier/ESLint defaults of the repository (tabs), British or American spelling is fine (cspell dictionary in `.cspell.json`).

## Pull requests

-   One topic per PR, with a description of *why* and *what*, and how it was verified.
-   Keep the PR green (lint, types, tests, build) and respond to review comments; automated review runs on every PR.
-   Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
-   By contributing you agree that your contribution is licensed under the AGPL-3.0 like the rest of the project.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
