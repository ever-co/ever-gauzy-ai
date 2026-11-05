# Ever Gauzy AI — Documentation Index

**Ever® Gauzy AI™ — Open Business Services and Intelligence Platform**

APIs and services that gather, analyze and act on business data for the Ever Gauzy ecosystem: job markets and integrations (Ever Jobs, Upwork's official API), AI matching and proposals, screenshot analysis, notifications and scheduling, with a plugin system and AI agents on top.

Welcome to the Ever Gauzy AI documentation. Contributing? See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md). Start with the [Architecture Overview](./architecture.md) for the big picture, then dive into specific topics below.

---

## Core Documentation

| Document                                                       | Description                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [**Architecture Overview**](./architecture.md)                 | System landscape, technology stack, module map, request lifecycle, CQRS patterns, scheduling, deployment |
| [**Authentication & Authorization**](./authentication.md)      | Dual auth methods (API Key/Secret + JWT Bearer), auth pipeline, security features, config switches       |
| [**Data Model Reference**](./data-model.md)                    | All database entities, ER diagram, column details, relationships, base classes, multi-tenancy model      |
| [**API Reference**](./api-reference.md)                        | All REST + GraphQL endpoints, request/response shapes, status codes, Swagger                             |
| [**Source Integration & Job Search**](./source-integration.md) | End-to-end job search flow, provider architecture, source config API, Upwork auth deep dive              |
| [**Plugins**](./plugins.md)                                    | How capabilities are packaged and loaded, built-in plugins, switching them off, writing a job source, the Upwork plugin |
| [**AI & Automation**](./ai-and-automation.md)                  | GPT-4 proposal generation, automation task system, CQRS command queue, job application pipeline          |

