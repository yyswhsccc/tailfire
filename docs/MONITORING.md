# Monitoring Guide

This document covers error monitoring setup, key configuration files, Doppler secrets, troubleshooting runbooks, and daily monitoring SOPs for the Tailfire platform.

---

## Overview

Tailfire uses **Sentry** for runtime error capture across all environments. Both the API (NestJS on Railway) and the Admin app (Next.js on Vercel) report to a single Sentry organization.

- **Dashboard**: https://systemsaholic.sentry.io
- **Organization**: systemsaholic
- Errors from `development`, `preview`, and `production` environments all flow to the same dashboard and are differentiated by environment tag
- Use the environment filter in the Sentry UI to isolate issues by deployment stage

---

## Sentry Projects

| Project | Platform | DSN Location | Deployed On |
|---------|----------|-------------|-------------|
| `tailfire-api` | NestJS | `apps/api/src/instrument.ts` (hardcoded fallback) | Railway |
| `tailfire-admin` | Next.js | `apps/admin/sentry.*.config.ts` (hardcoded fallback) | Vercel |

---

## Key Files

### API (`apps/api`)

| File | Purpose |
|------|---------|
| `apps/api/src/instrument.ts` | Sentry SDK initialization — must be the first import in `main.ts` |
| `apps/api/src/app.module.ts` | `SentryModule.forRoot()` registration and `SentryGlobalFilter` for unhandled exceptions |
| `apps/api/src/app.controller.ts` | `GET /api/v1/debug-sentry` test endpoint (disabled in production) |

### Admin (`apps/admin`)

| File | Purpose |
|------|---------|
| `apps/admin/sentry.client.config.ts` | Client-side Sentry SDK initialization |
| `apps/admin/sentry.server.config.ts` | Server-side (Node.js runtime) Sentry SDK initialization |
| `apps/admin/sentry.edge.config.ts` | Edge runtime Sentry SDK initialization |
| `apps/admin/src/instrumentation.ts` | Next.js `register()` hook and `onRequestError` handler |
| `apps/admin/src/app/global-error.tsx` | Root error boundary — captures uncaught React errors |
| `apps/admin/next.config.ts` | `withSentryConfig` wrapper; tunnel route set to `/monitoring` |

---

## Doppler Secrets

These secrets must be present in each Doppler config (`dev`, `stg`, `prd`) for Sentry to function correctly.

| Secret | Purpose | Per-environment |
|--------|---------|-----------------|
| `SENTRY_DSN_API` | API project DSN | No — same value across all envs |
| `SENTRY_DSN_ADMIN` | Admin project DSN | No — same value across all envs |
| `SENTRY_AUTH_TOKEN` | Authenticates source map uploads during builds | No — same value across all envs |
| `SENTRY_ORG` | Org slug (`systemsaholic`) | No — same value across all envs |
| `SENTRY_PROJECT_API` | API project slug | No — same value across all envs |
| `SENTRY_PROJECT_ADMIN` | Admin project slug | No — same value across all envs |
| `SENTRY_ENVIRONMENT` | Environment tag for API (`development`/`preview`/`production`) | Yes |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side DSN (must be present at build time) | No — same value across all envs |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Client-side environment tag | Yes |

### Why DSNs are hardcoded as fallbacks

Railway does not automatically sync runtime environment variables from Doppler — secrets are injected at build time via GitHub Actions only. Similarly, Next.js `NEXT_PUBLIC_*` variables must be present at build time; they cannot be injected at runtime. To ensure Sentry is always active regardless of CI/CD configuration drift, DSN values are also hardcoded directly in the config files as fallbacks.

If Doppler secrets are present, they take precedence. The hardcoded values are a safety net.

---

## Troubleshooting

### Errors not showing in Sentry

1. The fallback DSN is hardcoded, so missing environment variables should not prevent capture. Confirm the hardcoded DSN in the relevant config file is correct.
2. For the API: check Railway deployment logs for "Sentry initialized" or any DSN-related error at startup.
3. For the Admin: open browser DevTools, go to the Network tab, and look for outbound requests to `ingest.us.sentry.io` or to the `/monitoring` tunnel route.
4. Check the environment filter in the Sentry dashboard. If it is set to "production" only, errors from `preview` or `development` will be hidden. Switch to "All Envs" to see everything.

### 500 Internal Server Error on the API

1. Open https://systemsaholic.sentry.io and filter by the `tailfire-api` project.
2. Find the error event matching the approximate time of the failure.
3. Read the stack trace and error message in the event detail.
4. Common root causes:
   - **Schema drift**: a column referenced in code does not exist in the database. Run `pnpm db:migrate` locally or verify the migration ran in the deploy logs.
   - **CHECK constraint violation**: for example, `chk_received_sender` on `commission_checks` requires either `sender_name` or `sender_supplier_id` to be set when a check is marked as received.
   - **Trigger function error**: for example, `validate_trip_status_transition` blocks invalid status transitions. See [Known DB Constraints](#known-db-constraints-to-watch) below.

### DB migration ran but columns are still missing

1. Drizzle uses `$$` as a delimiter for function bodies. If a migration file contains `$$`, Drizzle's breakpoint splitter can corrupt the SQL. Use `$fn$` as the delimiter and set `breakpoints: false` on that migration.
2. Verify the function was actually replaced by querying the database:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'function_name';
   ```
3. Preview and local databases may be out of sync with each other. Run `pnpm db:migrate` locally to bring local up to date, then check whether the preview environment migration ran correctly in the CI/CD deploy logs.

### Doppler secrets not reaching Railway or Vercel

- **Railway**: Doppler secrets are injected at build time via GitHub Actions, not at runtime. Public values like DSNs are hardcoded as fallbacks for this reason. If a new secret is not appearing in a running Railway service, redeploy to force a fresh build.
- **Vercel**: `NEXT_PUBLIC_*` variables must be present during the Next.js build step. The deploy workflow injects Doppler secrets before calling the Vercel deploy command. If client-side Sentry is not initializing, verify the `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` variables are being passed correctly in the workflow.
- To debug: compare the Doppler value (via MCP) with what the running app reports. For Railway, check the Variables tab in the Railway dashboard. For Vercel, check the Environment Variables section in the project settings.

---

## Monitoring SOP for Beta Testing

### Daily checks

1. Open https://systemsaholic.sentry.io.
2. Filter by the `preview` environment.
3. Review the list of new unresolved issues since the previous check.
4. Triage each issue: assign a priority (P1 critical / P2 important / P3 minor), and either assign it to a team member for a fix or resolve it immediately if it is a known non-issue.

### When a tester reports an issue

1. Ask the tester for the approximate time the issue occurred and what action triggered it.
2. In Sentry, filter by the relevant project (`tailfire-api` or `tailfire-admin`) and the `preview` environment.
3. Search for errors near the reported timestamp.
   - If the tester reported an API error (5xx, failed request): filter `tailfire-api` and examine the stack trace.
   - If the tester reported a UI crash or unexpected behavior: filter `tailfire-admin` and check for error boundary captures.
4. If no Sentry event exists: the issue may be a UX problem that did not throw an error. Ask the tester to share their browser console output.

### When deploying a fix

1. Fix the code on a feature branch.
2. Push to the `preview` branch to trigger `deploy-preview.yml`.
3. Monitor the deployment: `gh run list --branch preview`.
4. After deployment completes, call the debug endpoint to verify Sentry is still capturing correctly:
   ```
   GET https://api-dev.tailfire.ca/api/v1/debug-sentry
   ```
   Confirm the test error appears in the `tailfire-api` project on Sentry within a minute.
5. Retest the scenario that caused the original issue and confirm it is resolved.

---

## Known DB Constraints to Watch

These constraints have caused errors in testing. When Sentry reports a `500` error from a relevant endpoint, check whether the constraint listed below is the cause.

| Constraint | Table | Rule |
|-----------|-------|------|
| `chk_received_sender` | `commission_checks` | A check marked as received must have either `sender_name` or `sender_supplier_id` set. Both cannot be null. |
| `validate_trip_status_transition` | `trips` (trigger) | `INSERT` operations must pass the `TG_OP` guard. `UPDATE` operations must follow the valid status transition graph. Invalid transitions are rejected at the database level. |

---

## Related Documentation

- [Security Model](./SECURITY.md) - Authentication, authorization, and the Sentry error monitoring section
- [Architecture Overview](./ARCHITECTURE.md) - Tech stack including Sentry
- [CI/CD Pipeline](./CI_CD.md) - Deploy workflows that inject Doppler secrets
- [Environment Configuration](./ENVIRONMENTS.md) - Domain and environment variable reference
