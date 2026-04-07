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
| **Has Bookings** | New backend filter — trips with at least one booked activity |
| **Created Date Range** | New backend fields — `createdAtFrom`, `createdAtTo` |

### Frontend Filter Panel Additions

Add these to `trips-filter-panel.tsx`:

1. **Assigned Agent** — User dropdown (from `useUsers`). Include "Unassigned" option that sends `ownerId=null`.
2. **Start Date Range** — Two date pickers (from/to)
3. **End Date Range** — Two date pickers (from/to)
4. **Created Date Range** — Two date pickers (from/to)
5. **Primary Contact** — Contact search input (from contacts API)
6. **Has Bookings** — Toggle (yes/no/any)
7. **Archived** — Toggle (show archived)

### Files
| File | Change |
|------|--------|
| `apps/api/src/trips/dto/trip-filter.dto.ts` | Add `createdAtFrom`, `createdAtTo`, `hasBookings` |
| `apps/api/src/trips/trips.service.ts` | Add created date + has bookings filter conditions |
| `packages/shared-types/src/api/trips.types.ts` | Add new filter fields to TripFilterDto interface |
| `apps/admin/src/components/trips/trips-filter-panel.tsx` | Add all new filter UI controls |
| `apps/admin/src/hooks/use-trips.ts` | Serialize new filter params |

---

## Part 2: Reassignment Email Fix

### Problem

When a trip is reassigned (single or bulk), the receiving agent gets an email with raw JSON content instead of formatted HTML.

### Root Cause

The `trip.updated` event handler in `notification-events.listener.ts` (lines 113-147) calls `NotificationService.send()` with:
- `title: 'Trip Assigned to You'`
- `body: 'Trip "{tripName}" has been assigned to you'`
- `data: { tripId, tripName, previousOwnerId }` (JSON payload)

`NotificationService.send()` routes to email based on user preferences. The email channel likely renders the `data` field as part of the email body, resulting in raw JSON.

### Fix for Single Reassign

Create a proper `trip-reassignment.template.ts` email template. When the `trip.updated` event fires with an ownerId change, send the email using this template instead of the generic notification-to-email path.

### Fix for Bulk Reassign

Currently `bulkReassign()` calls `reassignTripOwner()` per trip, each emitting a `trip.updated` event → individual notification per trip → individual email per trip.

**Fix:**
1. Add a `suppressNotifications` flag to `reassignTripOwner()`
2. `bulkReassign()` passes `suppressNotifications: true` for each trip
3. After all trips are processed, emit ONE `trips.bulk_reassigned` event with the full summary
4. Notification listener handles `trips.bulk_reassigned` → sends one summary email to the receiving agent and one to the admin who triggered it

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
