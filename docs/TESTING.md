# Testing Guide

This document describes the validation surface that is actually wired in the repo today.

## Current Test Matrix

| Workspace | Current scripts | Notes |
| --- | --- | --- |
| `apps/api` | `test`, `test:watch`, `test:cov`, `test:ci`, `test:debug` | Jest unit and integration coverage under `src/**/*.spec.ts` |
| `apps/api` | `test:e2e` | Script exists, but `apps/api/test/jest-e2e.json` is missing |
| `apps/admin` | `test`, `test:watch`, `test:coverage` | Vitest |
| `apps/admin` | `test:e2e`, `test:e2e:ui`, `test:e2e:headed` | Playwright |
| `apps/client` | no `test` script | Root `pnpm test` does not cover it |
| `apps/ota` | no `test` script and no `typecheck` script | Root validation skips both |
| `packages/shared-types` | `test`, `test:watch`, `test:cov` | Jest |
| `packages/database` | no `test` script | Test files exist, but the package is skipped by root `pnpm test` |
| `packages/api-client` | no scripts | Validation gap |
| `packages/ui-public` | `lint`, `typecheck` | No automated tests |
| `packages/trip-proposal-ui` | no scripts | No automated validation |

## Commands That Work Today

Root commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Filtered commands with better signal:

```bash
pnpm --filter @tailfire/api test
pnpm --filter @tailfire/admin test
pnpm --filter @tailfire/admin test:e2e
pnpm --filter @tailfire/shared-types test
```

## Important Gaps

- Root `pnpm test` only runs in workspaces that define a `test` script.
- The API `test:e2e` command is stale until the missing harness is restored.
- OTA and Client changes can ship without automated test coverage.
- Shared packages still have uneven build, typecheck, and test coverage.

## Practical Validation Bar

For workflow, API, or shared-contract changes, the current minimum realistic bar is:

```bash
pnpm lint
pnpm typecheck
pnpm --filter @tailfire/api test
pnpm --filter @tailfire/admin test
```

Add `pnpm --filter @tailfire/admin test:e2e` when UI flow behavior changes.
