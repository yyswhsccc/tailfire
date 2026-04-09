# Local Development

This document describes the local setup paths that are still accurate in the current repo.

## Requirements

- Node.js 20+
- pnpm 10+
- local env values for API and frontend apps
- Redis access for BullMQ-backed API features

## Root Startup Caveat

Root `pnpm dev` currently runs this `predev` hook first:

```bash
redis-cli ping > /dev/null 2>&1 || redis-server --daemonize yes
```

Practical impact:

- local `redis-cli` and `redis-server` binaries are assumed
- the API supports `REDIS_URL`, but the root preflight does not honor that before probing localhost
- filtered commands are often the safer path on machines without local Redis tooling

## Recommended Setup

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/client/.env.example apps/client/.env.local
cp apps/ota/.env.example apps/ota/.env.local

cd apps/api && pnpm db:migrate && cd ../..
```

Then either run the full stack:

```bash
pnpm dev
```

Or start only the apps you need:

```bash
pnpm --filter @tailfire/api dev
pnpm --filter @tailfire/admin dev
pnpm --filter @tailfire/client dev
pnpm --filter @tailfire/ota dev
```

## Local Ports

Ports are defined in `packages/config/ports.js`.

| App | URL |
| --- | --- |
| Admin | `http://localhost:3100` |
| API | `http://localhost:3101/api/v1` |
| OTA | `http://localhost:3102` |
| Client | `http://localhost:3103` |

## Database Commands

Run database lifecycle commands from `apps/api`:

```bash
cd apps/api

pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm db:reset
pnpm db:seed
pnpm db:reset:dry-run
pnpm db:seed:dry-run
pnpm db:reset:force
pnpm db:seed:force
```

Reset and seed safeguards currently include `ALLOW_DATABASE_RESET=true`, a production block, and interactive confirmation unless `--force` is used.

## OTA-Specific Env Surface

`apps/ota/.env.example` currently includes more than the standard frontend Supabase and API vars. In addition to `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the OTA expects:

- `API_URL`
- `NEXT_PUBLIC_SITE_URL`
- `CLIENT_PORTAL_URL`
- `OTA_SERVICE_KEY`
- `CATALOG_API_KEY`
- `REVALIDATION_SECRET`
- `AI_MODEL_ID`
- `OPENAI_API_KEY`
- optional Upstash rate-limit vars

## Daily Validation Commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Useful filtered commands:

```bash
pnpm --filter @tailfire/api test
pnpm --filter @tailfire/admin test
pnpm --filter @tailfire/admin test:e2e
```

## Current Caveats

- `apps/ota` has no `typecheck` or `test` script.
- `apps/client` has no `test` script.
- `apps/api` advertises `test:e2e`, but the referenced Jest E2E config file is missing.
- Root validation can therefore look healthier than the repo actually is.
