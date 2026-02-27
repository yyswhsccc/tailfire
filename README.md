# Tailfire Monorepo

Next-generation travel agency management platform built with Turborepo, pnpm workspaces, and modern tooling.

## Structure

```
tailfire/
├── apps/
│   ├── admin/     # B2B Admin Dashboard (Next.js) - Port 3100
│   ├── api/       # Backend API (NestJS) - Port 3101
│   ├── client/    # Customer-facing app (Next.js) - Port 3103
│   └── ota/       # OTA booking platform (Next.js) - Port 3102
├── packages/
│   ├── config/    # ESLint & TypeScript configs
│   ├── database/  # Drizzle ORM schema & migrations
│   ├── shared-types/  # TypeScript type definitions
│   ├── api-client/    # API client library
│   └── ui-public/     # Shared UI components
└── docs/          # Project documentation
```

## Architecture

Tailfire is designed as a **single-agency, multi-branch** platform:

- **Single Agency**: One travel agency organization (Phoenix Voyages)
- **Multiple Branches**: Support for future expansion to multiple physical or virtual branch locations
- **Centralized Management**: Admin dashboard manages all branches from a single interface
- **Shared Catalog**: All branches access the same cruise/tour catalog data
- **Branch-Scoped Data**: Bookings, clients, and transactions are scoped to individual branches

This is **not** a multi-tenant SaaS platform. The codebase serves a single agency with the flexibility to scale across multiple branches while maintaining centralized control.

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
# Edit with your Supabase credentials

# Run migrations (first time)
cd apps/api && pnpm db:migrate && cd ../..

# Start all apps
pnpm dev
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | System design, data flow, key decisions |
| [Security Model](./docs/SECURITY.md) | Authentication, authorization, RLS |
| [Database Architecture](./docs/DATABASE_ARCHITECTURE.md) | Schema, FDW, migrations |
| [Local Development](./docs/LOCAL_DEV.md) | Ports, startup commands, database setup |
| [Environment Configuration](./docs/ENVIRONMENTS.md) | Domains, CORS, environment variables |
| [CI/CD Pipeline](./docs/CI_CD.md) | GitHub Actions, deployment flow |
| [API Deployment](./docs/DEPLOYMENT_API.md) | Railway settings, health checks |
| [Testing Guide](./docs/TESTING.md) | Test frameworks, patterns, CI integration |

### App-Specific Documentation

| App | Documentation |
|-----|---------------|
| [API](./apps/api/README.md) | NestJS backend, database, storage providers |
| [Admin](./apps/admin/README.md) | B2B dashboard, state management, components |
| [Database](./packages/database/README.md) | Schema, migrations, Drizzle ORM |
| [Shared Types](./packages/shared-types/README.md) | Type definitions, API contracts |

### Operational Guides

| Guide | Description |
|-------|-------------|
| [Seed Runbook](./scripts/SEED-RUNBOOK.md) | Database seeding for dev/prod |
| [FDW Setup](./apps/ota/supabase/FDW_SETUP.md) | Catalog data access via Foreign Data Wrapper |
| [Migrations](./packages/database/MIGRATIONS.md) | Migration conventions and workflow |
| [Release Checklist](./docs/RELEASE_CHECKLIST.md) | Local-first release flow |

## Deployment

```
Feature Branch → preview branch → main branch
                      ↓                ↓
              Dev Environment    Production
```

| Environment | Git Branch | CI Workflow | Platforms |
|-------------|------------|-------------|-----------|
| **Development** | `preview` | `deploy-preview.yml` | Railway (`api-dev`), Vercel Preview |
| **Production** | `main` | `deploy-prod.yml` | Railway (`api-prod`), Vercel Production |

### Production Domains

- **API**: `api.tailfire.ca`
- **Admin**: `tailfire.phoenixvoyages.ca`
- **OTA**: `ota.phoenixvoyages.ca`
- **Client**: `client.phoenixvoyages.ca`

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Backend** | NestJS 10+, Drizzle ORM |
| **Frontend** | Next.js 15, shadcn/ui, TanStack Query |
| **Database** | Supabase PostgreSQL |
| **Auth** | Supabase Auth + JWT |
| **Storage** | Cloudflare R2 (Supabase Storage as fallback) |

## Scripts

```bash
pnpm dev          # Start all apps in dev mode
pnpm build        # Build all packages
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript type checking
pnpm test         # Run tests
```
