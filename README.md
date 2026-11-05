# Ever Gauzy AI Platform

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Node 26](https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg)](.nvmrc)
[![CI](https://github.com/ever-co/ever-gauzy-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/ever-co/ever-gauzy-ai/actions/workflows/ci.yml)

## 🌟 What is it

[Ever® Gauzy AI™](https://gauzy.ai) — Open Business Services and Intelligence Platform

APIs and services that gather, analyze and act on business data for the Ever Gauzy ecosystem: job markets and integrations (Ever Jobs, Upwork's official API), AI matching and proposals, screenshot analysis, notifications and scheduling, with a plugin system and AI agents on top.

Ever® Gauzy AI™ Platform is a part of our larger Open Platform for **On-Demand and Sharing Economies** - [Ever® Platform™](https://ever.co).

Gauzy AI is a mini-platform: a set of APIs that wrap AI-related capabilities the [Ever® Gauzy™](https://github.com/ever-co/ever-gauzy) platform (and any other client) can use — job search across many sources, AI matching and scoring, proposal and screening-answer generation, screenshot analysis, notifications and scheduled background work — organized as [plugins](docs/plugins.md) and secured per tenant.

## ✨ Features

Main features:

-   Autonomous AI & Human Agents
-   Access to large volumes third-party data
-   Processing & Analyzing of large amounts of internal & external data
-   Crawling of large data from websites or APIs (e.g. Upwork API / RSS feeds, LinkedIn, etc.)
-   Search large amount of internal & external data

What the API does today:

-   **Job search**: per-employee search criteria run against every enabled job source — the [Ever Jobs API](https://github.com/ever-jobs/ever-jobs) (25+ job boards), Upwork through its official API, and previously stored posts — on a schedule or on demand
-   **AI matching and scoring**: every job ↔ employee match gets a 0–100 score with evidence, risk flags and a recommendation (OpenRouter / OpenAI through the Vercel AI SDK), with a minimum-rate rule for hourly work
-   **Proposals and screening answers**: AI-written from the person's own template and the job post, for the person to review and send
-   **Screenshot analysis**: work-relatedness and activity description of uploaded screenshots or screenshot URLs
-   **Notifications**: match alerts, application status, daily digests through [Novu](https://novu.co)
-   **Prompt registry and tracing**: prompts versioned in [Langfuse](https://langfuse.com) (built-in catalog as fallback), generations traced
-   **Multi-tenant API**: GraphQL (with subscriptions) and REST; what a tenant owns (people, search criteria, matches, applications, tasks, credentials) is scoped to that tenant, while the job-post catalog gathered from public sources is shared by all; Ever ID (OpenID Connect) for people, API keys for machines, a service token for schedulers
-   **Plugins**: job sources, AI functions, notifications, prompt registry and scheduling are plugins that can be switched per deployment (`GET /api/plugins`)

The Ever Gauzy AI Platform is used by the Ever Gauzy Platform via a special integration plugin.

## 🧱 Technology Stack

-   Node.js 26, TypeScript, [NestJS](https://nestjs.com) 12 (ESM), CQRS
-   GraphQL ([Apollo](https://www.apollographql.com), [nestjs-query](https://github.com/tripss/nestjs-query), graphql-ws subscriptions) and REST (OpenAPI/Swagger)
-   [TypeORM](https://typeorm.io) with migrations, PostgreSQL (sql.js / SQLite for local runs and tests)
-   [Vercel AI SDK](https://sdk.vercel.ai) with [OpenRouter](https://openrouter.ai) / OpenAI models; prompts and traces in [Langfuse](https://langfuse.com)
-   Ever ID (OpenID Connect) for users, per-tenant API keys for machines
-   [Novu](https://novu.co) notifications, [Trigger.dev](https://trigger.dev) or in-process cron for scheduled jobs
-   Docker / Kubernetes

## 🚀 Quick Start

Requirements: Node.js 26 (see `.nvmrc`), Yarn 1, PostgreSQL 16+ (or run on sql.js without a database server).

```bash
git clone https://github.com/ever-co/ever-gauzy-ai.git
cd ever-gauzy-ai
yarn install
cp .env.sample .env        # fill in what you use: database, AI keys, Langfuse, Novu, Ever ID …
createdb gauzy_ai          # PostgreSQL: the database named in DB_NAME must exist (migrations create the schema)
yarn start                 # http://localhost:3005 — GraphQL playground at /graphql, Swagger UI at /swg
```

Without a PostgreSQL server, set `DB_TYPE=sqljs` and `DB_SYNCHRONIZE=true` in `.env`: the API then uses an embedded sql.js database that is **persisted to `gauzy-ai.db`** in the working directory (delete the file to start over; it may contain the credentials you configure, keep it out of version control). On PostgreSQL the schema is created and upgraded by migrations at startup (`DB_MIGRATIONS_RUN=true`).

Nothing works without credentials for the capabilities you want: an **OpenRouter** key (`OPENROUTER_API_KEY`) for match scoring and proposal generation, an **OpenAI** key (`OPENAI_API_KEY`, or the tenant's own) for screenshot analysis, the Ever Jobs API URL and/or Upwork API credentials for job search, Langfuse keys for the prompt registry (optional), a Novu key for notifications (optional). `GET /api/plugins` shows what a running instance has enabled and why.

### Authentication

Every request needs a credential (see [docs/authentication.md](docs/authentication.md)): a tenant API key (`X-APP-ID` / `X-API-KEY`) for machines, an Ever ID (OpenID Connect) token for people, or the service token (`X-SERVICE-TOKEN`) for schedulers calling `/api/ops/*`. `IS_DISABLE_AUTH=true` turns authentication off for local development only.

### Database migrations (PostgreSQL)

After changing an entity:

```bash
yarn migration:generate:ephemeral <Name>   # apply the existing migrations to a disposable embedded PostgreSQL, then diff the entities
yarn test:e2e:ephemeral                    # migrations + entity/schema parity on an empty database
```

then add the generated file to `packages/config/src/migrations/index.ts`. See [docs/architecture.md](docs/architecture.md#schema-management).

### Prompts

```bash
yarn prompts:seed            # load the prompt catalog into your Langfuse project (creates / updates `production` versions)
yarn prompts:seed --check    # report drift only
```

## 🧩 Documentation

-   [Architecture](docs/architecture.md) — system landscape, packages, request lifecycle, scheduling, database, plugins
-   [Plugins](docs/plugins.md) — how capabilities are packaged, built-in plugins, writing a job source, the Upwork plugin
-   [Authentication & Authorization](docs/authentication.md) — credentials, pipeline, tenant isolation
-   [API Reference](docs/api-reference.md) — REST and GraphQL
-   [AI & Automation](docs/ai-and-automation.md) — scoring, proposals, prompts, notifications, scheduling
-   [Source Integration](docs/source-integration.md) — job sources and per-tenant source credentials
-   [Data Model](docs/data-model.md), [Novu setup](docs/novu-setup.md)

## 🛠 Development

```bash
yarn lint                  # ESLint
npx tsc -p tsconfig.spec.json --noEmit
yarn test                  # unit tests (Jest)
yarn test:e2e:ephemeral    # migration tests on an embedded PostgreSQL
yarn build                 # rspack bundle → dist/main.js
```

Swagger UI of the running API: http://localhost:3005/swg (standalone generator: `yarn ts-node src/swagger.ts`, then http://localhost:3006/api). GraphQL client SDK: `yarn sdk:generate` (output in `./sdk`).

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## ⚖️ Responsible use

Gauzy AI reads job postings only through **official APIs or feeds** of the respective platforms (the Ever Jobs API, Upwork's public API with the tenant's own credentials). It does not scrape sites behind a login, does not submit applications or messages on anyone's behalf and does not circumvent rate limits or access controls. Proposals and answers are generated for the **person** to review and send through the platform's own interface. Operators are responsible for using each platform's API within its terms of service and for the data they process.

## 💌 Contact Us

-   [Ever.co Website Contact Us page](https://ever.co/contacts)
-   [Slack Community](https://join.slack.com/t/gauzy/shared_invite/enQtNzc5MTA5MDUwODg2LTI0MGEwYTlmNWFlNzQzMzBlOWExNTk0NzAyY2IwYWYwMzZjMTliYjMwNDI3NTJmYmM4MDQ4NDliMDNiNDY1NWU)
-   [Discord Chat](https://discord.gg/hKQfn4j)
-   For business inquiries: <mailto:gauzy@ever.co>
-   Please report security vulnerabilities to <mailto:security@ever.co> (see [SECURITY.md](SECURITY.md))
-   [Gauzy Platform @ Twitter](https://twitter.com/gauzyplatform)
-   [Gauzy Platform @ Facebook](https://www.facebook.com/gauzyplatform)

## 🔐 Security

Ever® Gauzy AI™ follows good security practices, but 100% security cannot be guaranteed in any software!
Ever® Gauzy AI™ is provided AS IS without any warranty. Use at your own risk!
See more details in the [LICENSE](LICENSE).

In a production setup, all client-side to server-side (backend, APIs) communications should be encrypted using HTTPS/WSS/SSL (REST APIs, GraphQL endpoint, WebSockets, etc.).

If you discover any issue regarding security, please disclose the information responsibly by sending an email to <mailto:security@ever.co> and not by creating a GitHub issue. See [SECURITY.md](SECURITY.md).

## 📄 License

This software is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). Copyright © 2020-present, [Ever Co. LTD](https://ever.co).

## ™️ Trademarks

**Ever**® is a registered trademark of [Ever Co. LTD](https://ever.co).
**Ever® Demand™**, **Ever® Gauzy™**, **Ever® Gauzy AI™** and **Ever® OpenSaaS™** are all trademarks of [Ever Co. LTD](https://ever.co).

The trademarks may only be used with the written permission of Ever Co. LTD. and may not be used to promote or otherwise market competitive products or services.

All other brand and product names are trademarks, registered trademarks or service marks of their respective holders.

## ©️ Copyright

#### Copyright © 2020-present, Ever Co. LTD. All rights reserved
