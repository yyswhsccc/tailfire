# Trip Workflow And State Model

This document is the canonical business workflow and lifecycle model for trips, itineraries, activities, proposal publishing, and booking capture.

Status note as of 2026-03-21:

- The current codebase still implements the legacy trip status set `inbound | draft | quoted | booked | in_progress | completed | cancelled`.
- Activity fulfillment is still split between legacy activity `status` values and the `isBooked` flag.
- Itinerary workflows still expose a legacy `declined` status in some API and UI paths.

This document defines the target operating model the platform should converge to. Use [TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md](./TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md) for the rollout plan and [REPOSITORY_REVIEW_ISSUES.md](./REPOSITORY_REVIEW_ISSUES.md) for the current implementation gaps.

## Design Principles

- `Trip Stage` is the lifecycle of the overall trip file. It is not a direct proxy for whether every supplier booking is complete.
- `Itinerary Status` is the proposal workflow for a specific itinerary option.
- `Activity Booking` is supplier fulfillment for a specific bookable component.
- The system, not user memory, owns stage progression.
- Intermediate operational signals should be derived where possible instead of adding more stored statuses.
- Proposal publishing must remain versioned and immutable. Clients approve a published version, not a live draft.

## Canonical State Model

### 1. Trip Stage (stored)

These are the only stored trip stages in the target model:

| Stage | Meaning | Typical Entry Trigger |
| --- | --- | --- |
| `Inbound` | Lead or intake file that has not meaningfully entered active planning yet | New lead intake, imported lead, or explicit reset to intake |
| `Planning` | Active planning, proposal drafting, proposal revision, and client review | Owner assigned, travelers added, or itinerary work begins |
| `Active` | At least one required supplier booking has been recorded in Tailfire | First required bookable activity or package is marked booked |
| `Travelling` | The trip is in progress | Start-date automation |
| `Travelled` | The trip has finished | End-date automation |
| `Cancelled` | The trip was cancelled and is terminal | Explicit cancel action |

### 2. Derived Trip Conditions (not stored as trip stages)

These are operational conditions that should be computed from itinerary and activity data:

| Condition | Meaning |
| --- | --- |
| `Proposal Sent` | At least one itinerary is in `Proposing` |
| `Proposal Approved` | At least one itinerary is in `Approved` |
| `Booking In Progress` | Some, but not all, required bookable components are booked |
| `Fully Booked` | All required bookable components are booked |

Important rule:

- A trip can be `Planning` and also show `Proposal Sent` or `Proposal Approved`.
- A trip does not become `Active` until real supplier fulfillment starts.

### 3. Itinerary Status (stored)

The canonical itinerary status set is:

| Status | Meaning |
| --- | --- |
| `Draft` | Internal working version |
| `Proposing` | Published and actively presented to the client |
| `Approved` | Client-selected itinerary option |
| `Archived` | Retired option or superseded version |

Rules:

- Only one itinerary per trip can be `Approved`.
- Multiple itineraries may be `Draft` or `Archived`.
- Multiple itineraries may be `Proposing` only if the trip is intentionally offering multiple options at once.
- When one itinerary becomes `Approved`, previously approved itineraries should become `Archived`.

Target simplification:

- `Declined` is not part of the target canonical itinerary status set.
- Client decline should be captured through feedback, comments, or an approval outcome record, then translated into staff action such as returning the itinerary to `Draft` or moving it to `Archived`.

### 4. Activity State (logical model)

Activities should display a simple user-facing label, but the implementation should keep proposal state separate from supplier-booking state.

Target logical fields:

| Field | Allowed Values | Purpose |
| --- | --- | --- |
| `proposalStatus` | `draft`, `proposing`, `approved`, `cancelled` | Client/proposal lifecycle |
| `bookingStatus` | `unbooked`, `booked`, `cancelled` | Supplier fulfillment lifecycle |

Recommended display mapping:

| Display Label | Logical State |
| --- | --- |
| `Draft` | `proposalStatus=draft`, `bookingStatus=unbooked` |
| `Proposing` | `proposalStatus=proposing`, `bookingStatus=unbooked` |
| `Approved` | `proposalStatus=approved`, `bookingStatus=unbooked` |
| `Booked` | `proposalStatus=approved`, `bookingStatus=booked` |
| `Cancelled` | any cancelled state |

Rules:

- Packages are the booking authority for their child activities.
- Child activities of a package inherit booking state and cannot be booked independently.
- Informational rows such as `port_info` must not count toward `Booking In Progress`, `Fully Booked`, or `Active`.
- Bookable items should normally only be marked booked after itinerary approval unless an explicit admin override exists.
- Marking something booked must capture enough supplier-facing audit data to be useful later.

## Proposal Versioning

Proposal statuses and proposal versions are separate concepts.

Target rules:

- The live itinerary is the editable working copy.
- Publishing creates an immutable snapshot version.
- Admin preview uses live draft data.
- Client share pages, comments, selections, approvals, and activity responses must bind to a published version.
- Republishing creates a new version. It does not rewrite an older approved or commented version.
- Approval should record both the itinerary id and the published version number the client actually approved.

This model already exists in part in the current codebase through `itinerary_versions`, `publishedVersion`, admin live preview, and public snapshot serving. The plan is to make the workflow contract explicit and consistent.

## Canonical Booking Flow

1. Create the trip.
   The trip starts in `Inbound` or `Planning` depending on the intake path. If there is no owner and no active planning work, it stays `Inbound`.

2. Add travelers and primary contact context.
   Travelers are required before the trip can progress into real fulfillment.

3. Create one or more itinerary drafts.
   Each itinerary is an option inside the trip. Agents compose activities, pricing, notes, and media in `Draft`.

4. Publish a proposal version.
   The itinerary moves to `Proposing`, a snapshot is created, and the client reviews that published version rather than the live draft.

5. Client reviews, comments, selects, and approves.
   The approved itinerary moves to `Approved`. The trip itself remains in `Planning`. The trip should now surface the derived condition `Proposal Approved`.

6. Agent books suppliers off-platform.
   Tailfire remains the internal system of record even when supplier booking happens externally.

7. Agent records the booking in Tailfire.
   The booking record should capture:
   - supplier
   - confirmation number
   - booking date
   - booking authority (standalone activity or package)
   - payment schedule status
   - any supplier-facing payment or deposit context needed operationally

8. The first required booking moves the trip to `Active`.
   This should happen automatically when the first required bookable activity or package is recorded as booked.

9. Additional bookings continue until the trip is fully booked.
   `Booking In Progress` and `Fully Booked` remain derived conditions, not trip stages.

10. Payment schedules and supplier payments are tracked separately from stage changes.
   Booking capture, expected supplier payments, and actual supplier payment transactions are related but not identical actions.

11. Service fees remain a separate trip-level financial workflow.
   Service fee creation, sending, collection, refund, and Stripe invoicing should not be conflated with supplier booking fulfillment.

12. Date-based automation moves the trip forward.
   - `Active -> Travelling` on trip start date
   - `Travelling -> Travelled` after trip end date

13. Post-trip automations run from `Travelled`.
   Welcome-home emails, feedback requests, and post-trip follow-up should key off the `Travelled` stage.

## Guardrails

### Stage Transition Guardrails

- `Inbound -> Planning` should happen from real planning activity, not from an arbitrary manual click alone.
- `Planning -> Active` should happen when the first required supplier booking is recorded.
- `Active -> Travelling` and `Travelling -> Travelled` should be date-driven.
- `Cancelled` must remain explicit and terminal.

### Non-Rules

- Itinerary approval does not mean supplier booked.
- Activity booking does not change itinerary approval.
- Service-fee payment does not mean supplier booked.
- Fully booked does not need to be a trip stage.

### Stability Guardrails

- The system should not silently move a trip backward if an activity is later unbooked or edited.
- Backward movement should require explicit staff action to avoid automation flapping.
- Proposal comments, selections, approvals, and declines must stay attached to the version the client actually saw.

### Booking Guardrails

- Package children cannot be booked directly.
- Required booking fields should be validated consistently for standalone activities and packages.
- The platform should maintain an explicit allowlist of activity types that count toward booking progress.

## Current-to-Target Mapping

During migration, these legacy trip statuses map to the target model as follows:

| Current Stored Status | Target Meaning |
| --- | --- |
| `inbound` | `Inbound` |
| `draft` | `Planning` |
| `quoted` | `Planning` |
| `booked` | `Active` |
| `in_progress` | `Travelling` |
| `completed` | `Travelled` |
| `cancelled` | `Cancelled` |

Other important current-state notes:

- Current activity rows still use legacy `status` values such as `proposed` and `confirmed` plus a separate `isBooked` flag.
- Current itinerary APIs and some admin/client flows still allow `declined` even though the target canonical set does not.
- Current automation and lifecycle events still use `booked`, `in_progress`, and `completed` naming.

## References

- Implementation plan: [TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md](./TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md)
- Current implementation issues: [REPOSITORY_REVIEW_ISSUES.md](./REPOSITORY_REVIEW_ISSUES.md)
- Current automation runtime: [AUTOMATION.md](./AUTOMATION.md)
