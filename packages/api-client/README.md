# @tailfire/api-client

Framework-agnostic fetch client for Tailfire frontends and shared integrations.

## What It Provides

- `createApiClient` with:
  - base URL configuration
  - async token provider support
  - request timeout handling
  - retry-on-5xx behavior
- `createMockApiClient`
- `ApiError` helpers
- small domain helper factories for inquiries, profile, and tracking

## Package Shape

This package exports source files directly from `src/` rather than a built `dist/` directory.

Key files:

- `src/client.ts`
- `src/errors.ts`
- `src/types.ts`
- `src/inquiries.ts`
- `src/profile.ts`
- `src/tracking.ts`

## Current Repo Usage

- `apps/client/src/lib/api-client.ts` wraps this package with a Supabase token provider
- the OTA does not currently use this package for its inquiry/tracking flow and still relies on local placeholder helpers

## Current Scripts

This package currently does not define build, typecheck, or test scripts.

## Related Docs

- [`../../apps/client/README.md`](../../apps/client/README.md)
- [`../../docs/REPOSITORY_REVIEW_ISSUES.md`](../../docs/REPOSITORY_REVIEW_ISSUES.md)
