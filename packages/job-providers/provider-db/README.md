# @packages/provider-db

Folder: `packages/job-providers/provider-db`. The `source-db` job source: job posts already stored in the Gauzy AI database, offered back to the crawler as if they had just been fetched, without any external request.

## What it does

When `SOURCE_DB_ENABLED=true`, `SourceDbProvider` returns the active, non-expired job posts created within the last `SOURCE_DB_MAX_AGE_HOURS` (default 72), newest first, at most 200 per crawl. They travel through the same `JobPostCreateCommand` as every other result; because the rows already exist, the handler updates them in place and publishes them in `JobPostUpdatedEvent`, which re-matches them against the employees whose criteria or profile changed since.

## Why it exists

The intent (see the comment in `source-db.provider.ts`) is "blending": a posting found by one employee's criteria could match other employees whose criteria differ, without fetching it again. Treating the local catalog as a source is a cheap switch for that.

How the pipeline does it: `JobPostCreateCommandHandler` (`@packages/jobPost`) publishes `JobPostCreatedEvent` with the newly inserted posts (matched against every employee by `EmployeeJobPostService.match()`) and `JobPostUpdatedEvent` with the posts that already existed — the ones this provider returns, and those a live provider finds again. The saga sends the latter to `EmployeeJobPostService.rematch()`, which matches a post against an employee only when the employee or one of their criteria was created or updated after the post was stored, and only once per version of those inputs (whichever crawl brings the post). So a criterion added today gets the matching posts of the last `SOURCE_DB_MAX_AGE_HOURS`, while a pair that AI scoring rejected is not scored again on every crawl (the provider re-offers the same posts every 10 minutes by default). A pair that already has a match is skipped, and the unique index on `employee_job_post` (`employeeId`, `jobPostId`) rules out duplicates.

## How it works

- `src/source-db.provider.ts` — `SourceDbProvider` (`providerCode: 'source-db'`, `providerName: 'Local Database Cache'`): `isEnabled()` returns `config.enabled`; `getJobs()` runs a query builder on `JobPost` (`isActive = true`, `createdAt > now - maxAgeHours`, `isExpired IS NULL OR false`, order by `createdAt DESC`, limit 200) and returns `[]` on a database error. It does not implement `getJobsForCriteria`, so the crawler calls `getJobs()` once per crawl. `SOURCE_DB_CONFIG` is the injection token of `SourceDbProviderConfig` (`enabled`, `maxAgeHours`).
- `src/source-db.module.ts` — `SourceDbModule.registerAsync({ inject?, useFactory })` registers the `JobPost` repository, the config and the provider; exports `SourceDbProvider`.
- `src/source-db.plugin.ts` — `SourceDbPlugin = definePlugin({ name: 'source-db', kind: 'job-source', env: ['SOURCE_DB_ENABLED', 'SOURCE_DB_MAX_AGE_HOURS'], enabled: SOURCE_DB_ENABLED === 'true', imports: [SourceDbModule.registerAsync(...)], jobProviders: [SourceDbProvider] })`.

The posts keep their original `providerCode` (`linkedin`, `upwork`, …) and `ingestedBy` (`ever-jobs`, `upwork`): `source-db` never appears on stored rows. Liveness checks are unaffected by this provider, which has no `verifyJob()`: `JobPostService.checkLiveness()` sends a re-served post to the verifier of the channel it originally came through (`EverJobsProvider`, or `UpworkProvider` for Upwork postings).

## Wiring

- Listed in `INSTALLED_PLUGINS` (`src/plugins.ts`); loaded by `PluginsModule.forRoot()` only when `SOURCE_DB_ENABLED=true`, then aggregated under `JOB_PROVIDERS_TOKEN` for `CrawlerService`.
- Environment variables: `SOURCE_DB_ENABLED` (default off), `SOURCE_DB_MAX_AGE_HOURS` (default 72). `ConfigurationService.sourceDbEnabled()` / `sourceDbMaxAgeHours()` expose the same values.
- No endpoints.

## Using / extending

Set `SOURCE_DB_ENABLED=true` (and optionally `SOURCE_DB_MAX_AGE_HOURS=24`) and check `GET /api/plugins`. Each crawl then re-offers up to 200 recent posts; the re-match pass only costs AI calls for pairs not yet evaluated against the employee's current criteria and profile (it reads the stored rows and skips inactive, archived and expired posts). That bookkeeping lives in memory, so after a restart the posts stored before an employee's last change are evaluated once more.

## Tests

`src/source-db.provider.spec.ts` (codes, enabled flag, query predicates, cutoff date, cap, error handling) — run `yarn test packages/job-providers/provider-db`. Re-matching of the posts it returns: `packages/employee-job-post/src/employeeJobPost.rematch.spec.ts`.
