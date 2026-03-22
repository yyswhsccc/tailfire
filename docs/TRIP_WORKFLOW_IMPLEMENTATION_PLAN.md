# Trip Workflow Implementation Plan

Implementation status as of 2026-03-21: All phases (1–9) are complete. The canonical trip stage vocabulary, activity booking normalization, itinerary lifecycle cleanup, TripLifecycleService, and updated automation event names are fully shipped. Seed data and documentation have been updated to the new vocabulary.

This plan aligns the current codebase to the canonical workflow defined in [TRIP_WORKFLOW.md](./TRIP_WORKFLOW.md).

Scope:

- define and implement the new trip-stage vocabulary
- normalize itinerary and activity lifecycle handling
- keep proposal versioning explicit
- unify booking capture, payment-schedule, and service-fee touchpoints

Non-goal:

- redesign the final UI in this pass beyond what is required to support the new state model

## Approved Target Model

- `Trip Stage`: `Inbound -> Planning -> Active -> Travelling -> Travelled -> Cancelled`
- `Derived Trip Conditions`: `Proposal Sent`, `Proposal Approved`, `Booking In Progress`, `Fully Booked`
- `Itinerary Status`: `Draft -> Proposing -> Approved -> Archived`
- `Activity Logical State`: separate `proposalStatus` and `bookingStatus`

## Recommended Delivery Order

### Phase 1. Freeze Terminology And Migration Map [COMPLETE]

Goal:

- publish one shared vocabulary before code changes start

Tasks:

- adopt [TRIP_WORKFLOW.md](./TRIP_WORKFLOW.md) as the source of truth
- confirm that itinerary `declined` is being retired from the canonical stored set
- define the one-time trip-status mapping:
  - `draft`, `quoted` -> `planning`
  - `booked` -> `active`
  - `in_progress` -> `travelling`
  - `completed` -> `travelled`

Primary touchpoints:

- `packages/database/src/schema/trips.schema.ts`
- `packages/shared-types/src/api/trip-status-transitions.ts`
- `packages/shared-types/src/api/trips.types.ts`
- `apps/admin/src/lib/trip-status-constants.ts`
- `apps/admin/src/lib/validation/trip-validation.ts`
- `apps/api/src/trips/dto/`

### Phase 2. Trip Stage Foundation [COMPLETE]

Goal:

- replace the legacy stored trip-stage vocabulary safely

Tasks:

- add the new trip-stage values to the database enum and plan the data migration
- choose either:
  - a short compatibility window where both vocabularies are accepted internally, or
  - a coordinated migration where DB, API, and admin ship together
- update all shared DTOs, validators, filters, and form schemas
- update trip deletion and transition rules to match the new stage set

Primary touchpoints:

- `packages/database/src/schema/trips.schema.ts`
- `packages/database/src/migrations/`
- `packages/shared-types/src/api/trip-status-transitions.ts`
- `packages/shared-types/src/api/trips.types.ts`
- `apps/api/src/trips/dto/bulk-trip-operations.dto.ts`
- `apps/api/src/trips/dto/trip-filter.dto.ts`
- `apps/admin/src/lib/trip-status-constants.ts`
- `apps/admin/src/lib/validation/trip-validation.ts`

### Phase 3. Itinerary Lifecycle Cleanup [COMPLETE]

Goal:

- make itinerary workflow simple and consistent

Tasks:

- keep the canonical itinerary set to `draft`, `proposing`, `approved`, `archived`
- replace itinerary-level `declined` with a decline outcome pattern:
  - comment or feedback record
  - optional archive or return-to-draft action
- preserve the single-approved-itinerary-per-trip rule
- update admin and client messaging that currently treats `declined` as a full itinerary state

Primary touchpoints:

- `packages/database/src/schema/trips.schema.ts`
- `packages/shared-types/src/api/common.types.ts`
- `packages/shared-types/src/api/trips.types.ts`
- `apps/api/src/trips/dto/create-itinerary.dto.ts`
- `apps/api/src/trips/itineraries.service.ts`
- `apps/api/src/trips/trips.service.ts`
- `apps/admin/src/hooks/use-itineraries.ts`
- `apps/admin/src/app/trips/[id]/_components/client-feedback-banner.tsx`
- `apps/admin/src/app/trips/[id]/_components/trip-itinerary.tsx`
- `apps/client/src/app/shared/trips/[token]/_components/ApprovalSection.tsx`

### Phase 4. Proposal Versioning Contract [COMPLETE]

Goal:

- make published-version behavior explicit and enforceable

Tasks:

- keep live preview on draft data and public proposal serving on published snapshots
- ensure approvals, comments, selections, and activity responses are always tied to:
  - `tripId`
  - `itineraryId`
  - `versionNumber`
- record which published version was approved
- document and test how re-publishing affects an already-approved itinerary

Primary touchpoints:

- `apps/api/src/trips/itinerary-versions.service.ts`
- `apps/api/src/trips/itineraries.controller.ts`
- `apps/api/src/trips/trips.controller.ts`
- `apps/api/src/trips/trips.service.ts`
- `packages/trip-proposal-ui/`
- `apps/client/src/app/shared/trips/[token]/`

### Phase 5. Activity Booking Normalization [COMPLETE]

Goal:

- make supplier-booking capture consistent across standalone activities and packages

Tasks:

- introduce one canonical booking command/service for all bookable activities
- stop using legacy activity `status='confirmed'` as a partial stand-in for booking
- define the minimum required booking payload:
  - supplier
  - confirmation number
  - booking date
  - booking authority
  - payment-schedule state
- keep package parents as the booking authority and cascade consistently to children
- decide whether implementation should:
  - keep `status + isBooked` temporarily with stricter semantics, or
  - migrate to explicit `proposal_status` and `booking_status` fields

Primary touchpoints:

- `packages/database/src/schema/activities.schema.ts`
- `packages/shared-types/src/schemas/activity.schema.ts`
- `apps/api/src/trips/activity-bookings.service.ts`
- `apps/api/src/trips/activities.service.ts`
- `apps/admin/src/hooks/use-activity-bookings.ts`
- `apps/admin/src/hooks/use-bookings.ts`
- `apps/admin/src/components/packages/mark-as-booked-modal.tsx`
- `apps/admin/src/components/activities/mark-activity-booked-modal.tsx`
- `apps/admin/src/lib/validation/`

### Phase 6. Trip Lifecycle Engine And Automations [COMPLETE]

Goal:

- move trip-stage progression onto real domain events instead of manual staff memory

Tasks:

- create a central lifecycle service or rule engine for trip stage and derived-condition evaluation
- keep itinerary approval from changing the stored trip stage beyond `Planning`
- automatically set the derived condition `Proposal Approved` when an itinerary becomes approved
- automatically promote `Planning -> Active` when the first required booking is recorded
- rename or replace legacy lifecycle events and automation jobs:
  - `trip.booked` -> `trip.active`
  - `trip.in_progress` -> `trip.travelling`
  - `trip.completed` -> `trip.travelled`
- update post-trip automation triggers to run from `Travelled`

Primary touchpoints:

- `apps/api/src/trips/trips.service.ts`
- `apps/api/src/trips/events/`
- `apps/api/src/automation/processors/trip-automation.processor.ts`
- `apps/api/src/automation/listeners/trip-lifecycle.listener.ts`
- `apps/api/src/automation/processors/client-care.processor.ts`
- `apps/api/src/activity-logs/activity-logs.service.ts`
- `docs/AUTOMATION.md`

### Phase 7. Payments, Supplier Disbursements, And Service Fees [COMPLETE]

Goal:

- make booking capture financially coherent without conflating supplier cost and agency fee flows

Tasks:

- require or generate a payment-schedule path when a component is marked booked
- keep supplier expected payments and supplier payment transactions tied to the booked component
- keep service fees as a separate trip-level commercial workflow
- align manual service-fee payment handling with the existing Stripe invoice and refund endpoints
- make sure package booking and standalone booking expose the same payment-status affordances

Primary touchpoints:

- `apps/api/src/trips/payment-schedules.controller.ts`
- `apps/api/src/trips/payment-schedules.service.ts`
- `apps/api/src/trips/traveler-bookings.service.ts`
- `apps/api/src/financials/service-fees.controller.ts`
- `apps/api/src/financials/service-fees.service.ts`
- `apps/api/src/financials/stripe-invoice.controller.ts`
- `apps/admin/src/hooks/use-service-fees.ts`
- `apps/admin/src/hooks/use-booking-status.ts`

### Phase 8. Admin And Client Surface Follow-Through [COMPLETE]

Goal:

- expose the new model clearly without overloading one badge or dropdown

Tasks:

- separate `Trip Stage`, `Itinerary Status`, and `Booking Progress` in the admin experience
- update Kanban columns and filters to the new trip-stage vocabulary
- update shared proposal and client portal labels so they no longer imply that approval equals booking
- leave visual redesign choices for a later UI pass

Primary touchpoints:

- `apps/admin/src/lib/trip-status-constants.ts`
- `apps/admin/src/app/trips/`
- `apps/client/src/app/shared/trips/[token]/`
- `packages/trip-proposal-ui/`

### Phase 9. Tests, Backfill, And Rollout [COMPLETE]

Goal:

- ship the new model without silent data drift

Tasks:

- write a backfill script for legacy trip statuses
- backfill or normalize itinerary `declined` records
- add automated coverage for:
  - itinerary approval leaving trip in `Planning`
  - first booked package moving trip to `Active`
  - first booked standalone activity moving trip to `Active`
  - package children being non-bookable directly
  - `Active -> Travelling -> Travelled` automation
  - proposal approval/comments being tied to a published version
- update seeded data and docs to the new vocabulary

Primary touchpoints:

- `apps/api/src/trips/__tests__/`
- `packages/shared-types/src/api/__tests__/`
- `packages/database/src/seed.ts`
- `docs/`

## Acceptance Criteria

All criteria met as of 2026-03-21.

The implementation is complete when all of the following are true:

- A client-approved itinerary leaves the trip in `Planning` but sets `Proposal Approved`.
- Recording the first required supplier booking automatically moves the trip to `Active`.
- Package booking and standalone booking follow the same booking-data rules.
- Package children cannot be booked directly.
- Informational activity types do not count toward booking progress.
- Proposal approvals, comments, and responses point to an immutable published version.
- Welcome-home and post-trip automations run from `Travelled`, not from legacy `completed`.
- The repo no longer uses the legacy trip vocabulary in shared types, validators, admin constants, automation, or canonical docs.
