# API Deployment

The Tailfire API is deployed to Railway through GitHub Actions rather than Railway auto-deploy.

## Services

| Branch | Workflow | Railway Service |
| --- | --- | --- |
| `preview` | `deploy-preview.yml` | `api-dev` |
| `main` | `deploy-prod.yml` | `api-prod` |

## Current Deployment Sequence

Both tracked workflows follow this order:

1. verify the database URL is not using the transaction pooler on port `6543`
2. block stray SQL migrations under `apps/ota/supabase/migrations`
3. run the database migration step before the API deploy
4. deploy with `railway up --service <service> --detach`
5. wait for `/api/v1/health`

Preview currently waits on `https://api-dev-dev-13dd.up.railway.app/api/v1/health`. Production waits on `https://api.tailfire.ca/api/v1/health`.

## Runtime Expectations

- `apps/api/src/main.ts` skips runtime migrations unless `RUN_MIGRATIONS_ON_STARTUP === 'true'`.
- Default local CORS allows `localhost:3100-3103`; preview and production subdomains are handled by runtime origin matching in `apps/api/src/main.ts`.
- `REDIS_URL` is part of the API runtime surface for BullMQ-backed automation.

## Operational Notes

- The current workflows are the source of truth for deployment order.
- If Railway URLs or aliases change, update the workflow health-check targets and the docs together.
- For broader deployment gaps and operational follow-up, use [REPOSITORY_REVIEW_ISSUES.md](./REPOSITORY_REVIEW_ISSUES.md).
