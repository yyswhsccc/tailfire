# Trip Workflow Implementation Plan

This is the dev-team implementation plan for finishing the workflow cleanup defined in [TRIP_WORKFLOW.md](./TRIP_WORKFLOW.md).

Status as of 2026-03-24:

- terminology migration is largely shipped
- itinerary status cleanup is largely shipped
- proposal versioning is live
- activity state fields are live
- lifecycle and booking normalization are still only partially complete

## Scope

- keep trip stage, itinerary status, client response, and supplier booking clearly separated
- finish lifecycle guardrails so the system owns forward progression without unwanted flapping
- normalize booking capture for standalone activities and packages
- align payment schedules, supplier payments, and service fees with the actual booking model
- document and test the final behavior

## Current Delivery Snapshot

| Workstream | Status | Notes |
| --- | --- | --- |
| Trip-stage vocabulary | shipped | `inbound`, `planning`, `active`, `travelling`, `travelled`, `cancelled` are live |
| Itinerary statuses | shipped | `draft`, `proposing`, `approved`, `archived` are live |
| Activity state fields | shipped | `proposalStatus` and `bookingStatus` are stored |
| Proposal versioning | shipped | `publishedVersion` and `itinerary_versions` are live |
| Lifecycle engine | partial | `TripLifecycleService` exists, but still auto-demotes `active -> planning` |
| Booking normalization | partial | standalone and package booking still differ |
| Financial alignment | partial | booking/payment schedule/payment status still uneven |
| UI follow-through | partial | some surfaces still imply approval == booking or do not expose the same details |
| Test and rollout coverage | partial | API E2E harness missing, cross-surface validation still uneven |

## Implementation Plan

### 1. Freeze Lifecycle Guardrails

Goal:

- make stage progression system-owned and predictable without status flapping

Do next:

- decide whether `active -> planning` is ever allowed automatically
- if rollback is needed, make it explicit and audited instead of automatic
- align `TRIP_STATUS_TRANSITIONS`, lifecycle service behavior, and admin controls
- define the exact rule for what qualifies as a booking that can promote a trip to `Active`

Primary touchpoints:

- `packages/shared-types/src/api/trip-status-transitions.ts`
- `apps/api/src/trips/trip-lifecycle.service.ts`
- `apps/admin/src/lib/trip-status-constants.ts`
- `apps/admin/src/app/trips/`

### 2. Normalize Supplier Booking Commands

Goal:

- make standalone activity booking and package booking behave the same way

Do next:

- create one canonical booking command/service contract for both paths
- require the same booking payload for standalone and package flows
- stop package booking from implicitly using proposal approval as a side effect unless that is an intentional rule
- make sure package child handling remains parent-owned and read-only

Primary touchpoints:

- `apps/api/src/trips/activity-bookings.service.ts`
- `apps/api/src/trips/activities.service.ts`
- `apps/admin/src/hooks/use-activity-bookings.ts`
- `apps/admin/src/hooks/use-bookings.ts`
- `apps/admin/src/components/packages/mark-as-booked-modal.tsx`

### 3. Finalize Booking Qualification Rules

Goal:

- make lifecycle and booking-progress math reflect real operational meaning

Do next:

- replace the current implicit exclusion-only rule with an explicit qualification model
- define which activity types count toward `Active`, `Booking In Progress`, and `Fully Booked`
- confirm whether optional add-ons, insurance, or reference rows should count
- ensure archived itineraries and package children are handled consistently

Primary touchpoints:

- `apps/api/src/trips/trip-lifecycle.service.ts`
- `apps/api/src/trips/activity-totals.service.ts`
- `packages/database/src/schema/activities.schema.ts`
- `packages/shared-types/src/api/trips.types.ts`

### 4. Align Financial Workflow With Booking Capture

Goal:

- make booking capture, payment schedules, supplier disbursements, and service fees coherent

Do next:

- decide whether booking should require a payment schedule or remain warning-only
- make package and standalone booking expose the same payment-status affordances
- ensure package booking actually submits any fields the modal collects
- keep supplier expected/actual payments separate from service-fee revenue

Primary touchpoints:

- `apps/api/src/trips/payment-schedules.service.ts`
- `apps/api/src/trips/payment-schedules.controller.ts`
- `apps/api/src/financials/service-fees.controller.ts`
- `apps/admin/src/components/packages/mark-as-booked-modal.tsx`
- `apps/admin/src/hooks/use-bookings.ts`

### 5. Finish Proposal And Client-Surface Alignment

Goal:

- keep approved proposal state, published versions, and client-facing rendering consistent

Do next:

- decide whether `@tailfire/trip-proposal-ui` is the long-term shared rendering layer
- remove remaining preview vs client drift
- keep client approval, comment, and activity-response flows pinned to published versions
- review user-facing language so approval never implies supplier booking

Primary touchpoints:

- `packages/trip-proposal-ui/`
- `apps/admin/src/app/trips/[id]/preview/`
- `apps/client/src/app/shared/trips/[token]/`
- `apps/api/src/trips/itinerary-versions.service.ts`
- `apps/api/src/trips/trips.service.ts`

### 6. Close Validation Gaps

Goal:

- make the workflow changes safe to ship and maintain

Do next:

- restore a real API E2E harness or remove the stale script
- add coverage for `planning -> active`, date transitions, package child booking rules, and proposal version binding
- add or expose scripts for packages that already contain testable logic
- make root validation better reflect actual repo coverage

Primary touchpoints:

- `apps/api/package.json`
- `apps/api/src/trips/__tests__/`
- `apps/admin/tests/e2e/`
- `packages/database/package.json`
- `packages/shared-types/src/schemas/__tests__/`

### 7. Backfill, Seed, And Docs Follow-Through

Goal:

- keep production data, sample data, and team guidance aligned with the final model

Do next:

- backfill any historical edge cases that still rely on pre-refactor assumptions
- update seeds and fixtures for the final workflow contract
- remove stale legacy lifecycle wording from code comments and operational text
- keep `docs/` and `wiki/` aligned after each workflow change

Primary touchpoints:

- `packages/database/src/seed.ts`
- `apps/api/src/trips/`
- `docs/`
- `wiki/`

## Acceptance Criteria

The implementation can be considered complete when all of the following are true:

- itinerary approval leaves the trip in `Planning`
- first qualifying supplier booking promotes the trip to `Active`
- removing or editing bookings does not silently flap the trip stage backward
- standalone and package booking use the same booking-data rules
- package children cannot be booked directly through normal UI/API flows
- payment schedule and payment-status behavior are consistent across booking types
- proposal approvals, comments, and activity responses remain version-bound
- automation uses `active`, `travelling`, and `travelled` consistently
- canonical docs and the agent/user guide match the shipped behavior
