# Database Architecture

This document provides a deep dive into the database schema organization, Drizzle ORM setup, and the FDW (Foreign Data Wrapper) architecture.

## Schema Organization

Tailfire uses PostgreSQL with two schemas:
- **public** - Core application data (trips, contacts, activities, financials)
- **catalog** - Cruise reference and sailing data (from Traveltek)

| Environment | Total Tables | Notes |
|-------------|--------------|-------|
| Local Dev (tailfire-Dev) | 90+ tables | Full schema including catalog (FDW) |
| Cloud Preview (Tailfire-Preview) | 90+ tables | Full schema (catalog via FDW) |
| Production (Tailfire-Prod) | 90+ tables | Full schema including local catalog |

> **Note:** Table counts include ~75+ public schema tables and 16 catalog schema tables (cruise data).

---

## Catalog Schema

**Location**: `packages/database/src/schema/cruise-*.schema.ts`

> **Architecture:** The catalog schema contains cruise reference data from Traveltek.
> - **Production**: Local tables populated by daily FTP sync (source of truth)
> - **Dev/Preview**: **Foreign tables** via FDW reading directly from Production (not local copies)
>
> **If FDW breaks on local dev** (catalog queries fail or return no data), restore with:
> ```bash
> ./scripts/setup-local-fdw.sh
> ```
>
> **WARNING:** Never write unguarded DDL against the `catalog` schema in migrations.
> `CREATE TABLE`, `ALTER TABLE`, and `DROP TABLE` on Dev/Preview will break FDW.
> See `packages/database/MIGRATIONS.md` > "Catalog Schema (FDW-Protected)" for the guard template.

The catalog schema contains read-only cruise reference data from Traveltek:

### Reference Tables

| Table | Purpose |
|-------|---------|
| `cruise_lines` | Cruise line companies with provider ID mapping |
| `cruise_ships` | Individual ships with line references |
| `cruise_regions` | Geographic regions for sailings |
| `cruise_ports` | Embark/disembark ports with coordinates |

### Ship Assets

| Table | Purpose |
|-------|---------|
| `cruise_ship_images` | Ship gallery/hero images |
| `cruise_ship_decks` | Ship deck plans |
| `cruise_ship_cabin_types` | Cabin categories per ship |
| `cruise_cabin_images` | Cabin type images |

### Sailing Data

| Table | Purpose |
|-------|---------|
| `cruise_sailings` | Individual sailing departures with prices |
| `cruise_sailing_cabin_prices` | Price breakdown by cabin type (CAD) |
| `cruise_sailing_stops` | Port-of-call details |
| `cruise_sailing_regions` | Region mapping for sailings |
| `cruise_alternate_sailings` | Alternative sailing options |

### Sync Operations

| Table | Purpose |
|-------|---------|
| `cruise_sync_raw` | Raw API data from Traveltek |
| `cruise_sync_history` | Sync operation tracking/metrics |
| `cruise_ftp_file_sync` | FTP file transfer tracking |

### Schema Definition

```typescript
// packages/database/src/schema/catalog.schema.ts
import { pgSchema } from 'drizzle-orm/pg-core'

export const catalogSchema = pgSchema('catalog')

// All cruise tables use catalogSchema.table()
export const cruiseLines = catalogSchema.table('cruise_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 100 }).notNull().default('traveltek'),
  providerIdentifier: varchar('provider_identifier', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  // ... more fields
})
```

---

## Public Schema

**Location**: `packages/database/src/schema/*.schema.ts` (non-cruise files)

The public schema contains all application data:

### Core Multi-Tenancy

| Table | Purpose |
|-------|---------|
| `agencies` | Agency organizations (multi-tenancy root) |
| `user_profiles` | User data extending auth.users |

### Trip Management

| Table | Purpose |
|-------|---------|
| `trips` | Trip records with travelers (soft-delete via `deleted_at`/`deleted_by`, cancel tracking via `status_before_cancel`) |
| `itineraries` | Trip itineraries |
| `itinerary_days` | Day-by-day breakdown |
| `itinerary_templates` | Reusable itinerary templates |

### Activities (Polymorphic)

| Table | Purpose |
|-------|---------|
| `itinerary_activities` | Base activity records (all component types) |
| `activity_media` | Photos/videos for activities |
| `activity_documents` | Attached documents |
| `activity_pricing` | Cost breakdown with line items |
| `activity_pricing_items` | Individual pricing line items |
| `activity_suppliers` | Vendor information |
| `activity_travelers` | Per-traveler assignments |

### Component Detail Tables

| Table | Activity Type |
|-------|---------------|
| `flight_details` | Flight bookings |
| `flight_segments` | Multi-segment flights |
| `lodging_details` | Hotels, resorts |
| `dining_details` | Restaurant reservations |
| `transportation_details` | Car rentals, transfers |
| `custom_cruise_details` | Custom cruise bookings |
| `port_info_details` | Port day information |
| `options_details` | Optional add-ons, excursions |
| `package_details` | Package-specific details |

### CRM & Contacts

| Table | Purpose |
|-------|---------|
| `contacts` | Customer records |
| `contact_addresses` | Addresses per contact |
| `contact_documents` | ID/passport/visa documents |
| `tags` | Central tag repository |
| `trip_tags` | Trip-to-tag mapping |
| `contact_tags` | Contact-to-tag mapping |

### Tour Catalog

| Table | Purpose |
|-------|---------|
| `tour_operators` | Tour operator companies (e.g., Globus) |
| `tour_departures` | Available tour departure dates/prices |
| `tour_hotels` | Hotel accommodations within tours |
| `tour_inclusions` | What's included in tour packages |
| `tour_media` | Tour images and media assets |
| `tour_day_details` | Day-by-day tour itinerary details |
| `tour_sync_history` | Tour data sync tracking |

### Sharing & Collaboration

| Table | Purpose |
|-------|---------|
| `contact_shares` | Contact sharing between agents |
| `trip_shares` | Trip sharing between agents |
| `trip_group_shares` | Trip group sharing between agents (with access levels) |
| `traveler_groups` | Group travelers across trips |

### Trip Groups (Group Bookings)

| Table | Purpose |
|-------|---------|
| `trip_groups` | Group definitions (folders and group bookings with status, dates, supplier) |
| `trip_group_documents` | Group-level documents (receipts, confirmations, contracts) |
| `trip_group_media` | Group-level media (shared photos, marketing assets) |

### Tasks & Workflow

| Table | Purpose |
|-------|---------|
| `tasks` | Task management items |
| `task_templates` | Reusable task templates |
| `notes` | Internal agent notes (scoped to trip, contact, or trip group via `trip_group_id`) |

### OCR & Document Import

| Table | Purpose |
|-------|---------|
| `ocr_import_jobs` | OCR document processing jobs |
| `ocr_supplier_runbooks` | Supplier-specific OCR parsing rules |

### Email & Communication

| Table | Purpose |
|-------|---------|
| `email_accounts` | Agent IMAP/SMTP email account connections (encrypted credentials) |
| `synced_emails` | Synced IMAP email messages with metadata (subject, from, to, body, folder) |
| `email_attachments` | Email attachment metadata and storage references |
| `email_logs` | System email sending records with status |
| `email_templates` | Reusable email templates |

### Insurance

| Table | Purpose |
|-------|---------|
| `trip_insurance_packages` | Available insurance packages |
| `trip_traveler_insurance` | Per-traveler insurance status |

### Media & Documents

| Table | Purpose |
|-------|---------|
| `trip_media` | Trip-level images/videos/documents |

### Templates

| Table | Purpose |
|-------|---------|
| `itinerary_templates` | Reusable itinerary structures |
| `package_templates` | Reusable package templates |

### API & Integration

| Table | Purpose |
|-------|---------|
| `api_credentials` | Encrypted API keys per provider |
| `api_provider_configs` | External API runtime configuration |

### Financials & Payments

| Table | Purpose |
|-------|---------|
| `expected_payment_items` | Payment schedule milestones |
| `payment_transactions` | Actual payment records |
| `payment_schedule_templates` | Reusable payment schedule patterns |
| `payment_schedule_template_items` | Milestones within templates |
| `payment_schedule_audit_log` | Immutable audit log (TICO compliance) |
| `currency_exchange_rates` | Exchange rate cache |
| `activity_traveller_splits` | Per-traveler cost breakdown |
| `service_fees` | Service fees via Stripe Connect |
| `trip_orders` | Versioned trip order JSON snapshots |

### Import Booking Fields (custom_cruise_details)

The `custom_cruise_details` table was extended with import-specific columns for storing data from imported cruise bookings:

| Column | Type | Purpose |
|--------|------|---------|
| `cabin_location` | varchar | Ship location (Mid-ship, Aft, Forward) |
| `dining_preferences` | jsonb | Seating, table size, smoking preferences |
| `selected_extras` | jsonb | Array of beverage packages, wifi, excursions |
| `selected_promotions` | jsonb | Applied promotion codes |
| `traveltek_booking_id` | bigint | Traveltek booking ID for re-sync |
| `traveltek_portfolio_id` | bigint | Traveltek portfolio ID for re-sync |

**Migration**: `20260216120000_add_import_fields_to_cruise_details.sql`

### Cruise Booking Sessions (FusionAPI Integration)

| Table | Purpose |
|-------|---------|
| `cruise_booking_sessions` | Ephemeral FusionAPI session state for booking flow |
| `cruise_booking_idempotency` | Idempotency tracking for booking retries (24h TTL) |

#### cruise_booking_sessions

Stores ephemeral session state for the FusionAPI booking flow. Separate from durable booking data in `custom_cruise_details`.

```typescript
// packages/database/src/schema/cruise-booking-sessions.schema.ts
export const cruiseBookingSessions = pgTable('cruise_booking_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  activityId: uuid('activity_id').notNull(),  // Links to itinerary_activities
  userId: uuid('user_id'),                     // User who owns the session
  tripId: uuid('trip_id'),                     // For handoff validation
  tripTravelerId: uuid('trip_traveler_id'),    // For handoff validation

  status: varchar('status', { length: 20 }),   // active, expired, completed, cancelled
  flowType: varchar('flow_type', { length: 20 }), // agent, client_handoff, ota

  // FusionAPI session state
  sessionKey: varchar('session_key', { length: 100 }),
  sessionExpiresAt: timestamp('session_expires_at'),

  // Search context (for replay/re-booking)
  codetocruiseid: varchar('codetocruiseid', { length: 100 }),
  resultNo: varchar('result_no', { length: 100 }),

  // Selection state
  fareCode: varchar('fare_code', { length: 50 }),
  gradeNo: integer('grade_no'),
  cabinNo: varchar('cabin_no', { length: 20 }),

  // Basket state
  basketItemKey: varchar('basket_item_key', { length: 100 }),
  cabinResult: varchar('cabin_result', { length: 100 }),
  holdExpiresAt: timestamp('hold_expires_at'),
})
```

**Session Lifecycle:**
- `active` → Session is in use for booking flow
- `completed` → Booking finalized successfully
- `expired` → TTL cleanup (2+ hours inactive)
- `cancelled` → User abandoned session

**Partial Unique Index:** Only one ACTIVE session per activity allowed.

#### cruise_booking_idempotency

Prevents double-booking on retry. Client sends UUID idempotency key with booking request.

```typescript
export const cruiseBookingIdempotency = pgTable('cruise_booking_idempotency', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: uuid('idempotency_key').notNull().unique(),
  activityId: uuid('activity_id').notNull(),
  userId: uuid('user_id').notNull(),
  bookingRef: varchar('booking_ref', { length: 100 }),
  bookingResponse: jsonb('booking_response'),
  status: varchar('status', { length: 20 }),  // pending, success, failed
  expiresAt: timestamp('expires_at'),  // 24 hour TTL
})
```

---

## Drizzle ORM Setup

### Client Factory

**Location**: `packages/database/src/client.ts`

```typescript
export function createDbClient(connectionString: string, options = {}) {
  // Detect Supabase pooler (port 6543 or pooler.supabase.com)
  const isPooledConnection =
    connectionString.includes('pooler.supabase.com') ||
    connectionString.includes(':6543/')

  const sql = postgres(connectionString, {
    max: 10,
    prepare: !isPooledConnection,  // Disable prepared statements for pooler
    ...options,
  })

  return drizzle(sql, { schema })
}
```

**Key Feature**: Automatic detection of Supabase pooler connections to disable prepared statements (required for transaction pooling).

### Configuration

**Location**: `packages/database/drizzle.config.ts`

```typescript
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
```

### Schema Export

**Location**: `packages/database/src/schema/index.ts`

All schemas are exported from a single entry point:
- Catalog schema definition (16 cruise tables)
- Public schema tables (~75+ tables)
- Relations and enums
- Total: 90+ tables across both schemas

---

## FDW Architecture

> **Status:** FDW is active in Dev and Preview. The Drizzle migration
> `20260104205000_setup_catalog_fdw.sql` is **dead code** (unconditional `RETURN` at line 23).
> FDW is set up and restored via `./scripts/setup-local-fdw.sh` for local dev.

### Overview

| Environment | Project Ref | catalog Schema |
|-------------|-------------|----------------|
| **Production** | `cmktvanwglszgadjrorm` | Local tables (cruise data from Traveltek sync) |
| **Dev** | `hplioumsywqgtnhwcivw` | Foreign tables (via FDW to Prod) |
| **Preview** | `gaqacfstpnmwphekjzae` | Foreign tables (via FDW to Prod) |

### Setup & Restoration

FDW is configured by running:

```bash
./scripts/setup-local-fdw.sh
```

This script:
- Reads credentials from Doppler (no hardcoded passwords)
- Verifies the target is the Dev database (refuses to run against Prod)
- Drops and recreates the `prod_catalog` foreign server + catalog schema
- Imports all tables from Production's catalog schema as foreign tables
- Grants `SELECT` to `service_role` and `authenticated`

See `apps/ota/supabase/FDW_SETUP.md` for full documentation.

### Production Setup (Read-Only User)

On the **Production** database, the `fdw_catalog_ro` read-only user must exist.
Password is stored in Doppler as `FDW_CATALOG_PASSWORD`.

```sql
-- Create read-only user for FDW (password from Doppler)
CREATE USER fdw_catalog_ro WITH PASSWORD '<RETRIEVE_FROM_DOPPLER: FDW_CATALOG_PASSWORD>';

-- Grant access to catalog schema
GRANT USAGE ON SCHEMA catalog TO fdw_catalog_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO fdw_catalog_ro;

-- Auto-grant on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT ON TABLES TO fdw_catalog_ro;
```

### Dead Migration Note

The Drizzle migration `20260104205000_setup_catalog_fdw.sql` contains FDW setup logic
but has an unconditional `RETURN` at line 23 that prevents it from ever executing.
The CI step in `deploy-preview.yml` that injects `__FDW_PASSWORD__` into this migration
has no effect. FDW was always set up manually.

### Development Setup (Vault Secret — Legacy)

Previously the password was stored in Supabase Vault. This is no longer the primary method;
use Doppler instead. For reference:

```sql
SELECT vault.create_secret('fdw_password', '<STRONG_PASSWORD>');
```

---

## Migration Strategy

### Migration System

Tailfire uses **Drizzle-only** migrations:

- **Location**: `packages/database/src/migrations/`
- **Tracking**: `migrations/meta/_journal.json`
- **Total**: 190+ SQL migration files

### Migration Types

| Type | Format | Example |
|------|--------|---------|
| Auto-generated | `0000_name.sql` | `0002_add_bidirectional_relationship_constraint.sql` |
| Manual | `YYYYMMDDHHmmss_name.sql` | `20260104205000_setup_catalog_fdw.sql` |

### Key Migrations

| Migration | Purpose |
|-----------|---------|
| `20251130100000_cruise_data_repository.sql` | Comprehensive cruise schema |
| `20260104205000_setup_catalog_fdw.sql` | FDW setup with guard clause |
| `20260105000000_move_cruise_tables_to_catalog_schema.sql` | Schema reorganization |
| `20251231300000_enable_rls_policies.sql` | Row-level security |
| `20260107000000_enable_rls_api_lockdown.sql` | RLS lockdown |
| `20251231200000_jwt_custom_claims_hook.sql` | JWT claim injection |
| `20260216120000_add_import_fields_to_cruise_details.sql` | Import booking fields for custom_cruise_details |

### Migration Execution

**Location**: `packages/database/src/migrate.ts`

Migrations run from `apps/api` only:

```typescript
export async function runMigrations(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)

  await migrate(db, { migrationsFolder })
}
```

**Commands** (from `apps/api`):

```bash
pnpm db:generate  # Generate migration from schema changes
pnpm db:migrate   # Run pending migrations
pnpm db:reset     # Reset database (dev only)
```

### Deprecated: Supabase CLI Migrations

Supabase CLI migrations are archived in `apps/ota/supabase/migrations/_archive/`. All new migrations use Drizzle.

---

## Key Tables Deep Dive

### agencies

Multi-tenancy root table:

```typescript
export const agencies = pgTable('agencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).unique(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})
```

### user_profiles

Extends `auth.users` with application data:

```typescript
export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey(),  // Matches auth.users.id
  agencyId: uuid('agency_id').notNull().references(() => agencies.id),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('pending'),
  licensingInfo: jsonb('licensing_info'),
  commissionSettings: jsonb('commission_settings'),
  platformPreferences: jsonb('platform_preferences'),
})
```

### trips

Trip management with agency scoping:

```typescript
export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').notNull(),  // Denormalized for RLS
  ownerId: uuid('owner_id').notNull(),    // User who created
  status: tripStatusEnum('status').notNull().default('draft'),
  // ... more fields
})
```

### activities

Polymorphic activity system:

```typescript
export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  componentType: componentTypeEnum('component_type').notNull(),
  parentActivityId: uuid('parent_activity_id'),  // Self-referential for packages
  // ... common fields
})

// Component types: flight, cruise, lodging, transportation, dining,
//                  entertainment, excursion, insurance, custom, port_info,
//                  package, tour, custom_tour, tour_day
```

---

## Database Connection Types

| Type | Port | Use Case |
|------|------|----------|
| **Direct TCP** | 5432 | Migrations, admin operations |
| **Session Pooler** | 5432 | OK for migrations (IPv6 workaround) |
| **Transaction Pooler** | 6543 | Application runtime only |

**Important**: Transaction pooler (6543) does not support DDL operations. Migrations must use direct or session mode.

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - High-level system design
- [Security Model](./SECURITY.md) - RLS policies and auth
- [CI/CD Pipeline](./CI_CD.md) - Migration deployment
- [FDW Setup Guide](../apps/ota/supabase/FDW_SETUP.md) - Detailed FDW instructions
