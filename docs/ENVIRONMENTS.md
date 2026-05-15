# Environment Configuration

This document describes the current branch-to-environment mapping, frontend env surface, and API CORS behavior verified from the tracked workflows and runtime bootstrap code.

## Environment Map

| Environment | Branch | Deployment Notes |
| --- | --- | --- |
| Local | local worktree | `localhost:3100-3103` |
| Preview | `preview` | `deploy-preview.yml` migrates the Preview database, deploys Railway `api-dev`, deploys Vercel previews, and aliases the admin preview to `tf-demo.phoenixvoyages.ca` |
| Production | `main` | `deploy-prod.yml` migrates the Production database, deploys Railway `api-prod`, and targets `api.tailfire.ca`, `tailfire.phoenixvoyages.ca` (admin), `my.phoenixvoyages.ca` (client portal), and the OTA — see B5 below |

**B5 (Al's domain decision 2026-05-15):**
- **OTA / consumer-facing** → apex `phoenixvoyages.ca` post-WordPress cutover. Until cutover the apex still serves WordPress; OTA continues to live at `ota.phoenixvoyages.ca` with `NEXT_PUBLIC_SITE_URL` set explicitly in Vercel prod env. Code fallbacks updated to apex so the cutover only requires a Vercel alias swap + Doppler env update.
- **Client portal** → `my.phoenixvoyages.ca` (was `client.`). Vercel domain alias + Doppler `CLIENT_PORTAL_URL` / `NEXT_PUBLIC_CLIENT_URL` updates needed.
- **Admin** → `tailfire.phoenixvoyages.ca` (unchanged).

Preview should not be documented with the old fixed `tailfire-dev`, `ota-dev`, or `client-dev` subdomains. The tracked workflow uses Vercel preview deployments, and the API health check currently waits on a generated Railway URL rather than a stable alias.

## API CORS Behavior

`apps/api/src/main.ts` currently allows these origins when `CORS_ORIGINS` is not set:

- `http://localhost:3100`
- `http://localhost:3101`
- `http://localhost:3102`
- `http://localhost:3103`
- Vercel preview origins that match the current `tailfire-...vercel.app` pattern
- `*.phoenixvoyages.ca` subdomains
- `*.tailfire.ca` subdomains

Use `CORS_ORIGINS` when you need an explicit override, but keep it aligned with the runtime rules in `apps/api/src/main.ts`.

## Frontend Environment Variables

All three frontend apps use the standard public Supabase/API client vars:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The OTA has extra runtime surface verified in `apps/ota/.env.example`:

- `API_URL`
- `NEXT_PUBLIC_SITE_URL`
- `CLIENT_PORTAL_URL`
- `OTA_SERVICE_KEY`
- `CATALOG_API_KEY`
- `REVALIDATION_SECRET`
- `AI_MODEL_ID`
- `OPENAI_API_KEY`
- optional `UPSTASH_REDIS_REST_URL`
- optional `UPSTASH_REDIS_REST_TOKEN`

## API Runtime Variables

The API bootstrap and workflows currently rely on these categories of variables:

- database and Supabase secrets from `apps/api/.env.example`
- `REDIS_URL` for BullMQ and automation
- `ADMIN_URL` for admin-facing links and redirects
- `CORS_ORIGINS` when overriding the default origin logic
- `RUN_MIGRATIONS_ON_STARTUP` if you intentionally want runtime migrations

`apps/api/src/main.ts` skips runtime migrations unless `RUN_MIGRATIONS_ON_STARTUP === 'true'`.

## Deployment Notes

- Preview and production database migrations are handled in GitHub Actions, not by default API startup.
- The deploy workflows reject `DATABASE_URL` values that point at the transaction pooler on port `6543`.
- The deploy workflows also block stray SQL migrations under `apps/ota/supabase/migrations` so Drizzle stays the single migration path.
