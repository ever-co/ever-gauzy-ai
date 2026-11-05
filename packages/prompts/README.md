# @packages/prompts

Folder: `packages/prompts`. The prompt registry of the AI functions: prompts are versioned in Langfuse and fetched at runtime, with the built-in catalog as the fallback so the platform works without Langfuse credentials.

## What it does

`PromptService.get(name, variables)` returns the text of a prompt with its `{{variables}}` filled in, from the Langfuse project when it is configured and reachable, otherwise from `catalog.ts`. The result carries where it came from and, for Langfuse prompts, the version and the reference that links AI SDK traces to that prompt version.

## Why it exists

Prompt wording changes more often than code. Keeping prompts in Langfuse lets them be edited and versioned without a deployment (the `production` label is what runs), while the catalog guarantees a working default, seeds the Langfuse project and documents every prompt the platform uses.

## How it works

- `src/catalog.ts` — `PROMPT_NAMES` (`job-proposal`, `qa-answer-generation`, `job-match-scoring`), `PROMPT_CATALOG` (`PromptDefinition`: name, description, `usedBy`, variables, text), `catalogPrompt(name)` and `compileTemplate(text, variables)` (Langfuse `{{name}}` syntax; unknown placeholders are left as is).
- `src/prompt.service.ts` — `PromptService`: creates a `Langfuse` client when `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set (`LANGFUSE_HOST` as base URL); `isLangfuseEnabled()` is false without keys or when the `langfuse` plugin is switched off; `get()` tries `langfuse.getPrompt(name)` (SDK cache, `production` label) and falls back to the catalog on any error or missing prompt; an unknown name throws; `shutdown()` flushes pending events.
- `src/telemetry.ts` — `promptTelemetry(functionId, prompt)` builds the `experimental_telemetry` settings for a Vercel AI SDK call: the function id names the generation in traces and `metadata.langfusePrompt` links it to the prompt version.
- `src/prompts.module.ts` — `PromptsModule` loads the `config` and `openai` configuration and exports `PromptService`.

The `ResolvedPrompt` shape: `{ name, text, source: 'langfuse' | 'catalog', version?, langfusePrompt? }`.

## Wiring

- `AiModule` (`@packages/ai`) imports `PromptsModule`; `AiService` uses `job-proposal` and `qa-answer-generation`, `AiScoringService` uses `job-match-scoring`.
- Environment variables: `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`. `LANGFUSE_TRACING_ENABLED` is read by the tracer (`src/utils/tracer.ts`), which exports AI generations to Langfuse whenever the keys are set unless it is `false`.
- The `langfuse` entry of `src/plugins.ts` reports the mode in `GET /api/plugins` ("catalog mode" when keys are missing).
- No endpoints.

## Using / extending

- Seed or update the Langfuse project from the catalog: `yarn prompts:seed` (creates missing prompts, updates the ones whose `production` text differs) or `yarn prompts:seed --check` (report only; `scripts/seed-prompts.ts`).
- Add a prompt: a new entry in `PROMPT_NAMES` and `PROMPT_CATALOG`, then `const p = await this.prompts.get(PROMPT_NAMES.x, { var: value })` and pass `p.text` to `generateText` / `generateObject` with `experimental_telemetry: promptTelemetry('<function-id>', p)`.
- Prompts edited in Langfuse take effect without a deployment; keep the catalog in sync so the fallback stays meaningful.

## Tests

`src/prompt.service.spec.ts` (catalog mode, Langfuse mode with the telemetry link, plugin switch, fallback on failure) — run `yarn test packages/prompts`.
