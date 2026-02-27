# MVP Readiness Design — Admin + Client Portal

**Date:** 2026-02-27
**Scope:** Get the Admin dashboard and Client Portal working end-to-end for the full sales cycle.

## Current State

### Admin App — ~85% complete
The full agent workflow (Contact → Trip → Itinerary → Booking → Payments → Documents) works. Three gaps remain:
1. No "Send Proposal" email button (agents must copy share link manually)
2. Trip Documents tab is a stub (activity-level docs work, no trip-wide view)
3. Trip Emails tab — needs IMAP integration with agents' cPanel email accounts

### Client Portal — ~50% functional
The frontend is built but calls `/client-portal/*` API endpoints that don't exist. Unauthenticated shared proposals (`/shared/trips/[token]`) work end-to-end.

### OTA — Out of scope for MVP

## Phase 1: Client Portal API Controller

### Problem
The client portal frontend (`apps/client`) calls 8 endpoints under `/client-portal/*`. No such controller exists in the API. Trip detail, itinerary viewing, and approve/reject all 404.

### Solution
Create a `ClientPortalModule` with `ClientPortalController` and `ClientPortalService` in `apps/api/src/client-portal/`.

### Auth
Same `PortalAuthGuard` + `portal-jwt` strategy used by the existing `/portal/*` endpoints. JWT contains `contact_id` and `agency_id` claims.

### Endpoints

#### 1. `GET /client-portal/trips`
Returns trips where the authenticated contact is a traveler.
- Query: `trip_travelers` join on `contact_id`, include trip cover photo, status, dates, type
- Response: `ClientTrip[]` with `travelerRole` field

#### 2. `GET /client-portal/trips/:tripId`
Returns trip detail with itineraries and travelers.
- Authorization: verify contact is a traveler on this trip
- Response shape matches `ClientTripDetail` (id, name, dates, status, coverPhotoUrl, pricingVisibility, itineraries[], travelers[])
- Reuse: `buildItinerarySnapshot` for itinerary summaries

#### 3. `GET /client-portal/trips/:tripId/itineraries/:itineraryId`
Returns full itinerary with days and activities.
- Authorization: verify contact is on the trip AND itinerary belongs to trip
- Response: `ClientItinerary` with days[].activities[] (same activity detail shapes as share endpoints)
- Reuse: `buildProposalItinerary` / `buildItinerarySnapshot` from trips.service.ts
- Pricing visibility gated by `trip.pricingVisibility`

#### 4. `POST /client-portal/trips/:tripId/itineraries/:itineraryId/approve`
Records approval feedback.
- Body: `{ message?: string, activityNotes?: { activityId, activityName, note }[] }`
- Transitions itinerary status to `approved` (same logic as share approve)
- Returns 200

#### 5. `POST /client-portal/trips/:tripId/itineraries/:itineraryId/request-changes`
Records change request feedback.
- Body: same shape as approve
- Stores feedback entry linked to itinerary + contact
- Returns 200

#### 6. `GET /client-portal/trips/:tripId/itineraries/:itineraryId/feedback`
Returns feedback history for the itinerary.
- Response: `FeedbackEntry[]` (id, feedbackType, message, activityNotes, status, createdAt, submittedBy)

#### 7. `GET /client-portal/profile`
Returns contact profile with client-portal field naming (`address1`/`address2`/`state` not `addressLine1`/`addressLine2`/`province`).
- Maps from contacts table fields

#### 8. `PATCH /client-portal/profile`
Updates contact profile fields.
- Body: partial profile
- Returns 200

### Data Reuse Strategy
- `buildProposalItinerary()` and `buildItinerarySnapshot()` in trips.service.ts already produce the exact activity/day shapes the frontend expects
- `previewProposal()` is the authenticated mirror of `findByShareToken()` — same response shape
- Comments and responses have authenticated variants at `/trips/:tripId/itineraries/:itineraryId/comments`

### New Tables
None — feedback entries can use the existing `proposal_comments` table with a `feedbackType` discriminator, or a new `itinerary_feedback` table if cleaner separation is preferred.

---

## Phase 2: Send Proposal Email Button

### Problem
After publishing an itinerary, agents must manually copy the share link and email it. No in-app email trigger exists.

### Solution
Add a "Send to Client" button on the trip detail page that:
1. Opens a dialog with pre-filled recipient (primary contact email) and share link
2. Uses an existing email template (`trip_order` category or new `proposal` category)
3. Sends via Resend (existing email service)
4. Logs the sent email in activity logs

### Files
- `apps/admin/src/app/trips/[id]/_components/send-proposal-dialog.tsx` (new)
- `apps/api/src/trips/trips.controller.ts` (new endpoint: `POST /trips/:id/send-proposal`)
- `apps/api/src/trips/trips.service.ts` (new method)

---

## Phase 3: Trip Documents Tab

### Problem
Trip-level Documents tab shows "Coming Soon". Activity-level documents work but there's no aggregate view.

### Solution
Build trip document management:
1. Trip-level document upload (confirmations, insurance, visas)
2. Aggregate view showing both trip-level and activity-level documents
3. Reuse existing `DocumentUploader` component and storage backend

### Files
- `apps/admin/src/app/trips/[id]/_components/trip-documents-tab.tsx` (new)
- API: trip documents likely already stored via existing storage endpoints

---

## Phase 4: IMAP Email Integration

### Problem
Agents want to view and compose emails from within the admin dashboard, connected to their cPanel-hosted IMAP email accounts.

### Solution
Design TBD — requires separate brainstorming for:
- IMAP connection management (credentials storage, encryption)
- Email sync strategy (polling vs push, folder mapping)
- Compose/reply UI
- Email-to-trip and email-to-contact association
- Security considerations (credential storage, OAuth vs app passwords)

---

## Implementation Order

1. **Phase 1** — Client Portal API (unblocks the entire portal)
2. **Phase 2** — Send Proposal Email (completes the proposal workflow)
3. **Phase 3** — Trip Documents Tab (fills the documents gap)
4. **Phase 4** — IMAP Email Integration (largest scope, design separately)

## Verification

- Phase 1: Client portal login → see trips → view itinerary → approve/reject works
- Phase 2: Agent publishes → clicks "Send to Client" → client receives email with link
- Phase 3: Agent uploads trip docs → sees all docs (trip + activity) in one tab
- Phase 4: Agent connects email → sees inbox → composes email scoped to contact/trip
