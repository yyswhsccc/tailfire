# Local Development

This document describes the current local-dev paths that actually work in the repo today.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Supabase development credentials
- Redis access for BullMQ automation

## Important Redis Caveat

The root `pnpm dev` flow currently runs:

```bash
redis-cli ping > /dev/null 2>&1 || redis-server --daemonize yes
```

That means:

- `pnpm dev` assumes local `redis-cli` and `redis-server` binaries exist.
- The API runtime also supports `REDIS_URL`, but the root `predev` script does not honor that variable before probing localhost.
- If you do not have local Redis tooling installed, prefer filtered commands such as `pnpm --filter @tailfire/api dev` and `pnpm --filter @tailfire/admin dev`.

## Recommended Setup Paths

### Option A: Doppler-backed local dev

```bash
pnpm install

brew install dopplerhq/cli/doppler
doppler login
doppler setup --project tailfire --config dev

doppler run -- pnpm --filter @tailfire/api db:migrate
doppler run -- pnpm dev
```

Use this when you want the broadest access to provider-backed features.

### Option B: Manual `.env` files

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/client/.env.example apps/client/.env.local
cp apps/ota/.env.example apps/ota/.env.local

cd apps/api && pnpm db:migrate && cd ../..

pnpm dev
```

Use this when you have local credentials but not Doppler access.

### Option C: Filtered app startup

Use this when the root Redis preflight is a problem or when you only need a subset of the stack.

```bash
pnpm --filter @tailfire/api dev
pnpm --filter @tailfire/admin dev
pnpm --filter @tailfire/client dev
pnpm --filter @tailfire/ota dev
```

## Ports

Ports are defined in `packages/config/ports.js`.

| App | Port | URL |
| --- | --- | --- |
| Admin | `3100` | `http://localhost:3100` |
| API | `3101` | `http://localhost:3101/api/v1` |
| OTA | `3102` | `http://localhost:3102` |
| Client | `3103` | `http://localhost:3103` |

## Database Commands

Run database commands from `apps/api`:

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

Reset/seed safety:

- `ALLOW_DATABASE_RESET=true` must be set
- `NODE_ENV=production` is blocked
- interactive confirmation is required unless `--force` is used

## Environment Files

### API

Typical local minimum in `apps/api/.env`:

```bash
NODE_ENV=development
PORT=3101
API_PREFIX=api/v1

DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...

JWT_SECRET=...
ADMIN_URL=http://localhost:3100
ALLOW_DATABASE_RESET=true
ENABLE_SWAGGER_DOCS=true

# BullMQ / automation
REDIS_URL=redis://localhost:6379
```

### Frontends

Typical local minimum in `apps/*/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3101/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Important provider note:

- `apps/api/.env.example` is not a complete reference for every current external-provider secret.
- Use [EXTERNAL_APIS.md](./EXTERNAL_APIS.md) as the current integration inventory.

## Daily Commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @tailfire/api build
pnpm --filter @tailfire/admin build
```

## Swagger

When `ENABLE_SWAGGER_DOCS=true`:

- `http://localhost:3101/api/v1/docs`

## Common Local Patterns

### API + Admin only

```bash
pnpm --filter @tailfire/api dev
pnpm --filter @tailfire/admin dev
```

### Schema change

```bash
cd apps/api
pnpm db:generate
pnpm db:migrate
```

### Full stack from root

```bash
pnpm dev
```

Use this only when the local Redis preflight behavior matches your machine setup.
```

### Scenario: Fresh Database Setup

```bash
cd apps/api

# Reset and seed with test data
pnpm db:seed
# Type "yes" when prompted
```

### Scenario: Running E2E Tests

```bash
cd apps/admin

# Run Playwright tests
pnpm test:e2e

# Run with UI (recommended for debugging)
pnpm test:e2e:ui

# Run headed (see browser)
pnpm test:e2e:headed
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3100

# Kill process
kill -9 <PID>
```

### Database Connection Issues

1. Verify `DATABASE_URL` uses direct TCP connection (not pooler) for migrations
2. Check Supabase project is active
3. Verify service role key has correct permissions

### Module Not Found Errors

```bash
# Clean install
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### TypeScript Errors After Schema Changes

```bash
# Rebuild database package
pnpm --filter @tailfire/database build

# Then restart dev servers
```

### Storage Provider Errors at Startup

If you see storage provider initialization errors:

1. **With Doppler:** This is normal - credentials load on-demand. Look for later log: `✓ cloudflare_r2: credentials configured`
2. **Without Doppler:** Storage features will use fallback providers. Add R2 credentials to `.env` if needed.

---

## Doppler Integration

Doppler is used for centralized secrets management. See [ENVIRONMENTS.md](./ENVIRONMENTS.md#doppler-configuration) for full details.

### Claude Code (MCP — preferred for AI-assisted workflows)

Claude Code has direct Doppler MCP access for reading and managing secrets without the CLI:
```
mcp__doppler__secrets_list(project: "tailfire", config: "dev")      # View all secrets
mcp__doppler__secrets_get(project: "tailfire", config: "dev", name: "DATABASE_URL")  # Get one
mcp__doppler__secrets_names(project: "tailfire", config: "dev")     # List names only
```

See `CLAUDE.md` > "Doppler MCP" for the full tool reference and usage policy.

### Human Developers (CLI)

```bash
# Check current config
doppler configure

# List all secrets (masked)
doppler secrets

# Run any command with secrets injected
doppler run -- <command>

# Switch between environments
doppler setup --project tailfire --config dev   # Local dev
doppler setup --project tailfire --config stg   # Preview/staging
doppler setup --project tailfire --config prd   # Production (read-only recommended)
```

### Running Individual Apps with Doppler

```bash
# API only
doppler run -- pnpm --filter @tailfire/api dev

# Admin only
doppler run -- pnpm --filter @tailfire/admin dev

# All apps
doppler run -- pnpm dev
```

---

## Related Documentation

- [Environment Configuration](./ENVIRONMENTS.md) - Domain and variable mapping
- [CI/CD Pipeline](./CI_CD.md) - Deployment workflows
- [API Deployment](./DEPLOYMENT_API.md) - Railway configuration
- [Database README](../packages/database/README.md) - Schema and migrations
