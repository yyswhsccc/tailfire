# @tailfire/database

Shared Drizzle ORM database layer for Tailfire Beta monorepo.

## Overview

This package provides:
- **Drizzle schema definitions** for all database tables
- **Database client factory** (`createDbClient`)
- **Migration runner** (`runMigrations` - apps/api only)
- **TypeScript types** for database entities

## Usage

### In NestJS Backend (`apps/api`)

```typescript
// apps/api/src/db/index.ts
import { createDbClient } from '@tailfire/database'

export const db = createDbClient(process.env.DATABASE_URL!)
```

### In Scripts

```typescript
// scripts/seed-database.ts
import { createDbClient } from '@tailfire/database'

const db = createDbClient(process.env.DATABASE_URL!)
await db.insert(schema.agencies).values({ name: 'Demo Agency' })
```

## Migrations

See [MIGRATIONS.md](./MIGRATIONS.md) for full conventions and workflow.

### Quick Reference

| Command | Description |
|---------|-------------|
| `cd apps/api && pnpm db:migrate` | Apply pending migrations |
| `pnpm --filter @tailfire/database migrations:validate` | Check naming and duplicates |
| `pnpm --filter @tailfire/database migrations:list` | List migration files |

### Key Rules

- **Run migrations from `apps/api` only** (requires direct TCP connection)
- **Naming format**: `YYYYMMDDHHMMSS_snake_case_description.sql`
- **Source of truth**: Supabase migrations table (not Drizzle journal)

## Directory Structure

```
packages/database/
├── src/
│   ├── schema/              # Drizzle schema files
│   │   ├── auth.schema.ts
│   │   ├── agencies.schema.ts
│   │   ├── trips.schema.ts
│   │   └── index.ts
│   ├── migrations/          # Generated SQL migrations
│   │   └── YYYYMMDD_*.sql
│   ├── client.ts            # Database client factory
│   ├── migrate.ts           # Migration runner
│   └── index.ts             # Package exports
├── drizzle.config.ts        # Drizzle Kit configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

Required in `apps/api/.env`:

```bash
# Direct TCP connection (Supabase provides this)
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

# Service role key (bypasses RLS, for migrations only)
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Schema Organization

| File | Tables | Description |
|------|--------|-------------|
| `auth.schema.ts` | users, sessions, roles | Authentication & RBAC |
| `agencies.schema.ts` | agencies, branches | Agency structure |
| `contacts.schema.ts` | contacts, relationships, groups | Contact management |
| `trips.schema.ts` | trips, travelers, itineraries | Trip management |
| `activities.schema.ts` | activities, activity_* | Trip activities (tours, dining, packages, etc.) |
| `financials.schema.ts` | payments, commissions, trust ledger | Financial management |
| `tasks.schema.ts` | tasks | Task management |
| `email-accounts.schema.ts` | email_accounts | Agent IMAP/SMTP email connections |
| `synced-emails.schema.ts` | synced_emails | Synced IMAP email messages |
| `email-attachments.schema.ts` | email_attachments | Email attachment metadata |
| `notes.schema.ts` | notes | Internal agent notes (trip, contact, group scoped) |
| `trip-group-shares.schema.ts` | trip_group_shares | Group sharing between agents |
| `trip-group-documents.schema.ts` | trip_group_documents | Group-level documents |
| `trip-group-media.schema.ts` | trip_group_media | Group-level media assets |
| `cruise-*.schema.ts` | cruise catalog tables (16 tables) | Cruise catalogue (catalog schema) |

## Schema Notes

### Floating Packages

Package activities are "floating" - they exist at the trip level rather than being tied to a specific itinerary day. This is implemented with:

- `itinerary_day_id` is nullable for package activities
- `trip_id` column provides the trip-level association
- Database constraint ensures either `itinerary_day_id` is set OR (`trip_id` is set AND `type = 'package'`)

See `apps/admin/docs/activity-form-patterns.md` for frontend implementation patterns.

## Development

Schema files are defined in `packages/database/src/schema/` and migrations in `packages/database/src/migrations/`.
