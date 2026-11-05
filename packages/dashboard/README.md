# @packages/dashboard

Folder: `packages/dashboard`. Dashboard statistics for a tenant or one of its employees: totals of matches and applications, average score, today's activity, the top match, a score distribution and a recent-activity feed, as the GraphQL query `dashboardStats`.

## What it does

`DashboardService.getStats(employeeId?, tenantId?)` aggregates the `EmployeeJobPost` (match) table for the authenticated tenant: `totalMatches`, `totalApplications` (`isApplied = true`), `avgMatchScore`, `matchesToday`, `applicationsSentToday`, `topScoringMatch`, `scoreDistribution` in five buckets (`0-29`, `30-49`, `50-69`, `70-89`, `90-100`) and `recentActivity` (the last five matches and five applications merged by time, ten entries at most).

## Why it exists

Client applications need one call for their overview screen instead of several paginated queries; the aggregation runs in SQL with parameterized query builders and is always scoped to the caller's tenant.

## How it works

- `src/dashboard.service.ts` — `DashboardService`: `tenantId = resolveTenantId(tenantId)` (`@packages/core/context`: the argument may only name the caller's own tenant, otherwise 403); counts and `findOne` on the repository, `AVG(matchScore)` and the bucket counts through `createQueryBuilder` with bound parameters (`applyWhereClause`, `computeScoreDistribution`).
- `src/dto/dashboardStats.type.ts` — `DashboardStats`, `TopScoringMatch`, `ScoreDistributionBucket`, `RecentActivityEntry` GraphQL object types.
- `src/dashboard.resolver.ts` — `DashboardResolver` with `dashboardStats(employeeId?: ID, tenantId?: ID)`.
- `src/dashboard.module.ts` — `DashboardModule` registers the `EmployeeJobPost` repository, provides the service and resolver, exports `DashboardService`.

## Wiring

- `AppModule` imports `DashboardModule` and lists it in the GraphQL `include`; `SchemaModule` (`src/schema.module.ts`, used by `yarn sdk:generate`) includes it as well, so `dashboardStats` stays in `src/schemas/schema.graphql` and the SDK.
- `DashboardResolver` is the only declaration of `dashboardStats` (it used to be declared on `EmployeeJobPostResolver` too; the description the schema published then is kept).
- No environment variables; GraphQL only (`dashboardStats`), tenant credential required.

## Using / extending

```graphql
query {
  dashboardStats(employeeId: "…") {
    totalMatches
    avgMatchScore
    topScoringMatch { jobTitle matchScore providerCode }
    scoreDistribution { range count }
    recentActivity { type description timestamp }
  }
}
```

New figures: add a field to `DashboardStats`, compute it in `getStats()` from the same `where` (keep `tenantId` in every query) and cover it in the service spec.

## Tests

`src/dashboard.service.spec.ts` (counts, average, top match, buckets, tenant scoping) and `src/dashboard.resolver.spec.ts` — run `yarn test packages/dashboard`.
