# Getting Started

This page is the quick orientation path for new contributors and operators.

## Repo Layout

- `apps/admin`: advisor and operations dashboard
- `apps/api`: NestJS backend and business logic
- `apps/client`: traveler-facing portal
- `apps/ota`: public storefront
- `packages/`: shared types, database schema, config, proposal UI, and shared client code
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

- `pnpm dev` runs the root `predev` hook first and expects Redis tooling locally unless `REDIS_URL` handling is updated.
- The detailed setup, env, and Redis guidance lives in the canonical docs, not in this page.
- The repo worktree may contain historical plan/spec material; use the canonical docs first.

## Read Next

- [Platform Architecture](./Platform-Architecture.md)
- [Trip Workflow](./Trip-Workflow.md)
- [Operations And Runbooks](./Operations-and-Runbooks.md)

## Canonical References

- [Local Development](https://github.com/Systemsaholic/tailfire/blob/main/docs/LOCAL_DEV.md)
- [Environments](https://github.com/Systemsaholic/tailfire/blob/main/docs/ENVIRONMENTS.md)
- [Testing](https://github.com/Systemsaholic/tailfire/blob/main/docs/TESTING.md)
- [README](https://github.com/Systemsaholic/tailfire/blob/main/README.md)
