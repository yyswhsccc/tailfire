# Automation System

This document describes the current BullMQ + Redis automation runtime in Tailfire.

## What The Automation Layer Handles Today

- scheduled trip stage transitions
- post-trip client-care follow-up
- notification delivery
- email sync and enrichment background work
- OCR and document-processing jobs

Important lifecycle distinction:

- `TripLifecycleService` handles synchronous booking-driven `planning <-> active` evaluation in application code.
- BullMQ handles scheduled/date-driven transitions such as `active -> travelling -> travelled`.

## Current Lifecycle Model In Automation

The current runtime uses:

```text
planning --(first qualifying booking)--> active --(start date)--> travelling --(end date)--> travelled
```

### What happens synchronously

`apps/api/src/trips/trip-lifecycle.service.ts` currently:

- promotes `planning -> active` when a trip has at least one booked activity
- archives non-approved itineraries when that promotion happens
- emits `trip.active`
- currently demotes `active -> planning` again if booked-count falls back to zero

That last behavior is still an open workflow issue, not a settled business rule.

### What happens on the queue

`apps/api/src/automation/processors/trip-automation.processor.ts` currently schedules and processes:

- `active -> travelling`
- `travelling -> travelled`
- reminders
- backfill jobs

The scheduled processor is idempotent and re-checks the trip state before applying the transition.

## Queues

| Queue | Purpose |
| --- | --- |
| `trip-automation` | scheduled trip stage transitions, reminders, backfill |
| `email-sync` | IMAP sync for agent email accounts |
| `enrichment` | activity enrichment, geocoding, media fetches |
| `document-render` | PDF generation |
| `ocr-processing` | OCR import work |
| `client-care` | follow-up emails and reminder jobs |
| `notifications` | push/email notification delivery |

## Job Types

### Trip automation

- `trip.status.transition`
- `trip.reminder`
- `trip.backfill`

### Client care

- `payment.reminder`
- `departure.reminder`
- `post_trip.thank_you`
- `post_trip.feedback`
- other recurring client-care jobs

## Scheduled Trip Transitions

The current scheduled path is:

```text
active --(trip start)--> travelling --(day after trip end)--> travelled
```

Deterministic job IDs are used to prevent duplicate scheduling. Current examples:

```text
trip:{tripId}:travelling
trip:{tripId}:travelled
```

## Post-Trip Automation

`apps/api/src/automation/listeners/trip-lifecycle.listener.ts` currently listens for `trip.travelled` and schedules:

- thank-you email one day later
- feedback request two days later

## Bull Board And Admin Access

- Queue dashboard path: `/admin/queues`
- Production exposure is controlled by `ENABLE_BULL_BOARD`
- Admin automation endpoints exist under `/admin/automation/*`

Current admin routes include:

- `GET /admin/automation/queues`
- `GET /admin/automation/queues/:name/delayed`
- `GET /admin/automation/jobs/:id`
- `DELETE /admin/automation/jobs/:id`
- `POST /admin/automation/jobs/schedule`
- `POST /admin/automation/trips/backfill`
- `DELETE /admin/automation/jobs/pattern`

## Redis Configuration

| Environment | Current source | Notes |
| --- | --- | --- |
| Local | local Redis or explicit `REDIS_URL` | API supports `REDIS_URL`, root `pnpm dev` still assumes local Redis tooling |
| Preview | Railway Redis | injected at runtime |
| Production | Railway Redis | injected at runtime |

Relevant env vars:

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis connection string |
| `ENABLE_BULL_BOARD` | Bull Board exposure toggle |

## Local Development Notes

The repo currently supports two practical local Redis patterns.

### Local Redis on the machine

```bash
redis-cli ping
redis-server --daemonize yes
```

### External Redis via `REDIS_URL`

Start the API with filtered commands rather than root `pnpm dev` if you want to avoid the local Redis probe.

## Current Drift To Be Aware Of

Some comments, examples, and admin-facing text in the codebase still refer to the legacy lifecycle names `booked`, `in_progress`, and `completed`. The live runtime and shared trip status types now use:

- `active`
- `travelling`
- `travelled`

Treat the runtime names above as the source of truth.

## Related Docs

- [TRIP_WORKFLOW.md](./TRIP_WORKFLOW.md)
- [LOCAL_DEV.md](./LOCAL_DEV.md)
- [REPOSITORY_REVIEW_ISSUES.md](./REPOSITORY_REVIEW_ISSUES.md)
