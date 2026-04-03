# Contact Lifecycle Service — Design Spec

## Goal

Automatically derive and maintain `contactStatus`, `contactType`, `becameClientAt`, `firstBookingDate`, and `lastTripReturnDate` on contacts based on the current state of their associated trips. Replaces the current situation where all 853 contacts are stuck in `prospecting` regardless of trip state.

## Architecture

A single new NestJS service — `ContactLifecycleService` — that recomputes contact lifecycle fields from current DB state whenever a trip or traveler changes. The service is event-triggered but DB-derived: events are triggers, not data sources. This makes it safe for multi-trip contacts, idempotent, and self-healing on backfill.

No migrations required. No UI changes required. All existing columns (`contactStatus`, `contactType`, `becameClientAt`, `firstBookingDate`, `lastTripReturnDate`) are already in the schema.

---

## Core Method: `recomputeForContact(contactId)`

Queries all of this contact's non-cancelled trips, derives the correct lifecycle state, and writes it.

### Trip Association Query

Two paths, deduplicated:
1. `trip_travelers.contact_id = contactId` → get trip IDs
2. `trips.primary_contact_id = contactId` → get trip IDs

Union, then fetch trip statuses and dates for all unique trip IDs. Exclude cancelled trips and deleted trips.

### Status Precedence (highest wins)

| Priority | Contact Status | Condition |
|----------|---------------|-----------|
| 1 | `traveling` | Any non-cancelled trip in `travelling` status |
| 2 | `booked` | Any non-cancelled trip in `active` status |
| 3 | `returned` | All non-cancelled trips are `travelled`, most recent `endDate` within 30 days |
| 4 | `awaiting_next` | All non-cancelled trips are `travelled`, most recent `endDate` > 30 days ago |
| 5 | `prospecting` | No non-cancelled trips, or only `planning`/`inbound` trips |

**`quoted` is NOT auto-derived.** The trip status `planning` merged the old `draft` and `quoted` concepts, so it's not a reliable signal. Agents set `quoted` manually when they send a quote. The recompute service does not overwrite a manually-set `quoted` status unless a higher-priority condition (booked, traveling, returned) is reached.

**`inactive` is NEVER auto-set.** Only via manual agent action (archiving a contact).

### Fields Derived

| Field | Derivation |
|-------|-----------|
| `contactStatus` | From precedence table above |
| `contactType` | Promote `lead` → `client` when derived status is `booked`, `traveling`, `returned`, or `awaiting_next`. Never demote `client` → `lead`. |
| `becameClientAt` | Set to `NOW()` on first promotion to `client`. Never cleared. |
| `firstBookingDate` | Earliest `statusAutoTransitionedAt` (or `startDate` fallback) from any non-cancelled trip that reached `active` or beyond. Never cleared even if trip later cancelled. |
| `lastTripReturnDate` | `endDate` of the most recently completed (`travelled`) non-cancelled trip. |

### Skip Conditions

- Contact has `isActive = false` → skip (don't recompute inactive/archived contacts)
- Contact already has `contactStatus = 'inactive'` → skip (manual override respected)
- Contact has `contactStatus = 'quoted'` AND no higher-priority trip state → preserve `quoted`

### Audit

When `contactStatus` or `contactType` changes, emit the existing `audit.status_changed` event so the activity log records the transition. Include `source: 'lifecycle_sync'` in the metadata to distinguish from manual changes.

---

## Trigger Method: `recomputeForTrip(tripId)`

1. Query all unique contact IDs associated with this trip:
   - `trip_travelers.contact_id` WHERE `trip_id = tripId`
   - `trips.primary_contact_id` WHERE `id = tripId`
2. Deduplicate
3. Call `recomputeForContact(contactId)` for each

---

## Event Listeners

### Trip Lifecycle Events (4)

| Event | Source | Trigger |
|-------|--------|---------|
| `trip.active` | TripLifecycleService | First booking on a planning trip |
| `trip.travelling` | TripsService / TripAutomationProcessor | Manual change or startDate scheduler |
| `trip.travelled` | TripsService / TripAutomationProcessor | Manual change or endDate scheduler |
| `trip.cancelled` | TripsService | Manual cancel |

All → `recomputeForTrip(event.tripId)`

### Trip Status Regressions (1)

| Event | Source | Why Needed |
|-------|--------|-----------|
| `trip.updated` | TripsService | Catches active→planning demotion, uncancel/restore, manual status overrides |

Filter: only trigger recompute if `event.changedFields` includes `status`. Otherwise ignore (avoid recomputing on every trip name edit).

### Traveler Membership Events (3)

| Event | Source | Why Needed |
|-------|--------|-----------|
| `traveler.created` | TripTravelersService | Adding a traveler to an active trip should update their status |
| `traveler.updated` | TripTravelersService | Contact ID change on a traveler row |
| `traveler.deleted` | TripTravelersService | Removing a traveler from a trip |

For `traveler.created` and `traveler.deleted`: recompute the affected contact.
For `traveler.updated`: recompute both old and new contact if contact_id changed.

---

## Backfill Endpoint

`POST /contacts/backfill-lifecycle`

- **Auth:** Admin-only (role check)
- **Logic:**
  1. Find all active contacts that have at least one trip (via `trip_travelers` or `trips.primary_contact_id`)
  2. Run `recomputeForContact(contactId)` for each
  3. Track counts: evaluated, updated (status changed), skipped (inactive), errors
- **Response:** `{ evaluated: number, updated: number, skipped: number, errors: number }`
- **Route registration:** In a dedicated controller (`ContactLifecycleController`) or registered BEFORE `:id` routes in contacts.module.ts

### Backfill Order

Run AFTER `POST /trips/backfill-lifecycle` — trip statuses must be correct before contact lifecycle can derive from them.

---

## Daily Cron: returned → awaiting_next

The 30-day `returned → awaiting_next` transition cannot fire from events (no event fires on day 31). Options:

**Recommended:** Piggyback on the existing `trip-automation.processor.ts` daily scheduler. After it processes trip status transitions, query contacts in `returned` status where `lastTripReturnDate < NOW() - 30 days` and recompute them.

This is a lightweight query — expected to affect 0-5 contacts per day.

---

## Consolidation: Remove Old Handler

The existing `handleTripActive()` in `contacts.service.ts` (line 666) that sets `firstBookingDate` should be **removed** after the new service is in place. The new service derives `firstBookingDate` as part of `recomputeForContact()`, eliminating split ownership.

---

## Files

| File | Purpose |
|------|---------|
| `apps/api/src/contacts/contact-lifecycle.service.ts` | Core recompute logic + event listeners |
| `apps/api/src/contacts/contact-lifecycle.controller.ts` | Backfill endpoint |
| `apps/api/src/contacts/contacts.module.ts` | Register new service + controller |
| `apps/api/src/contacts/contacts.service.ts` | Remove old `handleTripActive()` handler |
| `apps/api/src/automation/processors/trip-automation.processor.ts` | Add daily returned→awaiting_next check |

---

## What This Does NOT Change

- Contact create/update endpoints
- Contact import (has its own lifecycle handling)
- Contact merge (operates on contactStatus as stored)
- Manual status changes via `PATCH /contacts/:id/status` (agent can always override)
- The kanban/table UI (already reads contactStatus)
- Tag system
- Trip lifecycle service (trip status transitions unchanged)

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Contact on 2 trips: one travelling, one active | `traveling` (highest priority wins) |
| Contact on 1 cancelled trip only | `prospecting` (cancelled trips ignored) |
| Contact manually set to `quoted` by agent, no bookings | Preserved — recompute skips if no higher-priority state |
| Contact manually set to `inactive` | Skipped entirely — recompute never touches inactive |
| Trip endDate is NULL | Treat as no return date — don't transition to returned/awaiting_next |
| Contact is already `client`, all trips cancelled | Status → `prospecting`, but contactType stays `client` (never demote) |
| Backfill encounters a contact with `firstBookingDate` already set | Keep existing value (don't overwrite with a different date) |
| Traveler added to an already-travelled trip | Contact gets `returned` or `awaiting_next` status |
