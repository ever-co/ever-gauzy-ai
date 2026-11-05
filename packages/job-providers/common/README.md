# @packages/core-providers

Folder: `packages/job-providers/common`. The contract between the crawler and the job sources: the `IJobProvider` interface, the `SearchCriterion` the crawler passes in, the `LivenessResult` a provider answers, and the injection token under which the providers are collected.

## What it does

Declares types only (`src/interfaces/job-provider.interface.ts`); there is no module, service or runtime code. Every job source implements `IJobProvider`, the plugin loader aggregates the implementations under `JOB_PROVIDERS_TOKEN`, and the crawler and the liveness check talk to them through this interface alone.

## Why it exists

The crawler must not know whether postings come from the Ever Jobs API, from Upwork's official API or from the local catalog, and a new source must not require changes to the crawler. A small, dependency-free package (it imports only the `JobPost` entity) can be depended on by the plugin loader, the crawler and every provider without cycles.

## How it works

- `IJobProvider`:
  - `providerCode` — stable lower-case identifier; the posts a provider stores carry it in `ingestedBy` (their `providerCode` column holds the source site, which can differ: Ever Jobs stores `linkedin`, `upwork`, …), and that picks the provider for a liveness check;
  - `providerName` — human-readable name for logs;
  - `isEnabled()` — whether the provider can fetch in this deployment (configuration present);
  - `getJobs()` — legacy entry point without criteria (the crawler calls it only when `getJobsForCriteria` is absent);
  - `getJobsForCriteria?(criterion)` — preferred: one call per unique employee search criterion;
  - `canVerify?(job)` — optional: whether the provider is the liveness verifier of this stored post; without it, a provider verifies the posts it stored that have a URL (`providerCode === (job.ingestedBy ?? job.providerCode)`); a provider that can verify without a URL (by id, through an API) claims such posts here. A provider that owns a site whatever channel stored the post claims it here (`UpworkProvider`: every `upwork` posting, official API only), and the others must not claim it;
  - `verifyJob?(jobUrl, job?)` — optional liveness check of a stored posting; `job` is the post (`LivenessJob`); `jobUrl` is `''` for a post without URL (only for a provider whose `canVerify` took it).
- `SearchCriterion` — `tenantId?`, `keyword?`, `location?`, `country?`, `jobType?`, `isRemote?`, `hoursOld?`. Derived by `CrawlerService.deduplicateCriteria()` from the `JobSearchCriterion` rows; `tenantId` tells the provider whose source credentials to use.
- `LivenessResult` — `{ isOpen: boolean; reason?: string; verified?: boolean }`; `verified: false` means no verdict (the stored `isExpired` is kept).
- `LivenessJob` — the stored post a check is about: `id`, `providerCode`, `providerJobId`, `ingestedBy`, `url` (`url` or `sourceUrl`) and `tenantIds()` (on demand; whose own source credentials an API-backed check may use: only the requesting tenant on a request — any tenant may ask about any post of the shared catalog, so never another tenant's — and the tenants the post is matched for in a background check; `tenantIds(sourceCode)` offers only matched tenants with an active source config of their own for that source carrying credentials, filtered before the limit).
- `JOB_PROVIDERS_TOKEN` — `'JOB_PROVIDERS'`.

## Wiring

- `PluginsModule.forRoot()` (`@packages/plugin`) provides `JOB_PROVIDERS_TOKEN` as the array of the enabled plugins' `jobProviders`.
- `CrawlerService` (`@packages/crawler`) and `JobPostService` (`@packages/jobPost`) inject it with `@Optional() @Inject(JOB_PROVIDERS_TOKEN)`.
- Implementations: `EverJobsProvider`, `UpworkProvider`, `SourceDbProvider` (see the sibling packages).
- No environment variables, no endpoints.

## Using / extending

```ts
import { IJobProvider, SearchCriterion } from '@packages/core-providers';

@Injectable()
export class AcmeProvider implements IJobProvider {
  readonly providerCode = 'acme';
  readonly providerName = 'Acme Jobs API';
  async isEnabled() { return true; }
  async getJobs() { return []; }
  async getJobsForCriteria(criterion: SearchCriterion) { /* call the API, map to JobPost */ }
}
```

Adding a field to `SearchCriterion` means adding it to the `JobSearchCriterion` entity, the crawler's dedup key and the providers that can use it. See `packages/job-providers/README.md` for the whole flow.

## Tests

No spec files (types only). The contract is exercised by `packages/plugin/src/plugin.registry.spec.ts` and `packages/crawler/src/crawler.service.spec.ts`.
