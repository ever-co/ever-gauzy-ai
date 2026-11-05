# @packages/ever-jobs-client

Folder: `packages/ever-jobs-client`. The HTTP client for the Ever Jobs API — the separate service that aggregates job listings from many job boards and ATS platforms — with the TypeScript interfaces that mirror its request and response DTOs.

## What it does

`EverJobsClientService.searchJobs(input)` posts a search to `POST <EVER_JOBS_API_URL>/api/jobs/search` and returns the postings (wrapped `{ jobs: [...] }` or a raw array are both accepted); `analyzeJobs(input)` posts to `/api/jobs/analyze`. Errors (rate limits, server errors, network failures) are logged with their status and body and turned into an empty result (`[]` / `null`) so a crawl never fails on one request.

## Why it exists

Gauzy AI should depend on the Ever Jobs API's HTTP contract, not on its packages: the interfaces here are a local copy of the DTOs, which keeps the repositories decoupled. The client also centralizes authentication (`x-api-key`), the long timeout searches need and the error mapping.

## How it works

- `src/ever-jobs-client.service.ts` — `EverJobsClientService(httpService, options)`: strips trailing slashes from `apiUrl`, defaults the timeout to 30 s when `options.timeout` is absent, adds `x-api-key` when `apiKey` is set; `searchJobs()`, `analyzeJobs()`, `handleError()`.
- `src/interfaces/ever-jobs.interfaces.ts` — `EverJobsSite` (the site codes: general boards, ATS platforms, company career pages), `EverJobsJobType`, `EverJobsDescriptionFormat`, `EverJobsSearchInput` (`siteType`, `searchTerm`, `location`, `isRemote`, `jobType`, `resultsWanted`, `hoursOld`, `country`, `descriptionFormat`, proxy and rate-limit options, `auth`), `EverJobsSourceAuth` / `EverJobsUpworkAuth` (per-request Upwork OAuth2 credentials forwarded by the provider), `EverJobsJobPost` (the posting shape: title, URLs, company, location, compensation, skills, ATS metadata, `site`), `EverJobsAnalysis`, `EverJobsClientOptions` (`apiUrl`, `apiKey?`, `timeout?`).
- `src/ever-jobs-client.module.ts` — `EverJobsClientModule.register(options)` / `registerAsync({ inject?, useFactory })`: a global dynamic module built on `@nestjs/axios` `HttpModule` that provides and exports `EverJobsClientService`.

## Wiring

- Registered by `EverJobsPlugin` (`@packages/provider-ever-jobs`) with `EverJobsClientModule.registerAsync()` reading `EVER_JOBS_API_URL` (default `http://localhost:3001`), `EVER_JOBS_API_KEY` and `EVER_JOBS_TIMEOUT` (default 420000 ms, 7 minutes: searches across many boards are slow). The plugin is on only when `EVER_JOBS_API_URL` is set.
- Consumer: `EverJobsProvider`.
- No endpoints of its own.

## Using / extending

```ts
const jobs = await this.client.searchJobs({
  siteType: [EverJobsSite.LINKEDIN, EverJobsSite.INDEED],
  searchTerm: 'NestJS developer',
  isRemote: true,
  resultsWanted: 50,
  descriptionFormat: EverJobsDescriptionFormat.MARKDOWN,
});
```

When the Ever Jobs API adds a site or a field, extend `EverJobsSite` / `EverJobsJobPost` here first (they must stay in sync with the `@ever-jobs/models` enums), then the mapper in `@packages/provider-ever-jobs`.

## Tests

`src/ever-jobs-client.service.spec.ts` (URL and timeout handling, response shapes, headers, 4xx/5xx/429 and network errors) — run `yarn test packages/ever-jobs-client`.
