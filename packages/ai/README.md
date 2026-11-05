# @packages/ai

Folder: `packages/ai`. The AI functions of the platform: job ↔ employee match scoring, proposal and screening-answer generation (OpenRouter through the Vercel AI SDK, prompts from the registry), and screenshot analysis (OpenAI vision model) with upload and by-URL endpoints.

## What it does

- `AiScoringService.scoreMatch(jobPost, employee)` returns a structured score (0–100) with skills evidence, risk flags, budget fit, a recommended action and an explanation.
- `AiService.generateProposal(request)` writes a proposal from the employee's own template and the job details and, when the job has screening questions, answers them from the employee profile.
- `ImageAnalyzeService` tells whether screenshots show work-related activity, describes them and lists the applications visible, for uploaded files or for URLs the API downloads itself.

Each function is a capability plugin (`match-scoring`, `proposal-generation`, `screenshot-analysis`) and answers `503` when switched off.

## Why it exists

These are the paid, model-dependent steps of the pipeline. Keeping them behind three small services with typed outputs (zod schemas) lets matching, applications and the ops jobs call them without knowing which model or vendor is used, and lets a tenant bring its own OpenAI key for screenshot analysis.

## How it works

- `src/ai-scoring.service.ts` — `AiScoringService`: requires `OPENROUTER_API_KEY`; model `AI_SCORING_MODEL` (default `openai/gpt-4o-mini`); system prompt `job-match-scoring` from `PromptService`; user prompt built from the job post (title, type, compensation, skills, company, description) and the employee (`bio`, `skillsSummary` or the active search criteria, `experienceSummary`, `preferredRate`, `jobType`); `generateObject()` with `AiScoringResultSchema` (`src/ai-scoring-result.interface.ts`: `matchScore`, `skillsEvidence[]`, `riskFlags[]`, `budgetFit`, `recommendedAction`, `explanation`); telemetry via `promptTelemetry('job-match-scoring', prompt)`.
- `src/ai.service.ts` — `AiService.generateProposal(GenerateProposalRequest)` → `GenerateProposalResponse` (`src/generateProposalRequest.ts`, `src/generateProposalResponse.ts`): requires `OPENROUTER_API_KEY`; model `OPENAI_MODEL` (default `openai/gpt-4o`); converts the HTML template and job details to text, fills the `job-proposal` prompt (`existingTemplate`, `jobDetails`) and calls `generateText()`; when `qa` is given, `generateQAAnswers()` uses the `qa-answer-generation` system prompt with `generateObject()` and `AiQAResultSchema` (`src/ai-qa-result.interface.ts`) and returns the answers as a JSON string, falling back to the original `qa` on failure.
- `src/image-analyze.service.ts` — `ImageAnalyzeService.analyzeImages(files)` and `analyzeImageUrls(urls)`: resolve the request's OpenAI credentials once (`RequestContext.currentTenantApiKey()` → the tenant's `openAiSecretKey` / `openAiOrganizationId`, else the deployment's `OPENAI_API_KEY`), send each image as base64 to the vision model (`OPENAI_VISION_PREVIEW_MODEL`) through `OpenAIService.createChatCompletion()` and parse the JSON answer; a failed download or analysis yields `success: false` with the reason.
- `src/image-fetch.ts` — `fetchImage(url, options)`: `resolvePublicUrl()` + a pinned `GET` (`@packages/core/net/public-url`), image content types only, size cap `IMAGE_FETCH_MAX_BYTES` (default 10 MB) enforced while streaming, one deadline `IMAGE_FETCH_TIMEOUT_MS` (default 15 s) for resolution and download, redirects refused; `ImageFetchError`.
- `src/openai/openai.service.ts` — `OpenAIService`: lazy `openai` client from `OPENAI_API_KEY(_CURRENT)` / `OPENAI_ORGANIZATION_ID(_CURRENT)`, `createChatCompletion(prompt, options, role, messages, credentials?)` with a per-call client for request-scoped credentials; errors are logged and yield an empty answer.
- `src/image-analyze.controller.ts` — `ImageAnalyzeController` (`/api/image`): `POST /api/image/process` (multipart field `files`), `POST /api/image/process-urls` (`AnalyzeImageUrlsDto`: `urls`, 1–10 http(s) URLs).
- `src/ai.module.ts` — `AiModule` imports `PromptsModule`, provides the four services and the controller, exports `AiService`, `AiScoringService`, `OpenAIService`.

## Wiring

- `AppModule` imports `AiModule`; so do `CrawlerModule`, `EmployeeJobPostModule`, `EmployeeJobApplicationModule`, `AutomationTaskModule`, `OpsModule`.
- Callers: `EmployeeJobPostService.match()` / `rescoreMatch()` and `OpsService.scorePendingMatches()` (scoring); `EmployeeJobApplicationService.generateProposal()` (called by the application create command handler and the regeneration endpoints) and `EmployeeJobApplicationController` (`pre-process`) (proposals).
- Environment variables: `OPENROUTER_API_KEY`, `OPENAI_MODEL` / `OPENAI_MODEL_CURRENT`, `AI_SCORING_MODEL`, `OPENAI_API_KEY` / `OPENAI_API_KEY_CURRENT`, `OPENAI_ORGANIZATION_ID` / `OPENAI_ORGANIZATION_ID_CURRENT`, `OPENAI_VISION_PREVIEW_MODEL`, `IMAGE_FETCH_MAX_BYTES`, `IMAGE_FETCH_TIMEOUT_MS`; `GAUZY_AI_PLUGINS_DISABLED` for the three switches. `AI_MATCH_THRESHOLD` is applied by the matching code, not here.
- Endpoints: `POST /api/image/process`, `POST /api/image/process-urls` (tenant credential required).

## Using / extending

```bash
curl -X POST http://localhost:3005/api/image/process-urls -H "X-APP-ID: $APP_ID" -H "X-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" -d '{"urls":["https://storage.example.com/shot.png?token=..."]}'
```

- New AI function: a service in this package that takes `PromptService` and `ConfigurationService`, a prompt in `@packages/prompts`, a zod schema for the output, a `pluginEnabled()` gate and a `definePlugin` entry in `src/plugins.ts`.
- Change the model: `AI_SCORING_MODEL` (scoring) or `OPENAI_MODEL` (proposals) take OpenRouter model ids.

## Tests

`src/ai-scoring.service.spec.ts`, `src/ai.service.spec.ts` (QA generation, model routing, prompt content, defaults), `src/image-fetch.spec.ts` (address checks, pinned download, refused targets, limits, deadline) — run `yarn test packages/ai`.
