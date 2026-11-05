# @packages/jobSearchCriteria

Folder: `packages/job-search-criteria`. Per-employee job search criteria: the `JobSearchCriterion` rows (keyword, location, country, job type, remote, listing age) that drive every crawl, exposed as GraphQL CRUD under two names, with hooks that keep a criterion attached to an employee of the caller's tenant.

## What it does

`JobSearchCriteriaModule` registers two nestjs-query resolvers on the same table: the canonical `JobSearchCriterion` operations and the `UpworkJobsSearchCriterion` alias the Ever Gauzy integration plugin still calls. The `EmployeeOwned*Hook`s verify on create and update that `employeeId` belongs to the authenticated tenant; the owner-touch hooks bump an employee's `updatedAt` when one of their criteria is deleted or moved to another employee, so re-matching notices the change.

## Why it exists

Criteria are the input of the whole pipeline: the crawler searches each unique criterion with the tenant's own source credentials, and matching uses the criteria's keywords as the relevance filter. A caller must therefore never be able to attach criteria to another tenant's employee, and the legacy operation names must keep working for existing clients.

## How it works

- `src/jobSearchCriteria.module.ts` — `JobSearchCriteriaModule`: the `JobSearchCriterion` repository, `NestjsQueryGraphQLModule.forFeature` with two resolver definitions (`JobSearchCriterionDTO` with aggregates and total count, `UpworkJobsSearchCriterionDTO` with total count) and the `Employee` repository for the hooks; exports `TypeOrmModule`.
- `src/hooks/employee-owned.hook.ts` — `EmployeeOwnedCreateOneHook`, `EmployeeOwnedCreateManyHook` (one check per distinct employee), `EmployeeOwnedUpdateOneHook`, `EmployeeOwnedUpdateManyHook`: 401 without a tenant, 403 when the employee is not the tenant's; an update that does not touch `employeeId` passes.
- `src/hooks/criteria-owner-touch.hook.ts` — `CriterionDeleteOneTouchesEmployeeHook`, `CriteriaDeleteManyTouchEmployeesHook`, `CriterionUpdateOneTouchesFormerOwnerHook`, `CriteriaUpdateManyTouchFormerOwnersHook`. They run before the delete or move (after the tenant hooks, limited to the caller's tenant) and set the affected employees' `updatedAt` to `CURRENT_TIMESTAMP`. Re-matching (`EmployeeJobPostService.rematch()`) reads an employee's matching inputs from the stored timestamps of the employee and their criteria. A deleted criterion leaves no timestamp behind, and deleting the last one even makes every post relevant, so without the bump such a change would go unnoticed. nestjs-query only has hooks before a mutation, so the bump commits just before the change. A re-match pass in between is still covered, because `rematch()` detects changes by the content of the matching inputs (`matchingInputsFingerprint()`); the bump is what persists the change across restarts and replicas. The DTOs also run `ServerTimestamps*Hook` (`@packages/core/hooks`), so a client cannot set `createdAt` / `updatedAt` on a criterion.
- The DTOs live in `@packages/dto` (`packages/dto/src/jobSearchCriterion.dto.ts`): both extend `JobSearchCriterionBaseDTO`, carry `@Authorize(TenantAuthorizer)`, the tenant hooks from `@packages/core/hooks` the employee-owned hooks and the owner-touch hooks above. Fields: `employeeId`, `keyword`, `jobType` (`hourly` / `fixed`), `location`, `country`, `isRemote`, `hoursOld`, legacy `category` / `categoryId` / `occupation` / `occupationId`.
- The entity is `JobSearchCriterion` in `@packages/entities` (table `job_search_criterion`, renamed from `employee_upwork_jobs_search_criterion` by the `RenameLegacySearchCriteria` migration).

How criteria are used: `EmployeeService.getActiveWithJobSearchCriteria()` → `CrawlerService.deduplicateCriteria()` (one search per tenant + keyword + location + country + jobType + isRemote) → `provider.getJobsForCriteria(criterion)`; `EmployeeJobPostService.findRelevantJobs()` matches a post when it contains a criterion's `keyword`, `occupation` or `category`; `AiScoringService` lists the active criteria as the employee's skills when `skillsSummary` is empty.

## Wiring

- `AppModule` imports `JobSearchCriteriaModule` and lists it in the GraphQL `include`.
- GraphQL: `jobSearchCriteria`, `jobSearchCriterion`, `jobSearchCriterionAggregate`, `createOneJobSearchCriterion`, `createManyJobSearchCriteria`, `updateOneJobSearchCriterion`, `updateManyJobSearchCriteria`, `deleteOneJobSearchCriterion`, `deleteManyJobSearchCriteria`; the same set under `upworkJobsSearchCriteria` / `createManyUpworkJobsSearchCriteria` / `deleteManyUpworkJobsSearchCriteria` / …
- No REST controller, no environment variables (`CRAWL_DEFAULT_KEYWORDS` in `@packages/crawler` is the fallback when no criteria exist).
- Sample criteria for the seeded employees: `packages/seeds/src/jobSearchCriteria.seed.ts`.

## Using / extending

```graphql
mutation {
  createManyJobSearchCriteria(input: { jobSearchCriteria: [
    { employeeId: "…", keyword: "NestJS developer", isRemote: true, jobType: "hourly", hoursOld: 72 },
    { employeeId: "…", keyword: "TypeScript", country: "GERMANY", location: "Berlin" }
  ] }) { id keyword }
}
```

A new criterion field goes into the entity (+ migration), `JobSearchCriterionBaseDTO`, `SearchCriterion` (`@packages/core-providers`), the crawler's dedup key and the providers that can use it.

## Tests

`src/hooks/employee-owned.hook.spec.ts`, `src/hooks/criteria-owner-touch.hook.spec.ts` — run `yarn test packages/job-search-criteria`.
