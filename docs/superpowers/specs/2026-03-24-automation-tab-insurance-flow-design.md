# Trip Automations Tab + Insurance Waiver Flow — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Automation tab on trip detail page + insurance email/waiver flow + client portal waiver form

---

## Problem

1. The Trip Automations tab shows "This feature is in development" — agents can't see what jobs are queued or completed for a trip
2. After booking, agents must manually initiate insurance conversations — no automated email flow exists
3. Travelers can't self-serve insurance decisions (purchase or waive) — everything goes through the agent by phone
4. TICO requires documented insurance acknowledgment — the waiver process needs a formal form with timestamps

## Goals

1. Agents can see all automation jobs for a trip (queued, completed, paused, cancelled)
2. Agents can pause and cancel automation jobs with audit trail
3. Agents can initiate insurance proposal emails to travelers
4. Minors are auto-detected and assigned to parent/guardian
5. Travelers can purchase insurance or complete a waiver form via a token-based link (no login)
6. The waiver form is standalone and reusable for future form types (group booking intake, etc.)

---

## Design

### 1. Automation Tab

Replaces EmptyState on the trip detail page with a timeline of automation jobs.

**Data source:** `automation_job_history` table filtered by `trip_id`.

**DB changes to `automation_job_history`:**
- Add `trip_id` (uuid, nullable, FK to trips, cascade)
- Add `paused_at` (timestamp, nullable)
- Add `cancelled_at` (timestamp, nullable)
- Add `cancelled_by` (uuid, nullable)
- Add `paused` and `cancelled` to `automation_job_status` enum

**Layout:** Vertical timeline, newest first. Each entry shows:
- Job type icon + description
- Status badge (queued/processing/completed/failed/paused/cancelled)
- Scheduled/completed timestamp
- For queued/paused jobs: [Pause/Resume] [Cancel] buttons
- Cancelled jobs show "Cancelled by [agent] at [time]"

**Agent actions:**
- **Pause:** Removes job from BullMQ queue (using existing `AutomationService.cancel()`), sets `paused_at`, status → `paused`. Job data preserved for re-queue.
- **Resume:** Re-queues the job via `AutomationService.schedule()`, clears `paused_at`, status → `queued`.
- **Cancel:** Removes from queue, sets `cancelled_at` + `cancelled_by`, status → `cancelled`. Permanent — cannot be resumed. Creates audit record.

**Components:**
- `TripAutomations` — main component, fetches job history by `tripId`
- `AutomationJobCard` — individual job display with status + actions

### 2. Insurance Email Flow

**Trigger:** Agent clicks "Send Insurance Proposals" on the Insurance tab or from the auto-created insurance review task.

**Preview dialog (`InsuranceProposalDialog`):**
1. Fetches all trip travelers with insurance status
2. Filters to `status = 'pending'`
3. For each traveler, checks age: `trip.startDate - contact.dateOfBirth`. If < 18 → minor
4. Auto-detects parent/guardian from `contact_relationships` (labels: parent, mother, father, guardian)
5. If no parent found for a minor → flags for agent to assign manually
6. Agent can: check/uncheck travelers, reassign minor guardians, set schedule (now or delayed)
7. "Queue Emails" creates one BullMQ job per adult recipient

**BullMQ job:**
- Queue: `client-care`
- Job type: `insurance.proposal.email`
- Job data: `{ tripId, travelerId, travelerName, travelerEmail, dependentIds, formToken, agencyId }`
- Processor: generates form token, sends email via `EmailService.sendEmail()` with waiver link

**Email content:** Template with:
- Agency branding (name, logo)
- Trip name + dates
- Traveler name(s) — includes dependents
- Link: `https://client.phoenixvoyages.ca/forms/{token}`
- Expiry notice (30 days)

### 3. Form Tokens

**New table: `form_tokens`**
```sql
CREATE TABLE form_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token varchar(64) UNIQUE NOT NULL,
  form_type varchar(50) NOT NULL,        -- 'insurance_waiver', 'group_booking_intake', etc.
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,
  traveler_ids jsonb,                    -- array of trip_traveler_ids covered
  agency_id uuid NOT NULL,
  context_data jsonb,                    -- additional form-specific context
  expires_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_tokens_token ON form_tokens(token);
CREATE INDEX idx_form_tokens_trip ON form_tokens(trip_id);
```

**Token generation:** `crypto.randomBytes(32).toString('hex')` — 64 char hex string.

**Expiry:** 30 days from creation. API rejects submissions after expiry.

### 4. Waiver Form (Client Portal)

**Route:** `apps/client/src/app/forms/[token]/page.tsx`

**Server-side:** Resolves token → fetches trip, travelers, insurance packages from API.

**Form renders:**
- Agency branding header
- Trip name + dates
- Traveler name(s) covered by this form
- Two paths:

**Path A — Purchase Insurance:**
- Shows available packages from `trip_insurance_packages`
- Traveler selects package
- Submit → API updates `trip_traveler_insurance.status = 'selected_package'`, `selectedPackageId`

**Path B — Decline Insurance:**
- Acknowledgment text: "I understand that by declining insurance coverage, I assume all financial risk..."
- Checkbox: "I have read and understand the above"
- Decline reason (optional text)
- Submit → API updates `trip_traveler_insurance.status = 'declined'`, `declinedAt`, `acknowledgedAt`, `declinedReason`

**For parents with minors:** Form lists parent + dependents. One submission covers all.

**Post-submission:** Shows confirmation page. Marks `form_tokens.completed_at`.

### 5. Minor Detection Logic

```typescript
function detectMinorsAndGuardians(travelers, tripStartDate, relationships) {
  return travelers.map(traveler => {
    const age = calculateAge(traveler.dateOfBirth, tripStartDate)
    if (age >= 18) return { ...traveler, isMinor: false, guardian: null }

    // Find parent/guardian from contact_relationships
    const guardian = relationships.find(r =>
      (r.contactId1 === traveler.contactId && ['parent', 'mother', 'father', 'guardian'].includes(r.labelForContact2)) ||
      (r.contactId2 === traveler.contactId && ['parent', 'mother', 'father', 'guardian'].includes(r.labelForContact1))
    )

    return {
      ...traveler,
      isMinor: true,
      guardian: guardian ? findTravelerByContactId(travelers, guardian) : null,
      needsGuardianAssignment: !guardian,
    }
  })
}
```

Agent can override guardian assignment in the preview dialog.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/trips/:tripId/automations` | List automation jobs for trip |
| POST | `/trips/:tripId/automations/:jobId/pause` | Pause a queued job |
| POST | `/trips/:tripId/automations/:jobId/resume` | Resume a paused job |
| POST | `/trips/:tripId/automations/:jobId/cancel` | Cancel a job |
| POST | `/trips/:tripId/insurance/initiate` | Queue insurance proposal emails |
| GET | `/forms/:token` | Resolve form token (public, no auth) |
| POST | `/forms/:token/submit` | Submit form response (public, no auth) |

---

## Migration Summary

1. `automation_job_history`: add `trip_id`, `paused_at`, `cancelled_at`, `cancelled_by` columns
2. `automation_job_status` enum: add `paused`, `cancelled` values (pre-migration psql step)
3. `form_tokens`: new table

---

## Non-Goals (v1)

- No email template editor (uses code-defined templates)
- No automated follow-up reminders (if traveler doesn't respond)
- No payment processing on the waiver form (insurance purchase is recorded, not charged)
- No SMS notifications
- No multi-language support for waiver form
- No group booking intake form (future — uses same form_tokens pattern)
