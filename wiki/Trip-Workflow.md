# Trip Workflow

This page summarizes the canonical trip lifecycle and booking model. The full detailed source of truth lives in the repo docs.

## Core Separation

Tailfire documents these concerns separately:

- `Trip Stage`: overall trip file lifecycle
- `Itinerary Status`: proposal lifecycle for a specific itinerary option
- `Activity State`: proposal state and supplier-booking state for a specific component
- `Client Activity Response`: client feedback on a published activity/version

These must not be treated as the same thing.

## Trip Stage

Stored trip stages:

- `Inbound`
- `Planning`
- `Active`
- `Travelling`
- `Travelled`
- `Cancelled`

Key rule:

- A trip stays `Planning` while proposals are drafted, sent, revised, and approved.
- A trip becomes `Active` only when the first required supplier booking is actually recorded.
- Date automation then moves `Active -> Travelling -> Travelled`.

## Itinerary Status

Stored itinerary statuses:

- `Draft`
- `Proposing`
- `Approved`
- `Archived`

Key rule:

- only one itinerary per trip can be `Approved`

## Activity State

Current stored activity state is split into:

- `proposalStatus`
- `bookingStatus`

That means client approval and supplier booking do not share the same field.

## Derived Trip Conditions

These are not trip stages:

- `Proposal Sent`
- `Proposal Approved`
- `Booking In Progress`
- `Fully Booked`

## Proposal Versioning

Publishing and status are separate:

- the live itinerary is the editable draft
- publishing creates an immutable snapshot version
- the client should review and approve a published version, not the live draft

## Booking Capture

The current intended flow is:

1. trip is created and planned
2. itinerary is proposed and approved
3. agent books suppliers off-platform
4. agent records the booking in Tailfire
5. first required booking moves the trip to `Active`
6. date automation moves `Active -> Travelling -> Travelled`

Required booking capture should include:

- supplier
- confirmation number
- booking date
- payment-schedule context

## Current Focus

The repo already uses the new trip-stage vocabulary and separate activity state fields. The main remaining gaps are:

- lifecycle guardrails still allow automatic `active -> planning` demotion
- package booking and standalone booking are still not fully normalized
- some shared proposal rendering is still split across two UI implementations

## Canonical References

- [Trip Workflow Doc](https://github.com/Systemsaholic/tailfire/blob/main/docs/TRIP_WORKFLOW.md)
- [Implementation Plan](https://github.com/Systemsaholic/tailfire/blob/main/docs/TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md)
- [Repository Review Issues](https://github.com/Systemsaholic/tailfire/blob/main/docs/REPOSITORY_REVIEW_ISSUES.md)
