# Trip Workflow And State Model

This document is the canonical workflow reference for trip stages, itinerary statuses, activity booking state, client proposal versioning, and the current booking-capture model.

Status as of 2026-03-24:

- The stored trip-stage vocabulary is live in the database, shared types, API, and admin/client surfaces.
- Itinerary stored statuses are `draft | proposing | approved | archived`.
- Activities now store separate `proposalStatus` and `bookingStatus`.
- Proposal publishing/versioning is live.
- Lifecycle and booking guardrails are only partially normalized. Current caveats are called out explicitly below and in [REPOSITORY_REVIEW_ISSUES.md](./REPOSITORY_REVIEW_ISSUES.md).

## Core Separation

| Concern | What it means | Stored or derived |
| --- | --- | --- |
| Trip Stage | Overall lifecycle of the trip file | stored |
| Derived Trip Condition | Operational summary such as proposal sent or fully booked | derived |
| Itinerary Status | Lifecycle of a proposal option | stored |
| Activity State | Supplier-booking and proposal state for a trip component | stored |
| Client Activity Response | Client response to a published activity on a published version | stored separately from activity state |

The main rule is simple:

- trip stage is not the same thing as itinerary approval
- itinerary approval is not the same thing as supplier booking
- client activity response is not the same thing as activity booking

## Trip Stage

Current stored trip stages:

| Stage | Meaning |
| --- | --- |
| `Inbound` | lead/intake file before active planning |
| `Planning` | active planning, proposal work, revision, and client review |
| `Active` | supplier fulfillment has started |
| `Travelling` | trip is in progress |
| `Travelled` | trip has completed |
| `Cancelled` | trip was cancelled |

Current implementation notes:

- `planning -> active` is evaluated by `TripLifecycleService`.
- `active -> travelling -> travelled` is handled by automation.
- `cancelled` remains explicit.
- The current lifecycle engine also demotes `active -> planning` if booked-count returns to zero. That is implementation reality today, not the preferred long-term guardrail.

## Derived Trip Conditions

These are useful operational signals, but they are not stored trip stages:

| Condition | Meaning |
| --- | --- |
| `Proposal Sent` | at least one itinerary is `proposing` |
| `Proposal Approved` | at least one itinerary is `approved` |
| `Booking In Progress` | some qualifying bookable components are booked |
| `Fully Booked` | all qualifying bookable components are booked |

Practical interpretation:

- a trip can remain `Planning` while also showing `Proposal Sent` or `Proposal Approved`
- a trip should only become `Active` once supplier fulfillment starts

## Itinerary Status

Current stored itinerary statuses:

| Status | Meaning |
| --- | --- |
| `Draft` | internal working option |
| `Proposing` | option being presented to the client |
| `Approved` | client-selected option |
| `Archived` | retired option |

Rules:

- only one itinerary per trip should be `Approved`
- multiple itineraries may be `Draft` or `Archived`
- multiple itineraries may be `Proposing` only if the trip is intentionally presenting multiple options

Important distinction:

- `declined` is not an itinerary stored status
- client rejection/decline is captured through comments, feedback, and response records tied to the published proposal version

## Activity State

Activities now use separate fields:

| Field | Allowed values | Meaning |
| --- | --- | --- |
| `proposalStatus` | `draft`, `proposing`, `approved`, `cancelled` | proposal/client lifecycle |
| `bookingStatus` | `unbooked`, `booked`, `cancelled` | supplier-booking lifecycle |

Typical user-facing interpretation:

| User-facing label | State |
| --- | --- |
| `Draft` | `proposalStatus=draft`, `bookingStatus=unbooked` |
| `Proposing` | `proposalStatus=proposing`, `bookingStatus=unbooked` |
| `Approved` | `proposalStatus=approved`, `bookingStatus=unbooked` |
| `Booked` | `bookingStatus=booked` |
| `Cancelled` | any cancelled path |

Current booking rules in code:

- package parents are the booking authority for package children
- child activities of a package cannot be booked directly through the normal booking endpoint
- informational activity types such as `port_info` and `tour_day` are excluded from the current lifecycle booked-count

Current caveat:

- the package booking path and standalone booking path are still not fully normalized
- the package booking mutation currently sets `proposalStatus: 'approved'` together with `bookingStatus: 'booked'`
- the standalone booking endpoint updates booking state without that proposal-state side effect

## Client Activity Responses

The client proposal surface also stores per-activity responses on published proposals.

Current response model:

| Field | Values |
| --- | --- |
| `response` | `confirmed` or `declined` |
| `versionNumber` | required published version binding |

These records are separate from activity `proposalStatus` and `bookingStatus`.

## Proposal Versioning

Proposal status and proposal version are separate concerns.

Current versioning contract:

- the live itinerary is editable working data
- publishing creates an immutable `itinerary_versions` snapshot
- itineraries track `publishedVersion`
- admin preview uses live draft data
- shared/public proposal views resolve to published snapshots
- client comments, selections, approvals, and activity responses are bound to a published `versionNumber`

This is the core rule:

- the client approves a published version, not an unpublished working draft

## Current Booking Flow

1. Create the trip.
   The trip starts in `Inbound` or `Planning` depending on intake and early workflow.

2. Add travelers and trip context.
   This is still separate from itinerary and booking state.

3. Build one or more itinerary options.
   Activities and packages are composed inside itinerary days or as floating trip-level components.

4. Publish the proposal.
   Publishing creates a versioned snapshot for the client-facing share flow.

5. Client reviews and approves.
   The itinerary becomes `Approved`. The trip normally remains `Planning` at this point.

6. Agent books suppliers off-platform.
   Tailfire remains the system of record, but the actual supplier booking is still frequently done outside the platform.

7. Agent records the booking in Tailfire.
   Current entry paths:
   - standalone activity booking: `POST /bookings/activities/:activityId/mark`
   - package booking: `PATCH /activities/:id` via the package booking UI path

8. First qualifying booking promotes the trip.
   Current implementation promotes `planning -> active` once the lifecycle service sees at least one qualifying booked activity.

9. Date-based automation moves the trip forward.
   - `active -> travelling`
   - `travelling -> travelled`

## Guardrails

### Canonical guardrails

- itinerary approval should not be treated as proof of supplier booking
- service-fee collection should not be treated as supplier booking
- package children should not be booked independently
- proposal comments and approvals must remain tied to the version the client actually saw

### Current implementation caveats

- `TripLifecycleService` currently counts booked activities rather than a richer explicit allowlist of required bookable components
- the same service currently auto-demotes `active -> planning` when all counted bookings are removed
- package booking and standalone booking still use different command paths and different side effects
- the package booking modal exposes `paymentStatus`, but the current package booking mutation does not send it

## Historical Status Mapping

The legacy stored trip vocabulary was migrated to the current stage set as follows:

| Legacy status | Current stage |
| --- | --- |
| `draft` | `planning` |
| `quoted` | `planning` |
| `booked` | `active` |
| `in_progress` | `travelling` |
| `completed` | `travelled` |

## References

- [TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md](./TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md)
- [AUTOMATION.md](./AUTOMATION.md)
- [REPOSITORY_REVIEW_ISSUES.md](./REPOSITORY_REVIEW_ISSUES.md)
