# Local Development

This document describes how to run Tailfire locally, including port assignments and startup commands.

## Prerequisites

- **Node.js** 20.0.0 or higher
- **pnpm** 10.0.0 or higher
- Access to Supabase development project credentials

## Quick Start

### Option A: With Doppler (Recommended)

Doppler provides centralized secrets management with all credentials pre-configured:

```bash
# 1. Install dependencies
pnpm install

# 2. Install and authenticate Doppler CLI
brew install dopplerhq/cli/doppler
doppler login

# 3. Setup Doppler for local dev
doppler setup --project tailfire --config dev

# 4. Run database migrations (first time only)
doppler run -- pnpm --filter @tailfire/api db:migrate

# 5. Start all apps with Doppler-injected secrets
doppler run -- pnpm dev
```

> **Benefits:** Full access to R2 storage, email services, and all third-party integrations without managing `.env` files.

### Option B: Manual `.env` Files

If you don't have Doppler access, use manual environment files:

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/ota/.env.example apps/ota/.env.local
cp apps/client/.env.example apps/client/.env.local

# 3. Edit .env files with your Supabase credentials

# 4. Run database migrations (first time only)
cd apps/api && pnpm db:migrate && cd ../..

# 5. Start all apps
pnpm dev
```

> **Note:** Without Doppler, some features (R2 storage, email) will use fallback providers or be unavailable.

---

## Port Assignments

Ports are defined in `packages/config/ports.js`:

| App | Port | URL | Purpose |
|-----|------|-----|---------|
| **Admin** | 3100 | `http://localhost:3100` | B2B admin dashboard |
| **API** | 3101 | `http://localhost:3101/api/v1` | NestJS backend |
| **OTA** | 3102 | `http://localhost:3102` | OTA booking platform |
| **Client** | 3103 | `http://localhost:3103` | Customer-facing app |

### Rationale

- **3100** for Admin: Primary development interface, easy to remember
- **3101** for API: Adjacent to Admin for easy mental mapping
- **3102-3103** for secondary frontends: Follow sequentially
- **All in 31xx range**: Avoids conflicts with common ports (3000, 8080, etc.)

---

## Startup Commands

### Start All Apps (Turborepo)

```bash
# From monorepo root
pnpm dev
```

This runs `turbo dev` which starts all apps concurrently with proper dependency ordering.

### Start Individual Apps

```bash
# API only
pnpm --filter @tailfire/api dev

# Admin only
pnpm --filter @tailfire/admin dev

# OTA only
pnpm --filter @tailfire/ota dev

# Client only
pnpm --filter @tailfire/client dev
```

### Start Specific Combinations

```bash
# API + Admin (most common for development)
pnpm --filter @tailfire/api --filter @tailfire/admin dev

# All frontends (requires API running separately or in production)
pnpm --filter @tailfire/admin --filter @tailfire/ota --filter @tailfire/client dev
```

---

## Database Commands

All database commands run from the **API app directory** (`apps/api`):

```bash
cd apps/api

# Generate migration from schema changes
pnpm db:generate

# Run pending migrations
pnpm db:migrate

# Open Drizzle Studio (GUI)
pnpm db:studio

# Reset database (interactive confirmation)
pnpm db:reset

# Reset + seed with test data
pnpm db:seed

# Preview what reset would do (no changes)
pnpm db:reset:dry-run
pnpm db:seed:dry-run

# Force reset (no confirmation, for scripts)
pnpm db:reset:force
pnpm db:seed:force
```

### Database Reset Safety

Reset commands are protected by:
- `ALLOW_DATABASE_RESET=true` must be set in `.env`
- `NODE_ENV` cannot be `production`
- Interactive confirmation required (unless `--force`)

---

## Environment Files

### API (`apps/api/.env`)

Required variables for local development:

```bash
NODE_ENV=development
PORT=3101
API_PREFIX=api/v1

# Supabase
DATABASE_URL=postgresql://postgres.[ref]:[password]@...
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

# Auth
JWT_SECRET=dev-secret-key
ADMIN_URL=http://localhost:3100

# Database reset (dev only)
ALLOW_DATABASE_RESET=true

# Features
ENABLE_SWAGGER_DOCS=true
```

### Frontend Apps (`apps/*/\env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3101/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Build Commands

```bash
# Build all packages and apps
pnpm build

# Build specific app
pnpm --filter @tailfire/api build
pnpm --filter @tailfire/admin build

# Type check all
pnpm typecheck

# Lint all
pnpm lint

# Run tests
pnpm test
```

---

## API Documentation

When running locally with `ENABLE_SWAGGER_DOCS=true`:

**Swagger UI:** `http://localhost:3101/api/v1/docs`

---

## Common Development Scenarios

### Scenario: Working on Admin + API

```bash
# Terminal 1: Start API
pnpm --filter @tailfire/api dev

# Terminal 2: Start Admin
pnpm --filter @tailfire/admin dev
```

Or use the combined command:
```bash
pnpm dev
```

### Scenario: Testing Database Changes

```bash
# 1. Modify schema in packages/database/src/schema/
# 2. Generate migration
cd apps/api && pnpm db:generate

# 3. Review migration SQL
cat ../../packages/database/src/migrations/*.sql | tail -50

# 4. Apply migration
pnpm db:migrate
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
