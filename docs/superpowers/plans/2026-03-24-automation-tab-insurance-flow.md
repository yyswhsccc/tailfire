# Automation Tab + Insurance Waiver Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automation job timeline to trip detail page, insurance proposal email flow with minor detection, and token-based waiver form on client portal.

**Architecture:** Automation tab queries `automation_job_history` by `tripId`. Insurance flow queues BullMQ jobs via `client-care` queue. Waiver form uses standalone `form_tokens` table for token-based access on client portal. Minor detection uses `contact_relationships` with agent override.

**Tech Stack:** NestJS (API), Next.js (Admin + Client), BullMQ, Drizzle ORM, PostgreSQL, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-24-automation-tab-insurance-flow-design.md`

---

## File Structure

### New Files — Database
- `packages/database/src/migrations/YYYYMMDDHHMMSS_automation_job_history_additions.sql` — Add columns + enum values
- `packages/database/src/migrations/YYYYMMDDHHMMSS_create_form_tokens.sql` — New form_tokens table
- `packages/database/src/schema/form-tokens.schema.ts` — Drizzle schema for form_tokens

### New Files — API
- `apps/api/src/automation/automation.controller.ts` — Trip automation endpoints (list, pause, resume, cancel) — NOTE: check if this file exists already, extend if so
- `apps/api/src/forms/forms.module.ts` — Form tokens module
- `apps/api/src/forms/forms.service.ts` — Token generation + resolution
- `apps/api/src/forms/forms.controller.ts` — Public form endpoints (resolve, submit)
- `apps/api/src/trips/insurance-automation.service.ts` — Insurance email orchestration + minor detection

### New Files — Admin
- `apps/admin/src/app/trips/[id]/_components/trip-automations.tsx` — Automation tab main component
- `apps/admin/src/app/trips/[id]/_components/automation-job-card.tsx` — Individual job card with actions
- `apps/admin/src/components/insurance/insurance-proposal-dialog.tsx` — Preview + queue dialog
- `apps/admin/src/hooks/use-automations.ts` — React Query hooks for automation jobs

### New Files — Client Portal
- `apps/client/src/app/forms/[token]/page.tsx` — Form resolver page
- `apps/client/src/app/forms/[token]/_components/insurance-waiver-form.tsx` — Waiver form component

### Modified Files
- `packages/database/src/schema/automation-job-history.schema.ts` — Add columns
- `packages/database/src/schema/index.ts` — Export form-tokens schema
- `packages/database/src/migrations/meta/_journal.json` — Register migrations
- `apps/api/src/automation/automation.types.ts` — Add insurance job types
- `apps/api/src/automation/processors/client-care.processor.ts` — Add insurance email handler
- `apps/api/src/app.module.ts` — Register FormsModule
- `apps/admin/src/app/trips/[id]/page.tsx` — Replace automations EmptyState
- `apps/admin/src/app/trips/[id]/_components/trip-insurance.tsx` — Add "Send Insurance Proposals" button

---

## Task 1: DB Migration — Automation Job History Additions

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_automation_job_history_additions.sql`
- Modify: `packages/database/src/schema/automation-job-history.schema.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Pre-migration psql step for enum additions**

The deploy workflow has a pre-migration psql step. Create the migration:

```sql
-- Add new statuses to automation_job_status enum
-- NOTE: ALTER TYPE ADD VALUE cannot run in transactions
ALTER TYPE automation_job_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE automation_job_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Add trip association and pause/cancel tracking
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone;
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;
ALTER TABLE automation_job_history ADD COLUMN IF NOT EXISTS cancelled_by uuid;

CREATE INDEX IF NOT EXISTS idx_automation_job_history_trip ON automation_job_history(trip_id);
```

- [ ] **Step 2: Update Drizzle schema**

Add to `automation-job-history.schema.ts`:
```typescript
tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
pausedAt: timestamp('paused_at', { withTimezone: true }),
cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
cancelledBy: uuid('cancelled_by'),
```

Add `'paused'` and `'cancelled'` to `automationJobStatusEnum`.

- [ ] **Step 3: Register migration, run locally, commit**

```
git commit -m "feat(database): add trip_id + pause/cancel to automation_job_history"
```

---

## Task 2: DB Migration — Form Tokens Table

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_create_form_tokens.sql`
- Create: `packages/database/src/schema/form-tokens.schema.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration**

```sql
CREATE TABLE IF NOT EXISTS form_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token varchar(64) UNIQUE NOT NULL,
  form_type varchar(50) NOT NULL,
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,
  traveler_ids jsonb,
  agency_id uuid NOT NULL,
  context_data jsonb,
  expires_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_tokens_token ON form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_form_tokens_trip ON form_tokens(trip_id);
```

- [ ] **Step 2: Create Drizzle schema**

`packages/database/src/schema/form-tokens.schema.ts` with table definition + type exports.

- [ ] **Step 3: Export from schema barrel, register migration, run, commit**

```
git commit -m "feat(database): create form_tokens table for token-based forms"
```

---

## Task 3: Forms Module — Token Service + Public Controller (API)

**Files:**
- Create: `apps/api/src/forms/forms.module.ts`
- Create: `apps/api/src/forms/forms.service.ts`
- Create: `apps/api/src/forms/forms.controller.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: FormsService**

Methods:
- `createToken(formType, tripId, travelerIds, agencyId, contextData?, expiresInDays = 30)` — generates crypto random token, inserts into form_tokens
- `resolveToken(token)` — looks up token, checks expiry, returns form context
- `markCompleted(token)` — sets completed_at
- `submitInsuranceWaiver(token, travelerDecisions)` — updates trip_traveler_insurance for each traveler

Token generation: `import { randomBytes } from 'crypto'` → `randomBytes(32).toString('hex')`

- [ ] **Step 2: FormsController**

Public endpoints (no auth guard):
- `GET /forms/:token` — resolve token, return form type + context (trip name, travelers, packages)
- `POST /forms/:token/submit` — submit form response, update insurance status

- [ ] **Step 3: FormsModule + register in app.module.ts**

- [ ] **Step 4: Commit**

```
git commit -m "feat(api): add FormsModule with token generation and public waiver endpoints"
```

---

## Task 4: Insurance Automation Service (API)

**Files:**
- Create: `apps/api/src/trips/insurance-automation.service.ts`
- Modify: `apps/api/src/trips/trips.module.ts`

- [ ] **Step 1: InsuranceAutomationService**

Methods:
- `getProposalPreview(tripId)` — returns travelers with insurance status, detects minors, finds guardians
- `queueProposalEmails(tripId, selectedTravelerIds, scheduledFor?, userId?)` — creates form tokens, queues BullMQ jobs

Minor detection:
```typescript
async detectMinorsAndGuardians(tripId: string) {
  // 1. Get all trip travelers with contacts (DOB)
  // 2. Get trip start date
  // 3. Calculate age for each traveler
  // 4. For minors: query contact_relationships for parent/guardian labels
  // 5. Return enriched list with isMinor, guardian, needsGuardianAssignment
}
```

- [ ] **Step 2: Wire into TripsModule**

- [ ] **Step 3: Commit**

```
git commit -m "feat(api): add InsuranceAutomationService with minor detection"
```

---

## Task 5: Insurance Email Job Type + Processor (API)

**Files:**
- Modify: `apps/api/src/automation/automation.types.ts`
- Modify: `apps/api/src/automation/processors/client-care.processor.ts`

- [ ] **Step 1: Add job type**

In `automation.types.ts`, add:
```typescript
'insurance.proposal.email'
```
to the job types union, with data interface:
```typescript
interface InsuranceProposalEmailJobData {
  type: 'insurance.proposal.email'
  tripId: string
  travelerId: string
  travelerName: string
  travelerEmail: string
  dependentIds: string[]
  formToken: string
  agencyId: string
}
```

- [ ] **Step 2: Add processor handler**

In `client-care.processor.ts`, add case for `insurance.proposal.email`:
- Load agency branding
- Build email with waiver link: `https://client.phoenixvoyages.ca/forms/${formToken}`
- Send via `EmailService.sendEmail()`
- Log to automation_job_history with tripId

- [ ] **Step 3: Commit**

```
git commit -m "feat(api): add insurance proposal email job type + processor"
```

---

## Task 6: Trip Automations API Endpoints

**Files:**
- Modify or create: `apps/api/src/automation/automation.controller.ts`

- [ ] **Step 1: Add trip-scoped endpoints**

Check if `automation.controller.ts` exists. If so, extend it. If not, create it.

Endpoints:
- `GET /trips/:tripId/automations` — list jobs from `automation_job_history` where `trip_id = tripId`, ordered by `created_at DESC`
- `POST /trips/:tripId/automations/:jobId/pause` — call `AutomationService.cancel(jobId)`, update history row to `paused`
- `POST /trips/:tripId/automations/:jobId/resume` — re-queue the job from stored `job_data`, update history to `queued`
- `POST /trips/:tripId/automations/:jobId/cancel` — call `AutomationService.cancel(jobId)`, update history to `cancelled` with `cancelled_by`
- `POST /trips/:tripId/insurance/initiate` — call `InsuranceAutomationService.queueProposalEmails()`
- `GET /trips/:tripId/insurance/preview` — call `InsuranceAutomationService.getProposalPreview()`

All require JWT auth + trip access verification.

- [ ] **Step 2: Commit**

```
git commit -m "feat(api): add trip automation + insurance initiate endpoints"
```

---

## Task 7: Frontend Hooks (Admin)

**Files:**
- Create: `apps/admin/src/hooks/use-automations.ts`

- [ ] **Step 1: Create hooks**

```typescript
// Queries
useTripAutomations(tripId) — GET /trips/:tripId/automations
useInsurancePreview(tripId) — GET /trips/:tripId/insurance/preview

// Mutations
usePauseAutomation() — POST /trips/:tripId/automations/:jobId/pause
useResumeAutomation() — POST /trips/:tripId/automations/:jobId/resume
useCancelAutomation() — POST /trips/:tripId/automations/:jobId/cancel
useInitiateInsurance() — POST /trips/:tripId/insurance/initiate
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add automation + insurance React Query hooks"
```

---

## Task 8: Automation Job Card Component (Admin)

**Files:**
- Create: `apps/admin/src/app/trips/[id]/_components/automation-job-card.tsx`

- [ ] **Step 1: Create component**

Shows: job type icon + description, status badge, timestamp, action buttons (pause/resume/cancel for queued/paused jobs). Cancelled/completed jobs are read-only.

Status badge colors: queued (blue), processing (amber), completed (green), failed (red), paused (zinc), cancelled (zinc strikethrough).

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add AutomationJobCard component"
```

---

## Task 9: Trip Automations Tab (Admin)

**Files:**
- Create: `apps/admin/src/app/trips/[id]/_components/trip-automations.tsx`
- Modify: `apps/admin/src/app/trips/[id]/page.tsx`

- [ ] **Step 1: Create TripAutomations component**

Fetches jobs via `useTripAutomations(tripId)`. Renders `AutomationJobCard` for each. Header shows "Automations" + job count.

- [ ] **Step 2: Wire into trip detail page**

Replace the `automations` EmptyState case with `<TripAutomations trip={trip} />`.

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): add Trip Automations tab with job timeline"
```

---

## Task 10: Insurance Proposal Dialog (Admin)

**Files:**
- Create: `apps/admin/src/components/insurance/insurance-proposal-dialog.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/trip-insurance.tsx`

- [ ] **Step 1: Create InsuranceProposalDialog**

Dialog that:
1. Calls `useInsurancePreview(tripId)` to get travelers with status + minor detection
2. Shows checkboxes per traveler (adults checked by default, minors auto-assigned)
3. Shows guardian assignment for minors (with override dropdown)
4. Schedule option (now or delayed)
5. "Queue Emails" button calls `useInitiateInsurance()`

- [ ] **Step 2: Add "Send Insurance Proposals" button to trip-insurance.tsx**

In the Traveler Insurance Status card header, add a button:
```tsx
<Button size="sm" variant="outline" onClick={() => setShowProposalDialog(true)}>
  <Mail className="h-4 w-4 mr-1" />
  Send Proposals
</Button>
```

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): add Insurance Proposal dialog with minor detection"
```

---

## Task 11: Waiver Form — Client Portal

**Files:**
- Create: `apps/client/src/app/forms/[token]/page.tsx`
- Create: `apps/client/src/app/forms/[token]/_components/insurance-waiver-form.tsx`

- [ ] **Step 1: Create form resolver page**

Server component that:
1. Calls API: `GET /forms/${token}` to resolve token
2. If expired/invalid: shows error page
3. If completed: shows "Already submitted" page
4. If valid: renders `InsuranceWaiverForm` with context data

- [ ] **Step 2: Create InsuranceWaiverForm**

Client component showing:
- Agency branding header
- Trip name + dates
- Traveler name(s) covered
- Two tabs/paths:
  - Purchase: package selection cards → submit
  - Decline: acknowledgment text + checkbox + optional reason → submit
- Submits to `POST /forms/${token}/submit`
- Shows confirmation on success

- [ ] **Step 3: Commit**

```
git commit -m "feat(client): add token-based insurance waiver form"
```

---

## Task 12: Integration Test + Push

- [ ] **Step 1: TypeScript check all 3 apps**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep -c "error TS"
npx tsc --noEmit --project apps/admin/tsconfig.json 2>&1 | grep -c "error TS"
npx tsc --noEmit --project apps/client/tsconfig.json 2>&1 | grep -c "error TS"
```

- [ ] **Step 2: Manual test flow**

1. Open trip → Automations tab → verify timeline renders (empty initially)
2. Open trip → Insurance tab → click "Send Proposals"
3. Verify preview shows travelers with minor detection
4. Queue emails → verify jobs appear in Automations tab as "queued"
5. Pause a job → verify status changes
6. Cancel a job → verify cancelled with audit
7. Open waiver link in browser → verify form renders
8. Submit waiver → verify insurance status updates

- [ ] **Step 3: Push**

```bash
git push origin main
git checkout preview && git merge main --no-edit && git push origin preview && git checkout main
```
