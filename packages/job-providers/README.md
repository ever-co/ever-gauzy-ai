# Job providers

Folder: `packages/job-providers`. The job sources of the platform: the provider contract every source implements (`common`) and the three built-in providers — the Ever Jobs API, Upwork's official API and the local catalog of stored posts.

| Package | Alias | Provider | `providerCode` |
| --- | --- | --- | --- |
| [`common`](common/README.md) | `@packages/core-providers` | the `IJobProvider` contract, `SearchCriterion`, `LivenessResult`, `JOB_PROVIDERS_TOKEN` | — |
| [`provider-ever-jobs`](provider-ever-jobs/README.md) | `@packages/provider-ever-jobs` | `EverJobsProvider`: job postings from the job boards the Ever Jobs API aggregates | `ever-jobs` (stored posts get the site code, for example `linkedin`, and `ingestedBy: 'ever-jobs'`) |
| [`provider-upwork`](provider-upwork/README.md) | `@packages/provider-upwork` | `UpworkProvider`: Upwork job postings through Upwork's official GraphQL API with the tenant's own credentials; the liveness verifier of every Upwork posting | `upwork` |
| [`provider-db`](provider-db/README.md) | `@packages/provider-db` | `SourceDbProvider`: recently stored posts fed back into the crawl, re-matched against employees whose criteria or profile changed since (`JobPostUpdatedEvent` → `EmployeeJobPostService.rematch()`), so new criteria get matches among them | `source-db` |

## The contract

```ts
interface IJobProvider {
  readonly providerCode: string;   // 'ever-jobs', 'upwork', 'source-db'
  readonly providerName: string;
  isEnabled(): Promise<boolean>;   // configured for this crawl?
  getJobs(): Promise<JobPost[]>;   // legacy, criteria-less entry point
  getJobsForCriteria?(criterion: SearchCriterion): Promise<JobPost[]>; // preferred
  canVerify?(job: LivenessJob): boolean;                               // is it this post's verifier?
  verifyJob?(jobUrl: string, job?: LivenessJob): Promise<LivenessResult>; // liveness check
}
```

- `SearchCriterion` is what the crawler derives from one unique `JobSearchCriterion`: `tenantId`, `keyword`, `location`, `country`, `jobType` (`hourly` / `fixed`), `isRemote`, `hoursOld`. The `tenantId` matters: a provider resolves **that tenant's** source credentials and never another tenant's.
- A provider returns `JobPost` entities (`@packages/entities`) with at least `providerCode`, `providerJobId` and `title`, and sets `ingestedBy` to its own `providerCode`; the pair (`providerCode`, `providerJobId`) is the unique key of the `job_post` table and what the crawler uses to remove duplicates. `providerCode` names the source site, `ingestedBy` the channel the post came through: Ever Jobs stores `linkedin`, `indeed`, … and also `upwork` posts, all with `ingestedBy: 'ever-jobs'`.
- Liveness: `JobPostService.checkLiveness()` hands a stored post to the first provider with `verifyJob()` whose `canVerify(post)` is true; a provider without `canVerify` verifies the posts it stored (`providerCode === ingestedBy`, or the post's `providerCode` for rows without `ingestedBy`). Today:

  | Post | Verifier | How |
  | --- | --- | --- |
  | `providerCode: 'upwork'` (stored by the Upwork provider or by Ever Jobs) | `UpworkProvider` | official GraphQL API, `marketplaceJobPosting(id)` → `workFlowState.status` (`ACTIVE` / `CLOSED`), by id (no URL needed); credentials: on a request only the requesting tenant's own, in a background check a matched tenant's own (only matched tenants with a usable `upwork` config are offered), else the deployment-wide ones; upwork.com is never requested |
  | any other site stored by Ever Jobs (`ingestedBy: 'ever-jobs'`), with a URL | `EverJobsProvider` | one pinned `HEAD` request to the stored URL (public addresses only, no redirect followed) |
  | no `ingestedBy` and a code no provider has (created through the API), `source-db`, or no URL for a URL-based check | none | — |

  `verifyJob()` answers `{ isOpen, reason?, verified? }`: `verified: false` (no verdict: refused URL, network error, unreadable answer, no credentials), an error or no verifier leave `isExpired` as it is and only stamp `expiryCheckedAt`; a failure never closes a job. The Ever Jobs API's own liveness probe (`?liveness=true`, `EVER_JOBS_LIVENESS_ENABLED`) only annotates fresh search results and has no endpoint for a stored posting, so it is not used here.
- `JOB_PROVIDERS_TOKEN` (`'JOB_PROVIDERS'`) is the injection token under which `PluginsModule` (`@packages/plugin`) aggregates the providers of the enabled job-source plugins; `CrawlerService` and `JobPostService` inject it.

## Data flow

```
JobSearchCriterion rows ─► CrawlerService.crawl() ─► provider.getJobsForCriteria(criterion)
   ─► JobPost[] ─► JobPostCreateCommand ─► job_post upsert
   ─► JobPostCreatedEvent (new posts) ─► MatchJobPostsToEmployeesCommand ─► EmployeeJobPostService.match() (AI scoring, Novu)
   ─► JobPostUpdatedEvent (known posts, incl. source-db) ─► MatchJobPostsToEmployeesCommand({ existing: true })
         ─► EmployeeJobPostService.rematch() (only employees whose criteria or profile changed since)
```

Either way an employee ↔ post pair gets at most one `EmployeeJobPost` (existence check, then an insert with `ON CONFLICT DO NOTHING` on the unique index of `employeeId` + `jobPostId`).

## Per-tenant source configuration

Credentials for a source are stored per tenant in `source_config` (`@packages/sourceConfig`, GraphQL `createSourceConfig` with `sourceCode: "upwork"`). Providers call `SourceConfigService.getConfigForSource(sourceCode, sourceOrgId?, tenantId)`, which returns the tenant's own configuration first, then a tenant-less deployment-wide one, never another tenant's. The `UPWORK_*` variables are the fallback for the Upwork provider; the Ever Jobs provider forwards the same Upwork configuration to the Ever Jobs API.

## Adding a provider

1. Create `packages/job-providers/provider-<name>/` with `index.ts`, `src/<name>.provider.ts` (implements `IJobProvider`), `src/<name>.module.ts` (`register()` / `fromEnv()`) and `src/<name>.plugin.ts` (`definePlugin({ kind: 'job-source', imports, jobProviders, enabled })`).
2. Add the `@packages/provider-<name>` aliases to `tsconfig.json`, `package.json` (`jest.moduleNameMapper`) and `test/jest-e2e.json`.
3. Append the plugin to `INSTALLED_PLUGINS` in `src/plugins.ts`.
4. Unit-test the provider with an injected HTTP function (see `provider-upwork/src/upwork.provider.spec.ts`).

Only official APIs or feeds, within their terms of service; a provider reads postings and nothing else.

## Tests

`yarn test packages/job-providers` runs the specs of all three providers; the routing between them is covered by `packages/job-post/src/jobPost.service.spec.ts`.
