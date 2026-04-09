# Getting Started

This page is the quick orientation path for contributors and operators.

## Repo Layout

- `apps/admin`: advisor and operations dashboard
- `apps/api`: NestJS backend and business logic
- `apps/client`: traveler portal and shared proposal access
- `apps/ota`: public discovery, AI concierge, and advisor-led storefront
- `packages/`: shared contracts, database tooling, UI packages, and config
- `docs/`: canonical technical and operational documentation

## Local Setup Summary

From the repo root:

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/client/.env.example apps/client/.env.local
cp apps/ota/.env.example apps/ota/.env.local

cd apps/api && pnpm db:migrate && cd ../..

pnpm dev
```

## Default Local Ports

- Admin: `3100`
- API: `3101`
- OTA: `3102`
- Client: `3103`

## Important Notes

- Root `pnpm dev` still runs a Redis preflight that assumes local Redis tooling.
- Filtered app commands are often easier when you only need part of the stack.
- The OTA is API-backed for discovery and trip requests, but not a self-serve checkout flow.

## Read Next

- [Platform Architecture](./Platform-Architecture.md)
- [Trip Workflow](./Trip-Workflow.md)
- [Operations And Runbooks](./Operations-and-Runbooks.md)
