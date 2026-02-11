# Claude Code Project Guidelines - Tailfire

## Critical Rules

### 1. NEVER Apply Database Changes Directly to Production

**DO NOT:**
- Use Supabase MCP `execute_sql` for DDL or data changes on production
- Use Supabase MCP `apply_migration` on production
- Manually fix sequences, constraints, or schema on production

**ALWAYS:**
- Let CI/CD (`deploy-prod.yml`) handle all production database changes
- Only use `execute_sql` for READ-ONLY validation queries (SELECT only)

### 2. NEVER Push Directly to Main Without Preview

**DO NOT:**
- Commit and push directly to `main` branch
- Skip the dev/preview deployment step

**ALWAYS:**
1. Create a feature branch (e.g., `feature/phase-12-storage`)
2. Push to feature branch to trigger `deploy-dev.yml`
3. Verify changes work on preview environment
4. Create PR and merge to `main` for production deployment

### 3. ALWAYS Use tmux Pane 2 and Full Turbo Dev

**ALWAYS:**
- Use **tmux pane 2** for all terminal interactions (dev server, builds, etc.)
- Restart the **full turbo repo** (`turbo dev`), never just a single app (`turbo dev --filter=@tailfire/admin`)
- To restart: `tmux send-keys -t 2 C-c && sleep 2 && tmux send-keys -t 2 'turbo dev' Enter`

**Pane layout:**
- Pane 0: Claude Code
- Pane 1: Codex
- Pane 2: Dev server / terminal

### 4. NEVER Run Cruise Sync on Non-Production Environments

**DO NOT:**
- Run `cruise-import/sync` endpoint against localhost or dev API
- Set `ENABLE_SCHEDULED_CRUISE_SYNC=true` in dev/stg Doppler configs
- Trigger FTP sync from local development (`turbo dev`)

**WHY:** Dev and Preview databases use **FDW (Foreign Data Wrapper)** to read catalog data directly from Production. Running sync locally creates duplicate local tables that break the FDW architecture and waste storage.

**CORRECT WORKFLOW:**
1. Cruise sync runs ONLY on Production API (`api.tailfire.ca`) via scheduled CRON
2. Dev/Preview environments automatically see Production data through FDW
3. To test sync code changes: deploy to production and monitor the daily 2 AM sync

## Development Workflow (A to Z)

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. LOCAL DEVELOPMENT                                                         │
│    Database: tailfire-Dev (hplioumsywqgtnhwcivw)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│    turbo dev                      # Start all services                       │
│    cd apps/api && pnpm db:migrate # Run migrations locally                   │
│    # Test at localhost:3100 (admin) / localhost:3101 (api)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. PREVIEW DEPLOYMENT                                                        │
│    Database: Tailfire-Preview (gaqacfstpnmwphekjzae)                         │
│    Trigger: Push to `preview` branch                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│    git checkout -b feature/your-feature                                      │
│    git push -u origin feature/your-feature                                   │
│    git checkout preview && git merge feature/your-feature && git push        │
│    # OR: Push directly to preview branch                                     │
│    # Runs: .github/workflows/deploy-preview.yml                              │
│    # Test at tf-demo.phoenixvoyages.ca / api-dev.tailfire.ca                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. PRODUCTION DEPLOYMENT                                                     │
│    Database: Tailfire-Prod (cmktvanwglszgadjrorm)                            │
│    Trigger: Merge PR to `main` branch                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│    # Create PR from feature branch to main                                   │
│    # Review and approve                                                      │
│    # Merge PR                                                                │
│    # Runs: .github/workflows/deploy-prod.yml                                 │
│    # Live at tailfire.phoenixvoyages.ca / api.tailfire.ca                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Migration Workflow

See `packages/database/MIGRATIONS.md` for detailed migration conventions.

Quick reference:
```bash
# 1. Create feature branch
git checkout -b feature/your-feature

# 2. Create migration with timestamp
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
touch packages/database/src/migrations/${TIMESTAMP}_description.sql

# 3. Register in meta/_journal.json

# 4. Run migration locally (tailfire-Dev)
cd apps/api && pnpm db:migrate

# 5. Push to preview branch (triggers preview deployment)
git push -u origin feature/your-feature
git checkout preview && git merge feature/your-feature && git push

# 6. Verify on preview environment (tf-demo.phoenixvoyages.ca)

# 7. Create PR to main (triggers prod deployment after merge)
```

## Supabase MCP Usage

| Tool | Allowed Usage | Forbidden Usage |
|------|---------------|-----------------|
| `execute_sql` | SELECT queries for validation | INSERT, UPDATE, DELETE, DDL |
| `apply_migration` | Never use | All usage |
| `list_tables` | Always allowed | - |
| `list_migrations` | Always allowed | - |
| `get_logs` | Always allowed | - |

## Doppler CLI

Environment secrets are managed via Doppler. The CLI is available for managing secrets.

### Project and Configs
- **Project**: `tailfire`
- **Configs**: `dev`, `stg` (staging/preview), `prd` (production)

### Common Commands
```bash
# List all projects
doppler projects

# List configs for tailfire
doppler configs -p tailfire

# View secrets (masked)
doppler secrets -p tailfire -c dev

# Set a secret
doppler secrets set KEY="value" -p tailfire -c dev

# Set multiple secrets
doppler secrets set KEY1="value1" KEY2="value2" -p tailfire -c prd

# Delete a secret
doppler secrets delete KEY -p tailfire -c dev
```

### Key Secrets
| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `INTERNAL_API_KEY` | API key for internal endpoints (cruise-import) |
| `ENABLE_SCHEDULED_CRUISE_SYNC` | Enable daily cruise sync cron (`true`/`false`) |
| `TRAVELTEK_API_URL` | FusionAPI base URL for cruise booking |
| `TRAVELTEK_USERNAME` | FusionAPI OAuth username |
| `TRAVELTEK_PASSWORD` | FusionAPI OAuth password |
| `TRAVELTEK_SID` | FusionAPI agency session ID |

## Environment URLs

### Production
- **API**: https://api.tailfire.ca
- **Admin**: https://tailfire.phoenixvoyages.ca
- **OTA**: https://ota.phoenixvoyages.ca
- **Client**: https://client.phoenixvoyages.ca

### Dev/Preview
- **API**: https://api-dev.tailfire.ca
- **Admin**: https://tf-demo.phoenixvoyages.ca

### Local Development (Turbo Repo)
- **Admin**: http://localhost:3100
- **API**: http://localhost:3101 (prefix: `api/v1`)
- **API Docs**: http://localhost:3101/api/v1/docs (when `ENABLE_SWAGGER_DOCS=true`)

Start all services: `turbo dev` from project root

## Database Environments

### Supabase Projects

| Project | ID | Region | Purpose |
|---------|-----|--------|---------|
| **tailfire-Dev** | `hplioumsywqgtnhwcivw` | us-east-1 | Local development only |
| **Tailfire-Preview** | `gaqacfstpnmwphekjzae` | ca-central-1 | CI/CD preview deployments |
| **Tailfire-Prod** | `cmktvanwglszgadjrorm` | ca-central-1 | Production |

### Environment Mapping

| Context | Database | Config Source |
|---------|----------|---------------|
| `turbo dev` (localhost) | tailfire-Dev | Local `.env` files |
| `deploy-dev.yml` (tf-demo) | Tailfire-Preview | Doppler `dev` config |
| `deploy-prod.yml` (production) | Tailfire-Prod | Doppler `prd` config |

### Doppler Configs

| Doppler Config | Target Database | Purpose |
|----------------|-----------------|---------|
| `dev` | tailfire-Dev | Local development |
| `stg` | Tailfire-Preview | CI/CD preview deployments |
| `prd` | Tailfire-Prod | Production |

### Railway Environments

Railway has TWO environments with separate `api-dev` services:

| Railway Environment | Railway Service | Supabase Project | Doppler Config |
|---------------------|-----------------|------------------|----------------|
| `production` | `api-prod` | Tailfire-Prod | `prd` |
| `production` | `api-dev` | ⚠️ Legacy - do not use | - |
| `preview` | `api-dev` | Tailfire-Preview | `stg` |

> **IMPORTANT:** The `api-dev` service in Railway's `production` environment is legacy and should not be used. TF-Demo uses the `api-dev` service in Railway's `preview` environment.

### ⚠️ CRITICAL: Doppler and Railway Are NOT Automatically Synced

**There is NO automatic sync between Doppler and Railway.** When you update a secret in Doppler, you MUST also update it in Railway manually.

This has caused multiple production issues where:
1. Doppler has correct Preview project credentials (`gaqacfstpnmwphekjzae`)
2. Railway still has old Dev project credentials (`hplioumsywqgtnhwcivw`)
3. Result: 401 Unauthorized errors, wrong database data, auth failures

**Variables That MUST Match Between Doppler `stg` and Railway `preview` → `api-dev`:**

| Variable | Must Point To | Project Ref |
|----------|---------------|-------------|
| `DATABASE_URL` | Tailfire-Preview pooler | `postgres.gaqacfstpnmwphekjzae` |
| `SUPABASE_URL` | Tailfire-Preview | `https://gaqacfstpnmwphekjzae.supabase.co` |
| `SUPABASE_JWT_SECRET` | Tailfire-Preview JWT | Retrieved from Supabase API |
| `SUPABASE_ANON_KEY` | Tailfire-Preview anon key | From Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Tailfire-Preview service key | From Supabase Dashboard |

**Verification Workflow (Run After Any Doppler Changes):**
```bash
# 1. Switch to correct Railway environment
railway environment preview
railway service api-dev

# 2. Compare Doppler vs Railway
echo "=== Doppler stg ===" && doppler secrets -p tailfire -c stg | grep -E "DATABASE_URL|SUPABASE_URL"
echo "=== Railway preview ===" && railway variables --kv | grep -E "DATABASE_URL|SUPABASE_URL"

# 3. If mismatch, sync from Doppler to Railway
railway variables --set "DATABASE_URL=$(doppler secrets get DATABASE_URL -p tailfire -c stg --plain)"
railway variables --set "SUPABASE_URL=$(doppler secrets get SUPABASE_URL -p tailfire -c stg --plain)"
railway variables --set "SUPABASE_JWT_SECRET=$(doppler secrets get SUPABASE_JWT_SECRET -p tailfire -c stg --plain)"

# 4. Verify service redeployed with new variables
railway service status
```

**Future Fix:** Set up native Doppler-Railway integration (see `docs/DEPLOYMENT_API.md` for instructions).

### Critical Supabase Secrets

Each Supabase project has unique secrets that MUST match in the corresponding Doppler/Railway config:

| Secret | Description | How to Retrieve |
|--------|-------------|-----------------|
| `SUPABASE_JWT_SECRET` | Signs/verifies auth tokens | Supabase Management API: `GET /v1/projects/{ref}/postgrest` → `jwt_secret` |
| `SUPABASE_ANON_KEY` | Public API key | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin API key | Supabase Dashboard → Settings → API |
| `SUPABASE_URL` | Project URL | `https://{project_ref}.supabase.co` |

**Common Misconfigurations:**
- Using dev project's `SUPABASE_JWT_SECRET` in preview/prod → 401 Unauthorized errors
- JWT tokens signed by one Supabase project cannot be verified by another project's secret

**Verification Commands:**
```bash
# Check Railway environment and service
railway environment preview
railway service api-dev
railway variables | grep SUPABASE

# Check Doppler config
doppler secrets -p tailfire -c stg | grep SUPABASE

# Get correct JWT secret from Supabase
ACCESS_TOKEN=$(doppler secrets get SUPABASE_ACCESS_TOKEN -p tailfire -c stg --plain)
PROJECT_REF="gaqacfstpnmwphekjzae"  # Preview project
curl -s "https://api.supabase.com/v1/projects/${PROJECT_REF}/postgrest" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq '.jwt_secret'
```

### Running Migrations

```bash
# Local development (tailfire-Dev) - EITHER method works:
cd apps/api && pnpm db:migrate                    # Uses local .env
doppler run -p tailfire -c dev -- pnpm db:migrate # Uses Doppler dev

# Preview environment (via CI/CD only)
# Triggered by pushing to preview branch → deploy-preview.yml

# Production (via CI/CD only)
# Triggered by merging to main → deploy-prod.yml
```

## Storage System (Multi-Provider)

The application supports multiple storage providers with automatic failover:
- **Cloudflare R2** (primary) - S3-compatible, cost-effective
- **Backblaze B2** - S3-compatible, very low storage costs
- **Supabase Storage** - Integrated with Supabase

### Buckets
- **Documents**: `tailfire-documents` (PDFs, contracts - private, signed URLs)
- **Media**: `tailfire-media` / `tailfire-media-stg` (images, cover photos - public URLs)

### Key Files
- `apps/api/src/storage/providers/storage-provider.interface.ts` - Provider interface
- `apps/api/src/storage/providers/storage-provider.factory.ts` - Creates and caches providers
- `apps/api/src/trips/storage.service.ts` - High-level storage operations
- `apps/api/src/api-credentials/credential-resolver.service.ts` - Resolves credentials from Doppler

### Provider-Aware URL Generation
Each provider implements `getPublicUrl(path)` to generate URLs appropriate for that provider:
- **Supabase**: `{supabaseUrl}/storage/v1/object/public/{bucket}/{path}`
- **R2**: `{publicUrl}/{path}` (requires R2_MEDIA_PUBLIC_URL)
- **B2**: `{publicUrl}/{path}` (requires B2 public URL config)

The `StorageService` uses the active provider's `getPublicUrl()` method, ensuring URLs match where files are actually stored.

### Important: Module Initialization Order
The `StorageProviderFactory` must NOT call `credentialResolver.isAvailable()` before creating providers. This is because `CredentialResolverService.onModuleInit()` may not have run yet when `StorageService.onModuleInit()` executes. The `resolve()` method already handles missing credentials by throwing `ConfigurationError`.

### Unsplash Integration
Stock photos are provided via Unsplash API. Credentials are managed through Doppler as a shared credential across environments.

## Automation System (BullMQ + Redis)

The API includes a centralized job queue system for scheduled and delayed tasks using BullMQ + Redis.

### Key Features
- **Trip Auto-Transitions**: Automatic status changes (booked → in_progress → completed) based on dates
- **Bull Board Dashboard**: Admin UI at `/admin/queues` for monitoring jobs
- **Job History**: Permanent audit trail in `automation_job_history` table
- **Timezone-Aware**: Jobs scheduled in trip's local timezone

### Queues
| Queue | Purpose |
|-------|---------|
| `trip-automation` | Status transitions, reminders |
| `client-care` | Emails, follow-ups |
| `notifications` | Push, email, SMS delivery |

### Key Files
- `apps/api/src/automation/automation.module.ts` - BullMQ configuration
- `apps/api/src/automation/automation.service.ts` - Central scheduling API
- `apps/api/src/automation/processors/trip-automation.processor.ts` - Trip status transitions
- `apps/api/src/automation/admin/bull-board.setup.ts` - Dashboard setup

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `ENABLE_BULL_BOARD` | Enable Bull Board in production | `false` |

### Local Development
```bash
# Start Redis with Docker
docker run -d --name tailfire-redis -p 6379:6379 redis:7-alpine

# Verify connection
redis-cli ping  # Should return PONG
```

### Admin API Endpoints
```bash
# Get queue counts
curl http://localhost:3101/api/v1/admin/automation/queues \
  -H "Authorization: Bearer $TOKEN"

# Trigger trip backfill
curl -X POST http://localhost:3101/api/v1/admin/automation/trips/backfill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 100}'
```

See `docs/AUTOMATION.md` for detailed documentation.

## Cruise Catalog (FDW Architecture)

The cruise catalog data is synchronized from Traveltek FTP and uses Foreign Data Wrapper (FDW) to share data across environments.

### Architecture

| Environment | Database | Cruise Data Source | Sync Allowed? |
|-------------|----------|-------------------|---------------|
| **Local Dev** | tailfire-Dev | FDW → Prod `catalog` | **NO** |
| **Preview** | Tailfire-Preview | FDW → Prod `catalog` | **NO** |
| **Prod** | Tailfire-Prod | Local `catalog` schema | **YES** (CRON at 2 AM) |

### Data Flow
```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION ONLY                               │
│  Traveltek FTP ──► CRON (2 AM) ──► catalog.* tables             │
│                    api.tailfire.ca                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                    FDW (Foreign Data Wrapper)
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│   LOCAL DEV       │                   │   PREVIEW         │
│   tailfire-Dev    │                   │   Tailfire-Preview│
│   (FDW read-only) │                   │   (FDW read-only) │
└───────────────────┘                   └───────────────────┘
```

### Key Points
- **ONLY Production runs cruise sync** - scheduled CRON at 2 AM Toronto time
- **Automatic retry on FTP failures** - 3 attempts with exponential backoff (5min, 10min delays)
- **Dev and Preview use FDW** - foreign tables that read directly from Production
- **DO NOT run sync locally** - it will create local tables that break FDW architecture
- The FDW migration (`20260104205000_setup_catalog_fdw.sql`) auto-detects environment
- Production has 16 local catalog tables; Dev/Preview have 16 foreign tables pointing to Prod

### Sync Endpoints (Production Only!)

> **WARNING:** These endpoints must ONLY be called against `api.tailfire.ca` (Production).
> Never call sync endpoints on localhost or api-dev.tailfire.ca - this breaks the FDW architecture.

```bash
# Test connection (Production only)
curl https://api.tailfire.ca/api/v1/cruise-import/test-connection \
  -H "x-internal-api-key: <key>"

# Trigger sync (Production only - normally runs via CRON at 2 AM)
curl -X POST https://api.tailfire.ca/api/v1/cruise-import/sync \
  -H "x-internal-api-key: <key>" \
  -H "Content-Type: application/json" \
  -d '{"concurrency": 4}'

# Check status
curl https://api.tailfire.ca/api/v1/cruise-import/sync/status \
  -H "x-internal-api-key: <key>"
```

### Cruise Repository API (Tiered Auth)
- **JWT auth** (admin/client portal): No rate limiting
- **API key auth** (`x-catalog-api-key`): 30 req/min rate limit
- Both auth types work for `/cruise-repository/*` endpoints

## Cruise Booking Module (FusionAPI)

Real-time cruise booking via Traveltek FusionAPI. Supports three booking flows:

| Flow | Description |
|------|-------------|
| **Agent** | Agent searches, selects cabin, books on behalf of client |
| **Client Handoff** | Agent searches & holds cabin → Client completes booking |
| **OTA** | Client self-service search and booking |

### Key Files
- `apps/api/src/cruise-booking/cruise-booking.controller.ts` - 10 API endpoints
- `apps/api/src/cruise-booking/services/booking.service.ts` - Booking orchestration
- `apps/api/src/cruise-booking/services/fusion-api.service.ts` - FusionAPI client
- `apps/api/src/cruise-booking/services/traveltek-auth.service.ts` - OAuth token management

### Session Tables
- `cruise_booking_sessions` - Ephemeral FusionAPI session state
- `cruise_booking_idempotency` - Double-booking prevention (24h TTL)

### Two Expiry Times
| Expiry | Duration | Purpose |
|--------|----------|---------|
| **Session** | 2+ hours | FusionAPI stateful context |
| **Cabin Hold** | 15-30 min | Inventory reservation |

### Required Environment Variables
| Variable | Description |
|----------|-------------|
| `TRAVELTEK_API_URL` | FusionAPI base URL |
| `TRAVELTEK_USERNAME` | OAuth client username |
| `TRAVELTEK_PASSWORD` | OAuth client password |
| `TRAVELTEK_SID` | Agency session ID |

## Codex Collaboration (tmux)

When collaborating with Codex for plan validation or code review, **USE THE SKILL**:

```
/validate-with-codex
```

This skill provides a complete 7-step workflow including:
1. Prepare the query
2. Send to Codex (with **CRITICAL** `tmux send-keys -t 1 Enter` step)
3. Wait for response
4. Capture the response
5. Read and analyze
6. **Loop back to Step 1 if issues found** - iterate until approved
7. Present summary to user

### Common Use Cases
- **Plan validation**: Send implementation plans before coding
- **Security review**: Review credentials, auth flows, API designs
- **Documentation review**: Validate technical accuracy
- **Architecture decisions**: Get second opinion on design choices

### Quick Reference (if not using skill)
```bash
# Write query
cat > /tmp/codex_query.txt << 'EOF'
Your query for Codex...
EOF

# Send to Codex - ALL STEPS REQUIRED
tmux load-buffer /tmp/codex_query.txt
tmux paste-buffer -t 1
tmux send-keys -t 1 C-m  # <-- CRITICAL: C-m is Ctrl+M (Enter key)

# Wait and capture
sleep 10
tmux capture-pane -t 1 -p -S -200 > /tmp/codex_response.txt
cat /tmp/codex_response.txt
```

> **Note**: Use `C-m` (Ctrl+M) instead of `Enter` for tmux send-keys. The `Enter` keyword may not work reliably in all terminal configurations.
