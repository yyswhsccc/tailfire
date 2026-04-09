# CI/CD Pipeline

Only two tracked GitHub Actions workflows currently drive deploys:

- `.github/workflows/deploy-preview.yml`
- `.github/workflows/deploy-prod.yml`

There is no separate pre-merge or pull-request validation workflow in the repo today.

## Branch Mapping

| Workflow | Trigger | Target |
| --- | --- | --- |
| `deploy-preview.yml` | push to `preview` | Preview database, Railway `api-dev`, and Vercel preview deployments |
| `deploy-prod.yml` | push to `main` | Production database, Railway `api-prod`, and Vercel production deployments |

## Preview Workflow

`deploy-preview.yml` currently does all of the following:

1. rejects `DATABASE_URL` values that use port `6543`
2. blocks SQL files under `apps/ota/supabase/migrations`
3. runs database migration work before app deploys
4. deploys the API with `railway up --service api-dev --detach`
5. waits on `https://api-dev-dev-13dd.up.railway.app/api/v1/health`
6. deploys admin, OTA, and client Vercel previews
7. aliases the admin preview to `tf-demo.phoenixvoyages.ca`
8. runs an API health smoke test

## Production Workflow

`deploy-prod.yml` follows the same broad pattern for production:

1. rejects port `6543` database URLs
2. blocks stray SQL migrations under `apps/ota/supabase/migrations`
3. runs database migrations before deploying the API
4. deploys the API with `railway up --service api-prod --detach`
5. waits on `https://api.tailfire.ca/api/v1/health`
6. deploys admin, OTA, and client to Vercel production
7. runs an API health smoke test

## Runtime Migration Behavior

`apps/api/src/main.ts` only runs migrations at startup when `RUN_MIGRATIONS_ON_STARTUP === 'true'`. Otherwise it logs that migrations are being skipped because CI/CD handles them.

## Current CI/CD Gaps

- Deploys are not gated by a dedicated PR validation workflow.
- Smoke checks only verify the API health endpoint.
- Preview API health waits on a generated Railway URL, which is brittle compared with a stable alias.
