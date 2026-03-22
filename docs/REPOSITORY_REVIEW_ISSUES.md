# Repository Review Issues

Review date: 2026-03-21

Scope: issues observed while reconciling the docs with the current `tailfire/` codebase. No code changes were made in this pass.

## Priority 1

### 1. OTA storefront is still disconnected from live platform data

Evidence:

- `apps/ota/src/data/trips.ts`
- `apps/ota/src/lib/api.ts`

Why it matters:

- Search and trip detail pages are driven by local demo data.
- Inquiry, profile, and tracking helpers are placeholders that only log and resolve locally.
- Public-site behavior can drift from the real platform and cannot exercise production backend flows end-to-end.

Suggested next step:

- Replace local trip fixtures and placeholder helpers with API-backed queries/mutations, ideally through a shared client contract.

### 2. CI/CD is deploy-only; there is no pre-merge validation workflow

Evidence:

- `.github/workflows/deploy-preview.yml`
- `.github/workflows/deploy-prod.yml`
- no additional workflow files under `.github/workflows/`

Why it matters:

- The repo can deploy code without a dedicated PR gate for install, lint, typecheck, and test.
- Regressions are more likely to reach preview or production before being caught.

Suggested next step:

- Add a PR workflow that runs install, lint, typecheck, and the current test suite before deploy workflows are allowed to proceed.

### 3. Proposal UI is only partially shared, which risks preview vs published drift

Evidence:

- `apps/admin/src/app/trips/[id]/preview/page.tsx` uses `@tailfire/trip-proposal-ui`
- `apps/client/src/app/shared/trips/[token]/_components/` contains a parallel local proposal implementation

Why it matters:

- The admin preview and client-facing shared proposal are not rendering from a single component package.
- Changes can land in one surface and not the other, which undermines the purpose of a shared proposal UI layer.

Suggested next step:

- Consolidate the client shared-trip route onto `@tailfire/trip-proposal-ui` or clearly retire the package if that is not the direction.

### Trip lifecycle, itinerary workflow, and supplier booking are still split across conflicting state models

Evidence:

- `packages/database/src/schema/trips.schema.ts`
- `packages/shared-types/src/api/trip-status-transitions.ts`
- `apps/admin/src/lib/trip-status-constants.ts`
- `apps/admin/src/lib/validation/trip-validation.ts`
- `apps/api/src/trips/dto/create-itinerary.dto.ts`
- `apps/api/src/trips/trips.service.ts`

Why it matters:

- The repo still stores legacy trip statuses `draft`, `quoted`, `booked`, `in_progress`, and `completed` even though the agreed business model is now `Inbound`, `Planning`, `Active`, `Travelling`, `Travelled`, and `Cancelled`.
- Itinerary workflows still expose `declined`, which conflicts with the simplified target set of `Draft`, `Proposing`, `Approved`, and `Archived`.
- Automation, admin Kanban labels, DTO validation, and business terminology can drift because there is not yet one implemented lifecycle contract.

Suggested next step:

- Implement the canonical workflow documented in `docs/TRIP_WORKFLOW.md`, starting with shared types, database enums, validators, and automation vocabulary.

### Supplier booking capture is inconsistent between standalone activities and packages

Evidence:

- `apps/api/src/trips/activity-bookings.service.ts`
- `apps/api/src/trips/activities.service.ts`
- `apps/admin/src/hooks/use-activity-bookings.ts`
- `apps/admin/src/hooks/use-bookings.ts`
- `apps/admin/src/components/packages/mark-as-booked-modal.tsx`
- `apps/api/src/trips/trips.service.ts`

Why it matters:

- Standalone activity booking currently records `isBooked` and `bookingDate`, while package booking also forces activity `status='confirmed'` and cascades that state to child activities.
- The package booking modal collects `paymentStatus`, but the mutation path does not send it through consistently.
- Proposal approval and booking capture do not currently feed a single trip lifecycle engine, so the system cannot reliably auto-promote a trip to the target `Active` stage from the first real supplier booking.

Suggested next step:

- Create one canonical booking command/service for standalone activities and packages, then use that service to drive trip lifecycle progression and booking-progress derivation.

## Priority 2

### 4. The API package advertises an E2E test command, but its referenced config file is missing

Evidence:

- `apps/api/package.json` defines `test:e2e` as `jest --config ./test/jest-e2e.json`
- `apps/api/test/jest-e2e.json` is missing
- no `apps/api/test/` directory was found during the review

Why it matters:

- The repo presents API E2E coverage that is not currently runnable as wired.
- Contributors can waste time assuming the command is part of the validation bar when it will fail immediately.
- CI coverage discussions become less trustworthy when package scripts do not map to real test harnesses.

Suggested next step:

- Either restore the missing API E2E config/tests or remove the script until a working harness exists.

### 5. Automated validation coverage is uneven across apps and packages

Evidence:

- `apps/client/package.json` has no `test` script
- `apps/ota/package.json` has no `test` or `typecheck` script
- `packages/database/package.json` has no `test` script even though `packages/database/src/__tests__/cruise-data-smoke.test.ts` exists
- `packages/api-client/package.json` has no build/test scripts
- `packages/ui-public/package.json` has no `test` script
- `packages/trip-proposal-ui/package.json` has no build/test scripts

Why it matters:

- Important surfaces are missing automated protection even when touched frequently.
- Root turbo commands can give a false sense of coverage because they only run where a script exists.

Suggested next step:

- Define a minimum validation bar per workspace and enforce it through root scripts and CI.

### 6. Generated `tsconfig.tsbuildinfo` files are tracked in git

Evidence:

- `apps/admin/tsconfig.tsbuildinfo`
- `packages/database/tsconfig.tsbuildinfo`
- `packages/shared-types/tsconfig.tsbuildinfo`

Why it matters:

- Generated artifacts create noisy diffs and frequent unrelated churn.
- Review signal is lower when build output changes are mixed into feature work.

Suggested next step:

- Stop tracking these files and ignore them in git unless there is a deliberate reason to version them.

### 7. Parts of the API bypass package boundaries and import shared types from source paths directly

Evidence:

- `apps/api/src/calendar/calendar.controller.ts`
- `apps/api/src/tasks/tasks.controller.ts`
- `apps/api/src/contacts/contacts.controller.ts`
- `apps/api/src/trips/trips.controller.ts`
- additional matches from `rg "packages/shared-types/src/api" apps/api/src`

Why it matters:

- These imports couple the API to the internal file layout of `packages/shared-types` instead of its published workspace exports.
- Refactors inside the shared-types package become riskier because consumers are not honoring the package boundary the rest of the repo is documented around.
- It undermines the value of the package manifest and can create inconsistent build or tooling behavior across workspaces.

Suggested next step:

- Normalize API imports onto `@tailfire/shared-types` or `@tailfire/shared-types/api`, then keep direct source-path imports limited to explicit tooling/config cases only.

### 8. Migration history uses mixed naming conventions and manual journal assumptions

Evidence:

- `docs/MIGRATIONS.md`
- `packages/database/src/migrations/`

Why it matters:

- The repo contains both numbered migrations such as `0001_...sql` and timestamped migrations such as `202603...sql`.
- This is workable, but it increases audit and onboarding confusion and makes the documented conventions harder to trust.

Suggested next step:

- Standardize the forward naming convention and document how legacy files should be treated.

### 9. The API env example is stale for current external-provider setup

Evidence:

- `apps/api/.env.example` still documents `TRAVELTEK_API_KEY` and `TRAVELTEK_AFFILIATE_ID`
- `apps/api/src/cruise-booking/services/traveltek-auth.service.ts` requires `TRAVELTEK_API_URL`, `TRAVELTEK_USERNAME`, `TRAVELTEK_PASSWORD`, and `TRAVELTEK_SID`
- `apps/api/src/api-credentials/credential-resolver.service.ts` expects env-backed provider secrets such as `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AERODATABOX_RAPIDAPI_KEY`, `GOOGLE_PLACES_API_KEY`, `BOOKING_RAPIDAPI_KEY`, and `OPENAI_API_KEY`

Why it matters:

- Local setup and environment provisioning can follow the wrong Traveltek auth model.
- Operators do not get a reliable example of the current external-provider secret surface.
- Documentation drift around secrets tends to surface as slow, confusing runtime failures.

Suggested next step:

- Align `apps/api/.env.example` with the current FusionAPI, Traveltek FTP, and env-backed provider variables, or generate provider env docs directly from the resolver metadata.

### 10. The admin API-credentials status page does not accurately report env-only provider availability

Evidence:

- `apps/api/src/api-credentials/credential-resolver.service.ts` is the current source of truth for env-only provider availability
- `apps/api/src/api-credentials/api-credentials.service.ts` `getProviderMetadata()` checks only for active database records
- `apps/admin/src/app/settings/api-credentials/page.tsx` renders Doppler-managed provider status from that metadata

Why it matters:

- Providers configured correctly through environment variables can still appear as "Not Configured" in the admin UI.
- The status page is misleading for the exact class of providers the platform now prefers operationally.
- This increases the chance of unnecessary troubleshooting or duplicate credential entry attempts.

Suggested next step:

- Derive env-only provider availability from `CredentialResolverService` instead of database presence when building provider metadata.

### 11. Booking.com hotel enrichment is still wired to database credentials even though the provider policy is env-only

Evidence:

- `apps/api/src/external-apis/providers/hotels/hotels.controller.ts` calls `ApiCredentialsService.getDecryptedCredentials(ApiProvider.BOOKING_COM)`
- `apps/api/src/api-credentials/credential-resolver.service.ts` marks `BOOKING_COM` as `env-only`
- `apps/admin/src/app/settings/api-credentials/_components/credential-form-dialog.tsx` hides `env-only` providers from manual credential creation

Why it matters:

- The enrichment route can silently return empty amenities in the standard Doppler/env-backed setup.
- The route behavior is inconsistent with the rest of the provider stack, which uses the resolver and startup validation.
- Operators have no supported UI path to create the database credential record that this route currently expects.

Suggested next step:

- Switch Booking.com enrichment to `CredentialResolverService`, or explicitly move Booking.com back to a supported database-managed policy and update the admin UI accordingly.

### 12. Globus support is described inconsistently between the live proxy and the import pipeline

Evidence:

- `apps/api/src/globus/types/globus-api.types.ts` includes `Globus`, `Cosmos`, and `Monograms`
- `apps/api/src/globus/globus.controller.ts` and `apps/api/src/globus/globus.module.ts` describe all three brands as supported
- `apps/api/src/tour-import/tour-import.types.ts` explicitly limits import support to `Globus` and `Cosmos`
- `apps/api/src/tour-import/tour-import.service.ts` comments still say the import path supports `Monograms`

Why it matters:

- Readers cannot tell whether `Monograms` is intentionally supported, intentionally excluded, or simply unfinished.
- Brand coverage can drift between the live search surface and the persisted catalog.
- Planning catalog completeness or OTA rollout becomes harder when the supported-brand story is internally contradictory.

Suggested next step:

- Decide the supported Globus brand set, then align the type definitions, controller comments, sync endpoints, and docs around that decision.

### 13. The root `pnpm dev` flow assumes local Redis tooling even though the API also supports `REDIS_URL`

Evidence:

- `package.json` defines `predev` as `redis-cli ping > /dev/null 2>&1 || redis-server --daemonize yes`
- `apps/api/src/automation/automation.module.ts` already supports explicit `REDIS_URL` config and otherwise falls back to `localhost:6379`

Why it matters:

- Local onboarding can fail before the apps start if `redis-cli` or `redis-server` is not installed.
- This is surprising in Doppler-based setups where developers may expect a provided `REDIS_URL` to be sufficient.
- The root workflow is more coupled to a specific local Redis installation pattern than the API runtime itself.

Suggested next step:

- Make the root dev preflight honor `REDIS_URL` before probing local Redis, or remove the daemonizing side effect and document Redis startup as an explicit prerequisite.

## Priority 3

### 14. Several navigable product areas are still placeholders or partial implementations

Evidence:

- `apps/admin/src/app/reporting/page.tsx`
- `apps/admin/src/app/destinations/page.tsx`
- `apps/admin/src/app/settings/page.tsx`
- `apps/admin/src/app/profile/page.tsx`
- `apps/client/src/app/(dashboard)/messages/page.tsx`
- `apps/client/src/app/(dashboard)/payments/page.tsx`
- `apps/client/src/app/(dashboard)/preferences/page.tsx`
- `apps/client/src/app/(dashboard)/settings/page.tsx`

Why it matters:

- These routes exist and are discoverable, but some are explicitly marked "in development" or "coming soon".
- Product readiness is uneven across the visible navigation surface.

Suggested next step:

- Decide which sections should remain visible as roadmap placeholders versus which should be hidden until functional.
