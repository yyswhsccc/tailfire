# Pilot Testing Rollout Design

**Date:** 2026-04-06
**Goal:** Prepare the preview/staging environment for real agent testing by end of day.

---

## Overview

Three parallel workstreams to get pilot agents onto the platform:

| # | Workstream | Owner | Dependency |
|---|-----------|-------|------------|
| 1 | Fresh Data Import | Claude | None |
| 2 | Lightweight Welcome Page | Claude | None |
| 3 | Agent Setup & Trip Reassignment | Andre (manual) | Workstreams 1 & 2 complete |

**Environment:** Preview/staging only. Production stays clean until proper cut-over.

---

## Workstream 1: Fresh Data Import

### Steps

1. **Re-extract from TES** — run `extract-travelesolutions.ts` with credentials (`TS_USER=aguertin`, `TS_PASS=123Hammond!`, `TS_COMPANY=PhoenixV`) to pull the latest data into `data/migration/`.
2. **Wipe preview DB** — clear all trip-related data from the preview database:
   - Trips, activities, itineraries, activity pricing
   - Contacts, travelers
   - Payments, payment schedules, commission tracking, commission checks
   - Suppliers (re-imported)
   - Tags associated with trips
   - **Preserve:** agencies, user accounts, system config
3. **Re-import** — run `import-to-tailfire.ts` against the preview API URL with all steps.
4. **Lifecycle backfill** — `POST /trips/backfill-lifecycle` to evaluate all trip statuses.
5. **Verify counts** — confirm totals match TES source data (~426 trips, ~840 contacts, ~1209 activities).

### Agent Designation Codes

The TES data contains agent designation codes in `TripDescription` fields (e.g., `(AG) Trip Name`). These are **not** used during import — all trips import under the admin account. Andre will use these codes to manually reassign trips to the correct agent users after import.

Known codes from TES data:

| Code | Trips | Code | Trips |
|------|-------|------|-------|
| (JL) | 97 | (DH) | 11 |
| (SL) | 87 | (RS) | 9 |
| (MG) | 36 | (AC) | 7 |
| (DB) | 26 | (HB) | 6 |
| (AG) | 26 | (PL) | 4 |
| Others | ~10 | No code | 106 |

---

## Workstream 2: Lightweight Welcome Page

### Trigger

Detect first-time users via `onboardingCompletedAt === null` on the user profile. Redirect to `/welcome`. After dismissal, set `onboardingCompletedAt` timestamp so they never see it again.

> **Note (from Codex validation):** `lastLoginAt` is NOT reliably maintained — no application code or DB trigger updates it on sign-in. We use `onboardingCompletedAt` as the sole detection mechanism. For existing admin users, we pre-set this field so they skip the welcome page.

### Content (single page, not a wizard)

- **Welcome header** — "Welcome to Tailfire" with the user's first name
- **3-4 key feature cards** — visual overview of main areas:
  - **Trips** — manage client trips, itineraries, bookings
  - **Contacts** — CRM with import, merge, lifecycle tracking
  - **Calendar** — tasks, final payments, trip dates at a glance
  - **Payments** — track deposits, balances, commissions
- **How to get help** — point to the in-app help guide (already built)
- **How to report a bug or request a feature** — explain the bug report button with a visual callout showing where it is
- **"Get Started" button** — dismisses welcome, redirects to dashboard

### Implementation

- New route: `apps/admin/src/app/welcome/page.tsx`
- Layout-level redirect: check `onboardingCompletedAt` from the user profile (fetched via `useUserProfile`), redirect to `/welcome` if null
- New field on user profile: `onboardingCompletedAt` (nullable timestamp) — stored in the existing JSON `settings` field on `user_profiles` to avoid a DB migration (faster for today's timeline)
- "Get Started" dismissal: PATCH user profile settings with `onboardingCompletedAt: new Date()`
- Pre-set `onboardingCompletedAt` for existing admin users so they skip the welcome page

### Deferred

- Video embeds (training videos added to help docs later)
- Interactive product tour / step-by-step walkthrough
- Feature-by-feature guided setup
- Full onboarding guide

---

## Workstream 2b: Trip Owner Reassignment UI

> **Found by Codex validation:** The API has `PATCH /trips/:id/owner` but no admin UI is wired to it. Andre cannot reassign trips without a UI control.

**Build:** Add an owner reassignment dropdown/selector to the trip overview page. This uses the existing API endpoint and user list.

- Trip overview page gets an "Assigned Agent" field with a user selector dropdown
- Calls `PATCH /trips/:id/owner` with the selected userId
- Server-side search already includes `trips.description`, so searching `(AG)` works for finding trips

---

## Workstream 3: Agent Setup & Trip Reassignment (Manual)

Andre handles this through the admin UI to validate those flows:

1. **Create user accounts** — via Settings > Users > Create/Invite for each pilot agent
2. **Reassign trips** — search trips by designation code in the trip description, use the new owner selector to change owner to the correct agent user
3. **Send credentials** — share login info with pilot agents

This tests:
- User creation/invitation flow
- Trip ownership reassignment (new UI)
- The welcome page experience (each new agent sees it on first login)

---

## Issue & Feedback Reporting

The existing in-app bug report system is used as-is:
- Type selection: bug / feature request / question
- Auto-screenshot capture on dialog open
- Console logs automatically captured
- Creates a GitHub issue with all context
- Returns issue number + link to the user

No changes needed.

---

## Order of Operations (Today)

```
1. [Claude]  Build welcome page + trip owner UI    (independent, parallel)
2. [Claude]  Re-extract TES data                   (~5-10 min)
3. [Claude]  Wipe preview DB + re-import           (~15-20 min)
4. [Claude]  Deploy to preview                     (after 1-3 complete)
5. [Claude]  Verify: data counts, welcome page, owner reassignment, bug report
6. [Andre]   Create agent user accounts via admin UI
7. [Andre]   Reassign trips by designation code using new owner selector
8. [Andre]   Send login credentials to pilot agents
```

Steps 1 and 2-3 can run in parallel.

---

## Success Criteria

- [ ] Preview environment has fresh TES data with correct counts
- [ ] New users see the welcome page on first login
- [ ] Welcome page dismisses properly and never shows again
- [ ] Bug report dialog works from preview (creates GitHub issues)
- [ ] Help docs are accessible from the welcome page
- [ ] Agent accounts can be created via admin UI
- [ ] Trips can be reassigned to different owners
- [ ] Pilot agents can log in, see their trips, and report issues
