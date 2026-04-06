# Pilot Testing Rollout Design

**Date:** 2026-04-06
**Goal:** Prepare the preview/staging environment for real agent testing by end of day.
**Validated by:** Claude + Codex (full codebase analysis, ~25 min)

---

## Overview

Two-phase rollout (revised from Codex validation — not 3 independent workstreams):

| Phase | What | Owner | Dependency |
|-------|------|-------|------------|
| 1 | Preview Data Refresh | Claude | None |
| 2 | Pilot Onboarding + Reassignment | Claude (code) + Andre (manual) | Phase 1 complete |

**Environment:** Preview/staging only. Production stays clean until proper cut-over.

---

## Phase 1: Preview Data Refresh

### Steps

1. **Re-extract from TES** — run `extract-travelesolutions.ts` with credentials from Doppler/env (NOT hardcoded). Scripts live at `tailfire-project/scripts/migration/` (parent dir, outside repo).
2. **Dedicated preview reset** — NOT the `--full-reset` flag (which only clears trips/groups, not contacts/suppliers). Write a dedicated preview-only SQL script that handles full FK cascade in this order:
   - Delete `commission_check_items` tied to imported trips
   - Delete imported trips by `external_reference` (trip/activity/payment subtrees cascade)
   - Delete orphaned/imported `commission_checks`
   - Delete imported `trip_groups`
   - Clear CRM: `client_portal_users`, `contact_tags`, `contact_relationships`, `contact_group_members`, `contact_groups`, `contact_loyalty_programs`, `contact_documents`, `contact_duplicate_dismissals`, `contact_shares`, `contact_share_requests`, then `contacts`
   - Clear suppliers: ensure commission_checks are gone, then delete `suppliers`
   - **Preserve:** agencies, user accounts, system config, Drizzle migrations
3. **Set preview env vars explicitly** before import to avoid cross-environment risk (runner reads `apps/api/.env` if vars missing).
4. **Re-import** — run `import-to-tailfire.ts` against the preview API URL.
5. **Lifecycle backfills** (BOTH required):
   - `POST /trips/backfill-lifecycle` — evaluate all trip statuses
   - `POST /contacts/backfill-lifecycle` — recompute contact lifecycle from current DB state
6. **Run `validate-import.ts`** — verify data integrity.
7. **Verify counts** — confirm totals match TES source data (~426 trips, ~840 contacts, ~1209 activities).

### Agent Designation Codes

TES `TripDescription` is imported into **`trips.name`** (NOT `trips.description`). Designation codes like `(AG)` appear at the start of trip names. Server-side search includes trip names, so lookups work.

Known codes from TES data:

| Code | Trips | Code | Trips |
|------|-------|------|-------|
| (JL) | 97 | (DH) | 11 |
| (SL) | 87 | (RS) | 9 |
| (MG) | 36 | (AC) | 7 |
| (DB) | 26 | (HB) | 6 |
| (AG) | 26 | (PL) | 4 |
| Others | ~10 | No code | 106 |

### Contact Visibility Note

Imported contacts have no `ownerId` — they are agency-wide. All pilot agents will see all contacts regardless of trip assignment. This is acceptable for the pilot phase. Contact ownership scoping is deferred.

---

## Phase 2: Pilot Onboarding + Reassignment

### 2a: Lightweight Welcome Page

#### Trigger

Detect first-time users via `onboardingCompletedAt === null` in the user profile's `platformPreferences` JSON field. Redirect to `/welcome`. After dismissal, set `onboardingCompletedAt` timestamp so they never see it again.

> **Codex findings applied:**
> - `lastLoginAt` is NOT maintained by any app code — not used for detection
> - No generic `settings` JSON field exists — use `platformPreferences` instead
> - Profile updates use `PUT /user-profiles/me` (not PATCH)
> - Must extend `platformPreferences` type + DTO validation (extra keys currently rejected by `ValidationPipe` whitelist)
> - Must exempt `/welcome`, `/auth/*`, and `/profile?setup=true` from redirect (invite login redirects to profile setup)

#### Content (single page, not a wizard)

- **Welcome header** — "Welcome to Tailfire" with the user's first name
- **3-4 key feature cards** — visual overview of main areas:
  - **Trips** — manage client trips, itineraries, bookings
  - **Contacts** — CRM with import, merge, lifecycle tracking
  - **Calendar** — tasks, final payments, trip dates at a glance
  - **Payments** — track deposits, balances, commissions
- **How to get help** — button that opens the existing help guide **sheet** (not a link to a standalone docs page)
- **How to report a bug or request a feature** — explain the bug report button with a visual callout showing where it is in the top nav
- **"Get Started" button** — dismisses welcome, redirects to dashboard

#### Implementation

- New route: `apps/admin/src/app/welcome/page.tsx`
- Redirect gate in the dashboard layout shell (not root auth flow): check `onboardingCompletedAt` from `platformPreferences` via `useUserProfile` hook
- Exempt routes: `/welcome`, `/auth/*`, `/profile?setup=true`
- Store `onboardingCompletedAt` in `platformPreferences` JSON — requires:
  - Extend `PlatformPreferences` type in shared-types
  - Extend `UpdateUserProfileDto` nested validation to accept the new field
  - Use `PUT /user-profiles/me` for dismissal
- Pre-set `onboardingCompletedAt` for existing admin users so they skip the welcome page

#### Deferred

- Video embeds (training videos added to help docs later)
- Interactive product tour / step-by-step walkthrough
- Feature-by-feature guided setup
- Full onboarding guide

### 2b: Trip Owner Reassignment UI

> **Codex finding:** The API has `PATCH /trips/:id/owner` but no admin UI is wired to it.

**Build:** Add an owner reassignment dropdown/selector to the trip overview page.

- Trip overview page gets an "Assigned Agent" field with a user selector dropdown
- Calls `PATCH /trips/:id/owner` with the selected userId
- Search trips by name (where designation codes live) to find `(AG)`, `(MG)`, etc.

### 2c: Agent Setup & Trip Reassignment (Manual by Andre)

Andre handles this through the admin UI to validate those flows:

1. **Create user accounts** — via Settings > Users > Create/Invite for each pilot agent
2. **Reassign trips** — search trips by designation code in trip name, use the new owner selector to change owner
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
Phase 1: Preview Data Refresh
  1. [Claude]  Write dedicated preview reset SQL script
  2. [Claude]  Re-extract TES data (set env vars explicitly)   (~5-10 min)
  3. [Claude]  Run preview reset + re-import                   (~15-20 min)
  4. [Claude]  Run both lifecycle backfills + validate-import
  5. [Claude]  Verify counts

Phase 2: Pilot Onboarding (parallel with Phase 1 steps 2-5)
  6. [Claude]  Build welcome page (extend platformPreferences type/DTO)
  7. [Claude]  Build trip owner reassignment UI
  8. [Claude]  Deploy to preview (after all above complete)
  9. [Claude]  Verify: welcome page, owner reassignment, bug report

Phase 3: Agent Setup (Andre)
  10. [Andre]  Create agent user accounts via admin UI
  11. [Andre]  Reassign trips by designation code using owner selector
  12. [Andre]  Send login credentials to pilot agents
```

---

## Success Criteria

- [ ] Preview environment has fresh TES data with correct counts
- [ ] Both lifecycle backfills run (trips + contacts)
- [ ] New users see the welcome page on first login
- [ ] Welcome page dismisses properly and never shows again
- [ ] Existing admin users skip the welcome page
- [ ] Redirect exemptions work (/welcome, /auth/*, /profile?setup=true)
- [ ] Bug report dialog works from preview (creates GitHub issues)
- [ ] Help guide sheet opens from welcome page
- [ ] Trip owner can be changed via the new selector on trip overview
- [ ] Agent accounts can be created via admin UI
- [ ] Pilot agents can log in, see their trips, and report issues
