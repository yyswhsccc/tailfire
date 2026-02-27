# Architecture Overview

This document describes the high-level architecture and key design decisions in Tailfire.

## System Overview

Tailfire is a **single-agency, multi-branch** travel management platform built as a monorepo:

```
tailfire/
├── apps/                    # Deployable applications
│   ├── admin/              # B2B Admin Dashboard (Next.js)
│   ├── api/                # Backend API (NestJS)
│   ├── client/             # Customer-facing app (Next.js)
│   └── ota/                # OTA booking platform (Next.js)
├── packages/               # Shared libraries
│   ├── database/           # Drizzle ORM schema & migrations
│   ├── shared-types/       # TypeScript type definitions
│   ├── api-client/         # API client library
│   ├── ui-public/          # Shared UI components
│   └── config/             # ESLint & TypeScript configs
└── docs/                   # Project documentation
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Backend** | NestJS 10+, Drizzle ORM |
| **Frontend** | Next.js 15, shadcn/ui, TanStack Query |
| **Database** | Supabase PostgreSQL |
| **Auth** | Supabase Auth + JWT |
| **Storage** | Cloudflare R2 (Supabase Storage as fallback) |

---

## Data Flow: API-First Architecture

All data operations flow through the API layer:

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend Apps                            │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐   │
│  │  Admin  │    │   OTA   │    │ Client  │    │ (Future)│   │
│  │  :3100  │    │  :3102  │    │  :3103  │    │         │   │
│  └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘   │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────────┘         │
│                          │                                   │
│                   Supabase Auth                              │
│                   (Login/Signup)                             │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │     API (NestJS)      │
               │        :3101          │
               │                       │
               │  - JWT Validation     │
               │  - Authorization      │
               │  - Business Logic     │
               │  - Data Validation    │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │  Database (Supabase)  │
               │                       │
               │  ┌─────────────────┐  │
               │  │ public schema   │  │
               │  │ (app data)      │  │
               │  └─────────────────┘  │
               │  ┌─────────────────┐  │
               │  │ catalog schema  │  │
               │  │ (cruise data)   │  │
               │  └─────────────────┘  │
               └───────────────────────┘
```

**Why API-First?**
- Frontend apps use Supabase Auth for login/signup only
- All data queries go through the API (not direct to database)
- RLS "lockdown" blocks direct database access from frontends
- Centralized authorization, validation, and business logic

---

## Multi-Tenancy Model

Tailfire is designed for a **single agency with multiple branches**:

- **Single Agency**: One travel agency organization (Phoenix Voyages)
- **Multiple Branches**: Future support for physical/virtual branch locations
- **Centralized Management**: Admin dashboard manages all branches
- **Shared Catalog**: All branches access the same cruise/tour data
- **Branch-Scoped Data**: Bookings, clients, transactions scoped to branches

**This is NOT a multi-tenant SaaS platform.** The codebase serves one agency with the flexibility to scale across branches while maintaining centralized control.

### Data Isolation

Every row in core tables includes `agency_id`:
- Enables future multi-agency support if needed
- RLS policies enforce agency-scoped access
- JWT tokens carry `agency_id` claim

---

## Cruise & Tour Catalog Data

### Current State

Cruise catalog data (ships, sailings, prices) consists of 16 tables in the `catalog` schema. The architecture uses Foreign Data Wrapper (FDW) to share catalog data across environments without duplication:

| Environment | Table Count | Cruise Catalog Source |
|-------------|-------------|----------------------|
| Local Dev (tailfire-Dev) | 90+ tables | FDW foreign tables → Production `catalog` schema |
| Cloud Preview (Tailfire-Preview) | 90+ tables | FDW foreign tables → Production `catalog` schema |
| Production (Tailfire-Prod) | 90+ tables | Local `catalog` schema (authoritative) |

The catalog tables include:
- `cruise_lines`, `cruise_ships`, `cruise_regions`, `cruise_ports`
- `cruise_sailings`, `cruise_sailing_cabin_prices`, `cruise_sailing_stops`
- `cruise_ship_cabin_types`, `cruise_ship_decks`, `cruise_ship_images`
- `cruise_cabin_images`, `cruise_alternate_sailings`, `cruise_sailing_regions`
- `cruise_sync_raw`, `cruise_sync_history`, `cruise_ftp_file_sync`

### FDW Architecture (Active)

Foreign Data Wrapper is **currently active** on Dev and Preview environments. Both environments have foreign tables in the `catalog` schema that point directly to Production. Production holds the local (authoritative) catalog tables.

```
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCTION DATABASE                       │
│                 (cmktvanwglszgadjrorm)                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐       ┌─────────────────────────────┐  │
│  │ public schema   │       │ catalog schema              │  │
│  │ (90+ tables)    │       │ (16 cruise tables - LOCAL)  │  │
│  └─────────────────┘       └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                                      ↑
                                      │ FDW (read-only)
                                      │
┌─────────────────────────────────────────────────────────────┐
│              PREVIEW/DEV DATABASES                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐       ┌─────────────────────────────┐  │
│  │ public schema   │       │ catalog schema (FOREIGN)    │  │
│  │ (90+ tables)    │       │ Points to Production        │  │
│  └─────────────────┘       └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Key points**:
- Single source of truth for catalog data in Production
- Preview/Dev read catalog via FDW (no sync needed)
- Traveltek FTP sync runs only on Production (daily CRON at 2 AM)
- See [Database Architecture](./DATABASE_ARCHITECTURE.md) for implementation details

### Tour Catalog (Globus Integration)

In addition to cruise data, Tailfire manages a tour catalog sourced from Globus. The tour system includes:

- `tour_operators`, `tour_departures`, `tour_hotels`, `tour_inclusions`
- `tour_media`, `tour_day_details`, `tour_sync_history`

The API includes a `ToursByGlobusService`, a `tour-import` module for syncing Globus tour data, and a `tour-repository` module for serving tour data to frontends. Tours appear as `custom_tour` activity types in itineraries, with individual `tour_day` child activities.

---

## Key Design Decisions

### 1. Provider-Agnostic Catalog

Every catalog table includes:
```typescript
provider: varchar('provider').notNull().default('traveltek'),
providerIdentifier: varchar('provider_identifier').notNull(),
```

**Why**: Enables switching cruise data providers without schema changes.

### 2. Canonical Currency (CAD)

All prices stored in cents (integers):
```typescript
cheapestInsideCents: integer('cheapest_inside_cents'),
cheapestOceanviewCents: integer('cheapest_oceanview_cents'),
```

**Why**: Avoids floating-point precision issues; exchange handled in app layer.

### 3. Polymorphic Activities

Activities support the following component types:
- Flight, Cruise, Lodging, Transportation, Dining
- Entertainment, Excursion, Insurance, Custom, Port Info
- Package, Tour, Custom Tour, Tour Day

Each type has a dedicated detail table (e.g., `flight_details`, `lodging_details`). `Package` groups multiple child activities together. `Custom Tour` links to a catalog tour with a specific departure. `Tour Day` represents a single day within a multi-day tour.

**Why**: Clean separation of type-specific data while maintaining common fields.

### 4. Tagging System

Trips and contacts support freeform labels via a shared tagging system:
- `tags` — agency-scoped tag definitions
- `trip_tags` — many-to-many join between trips and tags
- `contact_tags` — many-to-many join between contacts and tags

Tags are exposed through `filter-options` endpoints so frontends can populate filter UIs dynamically.

### 5. Drizzle-Only Migrations

All schema changes use Drizzle ORM:
- Single source of truth for schema
- TypeScript type safety
- Migration tracking via `_journal.json`

Supabase CLI migrations are deprecated (archived in `_archive/`).

---

## Automation System (BullMQ + Redis)

The API includes a centralized job queue system for scheduled and delayed tasks:

```
┌─────────────────────────────────────────────────────────────────┐
│                         NestJS API                               │
│  ┌──────────────────┐    ┌─────────────────────────────────┐   │
│  │  Business Logic  │───▶│      AutomationModule           │   │
│  │  (TripsService)  │    │  - AutomationService            │   │
│  └──────────────────┘    │  - TripAutomationProcessor      │   │
│                          │  - ClientCareProcessor          │   │
│                          │  - NotificationsProcessor       │   │
│                          └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │  Redis (Railway) │
                          └─────────────────┘
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Trip Auto-Transitions** | Automatic status changes based on start/end dates |
| **Timezone-Aware** | Jobs scheduled in trip's local timezone |
| **Deterministic IDs** | Prevents duplicate jobs |
| **Bull Board** | Admin dashboard at `/admin/queues` |
| **Job History** | Permanent audit trail in PostgreSQL |

### Queues

| Queue | Purpose |
|-------|---------|
| `trip-automation` | Status transitions, reminders |
| `client-care` | Emails, follow-ups |
| `notifications` | Push, email, SMS |

**See [Automation System](./AUTOMATION.md) for detailed documentation.**

---

## Application Responsibilities

| App | Purpose | Users |
|-----|---------|-------|
| **Admin** | Agency management, user admin, trip oversight | Agency staff |
| **OTA** | Public booking platform, cruise search | End customers |
| **Client** | Customer portal, trip details, documents | Booked travelers |
| **API** | Business logic, auth, data access | All apps |

### Key API Modules

The NestJS API is organized into feature modules. Notable modules beyond the core CRUD resources include:

| Module | Purpose |
|--------|---------|
| `cruise-import` | Traveltek FTP sync; populates `catalog` schema on Production |
| `cruise-booking` | Real-time cruise booking via Traveltek FusionAPI (agent, client, OTA, import flows) |
| `tour-import` | Globus tour catalog sync (`ToursByGlobusService`) |
| `tour-repository` | Serves tour catalog data to frontends |
| `automation` | BullMQ job queues for trip auto-transitions and notifications |
| `ocr-import` | Document OCR for importing trip/booking data from PDFs and images |
| `amadeus` | Amadeus GDS integration for flight search and pricing |
| `tasks` | Task management (to-dos) scoped to trips and contacts |
| `dashboard` | Analytics and summary endpoints for the admin dashboard |
| `geocoding` | Address geocoding for activity locations |
| `loyalty` | Loyalty program tracking for travelers |
| `commissions` | Commission tracking and reporting for bookings |
| `activity-logs` | Audit trail via EventEmitter2 wildcard events (`audit.*`) |

### Package Responsibilities

| Package | Purpose |
|---------|---------|
| **database** | Drizzle schema, migrations, DB client |
| **shared-types** | TypeScript interfaces shared across apps |
| **api-client** | Generated API client for frontend apps |
| **ui-public** | Shared React components |
| **config** | ESLint, TypeScript, Prettier configs |

---

## Related Documentation

- [Security Model](./SECURITY.md) - Authentication, authorization, RLS
- [Database Architecture](./DATABASE_ARCHITECTURE.md) - Schema details, FDW setup
- [Automation System](./AUTOMATION.md) - Job queues, trip auto-transitions
- [Environment Configuration](./ENVIRONMENTS.md) - Domains, CORS, env vars
- [CI/CD Pipeline](./CI_CD.md) - Deployment workflows
