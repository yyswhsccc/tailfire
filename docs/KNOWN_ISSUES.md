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
- **Count:** ~227 instances across API and Admin
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
| Client care emails not sending | Wired welcome, follow-up, post-trip with TS templates |
| IMAP body re-downloaded every open | Added cache check — skip IMAP if body in DB |
| Hardcoded agency ID in 3 files | Replaced with auth-derived agencyId via useUser() |
| Day insertion ordering collision | Fixed Day 0 sequenceOrder in backend start-insert |
| DB trigger broke INSERT on uncancel | Added TG_OP='INSERT' guard |
| findOne/trip-access exposed soft-deleted | Added isNull(deletedAt) filter |

---

*Last updated: 2026-03-16*

---

## Production Launch (2026-05) — Accepted Patterns

The following items were audited during the production launch punch list
(`docs/PRODUCTION_LAUNCH_PUNCHLIST.md`) and are **explicitly accepted** for
the launch window. Each entry documents the rationale and the conditions
under which it should be revisited.

If you're considering "I'll just silently swallow this error," check
[CLAUDE.md §8 (Policy Error Handling)](../CLAUDE.md) first. The doctrine is
**strict by default** — silent swallowing requires explicit acceptance here.

### Accepted silent failures (B13, PR #384)

#### `apps/ota/src/app/api/consumer-activity/route.ts:18`

**Behavior:** Returns 204 No Content on every error path. Analytics ingest
must never surface failures to consumers — a broken tracking call should not
break the page they're viewing.

**Mitigation:** `console.warn` is emitted on the catch path so failures show
up in Vercel logs (added in B13). OTA does not currently have Sentry wired
(per CLAUDE.md, only API + admin do), so this is the best breadcrumb
available without adding the OTA Sentry SDK.

**Revisit when:** OTA gains a Sentry integration. Replace `console.warn`
with `Sentry.captureException(err, { level: 'warning' })`.

### Accepted typecheck baseline (B12)

`pnpm --filter @tailfire/api typecheck` currently fails on a known set of
pre-existing errors. The Nest build uses SWC with `nest-cli.json`
`"typeCheck": false`, so runtime is unaffected, but the static check is
informational rather than blocking.

**Status:** Documented as a launch risk in
`docs/PRODUCTION_LAUNCH_PUNCHLIST.md` (B12). Triage strategy (clean vs
accept-as-risk) is awaiting Codex consult.

**Revisit when:** B12 ships (planned Phase 1 OR accept-as-risk for launch
with a 2-week post-launch fix target).

### Accepted lint baseline (API)

`pnpm --filter @tailfire/api lint` currently has 9 errors:

- `apps/api/src/ic-payouts/ic-tax-profiles/__tests__/ic-tax-profiles.service.spec.ts:21` — `require()` import
- `apps/api/src/ic-payouts/payout-accounts/__tests__/ic-payout-accounts.service.spec.ts:17` — `require()` import
- `apps/api/src/softvoyage/softvoyage.controller.ts:109,110` — `require()` imports
- `apps/api/src/trips/itinerary-versions.service.ts:34` — `require()` import

The `no-empty` error in `softvoyage-search.processor.ts:177` was **fixed in
B13** (added `logger.warn`).

**Status:** API lint is informational on PR validation, not blocking. The
4 blocking CI jobs are: `admin-typecheck`, `migration-monotonicity`,
`supabase-migrations-guard`, `lint-ota`.

**Revisit when:** B12 cleanup OR a separate pre-launch lint sweep.

### How to add an entry

1. Confirm the issue is genuinely accepted, not just deferred. If it's just
   deferred, file a GitHub issue and link from the punchlist instead.
2. Document **what** the behavior is, **why** it's accepted, and **when** to
   revisit.
3. Reference the originating blocker (e.g., `B13`) so the rationale is
   traceable.

*Section added: 2026-05-15*
