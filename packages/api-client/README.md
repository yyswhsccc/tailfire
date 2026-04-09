# @tailfire/api-client

Framework-agnostic fetch client package for Tailfire frontends and shared integrations.

## What It Provides

- `createApiClient` with base URL configuration, async token provider support, request timeouts, and retry-on-5xx behavior
- `createMockApiClient`
- `ApiError` helpers
- small domain helper factories for inquiries, profile, and tracking

## Package Shape

This package exports source files directly from `src/`.

Key files:

- `src/client.ts`
- `src/errors.ts`
- `src/types.ts`
- `src/inquiries.ts`
- `src/profile.ts`
- `src/tracking.ts`

## Current Repo Usage

- `apps/client/src/lib/api-client.ts` wraps this package with app-specific auth behavior.
- The OTA currently uses its own `src/lib/api.ts` helpers instead so it can apply `x-catalog-api-key` and `x-ota-service-key` headers directly.

## Scripts

This package does not currently define build, typecheck, or test scripts.

## Related Docs

- [`../../apps/client/README.md`](../../apps/client/README.md)
- [`../../apps/ota/README.md`](../../apps/ota/README.md)
- [`../../docs/REPOSITORY_REVIEW_ISSUES.md`](../../docs/REPOSITORY_REVIEW_ISSUES.md)
