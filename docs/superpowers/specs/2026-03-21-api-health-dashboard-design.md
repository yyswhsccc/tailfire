# API Health Dashboard — Design Spec

## Goal

Replace the static API Credentials page with an active health monitoring dashboard. BullMQ runs health checks every 15 minutes against all external APIs, stores results, and notifies admins on consecutive failures.

## Provider List

| Provider | Category | Health Check Method | New? |
|----------|----------|-------------------|------|
| Amadeus | Travel | OAuth token acquisition | Existing |
| AeroDataBox | Travel | RapidAPI health endpoint | Existing |
| Traveltek/FusionAPI | Travel | `getAccessToken()` via TraveltekAuthService | New |
| Globus/Catalog | Travel | Lightweight search query | New |
| Google Places | Services | API key validation | Existing |
| Stripe | Services | `GET /v1/account` | New |
| Resend | Services | `GET /domains` | New |
| Unsplash | Services | `GET /photos/random` | Existing |
| OpenAI | Services | Model list or simple completion | New |
| ExchangeRate-API | Services | Rate fetch | New |
| Cloudflare R2 | Storage | HeadBucket | Existing |
| Supabase Storage | Storage | List buckets | Existing |
| Backblaze B2 | Storage | Authorize account | Existing |
| Redis | Infrastructure | PING | New |
| Traveltek FTP | Infrastructure | FTP connect + list | New |

## Architecture

### New Table: `api_health_checks`

```sql
CREATE TABLE api_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  success BOOLEAN NOT NULL,
  response_ms INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ahc_provider_time ON api_health_checks(provider, checked_at DESC);
```

Retention: 7 days, cleaned up by a daily BullMQ job.

### New Module: `ApiHealthModule`

Located at `apps/api/src/api-health/`.

**Files:**
- `api-health.module.ts` — NestJS module, imports BullMQ queue
- `api-health.service.ts` — orchestrates checks, writes results, triggers notifications
- `api-health.processor.ts` — BullMQ worker, one job per provider for failure isolation
- `api-health.controller.ts` — admin endpoints
- `api-health.types.ts` — type definitions

### BullMQ Queue: `api-health`

- Registered in `AutomationModule` (alongside existing queues) or in `ApiHealthModule` directly
- Repeatable job: every 15 minutes, fan-out to one child job per configured provider
- Each provider check: try/catch, measure response time, write to `api_health_checks`
- On 2 consecutive failures: notify all admins via `NotificationService.send()` with `system_alerts` category
- On recovery (was failing, now passes): send recovery notification

### DI Wiring

- `TraveltekAuthService` must be **exported from CruiseBookingModule** (currently not exported)
- `ApiHealthModule` imports: `CruiseBookingModule` (for Traveltek), `HttpModule`, `NotificationsModule`
- For providers already in `ApiCredentialsService.testConnection()`: reuse those methods
- For new providers: implement directly in `ApiHealthService`

### Health Check Implementations

**Traveltek**: Call `TraveltekAuthService.getAccessToken()` — if token obtained, healthy.

**Globus**: Use `GlobusService` to make a lightweight search query (e.g., search with limit=1). If it returns without error, healthy.

**Stripe**: `GET https://api.stripe.com/v1/account` with `Authorization: Bearer sk_...` header. 200 = healthy.

**Resend**: `GET https://api.resend.com/domains` with `Authorization: Bearer re_...` header. 200 = healthy.

**Redis**: Use existing BullMQ connection. `IORedis.ping()` → "PONG" = healthy.

**ExchangeRate-API**: Call existing `ExchangeRatesService` method or direct GET to the API.

**Traveltek FTP**: Connect + list root directory via existing `TraveltekFtpService`.

**OpenAI**: `GET https://api.openai.com/v1/models` with bearer token. 200 = healthy.

### Notification Logic

- Query last 2 checks from `api_health_checks` for each provider after a check completes
- If both failed AND no notification sent for this outage: notify all admin users
- Track "notified" state: add `notified_at` column to `api_health_checks` or use in-memory Map
- On recovery: if previous check failed + notified, send recovery notification

### Admin Notifications

```typescript
// Find all admin users
const admins = await db.query.userProfiles.findMany({
  where: eq(userProfiles.role, 'admin'),
  columns: { id: true },
})

for (const admin of admins) {
  await notificationService.send({
    userId: admin.id,
    category: 'system_alerts',
    title: `API Down: ${providerName}`,
    body: `${providerName} has failed 2 consecutive health checks. Last error: ${error}`,
    actionUrl: '/settings/api-credentials',
  })
}
```

### API Endpoints

All protected by `@AdminOnly()`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/api-health` | Latest status for all providers |
| `GET` | `/admin/api-health/:provider/history` | Last 24h of checks for a provider |
| `POST` | `/admin/api-health/:provider/check` | Trigger immediate check |

### Frontend: Refactored Settings Page

Replace the "API Credentials" tab content with a health status grid.

**Layout:**
- Provider cards grouped by category (Travel, Services, Storage, Infrastructure)
- Each card shows: provider name, status dot (green/amber/red/gray), last check time, response time (ms)
- "Test Now" button per card → calls `POST /admin/api-health/:provider/check`
- Gray = Not Configured, Green = Healthy, Amber = 1 failure, Red = 2+ consecutive failures
- Click card → expandable section with last 24h check history

**Tab rename:** "API Credentials" → "API Health" in the settings navigation.

**Keep:** "Managed by Doppler" note with link to Doppler dashboard.

## Out of Scope

- Uptime percentage / SLA tracking
- Response time sparklines / charts
- Per-provider configuration (check interval, failure threshold)
- Booking.com health check (no key configured, skip until configured)
- Public status page
