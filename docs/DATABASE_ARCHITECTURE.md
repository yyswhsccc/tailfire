# Database Architecture

This document provides a deep dive into the database schema organization, Drizzle ORM setup, and the FDW (Foreign Data Wrapper) architecture.

## Schema Organization

Tailfire uses PostgreSQL with two schemas:
- **public** - Core application data (trips, contacts, activities, financials)
- **catalog** - Cruise reference and sailing data (from Traveltek)

| Environment | Total Tables | Notes |
|-------------|--------------|-------|
| Local Dev (tailfire-Dev) | 75+ tables | Full schema including catalog |
| Cloud Preview (Tailfire-Preview) | 75+ tables | Full schema (catalog via FDW or local) |
| Production (Tailfire-Prod) | 75+ tables | Full schema including catalog |

> **Note:** Table counts include ~61 public schema tables (including cruise booking session tables) and 16 catalog schema tables (cruise data).

---

## Catalog Schema

**Location**: `packages/database/src/schema/cruise-*.schema.ts`

> **Architecture:** The catalog schema contains cruise reference data from Traveltek.
> - **Production**: Local tables populated by daily FTP sync (source of truth)
> - **Preview/Dev**: Foreign tables via FDW reading from Production
> - **Local Dev**: Local tables for offline development (may drift from Prod)

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
| `trips` | Trip records with travelers |
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

### Email & Communication

| Table | Purpose |
|-------|---------|
| `email_logs` | Email sending records with status |
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
- Public schema tables (~59 tables)
- Relations and enums
- Total: 75+ tables across both schemas

---

## FDW Architecture

> **Status:** The FDW architecture is designed and migrations exist. The catalog schema tables are present in all environments. FDW allows Preview/Dev to read catalog data from Production when Traveltek sync is active in Production only.

### Overview

The Foreign Data Wrapper will allow Preview/Development to read catalog data from Production:

| Environment | Project Ref | catalog Schema (Planned) |
|-------------|-------------|--------------------------|
| **Production** | `cmktvanwglszgadjrorm` | Local tables (cruise data from Traveltek) |
| **Preview** | `gaqacfstpnmwphekjzae` | Foreign tables (via FDW to Prod) |

### FDW Migration

**Location**: `packages/database/src/migrations/20260104205000_setup_catalog_fdw.sql`

#### Guard Clause

The migration detects the environment by checking if `catalog.cruise_lines` exists as a local table:

```sql
DO $$
BEGIN
  -- Check if catalog.cruise_lines exists as a local table ('r' = ordinary table)
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'catalog'
      AND c.relname = 'cruise_lines'
      AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'Local catalog tables exist - skipping FDW setup (Production)';
    RETURN;
  END IF;

  -- FDW setup code runs here (Development only)
END $$;
```

#### Foreign Server Creation

```sql
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER prod_catalog
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (
    host 'db.cmktvanwglszgadjrorm.supabase.co',
    port '5432',
    dbname 'postgres'
  );
```

#### User Mapping

```sql
CREATE USER MAPPING FOR current_user
  SERVER prod_catalog
  OPTIONS (
    user 'fdw_catalog_ro',
    password '__FDW_PASSWORD__'  -- Substituted by CI pipeline
  );
```

**Note**: `__FDW_PASSWORD__` is replaced during CI/CD deployment. Never commit the actual password.

#### Schema Import

```sql
IMPORT FOREIGN SCHEMA catalog
  LIMIT TO (
    cruise_alternate_sailings,
    cruise_cabin_images,
    cruise_ftp_file_sync,
    cruise_lines,
    cruise_ports,
    cruise_regions,
    cruise_sailing_cabin_prices,
    cruise_sailing_regions,
    cruise_sailing_stops,
    cruise_sailings,
    cruise_ship_cabin_types,
    cruise_ship_decks,
    cruise_ship_images,
    cruise_ships,
    cruise_sync_history,
    cruise_sync_raw
  )
  FROM SERVER prod_catalog
  INTO catalog;
```

#### Permissions

```sql
GRANT USAGE ON SCHEMA catalog TO service_role, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO service_role, authenticated;
```

### Production Setup (Read-Only User)

On the **Production** database, create the read-only user:

```sql
-- Create read-only user for FDW
CREATE USER fdw_catalog_ro WITH PASSWORD '<STRONG_PASSWORD>';

-- Grant access to catalog schema
GRANT USAGE ON SCHEMA catalog TO fdw_catalog_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO fdw_catalog_ro;

-- Auto-grant on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT ON TABLES TO fdw_catalog_ro;
```

### Development Setup (Vault Secret)

On the **Development** database, store the password in Supabase Vault:

```sql
SELECT vault.create_secret('fdw_password', '<STRONG_PASSWORD>');
```

---

## Migration Strategy

### Migration System

Tailfire uses **Drizzle-only** migrations:

- **Location**: `packages/database/src/migrations/`
- **Tracking**: `migrations/meta/_journal.json`
- **Total**: 110+ SQL migration files

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
//                  entertainment, excursion, insurance, custom, port_info
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
