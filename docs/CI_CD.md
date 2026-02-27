# CI/CD Pipeline

This document describes the GitHub Actions workflows for deploying Tailfire applications.

## Overview

Tailfire uses a two-branch deployment model:

```
┌──────────────┐     push      ┌──────────────┐     merge     ┌──────────────┐
│  Feature     │ ───────────►  │   preview    │ ───────────►  │    main      │
│  Branches    │               │   branch     │               │   branch     │
└──────────────┘               └──────────────┘               └──────────────┘
                                     │                              │
                                     ▼                              ▼
                               ┌──────────────┐               ┌──────────────┐
                               │ Dev/Preview  │               │  Production  │
                               │ Environment  │               │ Environment  │
                               └──────────────┘               └──────────────┘
```

### Deployment Workflows

| Workflow | Trigger | Target | Purpose |
|----------|---------|--------|---------|
| `deploy-preview.yml` | Push to `preview` | Dev/Preview environments | Development testing |
| `deploy-prod.yml` | Push to `main` | Production environments | Production release |

---

## Deployment Flow

### `deploy-preview.yml` (push to `preview`)

```
┌─────────────────────────────────────────────────────────────────┐
│                      deploy-preview.yml                          │
│                     (push to preview)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Deploy API Migrations (Drizzle → Preview Supabase)            │
│     ├─ Fetch secrets from Doppler (DOPPLER_TOKEN_PREVIEW)         │
│     ├─ Verify DB connection mode (reject port 6543)               │
│     ├─ Guard: block any Supabase CLI migrations                   │
│     ├─ Build database package                                     │
│     ├─ Inject FDW password into catalog FDW migration             │
│     └─ Run pnpm db:migrate                                       │
│                                                                   │
│  2. Deploy API to Railway (after migrations)                      │
│     ├─ Fetch secrets from Doppler                                 │
│     ├─ Install Railway CLI                                        │
│     ├─ railway up --service api-dev --detach                      │
│     └─ Wait for health check (20 retries, 15s intervals)         │
│                                                                   │
│  3. Deploy Admin to Vercel Preview (after migrations)             │
│     └─ Alias to tf-demo.phoenixvoyages.ca                        │
│  4. Deploy OTA to Vercel Preview (after migrations)               │
│  5. Deploy Client to Vercel Preview (after migrations)            │
│                                                                   │
│  6. Smoke Test (after all deploys)                                │
│     └─ Health check API endpoint                                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### `deploy-prod.yml` (push to `main`)

```
┌─────────────────────────────────────────────────────────────────┐
│                       deploy-prod.yml                             │
│                       (push to main)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Deploy API Migrations (Drizzle → Prod Supabase)               │
│     ├─ Fetch secrets from Doppler (DOPPLER_TOKEN_PRD)             │
│     ├─ Verify DB connection mode (reject port 6543)               │
│     ├─ Guard: block any Supabase CLI migrations                   │
│     ├─ Build database package                                     │
│     └─ Run pnpm db:migrate                                       │
│                                                                   │
│  2. Deploy API to Railway (after migrations)                      │
│     ├─ Fetch secrets from Doppler                                 │
│     ├─ Install Railway CLI                                        │
│     ├─ railway up --service api-prod --detach                     │
│     └─ Wait for health check (20 retries, 15s intervals)         │
│                                                                   │
│  3. Deploy Admin to Vercel Production (after migrations)          │
│  4. Deploy OTA to Vercel Production (after migrations)            │
│  5. Deploy Client to Vercel Production (after migrations)         │
│                                                                   │
│  6. Smoke Test (after all deploys)                                │
│     └─ Health check API endpoint                                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Migration Strategy

### Single Migration System (Drizzle Only)

All database migrations use Drizzle ORM. Supabase CLI migrations are **explicitly blocked** by a guard step in both workflows:

```yaml
- name: Guard against Supabase migrations
  run: |
    if find apps/ota/supabase/migrations -maxdepth 1 -name "*.sql" -not -path "*/_archive/*" 2>/dev/null | grep -q .; then
      echo "All migrations must be in packages/database/src/migrations/ (Drizzle)"
      exit 1
    fi
```

### DB Connection Mode Verification

Both workflows verify the `DATABASE_URL` uses session pooler (port 5432) which supports DDL. Transaction pooler (port 6543) is rejected:

```yaml
- name: Verify DB connection mode
  run: |
    if echo "$DATABASE_URL" | grep -q ":6543"; then
      echo "DATABASE_URL uses transaction pooler (port 6543). Migrations require session mode (port 5432)."
      exit 1
    fi
```

### Migration Guard Behavior (API Runtime)

In `apps/api/src/main.ts`:

```typescript
const shouldRunMigrations =
  process.env.NODE_ENV === 'development' ||
  process.env.RUN_MIGRATIONS_ON_STARTUP === 'true'

if (shouldRunMigrations) {
  await runMigrations(databaseUrl)
} else {
  console.info('Skipping migrations (CI/CD handles production migrations)')
}
```

---

## Railway API Deployment

The API is deployed via **Railway CLI in GitHub Actions**, not via Railway's auto-deploy feature.

### How It Works

1. GitHub Actions fetches secrets from Doppler
2. Installs Railway CLI (`npm install -g @railway/cli`)
3. Deploys using `railway up --service <service-name> --detach`
   - Preview: `railway up --service api-dev --detach`
   - Production: `railway up --service api-prod --detach`
4. Waits for health check (up to 5 minutes with 20 retries at 15s intervals)

### Why GitHub Actions (Not Auto-Deploy)

- Migrations run **before** the API deploy (job dependency)
- Secrets are centralized in Doppler and injected at deploy time
- Full control over deployment order and health verification

---

## Secrets Management

All secrets are managed via **Doppler** and fetched at workflow runtime using the `dopplerhq/secrets-fetch-action`:

```yaml
- name: Fetch secrets from Doppler
  uses: dopplerhq/secrets-fetch-action@v1.3.1
  with:
    doppler-token: ${{ secrets.DOPPLER_TOKEN_PREVIEW }}  # or DOPPLER_TOKEN_PRD
    inject-env-vars: true
```

### GitHub Secrets Required

Only Doppler tokens and Vercel credentials are stored as GitHub secrets:

| Secret | Used For |
|--------|----------|
| `DOPPLER_TOKEN_PREVIEW` | Doppler access for preview environment |
| `DOPPLER_TOKEN_PRD` | Doppler access for production environment |

All other secrets (DATABASE_URL, SUPABASE_*, RAILWAY_TOKEN, VERCEL_*, etc.) are managed in Doppler and injected automatically.

---

## Workflow Jobs Summary

### `deploy-preview.yml`

| Job | Purpose | Dependencies |
|-----|---------|--------------|
| `deploy-api-migrations` | Run Drizzle migrations to Preview Supabase | - |
| `deploy-api` | Deploy API to Railway (api-dev) | `deploy-api-migrations` |
| `deploy-admin` | Deploy Admin to Vercel Preview | `deploy-api-migrations` |
| `deploy-ota` | Deploy OTA to Vercel Preview | `deploy-api-migrations` |
| `deploy-client` | Deploy Client to Vercel Preview | `deploy-api-migrations` |
| `smoke-test` | Health check all services | `deploy-api`, `deploy-admin`, `deploy-ota`, `deploy-client` |

### `deploy-prod.yml`

| Job | Purpose | Dependencies |
|-----|---------|--------------|
| `deploy-api-migrations` | Run Drizzle migrations to Prod Supabase | - |
| `deploy-api` | Deploy API to Railway (api-prod) | `deploy-api-migrations` |
| `deploy-admin` | Deploy Admin to Vercel Production | `deploy-api-migrations` |
| `deploy-ota` | Deploy OTA to Vercel Production | `deploy-api-migrations` |
| `deploy-client` | Deploy Client to Vercel Production | `deploy-api-migrations` |
| `smoke-test` | Health check all services | `deploy-api`, `deploy-admin`, `deploy-ota`, `deploy-client` |

---

## GitHub Check Names (Branch Protection)

Use these exact check names when configuring branch protection rules in GitHub:

| Check Name | Purpose |
|------------|---------|
| `Deploy API Migrations (Drizzle)` | Drizzle migrations |
| `Deploy API to Railway` | API deployment |
| `Deploy Admin to Vercel` | Admin app deployment |
| `Deploy OTA to Vercel` | OTA app deployment |
| `Deploy Client to Vercel` | Client app deployment |
| `Smoke Test All Services` | Health check |

### Configuring Branch Protection

To require these checks before merging:

1. Go to GitHub repository **Settings** > **Branches**
2. Add or edit branch protection rule for `main` (and/or `preview`)
3. Enable **Require status checks to pass before merging**
4. Search for and select the check names above
5. Enable **Require branches to be up to date before merging** (recommended)

---

## Deployment Targets

| App | Platform | Dev Environment | Prod Environment |
|-----|----------|-----------------|------------------|
| **API** | Railway | `api-dev.tailfire.ca` | `api.tailfire.ca` |
| **Admin** | Vercel | `tf-demo.phoenixvoyages.ca` | `tailfire.phoenixvoyages.ca` |
| **OTA** | Vercel | Preview URLs | `ota.phoenixvoyages.ca` |
| **Client** | Vercel | Preview URLs | `client.phoenixvoyages.ca` |

---

## Rollback Procedures

### API (Railway)

1. Go to Railway dashboard > Deployments
2. Select the previous successful deployment
3. Click "Rollback to this deployment"

> **Warning:** Database migrations are not automatically rolled back. If a migration caused issues, create a new migration to revert changes.

### Frontend (Vercel)

1. Go to Vercel dashboard > Deployments
2. Find the previous production deployment
3. Click "..." > "Promote to Production"

---

## Related Documentation

- [Environment Configuration](./ENVIRONMENTS.md) - Domain and environment variables
- [Local Development](./LOCAL_DEV.md) - Running apps locally
- [API Deployment](./DEPLOYMENT_API.md) - Railway-specific settings
- [FDW Setup](../apps/ota/supabase/FDW_SETUP.md) - Foreign Data Wrapper configuration
