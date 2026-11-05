# Security Policy

## Reporting a vulnerability

Please report security issues **privately** to <security@ever.co>. Do not open a public GitHub issue for anything that could be a vulnerability.

Include what you found, how to reproduce it and, if you can, the impact. You will get an acknowledgement within a few working days and we will keep you informed while we work on a fix. We ask for reasonable time to release a fix before any public disclosure, and we are happy to credit reporters who want it.

## Supported versions

Security fixes land on the `develop` branch and are released through `stage` to `master`; the latest release is the supported one.

## Scope and expectations

Ever Gauzy AI is a multi-tenant API. The properties we care about most:

-   **Tenant isolation**: no credential of tenant A may read or change tenant-owned data of tenant B (GraphQL, REST, subscriptions, scheduled jobs). The job-post catalog gathered from public sources is shared by all tenants and is not private to the tenant that submitted or crawled a posting.
-   **Credentials**: tenant API-key secrets are stored as SHA-256 hashes; Ever ID tokens are verified against the issuer's keys; nothing credential-like is logged (automation-task payloads, which can carry a login, are never written to the log). Source credentials a tenant configures for job platforms (OAuth client secrets, access and refresh tokens in `source_config`) and the payload of automation tasks (`automation_task.command`) are stored as given because the platform has to present them upstream — database access, backups and SQL logs must therefore be treated as sensitive, and the API masks source credentials in responses.
-   **Server-side requests**: URLs the platform is given (screenshot analysis by URL, stored job URLs checked for liveness) are resolved once, must point to public addresses only, are fetched over a connection pinned to the validated address, and redirects are never followed (`packages/core/src/net/public-url.ts`).
-   **Dependencies**: Node.js 26 and current major versions of the framework; Dependabot security updates are enabled. The CodeQL and Snyk workflows run on pull requests and pushes to `develop`, `stage` and `master`; CodeQL needs code scanning (a public repository or GitHub Advanced Security) and Snyk a `SNYK_TOKEN` secret, and each skips itself where that is missing.

Deployments are expected to run behind TLS and to keep `IS_DISABLE_AUTH` off.

## Out of scope

-   Issues in third-party services the platform integrates with (job boards, AI providers, Langfuse, Novu) — please report those to the respective vendor.
-   Denial of service through excessive legitimate use of your own instance.
