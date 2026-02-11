# Environment Configuration

This document describes the domain mapping, CORS allowlists, and environment-specific URLs for Tailfire.

## Architecture Overview

Tailfire uses a **3-environment architecture** with separate Supabase databases for each:

| Environment | Purpose | Supabase Project | Doppler Config |
|-------------|---------|------------------|----------------|
| **Local Dev** | Local development | tailfire-Dev (`hplioumsywqgtnhwcivw`) | `dev` |
| **Cloud Preview** | Staging/QA testing | Tailfire-Preview (`gaqacfstpnmwphekjzae`) | `stg` |
| **Production** | Live environment | Tailfire-Prod (`cmktvanwglszgadjrorm`) | `prd` |

> **Important:** Each environment has its own isolated Supabase database. Local Dev does NOT share a database with Cloud Preview.

## Naming Conventions

Tailfire uses different naming conventions for different purposes:

| Concept | Local Dev | Cloud Preview | Production | Rationale |
|---------|-----------|---------------|------------|-----------|
| **Git Branch** | local | `preview` | `main` | Workflow stage |
| **NODE_ENV** | `development` | `development` | `production` | Runtime mode |
| **Railway Service** | - | `api-dev` | `api-prod` | Cloud API instances |
| **Domain** | `localhost` | `api-dev.tailfire.ca` | `api.tailfire.ca` | API endpoints |
| **Doppler Config** | `dev` | `stg` | `prd` | Secrets management |
| **Supabase Project** | tailfire-Dev | Tailfire-Preview | Tailfire-Prod | Database |

> **Why `preview` branch but `api-dev` service?**
> - The **branch name** (`preview`) describes the *workflow stage* - code is previewed here before going to production
> - The **service name** (`api-dev`) describes the *environment type* - it's a development environment with development data
> - These are separate concepts: the branch could be called anything, but the environment is always "development" vs "production"

## Environment Inventory

### Local Dev

- **Supabase project:** tailfire-Dev (`hplioumsywqgtnhwcivw`)
- **Doppler config:** `dev`
- **Admin:** `http://localhost:3100`
- **API:** `http://localhost:3101`
- **OTA:** `http://localhost:3102`
- **Client:** `http://localhost:3103`

### Cloud Preview (Staging)

- **Supabase project:** Tailfire-Preview (`gaqacfstpnmwphekjzae`)
- **Doppler config:** `stg`
- **Admin:** `https://tailfire-dev.phoenixvoyages.ca` (alias: `https://tf-demo.phoenixvoyages.ca`)
- **OTA:** `https://ota-dev.phoenixvoyages.ca`
- **Client:** `https://client-dev.phoenixvoyages.ca`
- **API:** `https://api-dev.tailfire.ca`
- **Railway service:** `api-dev`
- **Branch:** `preview`

### Production

- **Supabase project:** Tailfire-Prod (`cmktvanwglszgadjrorm`)
- **Doppler config:** `prd`
- **Admin:** `https://tailfire.phoenixvoyages.ca`
- **OTA:** `https://ota.phoenixvoyages.ca`
- **OTA root:** `https://phoenixvoyages.ca`, `https://www.phoenixvoyages.ca`
- **Client:** `https://client.phoenixvoyages.ca`
- **API:** `https://api.tailfire.ca`
- **Railway service:** `api-prod`
- **Branch:** `main`

## Domain Mapping

### Production Domains

| App | Domain | Platform | Purpose |
|-----|--------|----------|---------|
| **API** | `api.tailfire.ca` | Railway | Production NestJS API |
| **Admin** | `tailfire.phoenixvoyages.ca` | Vercel | B2B admin dashboard |
| **OTA** | `ota.phoenixvoyages.ca` | Vercel | OTA booking platform |
| **Client** | `client.phoenixvoyages.ca` | Vercel | Customer-facing app |
| **Marketing** | `phoenixvoyages.ca`, `www.phoenixvoyages.ca` | External | Main agency website (OTA may run here) |

### Preview Domains

| App | Domain | Platform | Purpose |
|-----|--------|----------|---------|
| **API (Dev)** | `api-dev.tailfire.ca` | Railway | Development API |
| **Admin (Dev)** | `tailfire-dev.phoenixvoyages.ca` | Vercel | Development admin |
| **OTA (Dev)** | `ota-dev.phoenixvoyages.ca` | Vercel | Development OTA |
| **Client (Dev)** | `client-dev.phoenixvoyages.ca` | Vercel | Development client |

### Local Development

| App | URL | Port |
|-----|-----|------|
| **Admin** | `http://localhost:3100` | 3100 |
| **API** | `http://localhost:3101/api/v1` | 3101 |
| **OTA** | `http://localhost:3102` | 3102 |
| **Client** | `http://localhost:3103` | 3103 |

---

## CORS Configuration

CORS is configured in `apps/api/src/main.ts` via the `CORS_ORIGINS` environment variable.

### Local Development (Default)

When `CORS_ORIGINS` is not set, the API allows:
```
http://localhost:3100
http://localhost:3101
http://localhost:3102
http://localhost:3103
```

### Production CORS Allowlist

```bash
CORS_ORIGINS=https://tailfire.phoenixvoyages.ca,https://ota.phoenixvoyages.ca,https://client.phoenixvoyages.ca,https://phoenixvoyages.ca,https://www.phoenixvoyages.ca
```

> **Note:** The root domain (`phoenixvoyages.ca` and `www.phoenixvoyages.ca`) must be included because OTA may run at the root domain.

### Preview CORS Allowlist

```bash
CORS_ORIGINS=https://tailfire-dev.phoenixvoyages.ca,https://ota-dev.phoenixvoyages.ca,https://client-dev.phoenixvoyages.ca
```

### Preview Deployments (Vercel)

For Vercel preview deployments, you have two options:

1. **Add explicit preview URLs** to the allowlist as they're created
2. **Implement dynamic origin checking** in the API (the default CORS middleware does not support wildcards like `*.vercel.app`)

Example dynamic origin checker pattern:
```typescript
origin: (origin, callback) => {
  const allowed = process.env.CORS_ORIGINS?.split(',') || []
  if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
    callback(null, true)
  } else {
    callback(new Error('Not allowed by CORS'))
  }
}
```

---

## Environment Variable Matrix

### API (`apps/api`) - Railway

| Variable | Local Dev | Cloud Preview | Production |
|----------|-----------|---------------|------------|
| `NODE_ENV` | `development` | `development` | `production` |
| `PORT` | `3101` | (Railway assigns) | (Railway assigns) |
| `DATABASE_URL` | tailfire-Dev Supabase | Tailfire-Preview Supabase | Tailfire-Prod Supabase |
| `SUPABASE_URL` | tailfire-Dev URL | Tailfire-Preview URL | Tailfire-Prod URL |
| `SUPABASE_SERVICE_ROLE_KEY` | tailfire-Dev key | Tailfire-Preview key | Tailfire-Prod key |
| `REDIS_URL` | `redis://localhost:6379` | Railway Redis | Railway Redis |
| `ENABLE_BULL_BOARD` | `true` (implicit) | `true` | `false` (set to enable) |
| `CORS_ORIGINS` | (default localhost) | Preview allowlist | Prod allowlist |
| `ADMIN_URL` | `http://localhost:3100` | `https://tailfire-dev.phoenixvoyages.ca` | `https://tailfire.phoenixvoyages.ca` |
| `RUN_MIGRATIONS_ON_STARTUP` | `true` (implicit) | `false` | `false` |
| `ENABLE_SWAGGER_DOCS` | `true` | `true` | `false` |

### Admin (`apps/admin`) - Vercel

| Variable | Local Dev | Cloud Preview | Production |
|----------|-----------|---------------|------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3101/api/v1` | `https://api-dev.tailfire.ca/api/v1` | `https://api.tailfire.ca/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | tailfire-Dev URL | Tailfire-Preview URL | Tailfire-Prod URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tailfire-Dev anon key | Tailfire-Preview anon key | Tailfire-Prod anon key |

### OTA (`apps/ota`) - Vercel

| Variable | Local Dev | Cloud Preview | Production |
|----------|-----------|---------------|------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3101/api/v1` | `https://api-dev.tailfire.ca/api/v1` | `https://api.tailfire.ca/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | tailfire-Dev URL | Tailfire-Preview URL | Tailfire-Prod URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tailfire-Dev anon key | Tailfire-Preview anon key | Tailfire-Prod anon key |

### Client (`apps/client`) - Vercel

| Variable | Local Dev | Cloud Preview | Production |
|----------|-----------|---------------|------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3101/api/v1` | `https://api-dev.tailfire.ca/api/v1` | `https://api.tailfire.ca/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | tailfire-Dev URL | Tailfire-Preview URL | Tailfire-Prod URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tailfire-Dev anon key | Tailfire-Preview anon key | Tailfire-Prod anon key |

---

## Supabase Projects

| Environment | Project Name | Project Ref | Region | Purpose |
|-------------|--------------|-------------|--------|---------|
| **Local Dev** | tailfire-Dev | `hplioumsywqgtnhwcivw` | us-east-1 | Local development database |
| **Cloud Preview** | Tailfire-Preview | `gaqacfstpnmwphekjzae` | ca-central-1 | Staging/QA database |
| **Production** | Tailfire-Prod | `cmktvanwglszgadjrorm` | ca-central-1 | Production database |

> **Note:** There is also a `tailfire-ai` project (`ccyvpovnnxxogafqsawy`) which is used for AI/experimental features.

### Database Connection Types

| Type | Format | Usage |
|------|--------|-------|
| **Direct TCP** | `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` | Migrations (requires service role) |
| **Pooler** | `postgresql://postgres.[ref]:[password]@aws-1-ca-central-1.pooler.supabase.com:6543/postgres` | Application runtime |

---

## Railway Quick Reference

Quick reference for Railway API deployment configuration:

| Setting | Cloud Preview (api-dev) | Production (api-prod) |
|---------|-------------------------|----------------------|
| **Domain** | `api-dev.tailfire.ca` | `api.tailfire.ca` |
| **Git Branch** | `preview` | `main` |
| **NODE_ENV** | `development` | `production` |
| **Doppler Config** | `stg` | `prd` |
| **Supabase Project** | Tailfire-Preview (`gaqacfstpnmwphekjzae`) | Tailfire-Prod (`cmktvanwglszgadjrorm`) |
| **Health Check** | `/api/v1/health` | `/api/v1/health` |
| **Migrations** | CI/CD (not runtime) | CI/CD (not runtime) |

### Key Differences Between Environments

| Variable | Must Differ? | Notes |
|----------|--------------|-------|
| `NODE_ENV` | Yes | `development` vs `production` |
| `DATABASE_URL` | Yes | Different Supabase projects |
| `SUPABASE_*` keys | Yes | Different Supabase projects |
| `SUPABASE_JWT_SECRET` | Yes | **Must use HS256 algorithm** (see below) |
| `JWT_SECRET` | Yes | Security: unique per environment |
| `CORS_ORIGINS` | Yes | Different frontend domains |
| `ADMIN_URL` | Yes | Different admin domains |
| `ENABLE_SWAGGER_DOCS` | Yes | `true` in dev, `false` in prod |
| `RUN_MIGRATIONS_ON_STARTUP` | No | `false` in both (CI/CD handles) |

### JWT Algorithm Support

The NestJS API supports **both HS256 and ES256** JWT algorithms with automatic detection:

| Algorithm | Verification Method | Supabase Project Type |
|-----------|--------------------|-----------------------|
| **HS256** | `SUPABASE_JWT_SECRET` | Older projects |
| **ES256** | JWKS endpoint (public key) | Newer projects |

The JWT strategy automatically detects the algorithm from the token header and uses the appropriate verification method.

**Configuration by environment:**

| Environment | Supabase Project | Notes |
|-------------|------------------|-------|
| Local Dev | tailfire-Dev | Supports HS256 or ES256 |
| Cloud Preview | Tailfire-Preview | Supports HS256 or ES256 |
| Production | Tailfire-Prod | Supports HS256 or ES256 |

> **Note:** Ensure `SUPABASE_JWT_SECRET` is configured in Doppler for HS256 projects, or the JWKS endpoint is accessible for ES256 projects.

See [Security Model](./SECURITY.md#api-layer-nestjs) for implementation details.

---

## Supabase Auth URL Configuration

For each environment, configure in Supabase Dashboard > Authentication > URL Configuration:

### Production (Tailfire-Prod)
- **Site URL:** `https://tailfire.phoenixvoyages.ca`
- **Redirect URLs:**
  - `https://tailfire.phoenixvoyages.ca/auth/callback`
  - `https://tailfire.phoenixvoyages.ca/auth/reset-password`

### Cloud Preview (Tailfire-Preview)
- **Site URL:** `https://tailfire-dev.phoenixvoyages.ca`
- **Redirect URLs:**
  - `https://tailfire-dev.phoenixvoyages.ca/auth/callback`
  - `https://tailfire-dev.phoenixvoyages.ca/auth/reset-password`
  - `https://tf-demo.phoenixvoyages.ca/auth/callback`
  - `https://tf-demo.phoenixvoyages.ca/auth/reset-password`

### Local Dev (tailfire-Dev)
- **Site URL:** `http://localhost:3100`
- **Redirect URLs:**
  - `http://localhost:3100/auth/callback`
  - `http://localhost:3100/auth/reset-password`

---

## Test User Accounts

Test accounts are pre-configured for Local Dev and Cloud Preview environments. These are shared across both non-production environments.

| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| `admin@phoenixvoyages.ca` | `Phoenix2026!` | Admin | Full admin access |
| `agent@phoenixvoyages.ca` | `Phoenix2026!` | Agent | Travel agent workflows |
| `test@phoenixvoyages.ca` | `Phoenix2026!` | Test | General testing |

> **Important:** Production uses live user accounts created by the business. Do not use test accounts in production.

---

## Doppler Configuration

Doppler is used for centralized secrets management across all environments.

| Doppler Config | Environment | Purpose |
|----------------|-------------|---------|
| `dev` | Local Dev | Local development secrets |
| `stg` | Cloud Preview | Staging/QA secrets |
| `prd` | Production | Production secrets |

### Doppler Setup

1. Install the Doppler CLI: `brew install dopplerhq/cli/doppler`
2. Login: `doppler login`
3. Setup for local dev: `doppler setup --project tailfire --config dev`
4. Run with Doppler: `doppler run -- pnpm dev`

### Key Doppler Variables

Variables managed via Doppler (not committed to git):
- Database credentials (`DATABASE_URL`, `SUPABASE_*`)
- API keys for third-party services (OpenAI, Resend, etc.)
- Storage credentials (Cloudflare R2)
- JWT secrets and encryption keys

---

## Storage Configuration (Cloudflare R2)

Tailfire uses Cloudflare R2 for media storage (trip photos, documents, etc.).

### R2 Buckets by Environment

| Environment | Bucket Name | Public URL |
|-------------|-------------|------------|
| **Local Dev** | `tailfire-media-dev` | Via R2 public access |
| **Cloud Preview** | `tailfire-media-stg` | Via R2 public access |
| **Production** | `tailfire-media` | Via R2 public access |

### R2 Environment Variables

All R2 credentials are managed via Doppler:

| Variable | Description | Env-Specific? |
|----------|-------------|---------------|
| `CLOUDFLARE_R2_ACCOUNT_ID` | Cloudflare account ID | No (shared) |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 API access key ID | No (shared) |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API secret key | No (shared) |
| `CLOUDFLARE_R2_BUCKET_NAME` | Bucket name for this env | Yes |
| `R2_MEDIA_BUCKET` | Alias for bucket name | Yes |
| `R2_MEDIA_PUBLIC_URL` | Public URL for media access | Yes |

> **Note:** The R2 API credentials are shared across environments (same Cloudflare account), but each environment uses a different bucket to isolate data.

### Storage Provider Configuration

The API uses a `StorageProviderFactory` that automatically selects the storage backend based on available credentials:

1. **Cloudflare R2** (production) - When `CLOUDFLARE_R2_*` credentials are present
2. **Supabase Storage** (fallback) - When only Supabase credentials are available
3. **Local/Mock** (development) - When no cloud credentials are configured

The storage provider is initialized at API startup and logged:
```
✓ cloudflare_r2: credentials configured (env-specific)
```

---

## Redis Configuration (Automation System)

Tailfire uses Redis for the BullMQ job queue system (trip auto-transitions, notifications, etc.).

### Redis by Environment

| Environment | Redis Source | URL |
|-------------|--------------|-----|
| **Local Dev** | Docker container | `redis://localhost:6379` |
| **Cloud Preview** | Railway Redis service | Auto-injected by Railway |
| **Production** | Railway Redis service | Auto-injected by Railway |

### Local Development Setup

```bash
# Start Redis with Docker
docker run -d --name tailfire-redis -p 6379:6379 redis:7-alpine

# Verify connection
redis-cli ping  # Should return PONG
```

### Railway Redis

Redis is automatically provisioned and connected in Railway environments:
- Navigate to Railway Dashboard → Project → New → Database → Redis
- Railway auto-injects `REDIS_URL` into the API service

### Redis Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `ENABLE_BULL_BOARD` | Enable Bull Board dashboard | `true` in dev, `false` in prod |

See [Automation System](./AUTOMATION.md) for detailed job queue documentation.

---

## Related Documentation

- [Local Development](./LOCAL_DEV.md) - Port assignments and startup commands
- [CI/CD Pipeline](./CI_CD.md) - Deployment workflows
- [API Deployment](./DEPLOYMENT_API.md) - Railway configuration
- [Automation System](./AUTOMATION.md) - Job queues and trip auto-transitions
