# API Deployment (Railway)

This document describes Railway-specific configuration for deploying the NestJS API.

## Overview

The Tailfire API is deployed to Railway with the following environments:

| Environment | Domain | Purpose |
|-------------|--------|---------|
| **Production** | `api.tailfire.ca` | Live production API |
| **Development** | `api-dev.tailfire.ca` | Development/staging API |

---

## Railway Environments

The Railway project has two environments, each tied to a specific Git branch and Supabase project:

### Environment Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| **Domain** | `api-dev.tailfire.ca` | `api.tailfire.ca` |
| **Git Branch** | `preview` | `main` |
| **NODE_ENV** | `development` | `production` |
| **Supabase Project** | `gaqacfstpnmwphekjzae` | `cmktvanwglszgadjrorm` |

### Environment Variables by Environment

These variables **must be different** between Dev and Prod:

| Variable | Development | Production |
|----------|-------------|------------|
| `NODE_ENV` | `development` | `production` |
| `DATABASE_URL` | Dev Supabase pooler URL | Prod Supabase pooler URL |
| `SUPABASE_URL` | `https://gaqacfstpnmwphekjzae.supabase.co` | `https://cmktvanwglszgadjrorm.supabase.co` |
| `SUPABASE_ANON_KEY` | Dev anon key | Prod anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Dev service role key | Prod service role key |
| `SUPABASE_JWT_SECRET` | Dev JWT secret | Prod JWT secret |
| `JWT_SECRET` | Dev-specific secret | Prod-specific secret |
| `CORS_ORIGINS` | Dev allowlist (see below) | Prod allowlist (see below) |
| `ADMIN_URL` | `https://tailfire-dev.phoenixvoyages.ca` | `https://tailfire.phoenixvoyages.ca` |
| `ENABLE_SWAGGER_DOCS` | `true` | `false` |

### CORS Origins by Environment

**Development:**
```
https://tailfire-dev.phoenixvoyages.ca,https://ota-dev.phoenixvoyages.ca,https://client-dev.phoenixvoyages.ca,http://localhost:3100,http://localhost:3102,http://localhost:3103
```

**Production:**
```
https://tailfire.phoenixvoyages.ca,https://ota.phoenixvoyages.ca,https://client.phoenixvoyages.ca,https://phoenixvoyages.ca,https://www.phoenixvoyages.ca
```

### Migrations Guard

Migrations are handled by CI/CD, **not at runtime**:

| Variable | Development | Production |
|----------|-------------|------------|
| `RUN_MIGRATIONS_ON_STARTUP` | `false` | `false` |

> **Note:** Set `RUN_MIGRATIONS_ON_STARTUP=true` only for emergency migrations. CI/CD runs migrations before Railway deploys.

---

## DNS Configuration

Custom domains require DNS configuration to point to Railway.

### Production Domain Setup (`api.tailfire.ca`)

**Current Status:** The api-prod service is running in Railway. The domain `api.tailfire.ca` requires DNS configuration.

**Required DNS Record:**

| Type | Name | Value |
|------|------|-------|
| CNAME | `api` | Railway CNAME target |

**Where to find the CNAME target:**
1. Go to Railway dashboard
2. Select the `api-prod` service
3. Navigate to **Settings** → **Domains**
4. Click on `api.tailfire.ca` to view the CNAME target

### Development Domain Setup (`api-dev.tailfire.ca`)

| Type | Name | Value |
|------|------|-------|
| CNAME | `api-dev` | Railway CNAME target (from api-dev service) |

### Temporary Access

While waiting for DNS propagation, use Railway's generated domain for testing:
- Go to Railway service → **Settings** → **Domains**
- Click **Generate Domain** to get a `*.railway.app` URL

### Validation

After DNS is configured, verify:

1. **Health Check:**
   ```bash
   curl https://api.tailfire.ca/api/v1/health
   # Should return: {"status":"ok","timestamp":"..."}
   ```

2. **SSL Certificate:**
   - Railway automatically provisions SSL after DNS resolves
   - Certificate issuance may take a few minutes after DNS propagation

### DNS Propagation

DNS changes can take up to 48 hours to propagate globally, though typically complete within minutes to a few hours. Use tools like `dig` or online DNS checkers to verify:

```bash
dig api.tailfire.ca CNAME
```

---

## Build Strategy

Railway uses **Railpack** (or the project Dockerfile) to build the API. The build runs from the **repository root**, not `apps/api`.

### Dockerfile Build (Recommended)

The project includes a multi-stage Dockerfile optimized for the pnpm monorepo:

| Stage | Purpose |
|-------|---------|
| **base** | Node 20 with pnpm enabled |
| **deps** | Install dependencies for workspace packages |
| **builder** | Build @tailfire/database, @tailfire/shared-types, @tailfire/api |
| **runner** | Production image with only built artifacts |

```dockerfile
# Key build steps
RUN pnpm --filter @tailfire/database build
RUN pnpm --filter @tailfire/shared-types build
RUN pnpm --filter @tailfire/api build

# Production start
CMD ["node", "apps/api/dist/main.js"]
```

### Railway Configuration

| Setting | Value |
|---------|-------|
| **Root Directory** | `/` (repository root) |
| **Builder** | Dockerfile (or Railpack auto-detect) |
| **Watch Paths** | `apps/api/**`, `packages/**`, `Dockerfile` |

> **Note:** If using Railpack instead of Dockerfile, Railway will auto-detect the build configuration from package.json files.

---

## Health Check

| Setting | Value |
|---------|-------|
| **Path** | `/api/v1/health` |
| **Timeout** | 300 seconds |
| **Interval** | 30 seconds |

The health endpoint returns:

```json
{
  "status": "ok",
  "timestamp": "2026-01-07T12:00:00.000Z"
}
```

### Dockerfile Health Check

The Dockerfile includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3101/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

---

## Required Environment Variables

### Core Application

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (Railway assigns automatically) | `${{RAILWAY_PORT}}` |
| `API_PREFIX` | API route prefix | `api/v1` |

### Database

| Variable | Description | Notes |
|----------|-------------|-------|
| `DATABASE_URL` | Supabase PostgreSQL connection | Use pooler URL for runtime |
| `SUPABASE_URL` | Supabase project URL | `https://[ref].supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Public, safe for client |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | **Secret**, bypasses RLS |
| `SUPABASE_JWT_SECRET` | JWT verification secret | From Supabase dashboard |

### Authentication

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Internal JWT signing key | Generate secure random string |
| `JWT_EXPIRATION` | Token expiration | `7d` |
| `ADMIN_URL` | Admin frontend URL | `https://tailfire.phoenixvoyages.ca` |

### CORS

| Variable | Description | Example |
|----------|-------------|---------|
| `CORS_ORIGINS` | Allowed origins (comma-separated) | See [Environments](./ENVIRONMENTS.md) |

### External Services

| Variable | Description | Required |
|----------|-------------|----------|
| `RESEND_API_KEY` | Email service API key | Yes |
| `EMAIL_FROM_ADDRESS` | Sender email | Yes |
| `EMAIL_FROM_NAME` | Sender name | Yes |

### Traveltek FusionAPI (Cruise Booking)

| Variable | Description | Required |
|----------|-------------|----------|
| `TRAVELTEK_API_URL` | FusionAPI base URL (`https://fusionapi.traveltek.net/2.1/json`) | Yes |
| `TRAVELTEK_USERNAME` | OAuth username | Yes |
| `TRAVELTEK_PASSWORD` | OAuth password | Yes |
| `TRAVELTEK_SID` | Site ID for API requests | Yes |

### Traveltek FTP (Cruise Catalogue)

| Variable | Description | Required |
|----------|-------------|----------|
| `TRAVELTEK_FTP_HOST` | FTP server hostname | Yes |
| `TRAVELTEK_FTP_USER` | FTP username (e.g., `SYH_9_CAD`) | Yes |
| `TRAVELTEK_FTP_PASSWORD` | FTP password | Yes |

> See [Cruise Booking README](../apps/api/src/cruise-booking/README.md) for FusionAPI details.
> See [Cruise Import README](../apps/api/src/cruise-import/README.md) for FTP sync details.

### Storage (Cloudflare R2)

| Variable | Description | Required |
|----------|-------------|----------|
| `CLOUDFLARE_R2_ACCOUNT_ID` | Cloudflare account ID | Yes |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 API access key ID | Yes |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API secret key | Yes |
| `CLOUDFLARE_R2_BUCKET_NAME` | Bucket name (env-specific) | Yes |
| `R2_MEDIA_BUCKET` | Alias for bucket name | Yes |
| `R2_MEDIA_PUBLIC_URL` | Public URL for media access | Yes |

> **Note:** R2 credentials are managed via Doppler. Each environment uses a different bucket:
> - Development: `tailfire-media-dev`
> - Preview/Staging: `tailfire-media-stg`
> - Production: `tailfire-media`

### Feature Flags

| Variable | Description | Production Value |
|----------|-------------|------------------|
| `ENABLE_SWAGGER_DOCS` | Enable Swagger UI | `false` |
| `ENABLE_API_THROTTLING` | Enable rate limiting | `true` |
| `THROTTLE_TTL` | Rate limit window (seconds) | `60` |
| `THROTTLE_LIMIT` | Requests per window | `100` |
| `RUN_MIGRATIONS_ON_STARTUP` | Run migrations on boot | `false` |

---

## Migration Guard Behavior

The API includes a migration guard to prevent accidental migration runs in production:

```typescript
const shouldRunMigrations =
  process.env.NODE_ENV === 'development' ||
  process.env.RUN_MIGRATIONS_ON_STARTUP === 'true'
```

### Production Behavior

- `RUN_MIGRATIONS_ON_STARTUP` should be `false` (or unset)
- Migrations run via CI/CD **before** API deployment
- API logs: `"Skipping migrations (CI/CD handles production migrations)"`

### Development Behavior

- Migrations run automatically on startup
- Safe because dev database allows `ALLOW_DATABASE_RESET=true`

### Emergency Migration Run

If you need to run migrations from a running production instance:

1. **Temporarily** set `RUN_MIGRATIONS_ON_STARTUP=true`
2. Redeploy or restart the service
3. **Immediately** set back to `false` after success

> **Warning:** Prefer CI/CD migrations. Manual runs risk schema drift between instances.

---

## Deployment Workflow

### Automatic (Railway Auto-Deploy)

Railway automatically deploys when code is pushed to configured branches:

1. Push to `main` or `preview` triggers Railway
2. Railway can wait for GitHub Actions to complete ("Wait for CI")
3. Railway builds using Dockerfile
4. New version deploys with health check validation

### CI/CD Integration

For production deployments, Railway should be configured to "Wait for CI":

1. Push to `main` triggers both:
   - GitHub Actions `deploy-prod.yml` (runs migrations)
   - Railway deployment (waits for CI)
2. CI completes migrations successfully
3. Railway proceeds with deployment
4. Health check validates deployment

See [CI/CD Pipeline](./CI_CD.md) for full details.

### Manual Deployment

```bash
# Railway CLI
railway up

# Or trigger via Railway dashboard
```

---

## Railway CLI Commands

```bash
# Login
railway login

# Link to project
railway link

# Deploy current directory
railway up

# View logs
railway logs

# Open dashboard
railway open

# Set environment variable
railway variables set KEY=value

# List variables
railway variables
```

---

## Monitoring & Logs

### Railway Dashboard

- **Metrics**: CPU, memory, network
- **Logs**: Real-time and historical
- **Deployments**: History and rollback

### Log Levels

Set `LOG_LEVEL` environment variable:

| Level | Description |
|-------|-------------|
| `error` | Errors only |
| `warn` | Warnings and errors |
| `info` | Standard logging (recommended for production) |
| `debug` | Verbose debugging |

---

## Scaling Configuration

### Horizontal Scaling

Railway supports multiple instances. Ensure:
- Sessions are stateless (JWT-based auth)
- No in-memory state (use Redis for caching)
- Database connections use pooler

### Resource Limits

| Setting | Recommended |
|---------|-------------|
| **Memory** | 512MB - 1GB |
| **CPU** | 0.5 - 1 vCPU |
| **Instances** | 1-2 (scale as needed) |

---

## Troubleshooting

### Deployment Fails

1. Check build logs for errors
2. Verify all required env vars are set
3. Check Dockerfile builds successfully locally

### Health Check Fails

1. Verify `/api/v1/health` returns 200
2. Check `PORT` is correctly set (Railway auto-assigns)
3. Review startup logs for errors

### Database Connection Errors

1. Verify `DATABASE_URL` is correct
2. Check if using pooler URL (recommended) vs direct
3. Verify SSL mode if required

### Migration Drift

If production schema is out of sync:

1. Check `supabase_migrations` table for applied migrations
2. Compare with `packages/database/src/migrations/`
3. Apply missing migrations via CI/CD

---

## Secrets Management (Doppler + Railway Native Integration)

Railway environment variables are managed via **Doppler's native Railway integration** for real-time, continuous secret synchronization.

### Configuration Overview

| Doppler Config | Railway Environment | Service | Purpose |
|----------------|---------------------|---------|---------|
| `stg` | Development | `api-dev` | Preview/staging secrets |
| `prd` | Production | `api-prod` | Production secrets |

### How It Works

Doppler's native Railway integration provides:
- **Real-time sync**: Secrets sync automatically when changed (not just on deploy)
- **Auto-redeploy**: Railway can auto-redeploy when secrets change (recommended)
- **Single source of truth**: Doppler dashboard is the authoritative source
- **No CI/CD workflow changes**: Integration is configured once in Doppler

### Setup Steps

1. **Generate Railway API Token** (Account Settings → Tokens)
   - Must be **account-level** token (not project-specific)
   - Project-specific tokens don't work with Doppler integration

2. **Configure in Doppler Dashboard**
   - Navigate to Project `tailfire` → Config (`prd` or `stg`) → Integrations
   - Add Railway integration with the token
   - Select Railway project, environment, and service
   - Enable auto-redeploy (recommended)

3. **Verify in Railway Dashboard**
   - Check service Variables tab shows secrets from Doppler
   - Secrets should include all Doppler values

### Managing Secrets

**Via Doppler MCP (Claude Code — preferred):**
```
# View secrets for an environment
mcp__doppler__secrets_list(project: "tailfire", config: "prd")

# Get a single secret
mcp__doppler__secrets_get(project: "tailfire", config: "prd", name: "DATABASE_URL")

# Update a secret (confirm with user before writing to prd)
mcp__doppler__secrets_update(project: "tailfire", config: "prd", secrets: {"KEY": "value"})

# Compare environments
mcp__doppler__secrets_download(project: "tailfire", config: "stg", format: "json")
mcp__doppler__secrets_download(project: "tailfire", config: "prd", format: "json")
```

**Via Doppler CLI (human developers):**
```bash
doppler secrets -p tailfire -c prd                                  # View secrets
doppler secrets set VARIABLE_NAME=value -p tailfire -c prd          # Update
doppler secrets set KEY1=value1 KEY2=value2 -p tailfire -c prd      # Set multiple
```

> **Important:** Do not set secrets directly in Railway. Always use Doppler as the source of truth. Changes in Doppler sync to Railway automatically.

### Cruise Sync Secrets

The following secrets are required for cruise catalog synchronization:

| Secret | Description | Required |
|--------|-------------|----------|
| `INTERNAL_API_KEY` | Protects `/cruise-import/*` endpoints | Yes |
| `ENABLE_SCHEDULED_CRUISE_SYNC` | Enable daily CRON sync (set to `true`) | Yes |
| `TRAVELTEK_FTP_HOST` | FTP server hostname | Yes |
| `TRAVELTEK_FTP_USER` | FTP username | Yes |
| `TRAVELTEK_FTP_PASSWORD` | FTP password | Yes |

### CRON Schedule

When `ENABLE_SCHEDULED_CRUISE_SYNC=true`, the following scheduled jobs run:

| Job | Time (Toronto) | Description |
|-----|----------------|-------------|
| Cruise Sync | 2:00 AM | Full catalog sync from Traveltek FTP |
| Raw JSON Purge | 3:00 AM | Clean up old raw import data |
| Past Sailing Cleanup | 4:00 AM | Archive departed sailings |
| Daily Stub Report | 6:00 AM | Report on unmatched cruise data |

Reference: [Doppler Railway Integration Docs](https://docs.doppler.com/docs/railway)

---

## Environment Variable Template

Reference template for Railway environment configuration (managed via Doppler):

```bash
# Core
NODE_ENV=production
API_PREFIX=api/v1

# Database
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-1-ca-central-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

# Auth
JWT_SECRET=your-secure-jwt-secret
JWT_EXPIRATION=7d
ADMIN_URL=https://tailfire.phoenixvoyages.ca

# CORS
CORS_ORIGINS=https://tailfire.phoenixvoyages.ca,https://ota.phoenixvoyages.ca,https://client.phoenixvoyages.ca,https://phoenixvoyages.ca,https://www.phoenixvoyages.ca

# Email
RESEND_API_KEY=re_...
EMAIL_FROM_ADDRESS=noreply@phoenixvoyages.ca
EMAIL_FROM_NAME=Phoenix Voyages

# Storage (Cloudflare R2)
CLOUDFLARE_R2_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-r2-access-key-id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-r2-secret-key
CLOUDFLARE_R2_BUCKET_NAME=tailfire-media
R2_MEDIA_BUCKET=tailfire-media
R2_MEDIA_PUBLIC_URL=https://your-r2-public-url

# Features
ENABLE_SWAGGER_DOCS=false
ENABLE_API_THROTTLING=true
THROTTLE_TTL=60
THROTTLE_LIMIT=100
RUN_MIGRATIONS_ON_STARTUP=false
LOG_LEVEL=info
```

---

## Related Documentation

- [Environment Configuration](./ENVIRONMENTS.md) - Domain and variable mapping
- [CI/CD Pipeline](./CI_CD.md) - Deployment workflows
- [Local Development](./LOCAL_DEV.md) - Running locally
- [API README](../apps/api/README.md) - Full API documentation
