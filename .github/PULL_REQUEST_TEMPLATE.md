## Why

<!-- The problem or need this PR addresses. Link the issue: Closes #… -->

## What

<!-- What changed, in a few bullets. New environment variables, migrations, plugins, endpoints? -->

## Verification

<!-- What you ran: yarn lint / tsc / yarn test / yarn test:e2e:ephemeral / yarn build, and any manual check -->

- [ ] Lint, types, unit tests and build pass locally
- [ ] Database changes come with an idempotent migration registered in `packages/config/src/migrations/index.ts`
- [ ] Tenant-scoped data stays tenant-scoped (hooks / `currentTenantWhere()`); cross-tenant work only behind the service token
- [ ] No credentials in code, logs or `.env.sample` values
- [ ] Docs updated (`docs/`, `.env.sample`) where behaviour or configuration changed
