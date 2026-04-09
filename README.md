# Tailfire Monorepo

Tailfire is the Phoenix Voyages monorepo. It uses pnpm workspaces and Turborepo to run an API-first travel platform: Next.js frontends handle presentation and Supabase auth, while business data and workflow logic flow through the NestJS API.

## Workspace Layout

```
tailfire/
├── apps/
│   ├── admin/   # Advisor and operations dashboard
│   ├── api/     # NestJS backend API
│   ├── client/  # Traveler portal and shared proposal access
│   └── ota/     # Public discovery, AI concierge, and advisor-led storefront
├── packages/
│   ├── api-client/
│   ├── config/
│   ├── database/
│   ├── shared-types/
│   ├── trip-proposal-ui/
│   └── ui-public/
└── docs/
```

## Quick Start

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/client/.env.example apps/client/.env.local
cp apps/ota/.env.example apps/ota/.env.local

cd apps/api && pnpm db:migrate && cd ../..

pnpm dev
```

`pnpm dev` runs the root `predev` hook first. Today that hook probes local Redis with `redis-cli` and may try to start `redis-server`, so filtered app commands are often easier on machines without local Redis tooling.

## Canonical Docs

| Document | Purpose |
| --- | --- |
| [Docs Index](./docs/README.md) | Canonical doc entry point |
| [Architecture](./docs/ARCHITECTURE.md) | Current app, package, and data-flow model |
| [Local Development](./docs/LOCAL_DEV.md) | Working local setup paths, ports, and caveats |
| [Environments](./docs/ENVIRONMENTS.md) | Environment mapping, frontend envs, and CORS behavior |
| [Testing](./docs/TESTING.md) | Current scripts, coverage boundaries, and gaps |
| [CI/CD](./docs/CI_CD.md) | What the tracked GitHub Actions workflows actually do |
| [API Deployment](./docs/DEPLOYMENT_API.md) | Railway API deployment behavior |
| [Repository Review Issues](./docs/REPOSITORY_REVIEW_ISSUES.md) | Open platform and doc-audit findings |

## App And Package Docs

| Surface | Documentation |
| --- | --- |
| API | [apps/api/README.md](./apps/api/README.md) |
| Admin | [apps/admin/README.md](./apps/admin/README.md) |
| Client | [apps/client/README.md](./apps/client/README.md) |
| OTA | [apps/ota/README.md](./apps/ota/README.md) |
| Database | [packages/database/README.md](./packages/database/README.md) |
| Shared Types | [packages/shared-types/README.md](./packages/shared-types/README.md) |
| API Client | [packages/api-client/README.md](./packages/api-client/README.md) |
| UI Public | [packages/ui-public/README.md](./packages/ui-public/README.md) |
| Trip Proposal UI | [packages/trip-proposal-ui/README.md](./packages/trip-proposal-ui/README.md) |

## Environment Summary

| Environment | Branch | Deployment Path |
| --- | --- | --- |
| Local | local worktree | `pnpm dev` or filtered app commands on `localhost:3100-3103` |
| Preview | `preview` | `deploy-preview.yml` migrates Preview DB, deploys Railway `api-dev`, deploys Vercel previews, and aliases admin preview to `tf-demo.phoenixvoyages.ca` |
| Production | `main` | `deploy-prod.yml` migrates Prod DB, deploys Railway `api-prod`, and targets `api.tailfire.ca`, `tailfire.phoenixvoyages.ca`, `ota.phoenixvoyages.ca`, and `client.phoenixvoyages.ca` |

Preview is not a fixed mirror of the old `*-dev.phoenixvoyages.ca` setup. The tracked workflow waits on a generated Railway URL for the API and uses Vercel preview deployments, with only the admin alias pinned in the workflow.

## Common Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
