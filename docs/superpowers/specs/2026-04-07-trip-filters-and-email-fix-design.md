# Trip Filters Enhancement + Reassignment Email Fix

**Date:** 2026-04-07
**Goal:** Expose missing trip filters in the UI and fix the JSON email issue for trip reassignment notifications.

---

## Part 1: Trip List Filters

### Current State

The backend DTO (`trip-filter.dto.ts`) already supports 11 filter types. The frontend filter panel only exposes 4: Status, Trip Type, Group, Tags.

### Backend Already Supports (just need frontend UI)
| Filter | Backend Field | Frontend Status |
|--------|--------------|-----------------|
| Search | `search` | Exists (search box) |
| Status | `status` | Exists (popover) |
| Trip Type | `tripType` | Exists (popover) |
| Tags | `tags[]` | Exists (multi-select) |
| Group | `tripGroupId` | Exists (popover) |
| **Assigned Agent** | `ownerId` | **Missing** |
| **Start Date Range** | `startDateFrom`, `startDateTo` | **Missing** |
| **End Date Range** | `endDateFrom`, `endDateTo` | **Missing** |
| **Primary Contact** | `primaryContactId` | **Missing** |
| **Archived** | `isArchived` | **Missing** |

### Need Backend + Frontend
| Filter | Notes |
|--------|-------|
| **Has Bookings** | New backend filter — EXISTS on `itinerary_activities.booking_status = 'booked'` (pattern from `trip-lifecycle.service.ts:140`). String tri-state: `'yes' \| 'no'` (not boolean — query builder drops false). |
| **Created Date Range** | New backend fields — `createdAtFrom`, `createdAtTo`. `createdAt` is timestamptz, so `createdAtTo` must use `<= '{date}T23:59:59Z'` for inclusive end-of-day. |
| **Unassigned** | New backend field — `unassigned: boolean`. Cannot use `ownerId=null` because query builder drops null values and DTO only accepts UUID. |

### Frontend Filter Panel Additions

Add these to `trips-filter-panel.tsx`:

1. **Assigned Agent** — User dropdown (from `useUsers`). Separate "Unassigned" checkbox that sends `unassigned=true` (NOT `ownerId=null`).
2. **Start Date Range** — Two date pickers (from/to)
3. **End Date Range** — Two date pickers (from/to)
4. **Created Date Range** — Two date pickers (from/to)
5. **Primary Contact** — Async contact search input (from contacts API)
6. **Has Bookings** — Select with options: Any (default), Yes, No (string values, not boolean)
7. **Archived** — Toggle (exact filter, not "show archived too")

### Files
| File | Change |
|------|--------|
| `apps/api/src/trips/dto/trip-filter.dto.ts` | Add `createdAtFrom`, `createdAtTo`, `hasBookings`, `unassigned` |
| `apps/api/src/trips/trips.service.ts` | Add created date + has bookings filter conditions |
| `packages/shared-types/src/api/trips.types.ts` | Add new filter fields to TripFilterDto interface |
| `apps/admin/src/components/trips/trips-filter-panel.tsx` | Add all new filter UI controls |
| `apps/admin/src/hooks/use-trips.ts` | Serialize new filter params |

---

## Part 2: Reassignment Email Fix

### Problem

When a trip is reassigned (single or bulk), the receiving agent gets an email with raw JSON content instead of formatted HTML.

### Root Cause (confirmed by Codex)

`notification.service.ts:555` literally appends `<pre>{JSON.stringify(data)}</pre>` to the email body. The `trip.updated` event handler passes `data: { tripId, tripName, previousOwnerId }` which gets serialized as raw JSON in the email.

### Fix for Single Reassign

1. Create a proper `trip-reassignment.template.ts` email template with HTML formatting
2. In the `trip.updated` notification listener, use the template for ownerId changes instead of the generic notification-to-email path
3. **Thread `auth.userId` through `reassignTripOwner()`** so the template can show "{adminName} assigned trip..." (currently `actorId` is null)

### Fix for Bulk Reassign

Currently `bulkReassign()` calls `reassignTripOwner()` per trip, each emitting a `trip.updated` event → individual notification + email per trip.

**Fix:**
1. Add a `suppressAssignmentNotification` flag to `reassignTripOwner()` — **do NOT suppress `trip.updated` entirely** (activity logs depend on it). Only suppress the assignment notification/email.
2. `bulkReassign()` passes `suppressAssignmentNotification: true` for each trip
3. After all trips are processed, send ONE summary notification + email to the receiving agent and admin
4. Thread `auth.userId` through `bulkReassign()` for actor context in email template

### Email Templates Needed

**Single reassignment (`trip-reassignment.template.ts`):**
- Subject: "Trip Assigned to You — {tripName}"
- Body: "{inviterName} assigned trip '{tripName}' to you. {contactsAssigned} contacts were also assigned."
- CTA button: "View Trip" → links to trip detail page

**Bulk reassignment (`trip-bulk-reassignment.template.ts`):**
- Subject: "{count} Trips Assigned to You"
- Body: "{adminName} assigned {count} trips to you. Summary: {contactsAssigned} contacts assigned, {contactsSkipped} contacts unchanged."
- List of trip names
- CTA button: "View Trips" → links to trips list with owner filter

### Files
| File | Change |
|------|--------|
| `apps/api/src/email/templates/trip-reassignment.template.ts` | New: single reassign email template |
| `apps/api/src/email/templates/trip-bulk-reassignment.template.ts` | New: bulk reassign summary email template |
| `apps/api/src/email/templates/index.ts` | Export new templates |
| `apps/api/src/trips/trips.service.ts` | Add `suppressNotifications` to `reassignTripOwner()`, send summary event from `bulkReassign()` |
| `apps/api/src/notifications/listeners/notification-events.listener.ts` | Handle `trips.bulk_reassigned` event, use proper email template for `trip.updated` |
| `apps/api/src/email/email.service.ts` | Add `sendTripReassignmentEmail()` and `sendBulkReassignmentEmail()` methods |

---

## Success Criteria

- [ ] All 7 new filters visible in trips filter panel
- [ ] Assigned Agent filter works with "Unassigned" option
- [ ] Date range filters work for start date, end date, created date
- [ ] Has Bookings filter works
- [ ] Single trip reassignment sends formatted HTML email (not JSON)
- [ ] Bulk reassignment sends ONE summary email to receiving agent
- [ ] Bulk reassignment sends ONE summary email to admin who triggered it
- [ ] No per-trip emails during bulk operations
