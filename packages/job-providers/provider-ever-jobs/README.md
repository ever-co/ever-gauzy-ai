# @packages/provider-ever-jobs

Folder: `packages/job-providers/provider-ever-jobs`. The `ever-jobs` job source: one provider that searches all the job boards the Ever Jobs API aggregates, maps its results to `JobPost` entities and verifies stored postings for the liveness check.

## What it does

For each unique employee search criterion the crawler hands over, `EverJobsProvider` builds an Ever Jobs search request (sites, keyword, location, country, remote flag, listing age), attaches the tenant's Upwork credentials when a source configuration exists, calls the Ever Jobs API through `@packages/ever-jobs-client` and maps every returned posting with `EverJobsMapperService` (`ingestedBy: 'ever-jobs'`). `verifyJob(url)` answers whether a stored posting it brought in is still reachable — every site except Upwork, whose postings are checked through Upwork's official API by the `upwork` provider.

## Why it exists

The Ever Jobs API already normalizes dozens of job boards and ATS platforms behind one endpoint; this provider turns that into Gauzy AI's own job-post catalog and keeps the mapping (which is pure and well tested) separate from the transport.

## How it works

- `src/ever-jobs.provider.ts` — `EverJobsProvider` (`providerCode: 'ever-jobs'`, `providerName: 'Ever Jobs API'`):
  - `isEnabled()` — true when the client is present;
  - `getJobsForCriteria(criterion)` — `buildSearchInput()` maps `EVER_JOBS_SITES` (validated against `EverJobsSite`) and `EVER_JOBS_RESULTS_WANTED` from the module configuration, then `keyword → searchTerm`, `location`, `country`, `isRemote`, `hoursOld`; descriptions are requested as Markdown; `attachSourceAuth()` loads `SourceConfigService.getConfigForSource('upwork', undefined, criterion.tenantId)` and, when it has a `clientId`, sends it as `auth.upwork` so the Ever Jobs service can query Upwork on the tenant's behalf; errors are logged and yield `[]`;
  - `getJobs()` — legacy: `getJobsForCriteria({})`;
  - `canVerify(post)` — the posts with a URL this provider stored (`ingestedBy: 'ever-jobs'`; a row without `ingestedBy` only when its `providerCode` is `ever-jobs`), whatever their site code, **except** Upwork postings (`providerCode: 'upwork'` or an upwork.com URL): those go to the `upwork` provider (official API only). So `JobPostService.checkLiveness()` sends a `linkedin` or `indeed` post stored by Ever Jobs here;
  - `verifyJob(url)` — one `HEAD` request through `resolvePublicUrl()` + `pinnedRequest()` (`@packages/core/net/public-url`): public addresses only, connection pinned to the validated address, redirects never followed, 10 s deadline. `404` / `410` → closed; a redirect whose target looks like a closed/expired/search page → closed; `2xx` → open. A refused URL, a network error, a redirect elsewhere or any other status is no verdict (`verified: false`, with the reason): the post keeps its `isExpired`. An upwork.com URL is never requested (no verdict).
  - Why not the Ever Jobs API's own liveness: its `?liveness=true` probe (gated by `EVER_JOBS_LIVENESS_ENABLED` on the Ever Jobs side) annotates the results of a fresh search only; there is no endpoint that verifies a stored posting.
- `src/ever-jobs-mapper.service.ts` — `EverJobsMapperService.mapMany()` / `mapOne(dto, searchKeyword)`: `providerCode = dto.site` (falls back to `ever-jobs`), `ingestedBy = 'ever-jobs'`, `providerJobId = <site>-<id>` or `<site>-<hash of jobUrl>`, title, description, `jobDateCreated`, URL, job type label, budget text and structured `compensation*` fields, location and country, company fields, skills, remote flag, ATS and listing metadata, `searchCategory = site`, `searchKeyword`. Postings without a title are skipped.
- `src/ever-jobs.module.ts` — `EverJobsModule.register(config)` / `registerAsync({ inject?, useFactory })` (`EverJobsProviderConfig`: `sites`, `resultsWanted`); registers the `SourceConfig` repository, `SourceConfigService`, the mapper and the provider; exports both.
- `src/ever-jobs.plugin.ts` — `EverJobsPlugin`: `kind: 'job-source'`, on when `EVER_JOBS_API_URL` is set; imports `EverJobsClientModule.registerAsync()` (`EVER_JOBS_API_URL`, `EVER_JOBS_API_KEY`, `EVER_JOBS_TIMEOUT` default 420000 ms) and `EverJobsModule.registerAsync()` (`EVER_JOBS_SITES`, `EVER_JOBS_RESULTS_WANTED` default 50).

Data flow: `SearchCriterion` → `EverJobsSearchInput` (+ tenant Upwork auth) → `EverJobsClientService.searchJobs()` → `EverJobsJobPost[]` → `EverJobsMapperService` → `JobPost[]` → crawler → `JobPostCreateCommand`.

## Wiring

- Listed first in `INSTALLED_PLUGINS` (`src/plugins.ts`), loaded by `PluginsModule.forRoot()` and aggregated under `JOB_PROVIDERS_TOKEN`.
- Environment variables: `EVER_JOBS_API_URL`, `EVER_JOBS_API_KEY`, `EVER_JOBS_TIMEOUT`, `EVER_JOBS_SITES` (comma-separated site codes; see `.env.sample` for the list), `EVER_JOBS_RESULTS_WANTED`.
- No endpoints of its own; the liveness check runs through `POST /api/crawler/liveness` (and the hourly liveness job) and the GraphQL mutation `verifyJobLiveness`, for every post with `ingestedBy: 'ever-jobs'` except Upwork postings.

## Using / extending

- Restrict the boards: `EVER_JOBS_SITES=linkedin,indeed,upwork`. Unknown codes are logged and skipped.
- Let Ever Jobs search Upwork for a tenant: create a source configuration with `sourceCode: "upwork"` (`createSourceConfig` mutation). Use either this forwarding or the `upwork` plugin per deployment, not both, to avoid duplicate postings.
- Map a new Ever Jobs field: add it to `EverJobsJobPost` (`@packages/ever-jobs-client`), the `JobPost` entity (+ migration) and `mapOne()`, with a case in the mapper spec.

## Tests

`src/ever-jobs-mapper.service.spec.ts` (field mapping, fallbacks, hash ids, null handling) and `src/ever-jobs.provider.liveness.spec.ts` (refused targets, pinned HEAD request, redirects, failures as no verdict, Upwork pages never requested, `canVerify`) — run `yarn test packages/job-providers/provider-ever-jobs`.
