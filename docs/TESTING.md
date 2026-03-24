# Testing Guide

This document describes the testing and validation surface that is actually wired in the repo today.

## Current Test Matrix

| Workspace | Current scripts | Notes |
| --- | --- | --- |
| `apps/api` | `test`, `test:watch`, `test:cov`, `test:ci`, `test:debug` | Jest unit/integration coverage exists under `src/**/*.spec.ts` |
| `apps/api` | `test:e2e` | Script exists, but the referenced `./test/jest-e2e.json` harness is missing |
| `apps/admin` | `test`, `test:watch`, `test:coverage` | Vitest |
| `apps/admin` | `test:e2e`, `test:e2e:ui`, `test:e2e:headed` | Playwright |
| `apps/client` | no `test` script | Root `pnpm test` does not cover it |
| `apps/ota` | no `test` script | Root `pnpm test` does not cover it |
| `packages/shared-types` | `test`, `test:watch`, `test:cov` | Jest schema/type tests |
| `packages/database` | no `test` script | At least one test file exists under `src/__tests__`, but root test commands do not run it |
| `packages/api-client` | no test/build script | Validation gap |
| `packages/ui-public` | `lint`, `typecheck` only | No automated test script |
| `packages/trip-proposal-ui` | no scripts | No automated validation script |

## Commands That Work Today

### Root

```bash
pnpm test
pnpm lint
pnpm typecheck
```

Important limitation:

- Root `pnpm test` only runs where a workspace exposes a `test` script.

### API

```bash
pnpm --filter @tailfire/api test
pnpm --filter @tailfire/api test:watch
pnpm --filter @tailfire/api test:cov
pnpm --filter @tailfire/api test:ci
```

Current caveat:

- `pnpm --filter @tailfire/api test:e2e` is advertised in `apps/api/package.json`, but the referenced `apps/api/test/jest-e2e.json` file is missing.

### Admin

```bash
pnpm --filter @tailfire/admin test
pnpm --filter @tailfire/admin test:watch
pnpm --filter @tailfire/admin test:coverage
pnpm --filter @tailfire/admin test:e2e
pnpm --filter @tailfire/admin test:e2e:ui
```

### Shared Types

```bash
pnpm --filter @tailfire/shared-types test
pnpm --filter @tailfire/shared-types test:watch
pnpm --filter @tailfire/shared-types test:cov
```

## What Root Validation Misses

The current root scripts do not fully represent repo quality coverage.

Examples:

- `apps/client` has no `test` script.
- `apps/ota` has no `test` or `typecheck` script.
- `packages/database` has no `test` script even though `packages/database/src/__tests__/cruise-data-smoke.test.ts` exists.
- `packages/api-client` and `packages/trip-proposal-ui` expose no build/test scripts.
- `packages/ui-public` participates in lint/typecheck only.

## Current File Layout Patterns

Observed conventions in the repo:

- API tests are usually `*.spec.ts` under `apps/api/src/**`
- Admin unit/integration tests use Vitest naming such as `*.test.ts` and `*.test.tsx`
- Admin E2E tests live under `apps/admin/tests/e2e/`
- Shared-type tests live under `packages/shared-types/src/**`

## Practical Validation Recommendations

For repo work that touches trip workflow, booking, or shared contracts, the minimum realistic validation bar today is:

```bash
pnpm lint
pnpm typecheck
pnpm --filter @tailfire/api test
pnpm --filter @tailfire/admin test
```

Add this when UI flows change:

```bash
pnpm --filter @tailfire/admin test:e2e
```

## Known Gaps

- API E2E is currently documented in scripts, but not wired to a real harness.
- Several user-facing apps and shared packages are outside automated test coverage.
- Root `pnpm test` can look healthier than the repo actually is because missing scripts are simply skipped.

## Related Docs

- [LOCAL_DEV.md](./LOCAL_DEV.md)
- [CI_CD.md](./CI_CD.md)
- [REPOSITORY_REVIEW_ISSUES.md](./REPOSITORY_REVIEW_ISSUES.md)
