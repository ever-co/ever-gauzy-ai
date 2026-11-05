# @packages/plugin

Folder: `packages/plugin`. The plugin contract of the platform: how a capability (job source, AI function, notifications, prompt registry, scheduling) describes itself, how the enabled ones are loaded at startup, how any of them is switched off per deployment, and the endpoint that reports the result.

## What it does

`definePlugin()` describes a plugin (name, kind, environment variables, NestJS modules, job providers, an `enabled(env)` rule). `PluginsModule.forRoot()` resolves the list from `src/plugins.ts`, imports the modules of the enabled plugins, aggregates their `IJobProvider`s under `JOB_PROVIDERS_TOKEN` for the crawler and keeps the decisions in `PluginRegistry`, which `GET /api/plugins` exposes and which the capability implementations consult.

## Why it exists

Job sources, AI functions, notifications and scheduling are optional per deployment and depend on credentials. One list and one switch (`GAUZY_AI_PLUGINS_DISABLED`) let an operator see and control what a running instance can do without code changes, and let a disabled job source stay out of the application entirely.

## How it works

- `src/plugin.interface.ts` — `GauzyAiPlugin`, `PluginKind` (`job-source`, `ai`, `notifications`, `observability`, `scheduling`, `integration`), `definePlugin()`, `resolvePlugins(plugins, env)` (the `GAUZY_AI_PLUGINS_DISABLED` override first, then the plugin's own `enabled(env)`, default on; a duplicate name throws), `ResolvedPlugin`, `PluginStatus`, the tokens `PLUGINS_TOKEN` / `PLUGINS_DISABLED_ENV`, the names of the built-in capabilities `CAPABILITY_PLUGINS` (`match-scoring`, `proposal-generation`, `screenshot-analysis`, `langfuse`, `novu`, `trigger-dev`), and `pluginEnabled(registry, name)` — true unless a registry is present and says otherwise, so services constructed without one (unit tests) keep everything on.
- `src/plugin.registry.ts` — `PluginsModule.forRoot(plugins, env?)`: a global dynamic module that logs each decision, imports the `imports` of the enabled plugins, provides `PLUGINS_TOKEN`, `PluginRegistry` and the `JOB_PROVIDERS_TOKEN` factory (the enabled plugins' `jobProviders` classes, resolved from their modules).
- `src/plugin-registry.service.ts` — `PluginRegistry.list()`, `enabled()`, `isEnabled(name)`.
- `src/plugins.controller.ts` — `PluginsController`: `GET /api/plugins` (`@Public()` + `ServiceTokenGuard`: service token or any tenant credential) returns the `PluginStatus` list with `enabled` and `reason`.
- `src/external-scheduler.guard.ts` — `ExternalSchedulerGuard`: a callback that carries `X-Scheduler: trigger-dev` is refused with 409 when the `trigger-dev` plugin is off, so schedules still deployed on Trigger.dev workers cannot duplicate the in-process jobs. It is applied on `OpsController` (`/api/ops/*`) and `CrawlerController` (`/api/crawler/*`) only; tenant endpoints such as `/api/employee/job/application/process` do not use it.

How capability plugins are enforced: job-source plugins contribute providers and are simply not loaded when off; capability plugins describe modules `AppModule` wires directly, so their implementations check the switch themselves — `AiService`, `AiScoringService`, `ImageAnalyzeService` answer 503, `NovuService.isEnabled()` is false, `PromptService` stays in catalog mode, `TriggerService` does not configure the SDK and `SchedulerService` runs the jobs itself, `OpsService.scorePendingMatches()` refuses before claiming anything. Each of them injects `PluginRegistry` as `@Optional()` and calls `pluginEnabled()`.

## Wiring

- `src/plugins.ts` — `INSTALLED_PLUGINS`: `EverJobsPlugin`, `UpworkPlugin`, `SourceDbPlugin` (job sources) and the capability descriptors; `AppModule` imports `PluginsModule.forRoot(INSTALLED_PLUGINS)`.
- `JOB_PROVIDERS_TOKEN` (defined in `@packages/core-providers`) is injected by `CrawlerService` and `JobPostService`.
- Environment variable: `GAUZY_AI_PLUGINS_DISABLED` (comma-separated names, case-insensitive). The tracer in `src/utils/tracer.ts` reads it too, to switch the Langfuse exporter off before the application starts.
- Endpoint: `GET /api/plugins`.

## Using / extending

- A job source: implement `IJobProvider` in `packages/job-providers/provider-<name>/`, export it from a module, describe it with `definePlugin({ kind: 'job-source', imports: [...], jobProviders: [...] , enabled })` and append it to `INSTALLED_PLUGINS`.
- A capability: write the module, import it in `AppModule`, add a `definePlugin` entry (no `jobProviders`) with an `enabled(env)` rule that reflects its configuration, and gate the implementation with `pluginEnabled(this.plugins, '<name>')`.
- Switch plugins off: `GAUZY_AI_PLUGINS_DISABLED=upwork,source-db`; check with `curl -H "X-SERVICE-TOKEN: $SERVICE_API_TOKEN" http://localhost:3005/api/plugins`.

See `docs/plugins.md` for the full guide.

## Tests

`src/plugin.registry.spec.ts` (resolution, loading, provider aggregation, `pluginEnabled`), `src/external-scheduler.guard.spec.ts` — run `yarn test packages/plugin`.
