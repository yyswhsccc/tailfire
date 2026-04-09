# Promotions System Migration Design

**Date:** 2026-04-06
**Status:** Draft
**Validated by:** Codex (3 rounds — data model, API pipeline, phase plan)

## Overview

Migrate the Phoenix Voyages deal/promotion system from the WordPress-based pipeline (TLN scraper → SQLite → WordPress MySQL → phoenix-deals plugin) into the Tailfire monorepo. The Tailfire system becomes the source of truth for promotions, with a SQLite buffer feeding WordPress during parallel operation until the new OTA is ready to go live.

### Goals

1. Tailfire owns promotion data (creation, editing, publishing, catalog linking)
2. WordPress stays live and untouched until new OTA launches
3. AI enrichment preserved — deterministic logic in API, generative AI stays on VPS agents
4. Advisors can manage and feature promotions in the admin app
5. OTA renders offers with catalog-linked sailings, UTM attribution, and lead capture

### Non-Goals

- Rewriting the TLN Playwright scraper (it just POSTs to a new endpoint)
- Moving social posting off the VPS (Late.dev MCP stays on phoenix-services)
- Building Pxl short link management in Tailfire (stays on VPS)
- Multi-agency support (single-agency scoping, consistent with existing Tailfire pattern)

## Vocabulary

| Context | Term | Examples |
|---|---|---|
| Database, API, admin, VPS agents | **Promotion** | `promotions` table, `PromotionsService`, `POST /api/v1/promotions` |
| Admin app UI | **Promotion** | Library → Marketing → Promotions, "New Promotion", "Review Queue" |
| OTA pages, URLs, consumer copy | **Offer** | `/offers/`, "Exclusive Travel Offers", "View Offer" |
| OTA API routes (public) | **Offers** | `GET /api/v1/ota/offers` (queries `promotions` table internally) |
| Marketing copy | **Flexible** | "Deal of the Week", "Flash Deals", "Limited-Time Offer" — not a system term |

### Core Entities

| Entity | Definition | DB Table |
|---|---|---|
| **Promotion** | Central entity. Supplier's time-limited offer with headline, offer text, booking window, travel dates, promo code, priority, tags, publish status. Lifecycle: `draft → active → expired`. | `promotions` |
| **Campaign** | Optional marketing orchestration. Tracks channels, social copy, approval status, ad IDs. Lifecycle: `proposed → approved → executing → complete`. Not every promotion needs one. | `promotion_campaigns` |
| **Catalog Link** | Connection between a promotion and inventory. Four levels: cruise line, ship, sailing, destination. | `promotion_catalog_links` |
| **Channel Usage** | Record of a promotion posted to a distribution channel (FB, IG, email, etc.). Tracks post IDs, timestamps, performance metrics. | `promotion_channel_usage` |

## Section 1: Data Model

### 1a. `promotions` table (rename + extend existing `deals`)

Migration renames `deals` → `promotions` (phased — see Phase 0 sub-steps).

**New columns:**

| Column | Type | Purpose |
|---|---|---|
| `offer_text` | text | The offer line — "60% Off 2nd Guest + $950 OBC" |
| `promo_code` | varchar(100) | Supplier promo code |
| `booking_start` | date | Booking window opens |
| `booking_end` | date | Booking window closes |
| `travel_start` | date | Travel period start (rename from `valid_from`) |
| `travel_end` | date | Travel period end (rename from `valid_until`) |
| `priority` | integer (0-3) | 0=normal, 1=featured, 2=hot, 3=urgent |
| `tags` | text[] | PostgreSQL array — luxury, family, flash, caribbean, etc. |
| `content_hash` | varchar(64) | SHA-256 for change detection on re-fetch |
| `source` | varchar(50) | Origin: `tln`, `email_intake`, `manual`, `supplier_api` |
| `status` | pgEnum | `draft`, `active`, `paused`, `expired` (replaces `is_published` boolean) |
| `category` | varchar(50) | Machine key: `cruise`, `tour`, `hotel`, `package` (replaces `product_type`) |

**Existing columns kept:** `id` (uuid), `agency_id`, `slug` (unique), `title`, `description`, `hero_image_url`, `pricing` (JSONB), `destinations` (text[]), `supplier_name`, `external_source`, `external_id`, `seo_meta` (JSONB), `created_at`, `updated_at`, `deleted_at`.

**Dropped (in Phase 4 cleanup, not Phase 0):** `is_published`, `product_type`, `valid_from`, `valid_until`.

**Index fix:** Unique index changes from `(external_source, external_id)` to `(agency_id, external_source, external_id)` — agency-scoped dedup.

**Status semantics:**
- `draft` — imported or created, not yet reviewed/published
- `active` — visible on OTA, serving to consumers
- `paused` — manually hidden by agent, not expired
- `expired` — set by daily BullMQ cron job: `UPDATE promotions SET status = 'expired' WHERE status = 'active' AND booking_end < CURRENT_DATE`. Not derived at query time — the cron is authoritative. This matches the Phoenix system's `phoenix_deals_daily_cleanup` WP-Cron pattern.
- OTA public query: `WHERE status = 'active'` (no date filter needed — cron handles expiration). Belt-and-suspenders: add `AND (booking_end IS NULL OR booking_end >= CURRENT_DATE)` for safety until cron is verified reliable.

### 1b. `promotion_campaigns` table (new)

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `promotion_id` | uuid FK → promotions | Linked promotion |
| `agency_id` | uuid FK | Agency scope |
| `campaign_name` | varchar(255) | Human-readable name |
| `campaign_angle` | varchar(100) | Slug for multi-push dedup (e.g., "arctic-spotlight") |
| `headline_hash` | varchar(64) | SHA-256 dedup hash (normalized supplier+headline+offer) |
| `intake_status` | pgEnum | `proposed`, `approved`, `executing`, `complete`, `rejected`, `on_hold` |
| `channels_proposed` | jsonb | Proposed channels array |
| `channels_approved` | jsonb | Approved channels array |
| `social_copy_drafts` | jsonb | AI-generated copy per platform |
| `landing_page_url` | varchar(500) | Landing page URL |
| `source_type` | varchar(50) | `cc_promote_email`, `manual`, `auto` |
| `source_email_id` | uuid FK → synced_emails (nullable) | Link to intake email (mailbox-aware) |
| `proposal_email_id` | uuid FK → synced_emails (nullable) | Link to sent proposal email |
| `approved_by` | varchar(255) | Who approved |
| `proposed_at` | timestamptz | |
| `approved_at` | timestamptz | |
| `executing_at` | timestamptz | |
| `completed_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

**Unique constraint:** `(agency_id, headline_hash, campaign_angle)` WHERE `intake_status NOT IN ('rejected', 'expired', 'complete')` — prevents duplicate active campaigns.

### 1c. `promotion_catalog_links` table (new)

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `promotion_id` | uuid FK → promotions | |
| `link_type` | varchar(20) | `cruise_line`, `ship`, `sailing`, `destination` |
| `catalog_type` | varchar(20) | `cruise_sailing`, `tour`, `vacation` |
| `catalog_id` | uuid | FK to catalog entity (nullable for destination/cruise_line level) |
| `catalog_label` | varchar(255) | Denormalized label for display |
| `auto_linked` | boolean | True if created by auto-matching, false if manual |
| `is_suggestion` | boolean DEFAULT true | True until agent confirms; auto-linked suggestions start as true |
| `created_at` | timestamptz | |

**CHECK constraint:** Prevents invalid combos — `catalog_id` required when `link_type` is `sailing` or `ship`.

**Unique constraint:** `(promotion_id, link_type, catalog_type, catalog_id)` — no duplicate links.

### 1d. `promotion_channel_usage` table (new)

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `promotion_id` | uuid FK → promotions | |
| `campaign_id` | uuid FK → promotion_campaigns (nullable) | For multi-campaign attribution |
| `channel` | varchar(50) | `facebook`, `instagram`, `linkedin`, `email_weekly`, `email_caribbean`, etc. |
| `platform_post_id` | varchar(255) | Post ID from the platform |
| `pxl_link_id` | varchar(255) | Pxl short link ID |
| `caption_used` | text | What copy was posted |
| `posted_at` | timestamptz | When it went live |
| `impressions` | integer | |
| `clicks` | integer | |
| `engagements` | integer | |
| `created_at` | timestamptz | |

### 1e. `ota_referrals` extension

Add UTM columns to existing table:

| New Column | Type |
|---|---|
| `utm_source` | varchar(100) |
| `utm_medium` | varchar(100) |
| `utm_campaign` | varchar(255) |
| `utm_content` | varchar(255) |
| `utm_term` | varchar(255) |

### 1f. Rename `advisor_featured_deals` → `advisor_featured_promotions`

Same structure (composite PK: advisor_profile_id, promotion_id, sort_order), just rename table and FK column. Done in Phase 0b code cutover.

## Section 2: API & Intake Pipeline

### 2a. Module Structure

Rename `apps/api/src/deals/` → `apps/api/src/promotions/`:

```
apps/api/src/promotions/
├── promotions.module.ts
├── promotions.controller.ts          # Admin CRUD (JWT auth)
├── ota-offers.controller.ts          # Public OTA reads (under ota/ prefix)
├── promotion-import.controller.ts    # Scraper/VPS endpoints (x-internal-api-key)
├── promotions.service.ts             # Core CRUD + query logic
├── promotion-intake.service.ts       # TLN + email + manual intake processing
├── promotion-catalog.service.ts      # Catalog linking (auto-suggest + manual)
├── promotion-campaigns.service.ts    # Campaign lifecycle
├── promotion-channel.service.ts      # Channel usage recording + queries
├── dto/
│   ├── create-promotion.dto.ts
│   ├── update-promotion.dto.ts
│   ├── import-promotion.dto.ts
│   ├── promotion-search.dto.ts
│   ├── link-catalog.dto.ts
│   └── record-channel-usage.dto.ts
```

Three controllers split by auth boundary (matching Tailfire conventions):
- `promotions.controller.ts` — Admin JWT CRUD
- `ota-offers.controller.ts` — Public reads under `ota/offers`
- `promotion-import.controller.ts` — Internal API key for scraper/VPS agents

### 2b. API Endpoints

**Public (OTA):**

| Method | Route | Purpose |
|---|---|---|
| GET | `/ota/offers` | List active promotions, paginated, filtered by category/destination/supplier/tags |
| GET | `/ota/offers/by-slug/:slug` | Single promotion by slug |
| GET | `/ota/offers/by-tag/:tag` | Promotions filtered by tag |

**Admin (JWT):**

| Method | Route | Purpose |
|---|---|---|
| GET | `/promotions` | List all promotions (any status) with filters + search |
| GET | `/promotions/:id` | Single promotion with campaigns, catalog links, channel usage |
| POST | `/promotions` | Create promotion manually |
| PUT | `/promotions/:id` | Update promotion |
| DELETE | `/promotions/:id` | Soft delete |
| POST | `/promotions/:id/publish` | Set status → active, trigger ISR revalidation |
| POST | `/promotions/:id/catalog-links` | Add catalog links |
| DELETE | `/promotions/:id/catalog-links/:linkId` | Remove a catalog link |
| POST | `/promotions/:id/catalog-links/:linkId/confirm` | Confirm a suggestion (sets is_suggestion=false) |
| GET | `/promotions/:id/campaigns` | List campaigns |
| POST | `/promotions/:id/campaigns` | Create campaign |
| PUT | `/promotions/campaigns/:campaignId` | Update campaign status/fields |

**Import (internal API key):**

| Method | Route | Purpose |
|---|---|---|
| POST | `/promotions/import/tln` | Bulk upsert from TLN scraper |
| POST | `/promotions/import/email` | Single promotion from cc-promote@ agent |
| POST | `/promotions/:id/channel-usage` | Record channel posting |
| PUT | `/promotions/:id/channel-usage/:usageId` | Update performance metrics |
| GET | `/promotions/unused-on/:channel` | Promotions not yet posted to a channel |

**Legacy compatibility (route aliases, not redirects — supports POST/PUT/DELETE):**
- `/deals` → aliases to `/promotions` endpoints during transition
- `/ota/deals` → aliases to `/ota/offers` during transition
- Removed in Phase 4

### 2c. Intake Flow

Three channels, all produce `promotions` rows:

**TLN Scraper** (existing Python on VPS):
- `fetch_promotions.py` modified to POST to `POST /api/v1/promotions/import/tln`
- Dedup: SHA-256 contentHash + `(agency_id, external_source, external_id)` unique index
- Status: auto-set to `active` for TLN imports (pre-vetted by TLN)
- Fallback: write to SQLite directly if Tailfire API unreachable

**cc-promote@ Email Intake** (existing Sonnet agent on VPS):
- Promo-intake agent calls `POST /api/v1/promotions/import/email`
- Creates promotion (`status: draft`) + campaign (`intake_status: proposed`)
- Email idempotency: `source_email_id` references `synced_emails.id` (mailbox-aware, prevents re-processing)
- Agent sends HTML proposal email as before
- On APPROVED: `PUT /promotions/:id { status: active }` + `PUT /promotions/campaigns/:id { intakeStatus: approved }`

**Manual** (admin UI):
- Agent creates via `POST /api/v1/promotions` → `status: draft`
- Agent reviews, adds catalog links, publishes when ready

### 2d. Auto-Enrichment (deterministic, in the API)

On promotion create/import, `promotion-intake.service.ts` runs:

1. **Auto-tag** — Parse supplierName, destinations, category to suggest tags (e.g., Royal Caribbean → `cruise`, Caribbean destination → `caribbean`)
2. **Auto-suggest catalog links** — Query `catalog.cruise_sailings` by supplier name + date overlap using `CatalogMatcherService` tiers where possible. Creates `promotion_catalog_links` with `auto_linked: true, is_suggestion: true`. Agent confirms in admin UI.
3. **Urgency scoring** — `booking_end` within 7 days → priority 2 (hot). Within 3 days → priority 3 (urgent). Agent can override.
4. **Slug generation** — From supplier + headline, deduped with numeric suffix on collision.

Plain TypeScript logic, no AI API calls. Heavy AI (social copy, TICO compliance, landing pages) stays on VPS agents.

### 2e. WordPress Parallel Sync (VPS-Side Pull)

New Python script on phoenix-services (`data/pull_from_tailfire.py`):

```
Cron: every 15 minutes on VPS

1. GET /api/v1/promotions?status=active&updatedAfter={last_sync_timestamp}
   (authenticated with x-internal-api-key)

2. For each promotion:
   - Map Tailfire UUID → SQLite integer ID (stored in mapping table in promotions.db)
   - UPSERT into promotions.db SQLite

3. Existing sync_to_wordpress.py picks up changes → WordPress MySQL
   (zero changes to WordPress side)

4. Store last_sync_timestamp for next run
```

Optional "sync now" trigger: `POST /api/v1/promotions/trigger-vps-sync` (writes a timestamp file the VPS cron checks).

## Section 3: Admin UI

### 3a. Navigation

New section under Library in admin sidebar:

```
Library
├── Suppliers          (existing)
├── Notifications      (existing)
└── Marketing          (NEW)
    └── Promotions     (NEW)
```

Route: `/library/marketing/promotions`

### 3b. Promotions List View

Grid with filters and bulk actions (pattern: matches existing contacts list).

**Columns:** Status badge, Priority icon, Supplier, Title, Category, Booking End (urgency coloring), Catalog Links count, Channel Usage icons, Source, Updated.

**Filters:** Status, Category, Source, Supplier (dropdown), Tags (multi-select), Priority, Has catalog links, Unused on channel.

**Actions:** Bulk publish, Bulk pause, Bulk add tags, New Promotion.

### 3c. Promotion Detail View

Three-panel layout:

**Left panel — editable form:**
Title, offer text, description, supplier, category, promo code, booking window, travel period, priority, tags, hero image (upload + Unsplash), destinations, SEO meta (collapsible), status + publish button.

**Right panel — linked data + AI suggestions:**

- **Catalog Links** section: Auto-suggested links (Accept/Dismiss), Confirmed links (Remove), [+ Link Catalog Item] button opens search modal
- **Channel Usage** section: Per-channel posting records with metrics
- **Campaigns** section: Campaign cards with lifecycle status, read-only initially

### 3d. Catalog Link Search Modal

On [+ Link Catalog Item]:
- Link level selector: Cruise Line | Ship | Specific Sailing | Destination
- Type-ahead search against catalog (cruise_lines, cruise_ships, cruise_sailings)
- Preview: shows count of matching sailings before confirming
- Confirm: creates `promotion_catalog_links` with `is_suggestion: false`

### 3e. React Hooks

```
hooks/
├── use-promotions.ts           # List, search, filter (TanStack Query)
├── use-promotion.ts            # Single detail with related data
├── use-promotion-mutations.ts  # Create, update, delete, publish
├── use-promotion-catalog.ts    # Catalog link CRUD + search
├── use-promotion-campaigns.ts  # Campaign list + status updates
├── use-promotion-channels.ts   # Channel usage list
```

## Section 4: OTA Rendering

### 4a. Route Migration

| Current | New | Notes |
|---|---|---|
| `/deals` | `/offers` | Main offers grid |
| `/deals/[slug]` | `/offers/[slug]` | Single offer detail |
| — | `/offers/tag/[tag]` | Tag-filtered page (luxury, caribbean, etc.) |
| — | `/offers/supplier/[slug]` | Supplier landing page |

Legacy redirects: `/deals/*` → `/offers/*` (301 permanent in Next.js middleware).

### 4b. Offers List Page (`/offers`)

ISR with 1-hour revalidation. Data from `GET /api/v1/ota/offers`.

- Hero section: "Exclusive Travel Offers"
- Filter bar: category tabs + tag pills
- Featured offer card (first result, large)
- Grid of offer cards (3-col desktop, 1-col mobile)
- Urgency badges on cards (hot, ending soon)
- Inline lead form at bottom ("Never Miss an Offer")

### 4c. Single Offer Page (`/offers/[slug]`)

ISR with 1-hour revalidation. Data from `GET /api/v1/ota/offers/by-slug/:slug`.

- Breadcrumb: Home → Offers → Supplier → This Offer
- Offer banner: offer text, promo code (copy button), booking deadline
- Two-column body: hero image + description (filtered for B2B copy) | sidebar with dates, CTA
- **Linked catalog sailings** (new): "Sailings included in this offer" — cards with departure date, ship, itinerary, duration. Each links to cruise detail page.
- Related offers from same supplier
- "Why Book With Phoenix Voyages" trust section

### 4d. Inquiry Modal & Lead Capture

React modal on "Request a Quote":
- Left: offer context (image, headline, supplier, dates)
- Right: lead form (name, email, phone optional, message optional)
- Hidden fields: UTM params + referral code + promotion context
- Submit → `POST /api/v1/ota/leads/capture` with promotion context
- Creates contact with UTM attribution, advisor assignment from `?ref=` cookie, promotion context as note, interest tags from `utm_content`

### 4e. UTM Middleware

Next.js middleware in `apps/ota/src/middleware.ts`:
1. Check URL for `utm_*` params or `?ref=` param
2. If present: create/update `ota_referrals` record via API, set `ota_ref` cookie (30 days)
3. On lead form submit: read cookie → send `referralSessionId` with form data → API resolves attribution

### 4f. Cruise Search Deal Badges

On cruise search result pages, for each sailing card:
- Server-side query: any active `promotion_catalog_links` matching this sailing (by sailing ID, ship, cruise_line, or destination)?
- If match: render "Active Offer" badge with offer text + link to offer detail page
- Cached via ISR — no per-request latency

## Section 5: Phases & Migration Plan

### Phase 0a: Additive Database Migration

**Goal:** Add new columns and tables. Zero breaking changes. Old code still works.

1. Create pgEnums: `promotion_status_enum`, `campaign_intake_status_enum`
2. Add new columns to `deals` table: `offer_text`, `promo_code`, `booking_start`, `booking_end`, `priority`, `tags`, `content_hash`, `source`, `category`, `status` (nullable initially)
3. Backfill `status`: `UPDATE deals SET status = CASE WHEN COALESCE(is_published, false) THEN 'active' ELSE 'draft' END`
4. Backfill `category` from `product_type` values
5. Set `status` NOT NULL after backfill
6. Create new tables: `promotion_campaigns`, `promotion_catalog_links`, `promotion_channel_usage`
7. Add UTM columns to `ota_referrals`
8. Create new unique index: `(agency_id, external_source, external_id)` on `deals` (old global index stays until Phase 4)

**Exit criteria:** Migration runs on dev + preview. Old code works unchanged. New columns exist but are unused.

### Phase 0b: Code Cutover

**Goal:** Rename modules, update all code references, deploy with compatibility aliases.

1. Rename `apps/api/src/deals/` → `apps/api/src/promotions/` (all files)
2. Rename Drizzle schema: `deals.schema.ts` → `promotions.schema.ts`, update table reference to `promotions`
3. Rename `advisor-featured-deals.schema.ts` → `advisor-featured-promotions.schema.ts`
4. SQL migration: `ALTER TABLE deals RENAME TO promotions`, `ALTER TABLE advisor_featured_deals RENAME TO advisor_featured_promotions`
5. Rename columns: `valid_from` → `travel_start`, `valid_until` → `travel_end`
6. Update `app.module.ts`: `DealsModule` → `PromotionsModule`
7. Update all DTOs, types, imports
8. Add legacy route aliases (controller-level, not HTTP redirects — supports POST/PUT/DELETE):
   - `/deals` → `/promotions`
   - `/ota/deals` → `/ota/offers`
   - `/advisor-profiles/:id/deals` → `/advisor-profiles/:id/promotions`
9. ISR: revalidate both `deals` and `promotions` tags
10. OTA: update fetch URLs, keep `/deals` pages working via internal aliasing

**Exit criteria:** Preview deployment verified. All existing pages/endpoints work via both old and new paths. Build + lint pass. Manual smoke test of `/deals`, `/deals/[slug]`, advisor deals page.

### Phase 1: API & Intake Pipeline

**Goal:** Tailfire becomes source of truth. VPS starts writing to Tailfire.

1. Build 3 controllers + 6 services (promotions module)
2. Build import endpoints (`/promotions/import/tln`, `/promotions/import/email`)
3. Implement auto-enrichment (auto-tag, auto-suggest catalog links, urgency scoring)
4. Deploy VPS adapter script (`data/pull_from_tailfire.py`) — cron every 15 min
5. Modify TLN scraper to POST to Tailfire API first (SQLite as fallback)
6. Modify cc-promote@ agent to call Tailfire API
7. Build channel usage endpoints
8. Verify parity: Tailfire active count == SQLite active count == WordPress active count

**Exit criteria:** TLN promos flow Tailfire → SQLite → WordPress. All 3 stores in sync. VPS agents write to Tailfire.

### Phase 2: Admin UI (parallel with Phase 3)

**Goal:** Agents manage promotions in admin.

1. Promotions list page (Library → Marketing → Promotions)
2. Promotion detail view (edit form + suggestions panel)
3. Catalog link search modal (4 levels)
4. Campaign view (read-only initially)
5. Advisor featured promotions (update profile page)
6. React hooks (6 hook files)

**Exit criteria:** Agents can create, edit, publish, link, and review promotions in admin.

### Phase 3: OTA Offers Pages (parallel with Phase 2)

**Goal:** New OTA renders offers natively.

1. Create `/offers/` route structure (list, detail, tag, supplier pages)
2. Offers list page with filters, urgency badges, lead form
3. Single offer page with linked catalog sailings
4. Tag and supplier filtered pages
5. UTM middleware (capture params → `ota_referrals`)
6. Lead capture modal → `ota-leads.captureLead()` with promotion context
7. Cruise search deal badges
8. Legacy `/deals/*` → `/offers/*` 301 redirects in Next.js middleware
9. Update `next.config.mjs` redirect inventory (existing WordPress redirects targeting `/deals`)

**Dependency note:** Cruise search badges depend on real catalog links existing, which requires Phase 2 admin workflows or accepted suggestions.

**Exit criteria:** OTA serves offers natively. Lead capture with full UTM attribution. Cruise search shows offer badges.

### Phase 4: Cutover & Cleanup

**Goal:** WordPress retired, single source of truth.

**Pre-cutover verification:**
- Parity check: Tailfire active promotions == WordPress active promotions
- Canary window: run both systems for 1 week with monitoring before disabling sync
- Manual OTA verification (build + lint + key route checks — OTA has no automated test suite)

**Cutover steps:**
1. WordPress `/deals/*` and `/promo/*` URLs redirect to new OTA `/offers/*`
2. Disable VPS sync script (`pull_from_tailfire.py` cron off)
3. Drop legacy route aliases (`/deals` → `/promotions`, dual ISR tags)
4. Drop old columns: `is_published`, `product_type`, `valid_from`, `valid_until`
5. Drop old global unique index on `(external_source, external_id)`
6. Deactivate phoenix-deals WordPress plugin (don't delete — keep for rollback window)
7. `promotions.db` becomes read-only archive
8. Deprecate `register_promotion()` MCP tool — all writes through Tailfire API

**Exit criteria:** WordPress no longer involved. Tailfire is sole source of truth. No legacy aliases remain.

### Rollback Procedures

| Phase | Rollback |
|---|---|
| 0a | Drop new columns/tables. No code changes needed. |
| 0b | Revert code to old module names. Rename tables back. Old columns still exist. |
| 1 | Disable VPS adapter script. Revert TLN scraper to write to SQLite directly. WordPress unaffected. |
| 2 | Remove admin UI pages. No data impact. |
| 3 | Remove OTA `/offers` routes. `/deals` still works via aliases. |
| 4 | Re-enable VPS sync. Reactivate phoenix-deals plugin. Restore redirect rules. |

## Architecture Decisions

### AD-1: Extend `deals` table vs separate `deal_promotions`
**Decision:** Extend existing table (rename to `promotions`).
**Rationale:** A promotion IS the entity — no need for indirection. Existing table has minimal usage (no admin UI), making rename low-risk.

### AD-2: Hybrid AI — deterministic in API, generative on VPS
**Decision:** Auto-tag, auto-suggest, urgency scoring in TypeScript. Social copy, TICO compliance, landing pages stay on VPS Sonnet agents.
**Rationale:** Avoids Anthropic API costs for deterministic operations. VPS agents already work well for generative tasks.

### AD-3: VPS-side pull for SQLite buffer (not Railway push)
**Decision:** Python script on VPS pulls from Tailfire API and writes to SQLite.
**Rationale:** Railway container has no SSH/SQLite dependencies. VPS-side pull matches existing cron-based patterns. Zero changes to WordPress side.

### AD-4: Catalog auto-suggest, not auto-commit
**Decision:** Auto-linking creates suggestions (`is_suggestion: true`). Agent confirms in admin UI.
**Rationale:** Supplier + date overlap is too weak for confident automatic linking. Tailfire's CatalogMatcherService is multi-tier and treats "no match" as normal. Suggestions prevent false positives.

### AD-5: Legacy route aliases, not HTTP redirects
**Decision:** Controller-level route aliases during transition, not 301 redirects.
**Rationale:** HTTP redirects break POST/PUT/DELETE operations. Aliases transparently serve both old and new paths.

### AD-6: SHA-256 for contentHash (not MD5)
**Decision:** 64-char SHA-256 hash.
**Rationale:** Newer Tailfire import code uses SHA-256 (vacation-import change-detector). Aligns with current patterns.

### AD-7: pgEnum for status fields
**Decision:** PostgreSQL enum types for promotion status and campaign intake status.
**Rationale:** Tailfire uses pgEnum for stable domain workflow states. Provides database-level constraint enforcement.
