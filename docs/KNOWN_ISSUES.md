# Known Issues & Technical Debt

Tracked issues for the Tailfire platform as of March 16, 2026. Items are categorized by severity relative to the controlled beta release.

---

## Beta Blockers

~~### Trip Cancellation Flow Not Implemented~~ **RESOLVED 2026-03-16**
- Confirmation dialog with reason presets, server-side enforcement, bypass protection, payment reminder guard.

---

## Should Fix (Post-Beta Priority)

~~### Payment Schedule Locking Disabled~~ **RESOLVED 2026-03-16**
- Trip-status-based lock: editable until departure, blocked after (admin can override).

~~### Client Care Emails Not Sending~~ **RESOLVED 2026-03-16**
- Wired welcome, follow-up, and post-trip handlers with TS templates + EmailService.sendEmail().

~~### Itinerary Enum Migration Undocumented~~ **ALREADY RESOLVED**
- Migration `20260224000000_rename_itinerary_status_enums.sql` exists and is registered in journal. Idempotent (safe on all envs).

~~### IMAP Sync Caching Not Implemented~~ **RESOLVED 2026-03-16**
- Sync was already UID-incremental. Added body cache check — skip IMAP if body already in DB.

---

## Tech Debt (Can Defer)

### Excessive `as any` Type Casts
- **Count:** ~150 instances across API and Admin
- **High-risk locations:**
  - `trips/activities.service.ts:334` — pricing JSON cast
  - `trips/component-orchestration.service.ts` — 18+ pricing casts
  - `admin/app/trips/[id]/_components/flight-form.tsx:158` — `trip?: any`
- **Impact:** Type safety gaps could hide runtime bugs

### Legacy Controllers Marked for Removal
- **Files:**
  - `apps/api/src/trips/activity-media.controller.ts:718` — Target was Q1 2025
  - `apps/api/src/trips/activity-documents.controller.ts:270` — Target was Q1 2025
- **Status:** Still functional, new controllers coexist
- **Fix:** Remove after confirming no frontend references to old endpoints

~~### Hardcoded Agency Context in Frontend~~ **RESOLVED 2026-03-16**
- Replaced TEMP_AGENCY_ID with auth-derived agencyId via useUser() in 3 files.

### Static Airline Data
- **File:** `apps/admin/src/lib/airlines-data.ts:7`
- **Status:** Hardcoded list of ~90 airlines, will go stale over time
- **Fix:** Move to API endpoint backed by external data source

### Keyboard Drag & Drop Not Implemented
- **File:** `apps/admin/src/app/trips/[id]/_components/trip-itinerary.tsx:572`
- **Impact:** Accessibility gap — itinerary builder requires mouse for drag-and-drop
- **Fix:** Add keyboard-based reordering as an alternative

~~### Add Days Dialog Insert Logic~~ **RESOLVED 2026-03-16**
- Fixed Day 0 sequenceOrder collision in backend start-insert path.

---

## Resolved This Session (2026-03-16)

| Issue | Resolution |
|-------|-----------|
| SQL injection in dashboard (8 instances of `sql.raw()`) | Replaced with parameterized helper |
| IDOR in 11 financial controllers (40+ endpoints) | Added `@GetAuthContext` + trip/agency access checks |
| AdminGuard was placeholder (`return true`) | Implemented actual `auth.role === 'admin'` check |
| Email SSRF (arbitrary IMAP/SMTP hosts) | Added DTO validation + runtime DNS resolution guard |
| Email rate limiting missing | Added `@Throttle` + `ThrottlerGuard` to 3 endpoints |
| Stripe webhook blocked by JWT guard | Added `@Public()` decorator |
| Payment templates hardcoded `userId = 'system'` | Replaced with `auth.userId` |
| Debug `console.log` statements (11 in trip-form-dialog) | Removed |
| "Coming Soon" placeholder text | Replaced with "In Development" |
| Documentation gaps (email, groups, enrichment) | Updated 7 doc files |
| Branch cleanup (9 stale branches) | Deleted, 2 merged |
| Trip cancellation not implemented | Full cancel flow with dialog, reason presets, bypass prevention |
| Cancellation email to travelers | Optional opt-in email with HTML template |
| Reference-data refresh unguarded | Added AdminGuard |
| Payment schedule locking disabled | Trip-status-based lock (blocked after departure, admin override) |
| Soft-delete was hard delete | Converted to soft-delete with admin restore |
| No un-cancel for trips | Admin-only un-cancel restoring to previous status |

---

*Last updated: 2026-03-16*
