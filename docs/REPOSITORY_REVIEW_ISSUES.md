# Repository Review Issues

Review date: 2026-03-24

Scope: open issues observed while reconciling the docs and local wiki/user guide with the current `tailfire/` codebase. No product code was changed in this pass.

## Priority 1

### 1. OTA storefront is still disconnected from live platform data

Evidence:

- `apps/ota/src/data/trips.ts`
- `apps/ota/src/lib/api.ts`

Why it matters:

- Search and trip detail pages are still driven by local demo data.
- Inquiry, profile, and tracking helpers are placeholders that only resolve locally.
- Public behavior can drift from the real platform and cannot exercise backend flows end to end.

Suggested next step:

- Replace local trip fixtures and placeholder helpers with API-backed queries and mutations.

### 2. CI/CD is deploy-only; there is no pre-merge validation workflow

Evidence:

- `.github/workflows/deploy-preview.yml`
- `.github/workflows/deploy-prod.yml`
- no additional workflow files under `.github/workflows/`

Why it matters:

- The repo can deploy without a dedicated PR gate for install, lint, typecheck, and tests.
- Regressions are more likely to reach preview or production before they are caught.

Suggested next step:

- Add a PR workflow that runs install, lint, typecheck, and the current test suite before deploy workflows proceed.

### 3. Proposal UI is only partially shared, which risks preview vs published drift

Evidence:

- `apps/admin/src/app/trips/[id]/preview/page.tsx` uses `@tailfire/trip-proposal-ui`
- `apps/client/src/app/shared/trips/[token]/_components/` still contains a parallel local proposal implementation

Why it matters:

- Admin preview and client-facing proposal rendering are not on one shared surface.
- UI and behavior drift can still happen between the preview and the published/share flow.

Suggested next step:

- Consolidate the client shared-trip route onto `@tailfire/trip-proposal-ui` or explicitly retire the package.

### 4. Trip lifecycle guardrails still do not match the documented target model

Evidence:

- `apps/api/src/trips/trip-lifecycle.service.ts` promotes `planning -> active` when booked-count is greater than zero
- the same service demotes `active -> planning` when booked-count returns to zero
- `packages/shared-types/src/api/trip-status-transitions.ts` still allows `active -> planning`

Why it matters:

- The trip stage can flap backward automatically if bookings are removed or edited.
- That conflicts with the documented guardrail that backward movement should be explicit and audited.
- Automations and activity logs become harder to reason about when the lifecycle can silently reverse.

Suggested next step:

- Make backward lifecycle movement explicit, then align the transition map, lifecycle service, and admin controls to that rule.

### 5. Supplier booking is still inconsistent between standalone activities and packages

Evidence:

- `apps/api/src/trips/activity-bookings.service.ts` marks standalone activities booked through the dedicated bookings endpoint
- `apps/admin/src/hooks/use-bookings.ts` marks packages booked by patching `/activities/:id`
- the package mutation currently sends `proposalStatus: 'approved'` together with `bookingStatus: 'booked'`
- `apps/admin/src/components/packages/mark-as-booked-modal.tsx` exposes `paymentStatus`, but `apps/admin/src/hooks/use-bookings.ts` does not send it

Why it matters:

- Recording a supplier booking is still not one consistent command path.
- Package booking currently conflates proposal approval and supplier booking in a way the standalone path does not.
- The UI collects financial detail that the mutation then drops.

Suggested next step:

- Move both standalone and package booking onto one canonical booking contract with the same required payload and side effects.

## Priority 2

### 6. The API package advertises an E2E test command, but its referenced config file is missing

Evidence:

- `apps/api/package.json` defines `test:e2e` as `jest --config ./test/jest-e2e.json`
- `apps/api/test/jest-e2e.json` is missing
- no `apps/api/test/` directory exists

Why it matters:

- The repo presents API E2E coverage that is not currently runnable as wired.
- Contributors can waste time assuming the command is part of the validation bar when it fails immediately.

Suggested next step:

- Restore the missing API E2E harness or remove the stale script.

### 7. Automated validation coverage is uneven across apps and packages

Evidence:

- `apps/client/package.json` has no `test` script
- `apps/ota/package.json` has no `test` script and no `typecheck` script
- `packages/database/package.json` has no `test` script even though `packages/database/src/__tests__/cruise-data-smoke.test.ts` exists
- `packages/api-client/package.json` has no build/test scripts
- `packages/ui-public/package.json` has no `test` script
- `packages/trip-proposal-ui/package.json` has no scripts

Why it matters:

- Important surfaces are outside automated protection.
- Root `pnpm test` only covers workspaces that expose a `test` script, which can create a false sense of coverage.

Suggested next step:

- Define a minimum validation bar per workspace and enforce it through root scripts and CI.

### 8. Generated `tsconfig.tsbuildinfo` files are tracked in git

Evidence:

- `apps/admin/tsconfig.tsbuildinfo`
- `packages/database/tsconfig.tsbuildinfo`
- `packages/shared-types/tsconfig.tsbuildinfo`

Why it matters:

- Generated artifacts create noisy diffs and unrelated churn.
- Review signal drops when build output is mixed into feature work.

Suggested next step:

- Stop tracking these files and ignore them unless there is a deliberate reason to version them.

### 9. Parts of the API bypass package boundaries and import shared types from source paths directly

Evidence:

- `apps/api/src/calendar/calendar.controller.ts`
- `apps/api/src/tasks/tasks.controller.ts`
- `apps/api/src/contacts/contacts.controller.ts`
- `apps/api/src/trips/trips.controller.ts`
- additional matches from `rg "packages/shared-types/src/api" apps/api/src`

Why it matters:

- These imports couple the API to the internal file layout of `packages/shared-types`.
- Refactors inside the shared package become riskier than they need to be.

Suggested next step:

- Normalize imports onto `@tailfire/shared-types` or an exported package subpath.

### 10. Migration history uses mixed naming conventions and manual journal assumptions

Evidence:

- `docs/MIGRATIONS.md`
- `packages/database/src/migrations/`

Why it matters:

- The repo mixes numbered migrations and timestamped migrations.
- That increases onboarding and audit confusion.

Suggested next step:

- Standardize the forward naming convention and document how legacy files should be treated.

### 11. The API env example is stale for the current external-provider setup

Evidence:

- `apps/api/.env.example` still documents older Traveltek keys
- `apps/api/src/cruise-booking/services/traveltek-auth.service.ts` requires `TRAVELTEK_API_URL`, `TRAVELTEK_USERNAME`, `TRAVELTEK_PASSWORD`, and `TRAVELTEK_SID`
- `apps/api/src/api-credentials/credential-resolver.service.ts` expects env-backed provider secrets such as `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AERODATABOX_RAPIDAPI_KEY`, `GOOGLE_PLACES_API_KEY`, `BOOKING_RAPIDAPI_KEY`, and `OPENAI_API_KEY`

Why it matters:

- Local setup and environment provisioning can follow the wrong provider model.
- External-provider drift tends to surface as slow, confusing runtime failures.

Suggested next step:

- Align `apps/api/.env.example` with the current provider surface or generate env docs from provider metadata.

### 12. The admin API-credentials status page does not accurately report env-only provider availability

Evidence:

- `apps/api/src/api-credentials/credential-resolver.service.ts` is the current source of truth for env-only providers
- `apps/api/src/api-credentials/api-credentials.service.ts` metadata still keys off database records
- `apps/admin/src/app/settings/api-credentials/page.tsx` renders that metadata

Why it matters:

- Env-backed providers can appear as "Not Configured" in the admin UI even when they are live.

Suggested next step:

- Build provider metadata from `CredentialResolverService` instead of database presence alone for env-only providers.

### 13. Booking.com hotel enrichment is still wired to database credentials even though the provider policy is env-only

Evidence:

- `apps/api/src/external-apis/providers/hotels/hotels.controller.ts` calls `ApiCredentialsService.getDecryptedCredentials(ApiProvider.BOOKING_COM)`
- `apps/api/src/api-credentials/credential-resolver.service.ts` marks `BOOKING_COM` as `env-only`
- `apps/admin/src/app/settings/api-credentials/_components/credential-form-dialog.tsx` hides env-only providers from manual credential creation

Why it matters:

- The hotel-enrichment route can silently fail in the standard env-backed setup.
- Operators have no supported UI path to satisfy the database-credential dependency this route still expects.

Suggested next step:

- Switch the enrichment path to `CredentialResolverService`, or explicitly move Booking.com back to a supported database-managed policy.

### 14. Globus support is described inconsistently between the live proxy and the import pipeline

Evidence:

- `apps/api/src/globus/types/globus-api.types.ts` includes `Globus`, `Cosmos`, and `Monograms`
- `apps/api/src/globus/` describes all three brands as supported
- `apps/api/src/tour-import/tour-import.types.ts` limits import support to `Globus` and `Cosmos`
- `apps/api/src/tour-import/tour-import.service.ts` comments still mention `Monograms`

Why it matters:

- Readers cannot tell whether `Monograms` is supported, unsupported, or unfinished.
- Catalog coverage can drift between live search and persisted import behavior.

Suggested next step:

- Decide the supported Globus brand set, then align code comments, types, endpoints, and docs.

### 15. The root `pnpm dev` flow assumes local Redis tooling even though the API also supports `REDIS_URL`

Evidence:

- `package.json` defines `predev` as `redis-cli ping > /dev/null 2>&1 || redis-server --daemonize yes`
- `apps/api/src/automation/automation.module.ts` already supports explicit `REDIS_URL`

Why it matters:

- Local onboarding can fail before the apps start if `redis-cli` or `redis-server` is not installed.
- This is surprising in environments where developers expect a provided `REDIS_URL` to be sufficient.

Suggested next step:

- Make the root dev preflight honor `REDIS_URL` before probing localhost, or remove the side effect and document Redis startup as explicit.

### 16. Flight segment search input guidance can still duplicate the airline code

Evidence:

- `apps/admin/src/app/trips/[id]/_components/flight-form.tsx` concatenates `airline + flightNumber` before searching
- the same form still shows the flight-number placeholder as `e.g., AC860`

Why it matters:

- Selecting airline `AC` and then typing `AC860` yields `ACAC860`.
- The search flow is easier to misuse than it needs to be.

Suggested next step:

- Show a numeric-only example in the flight-number field, or sanitize duplicated airline prefixes before searching.

## Priority 3

### 17. Several navigable product areas are still placeholders or partial implementations

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

- Some routes are visible and navigable but still "coming soon" or incomplete.

Suggested next step:

- Decide which sections should remain visible as placeholders and which should be hidden until functional.
