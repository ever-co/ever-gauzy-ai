# @packages/provider-upwork

Folder: `packages/job-providers/provider-upwork`. The `upwork` job source: job postings read through Upwork's official GraphQL API (`marketplaceJobPostingsSearch`) with OAuth2 credentials that belong to the tenant. Read-only: it never applies, messages or submits anything.

## What it does

For each unique employee search criterion with a `keyword`, `UpworkProvider` resolves the tenant's Upwork credentials (source configuration first, `UPWORK_*` variables as fallback), obtains or reuses an OAuth2 access token, runs the marketplace search with the keyword and optional job type, and maps every posting to a `JobPost` with `providerCode: 'upwork'` and `ingestedBy: 'upwork'`, hourly or fixed compensation, client information and the Upwork job URL. It is also the liveness verifier of every Upwork posting (also those Ever Jobs relayed): it asks the same API whether the posting is still open, and never requests upwork.com pages.

## Why it exists

Upwork is a first-class source for freelancers and its API gives structured budgets, client history and contract type that the generic boards do not. Credentials are per tenant (each organization uses its own Upwork application), and the provider must make that boundary impossible to cross.

## How it works

- `src/upwork.provider.ts` — `UpworkProvider` (`providerCode: 'upwork'`, `providerName: 'Upwork (official API)'`):
  - `isEnabled()` — always true: credentials are decided per tenant at search time, and a search without credentials returns `[]`;
  - `getJobs()` — `[]` (Upwork needs a search expression);
  - `getJobsForCriteria(criterion)` — `credentials(tenantId)`: `SourceConfigService.getConfigForSource('upwork', undefined, tenantId)` (`accessToken`, or `clientId` + `clientSecret`; `sourceOrgId` as organization), else the module configuration from `UPWORK_*`; then `accessToken()`: a pre-obtained token is used as is, otherwise a `client_credentials` token is requested from `UPWORK_TOKEN_URL` and cached until it expires, keyed by a hash of client id and secret so a changed secret never reuses a token; the search posts `UPWORK_SEARCH_QUERY` to `UPWORK_API_URL` with `searchExpression_eq = keyword`, `jobType_eq = HOURLY | FIXED` from `criterion.jobType`, `pagination.first = min(resultsWanted, 100)`, `Authorization: Bearer` and `X-Upwork-API-TenantId` when an organization id is known; each request has a deadline (`UPWORK_TIMEOUT_MS`, default 30 s); HTTP or GraphQL errors throw;
  - `canVerify(post)` — every post with `providerCode: 'upwork'`, whichever provider stored it (Upwork may only be asked through its API, so `EverJobsProvider` leaves these alone);
  - `verifyJob(url, post)` — posts `UPWORK_JOB_STATE_QUERY` (`marketplaceJobPosting(id)` → `workFlowState { status closeResult }`, the same "Read marketplace Job Postings" permission as the search) with the posting id: `providerJobId` for posts this provider stored, the id inside `upwork-upwork-<id>` for postings Ever Jobs relayed. `CLOSED` → closed (the reason names the close result: filled, closed without a contract, cancelled by Upwork, expired after 30 days without activity), `ACTIVE` → open. No URL is needed (a posting stored without `ciphertext` is checked by its id). Credentials: the first tenant of `post.tenantIds()` with an `upwork` source config of its own — on a request (`verifyJobLiveness`) only the requesting tenant, never another tenant's; in a background check (the liveness job) the tenants the post is matched for, of which `tenantIds('upwork')` offers only those with an active `upwork` config of their own carrying credentials (filtered before the limit, so a usable one is never crowded out) — else the tenant-less config / `UPWORK_*`. No posting id, no credentials, an HTTP / GraphQL error (a removed or private posting is reported as an error or as no posting), a timeout or an unknown state is no verdict (`verified: false`): the post keeps its `isExpired`. `url` is never fetched;
  - `map(node, criterion)` — `providerJobId = node.id`, `ingestedBy: 'upwork'`, URL from `ciphertext`, `jobStatus: 'Open'`, `isRemote: true`, category, duration, skills, `searchKeyword` / `searchJobType`; hourly postings get `compensationMin` / `compensationMax` (a minimum without a maximum stays open-ended) and a budget text such as `$30-$60/hr`; fixed postings get the amount in both bounds; client country, feedback, reviews, posted jobs, hires and payment verification.
- `src/upwork.module.ts` — `UpworkModule.register(config)` and `fromEnv(env)` (`UPWORK_API_URL`, `UPWORK_TOKEN_URL`, `UPWORK_RESULTS_WANTED`, `UPWORK_TIMEOUT_MS`, `UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET`, `UPWORK_ACCESS_TOKEN`, `UPWORK_ORGANIZATION_ID`); registers the `SourceConfig` repository and `SourceConfigService`; exports `UpworkProvider`.
- `src/upwork.plugin.ts` — `UpworkPlugin`: `kind: 'job-source'`, no `enabled` rule (always loadable), `imports: [UpworkModule.fromEnv()]`, `jobProviders: [UpworkProvider]`.

## Wiring

- Listed in `INSTALLED_PLUGINS` (`src/plugins.ts`); switch it off with `GAUZY_AI_PLUGINS_DISABLED=upwork`.
- Environment variables (fallback and global settings): `UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET`, `UPWORK_ACCESS_TOKEN`, `UPWORK_ORGANIZATION_ID`, `UPWORK_RESULTS_WANTED` (default 50, max 100), `UPWORK_TIMEOUT_MS`, `UPWORK_API_URL` (default `https://api.upwork.com/graphql`), `UPWORK_TOKEN_URL` (default `https://www.upwork.com/api/v3/oauth2/token`).
- Per-tenant credentials: a `source_config` row with `sourceCode: "upwork"` created through the `createSourceConfig` mutation (`@packages/sourceConfig`); secrets are masked in every response.
- No endpoints; Upwork postings are liveness-checked through `POST /api/crawler/liveness` (and the hourly liveness job) and the GraphQL mutation `verifyJobLiveness`, which reach `verifyJob()` through `JobPostService.checkLiveness()`.

## Using / extending

```graphql
mutation {
  createSourceConfig(input: { sourceCode: "upwork", auth: { grantType: "client_credentials", clientId: "…", clientSecret: "…" } }) { id }
}
```

Then give employees criteria with a `keyword` (and `jobType: "hourly"` or `"fixed"`); the next crawl searches Upwork for that tenant. To read more fields, extend `UPWORK_SEARCH_QUERY`, `UpworkJobNode` and `map()`. The provider takes an injectable `fetchFn` in its constructor for tests.

Use Upwork's API within its terms of service; this provider reads public postings only.

## Tests

`src/upwork.provider.spec.ts` (no credentials, token flow and mapping, open-ended hourly budgets, token cache per secret, source-config precedence, API errors, keyword required; liveness: `canVerify`, `ACTIVE` / `CLOSED`, relayed posting ids, tenant credential order, no verdict without id / credentials or on errors) — run `yarn test packages/job-providers/provider-upwork`.
