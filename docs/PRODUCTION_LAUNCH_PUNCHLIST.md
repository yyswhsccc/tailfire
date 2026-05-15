# Production Launch Punch List — MASTER

**Status:** Operational plan. Code findings validated against `origin/main @ 42d03684` (Codex review, 2026-05-15).
**Target:** Phoenix Voyages (TICO-licensed, Ontario, Canada) — `apps/ota` + `apps/client` + `apps/admin` + `apps/api` → production
**Owner:** _set per item — most default to **Al + Claude (paired)** unless flagged otherwise_

---

## Executive Summary — TL;DR

**Current state:** **14 code-verified blockers.** Sequencing-wise, **Phase 0 (decisions) and Phase 1 (security fixes) can run in PARALLEL** — B1/B2/B12 don't depend on the domain decision. Phase 2 onward serializes.

**The 3 longest-pole items that gate launch ETA:**

1. **Legal: Privacy + Terms + cookie banner** — gated on lawyer SLA. Start TODAY. Without it, no consumer-facing launch.
2. **TES import re-validation + W1-W5 + dry-run + cutover (B14 + B11)** — 2-3 days of work. The April-2 validation does NOT cover 6 weeks of post-validation codebase changes (IC payouts module, traveler auto-assign policy, payment-schedule lock policy). Must re-validate against current `main` before importing prod.
3. **Prod auth/email/env/smoke readiness** — Supabase Auth config, Doppler→Railway/Vercel sync verification, R2 + Stripe + Resend domain + smoke test expansion. Many small tasks that compound.

*(Domain decision is a gate, not a long pole — Al decides, then ~1hr of code work. Tracked under B5.)*

**Internal-alias path (defensible):** After B1/B2 + backup + env sync + migration dry-run + basic smoke, Phoenix Voyages staff can use the platform behind a non-public Vercel alias within **48h** for NEW trip creation. This is NOT consumer-facing soft launch and does NOT include TES historical data — that requires B14 + legal pages + TICO expansion + full smoke suite.

**Realistic launch window: 8-12 working days** from start of Phase 0 to DNS flip, assuming legal returns within the window and B14 surfaces no major incompatibilities.

**What's already done (Refactor + bug-fix sweep):** 17 PRs merged, including all 5 main refactor roadmap steps, 4 blocking CI jobs, hook + form lifecycle proven on flight-form. None of that work blocks launch — but it hardens the codebase for the post-launch iteration cycle.

---

## Phase Plan — Do These In Order

Phases marked **‖** can run in parallel.

| Phase | Goal | Effort | Blocked by | Output |
|---|---|---|---|---|
| **0. Decide ‖** | Apex vs subdomain (B5). `my.` vs `client.` portal hostname. Soft vs hard launch. Lawyer engaged for B3. | 1 day, async | Al's call + lawyer engagement | Decisions recorded in changelog |
| **1. Secure ‖** | B1 (consumer-activity scoping). B2 (registration throttling + CAPTCHA). B12 triage (typecheck — decide accept-as-risk or clean). | 1 day (B1/B2), B12 separate | nothing | PRs merged to preview |
| **2. Configure** | Doppler `prd` complete (B7). Railway + Vercel env sync. Supabase Auth prod config (B6). R2 + Resend + Stripe domain config. DNS records created (NOT flipped). | 1-2 days | Phase 0 + Phase 1 | Production envs healthy, alias-tested |
| **3. Stage + TES Re-Validation** | Clone prod DB. Run migrations dry-run (B9). Verify drizzle journal vs Preview row-for-row. **B14: re-validate TES import against current `main`** (fresh dry-run on tf-demo, patch script for incompatibilities, complete W1-W5, decide IC payouts treatment). Deploy API/apps behind non-public URLs (`vercel --prod --skip-domain`). Basic smoke (B10 partial). | **2-3 days** | Phase 2 | Production aliases respond. TES dry-run passes. Internal use possible. |
| **4. Prod Import** | TES full import to prod with mguertin account (B11) using script validated in Phase 3. Run `/trips/backfill-lifecycle` → `/contacts/backfill-lifecycle`. Validate counts. | 1 day | Phase 3 + Privacy/Terms live (B3) | Real production data loaded |
| **5. Verify** | UAT with 2+ agents + 3+ consumers. Smoke test full suite (B10 complete). TICO §38 audit complete (B4). | 2-3 days | Phase 4 | Sign-off from Phoenix Voyages |
| **6. Launch** | DNS flip. Smoke test on apex. Watch Sentry. | 1 hour | Phase 5 | 🚀 |

**Realistic minimum: 7-10 working days** from start of Phase 0 to DNS flip, assuming legal returns Privacy + Terms within Phase 1-3 and no surprises in TES cutover. 6 days is a stretch — Codex flagged that as a minimum, not a schedule.

---

## 🔴 BLOCKERS — Operational Tracker

Each blocker has: **owner, effort, dependencies, status, GH issue ref.**

Status legend: `[ ]` todo · `[~]` in progress · `[!]` blocked · `[x]` done

---

### B1. Security: Consumer-activity admin endpoints lack agency scoping
**Owner:** Claude · **Effort:** ~2 hrs actual · **Blocks:** Phase 1 · **Status:** `[x]` · **Issue:** [#379](https://github.com/Systemsaholic/tailfire/issues/379) · **PR:** [#380](https://github.com/Systemsaholic/tailfire/pull/380) (merged 2026-05-15)

`apps/api/src/consumer-activity/consumer-activity.controller.ts:23` exposed 3 endpoints with no `@AdminOnly` and no agency-ownership check:
- `GET /consumer-activity/by-contact/:id`
- `GET /consumer-activity/signals/:id`
- `GET /consumer-activity/insights/:id`

`apps/api/src/consumer-activity/consumer-activity.service.ts:50` fetched by raw `contactId` only.

**Impact:** Any authenticated agent (any agency) could read any agency's consumer browsing/intent data. **Cross-agency PII leak.**

**Acceptance:**
- [x] All three endpoints gated by `@AdminOnly`
- [x] Service verifies contact agency matches actor's agency before returning data (`assertContactInAgency`)
- [x] Spec covers: same-agency 200, cross-agency 403, anonymous 401 (global JwtAuthGuard)
- [x] Codex APPROVE: no auth-bypass paths, defense-in-depth correct

---

### B2. Security: Public registration not throttled
**Owner:** Claude · **Effort:** 2-4 hrs (Turnstile/hCaptcha + per-email throttling, not 30min) · **Blocks:** Phase 1 · **Status:** `[~]` · **Issue:** [#381](https://github.com/Systemsaholic/tailfire/issues/381)

`apps/api/src/consumer-auth/consumer-auth.controller.ts:28` — `POST /consumer-auth/register` is public + ungated. `apps/api/src/auth/auth.controller.ts:25` notes `ThrottlerGuard` is NOT global.

**Impact:** Account spray, fake accounts, magic-link abuse, email deliverability damage.

**Acceptance:**
- [x] `ThrottlerGuard` applied (per-IP `default` + per-email `register-email` named throttler)
- [x] Cloudflare Turnstile token wired in DTO + `TurnstileService` verifies before any DB write
- [x] OTA proxy forwards `turnstileToken` AND visitor `x-forwarded-for` to API (Codex rework)
- [x] OTA `EmailCaptureModal` renders Turnstile widget, blocks submit until token, resets on 4xx, handles script-load race via `onLoad` → re-render
- [x] API `main.ts` sets `trust proxy = 1` so `req.ip` resolves to real client IP behind Vercel/Railway
- [x] `TurnstileService` fail-closed on `NODE_ENV ∈ {production, preview, staging}` — startup throws unless `TURNSTILE_REQUIRED=true` AND `TURNSTILE_SECRET` are both set
- [x] OTA modal `throws` at module load if `NODE_ENV=production` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is missing (Vercel build catches missing env)
- [x] Spec coverage: 33 tests — per-throttler decorator wiring, strict-env startup invariants (incl. mistypes), Turnstile behavior matrix
- [ ] **Operational follow-up (Al):** Doppler `prd`/`stg` keys: `TURNSTILE_SECRET`, `TURNSTILE_REQUIRED=true`, OTA `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Verify Doppler→Railway and Doppler→Vercel sync per CLAUDE.md ⚠️ section.
- [ ] Decision DEFERRED: keep public endpoint or force through OTA service-key proxy (Codex's preferred long-term option). Phase 1 ships throttler+CAPTCHA on public endpoint; proxy migration is a separate post-launch item.

---

### B3. Legal: Privacy Policy + Terms + cookie banner
**Owner:** Al + lawyer · **Effort:** lawyer SLA-bound · **Blocks:** Phase 5 (DNS flip — but soft launch can proceed if invite-only) · **Status:** `[!]` blocked on legal · **Issue:** _file as project item_

`apps/ota/src/app/(marketing)/privacy/page.tsx:25` and `apps/ota/src/app/(marketing)/terms/page.tsx:25` both say "Full policy pending legal review."

**Impact:** Direct PIPEDA exposure. TICO expects pre-sale privacy + terms posting for online travel sellers.

**Acceptance:**
- [ ] Final Privacy Policy published (PIPEDA-compliant, lawyer-reviewed)
- [ ] Final Terms of Service published (lawyer-reviewed)
- [ ] Cookie banner / consent live (PIPEDA + OPC tracking guidance)
- [ ] Refund/cancellation policy surfaced in booking flow

**Path:** Engage lawyer today. Use a public-facing template + Phoenix Voyages-specific clauses while waiting. Soft launch can proceed behind invite-only beta with placeholder banner saying "private beta — full T&Cs at launch."

---

### B4. TICO §38 invoice gate is partial
**Owner:** Claude + Al (domain review) · **Effort:** 1 day (with E2E + docs) · **Blocks:** Phase 5 UAT · **Status:** `[ ]` · **Issue:** _file_

`apps/api/src/financials/trip-order.service.ts:447` only blocks finalization on a subset of TICO Ontario Reg. 26/05 §38. Missing:
- Insurance disclosure (offered/declined)
- Price-increase terms (when allowed)
- Travel-document advice (passport, visa)
- Cancellation and non-refundable disclosure
- **TICO registration number drift** — verify the displayed registration number matches Phoenix Voyages' current TICO record on every invoice template

**Acceptance:**
- [ ] Audit `TripOrderService.finalize()` against full TICO §38 checklist
- [ ] Add missing gate fields (with sensible defaults to keep existing trips finalizable)
- [ ] E2E test: booking → invoice → finalize exercising all disclosure fields
- [ ] Verify TICO registration number is sourced from agency config, not hardcoded
- [ ] Document the canonical §38 mapping in `docs/COMPLIANCE_TICO.md` (new)

**Reference:** [TICO Disclosure/Invoicing](https://tico.ca/travel-professionals/resources-guidelines/disclosure-invoicing.html), [TICO Guidelines PDF](https://www.tico.ca/files/Disclosure%20and%20Invoicing%20Guidelines-August2016-Final.pdf)

---

### B5. Domain decision + CORS + robots
**Owner:** Al (decision) · Claude (code) · **Effort:** 1 hr code, decision is the gate · **Blocks:** Phase 2 onward · **Status:** `[!]` decision pending · **Issue:** _file after decision_

Two options:
- **A: Apex** — `phoenixvoyages.ca` for OTA, `my.` for portal, `admin.` for admin. Best brand recognition. Requires CORS apex support (currently subdomain-only).
- **B: All subdomains** — `ota.phoenixvoyages.ca`, `my.` OR `client.phoenixvoyages.ca`, `admin.phoenixvoyages.ca`. Matches current code. Slightly weaker brand. Lower-risk launch.

**Sub-decision (Codex flagged):** Portal hostname — current code/deploy/runbooks mix `my.` and `client.` naming. **Pick one now** so config/redirects/CORS all point consistently.

**Code touchpoints (regardless of choice):**
- `apps/api/src/main.ts:71` — CORS allow-list (apex regex needed if Option A)
- `apps/ota/src/app/robots.ts:6` — hardcoded `ota.phoenixvoyages.ca`
- Supabase Auth: Site URL + redirect allow-list
- `COOKIE_DOMAIN` env var

**Acceptance:**
- [ ] Decision recorded in this doc's changelog (apex vs subdomain AND `my.` vs `client.`)
- [ ] CORS allow-list updated and tested with chosen apex/subdomains
- [ ] `robots.ts` matches chosen host
- [ ] Vercel domain aliases configured for chosen hosts
- [ ] All runbooks (`DEPLOYMENT_API.md`, `ENVIRONMENTS.md`) updated to single portal hostname

**Recommendation:** Option B (subdomains) + `my.` (more user-friendly than `client.`). Lower risk for first launch. Migrate to apex post-launch when traffic justifies it.

---

### B6. Supabase Auth production config
**Owner:** Al (Supabase dashboard access) · Claude (verification script) · **Effort:** 30 min · **Blocks:** Phase 2 · **Status:** `[ ]` · **Issue:** _no GH issue needed, runbook item_

Lives outside the codebase — easily missed.

**Acceptance:**
- [ ] Site URL = production OTA host
- [ ] Redirect allow-list includes portal + OTA + admin `/auth/callback` paths
- [ ] Email templates point to production links (magic link, password reset, confirm signup)
- [ ] MFA enforcement confirmed (currently MFA-aware via `apps/api/src/auth/guards/jwt-auth.guard.ts`)
- [ ] SMTP relay configured (Resend or Supabase native)

---

### B7. Doppler `prd` + Railway/Vercel env sync
**Owner:** Al · **Effort:** 1-2 hrs (mostly verification) · **Blocks:** Phase 2 · **Status:** `[ ]` · **Issue:** _runbook item_

Doppler is NOT auto-synced to Railway or Vercel. Verified gap documented in `docs/runbooks/ic-payouts-cutover.md:43`.

**Required Doppler `prd` secrets:**

| Secret | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase | Session pooler for runtime |
| `DIRECT_URL` | Supabase | Migrations only |
| `SUPABASE_URL` / `_ANON_KEY` / `_SERVICE_ROLE_KEY` | Supabase | All three |
| `R2_*` | Cloudflare | Prod bucket creds + custom domain |
| `SENTRY_DSN` | Sentry | Separate from dev/preview |
| `AMADEUS_*` | Amadeus | Flight search API |
| `FUSION_API_KEY` | Traveltek | Cruise booking |
| `SERP_API_KEY` | SerpAPI | TripAdvisor enrichment |
| `RESEND_API_KEY` | Resend | Transactional email |
| `STRIPE_*` | Stripe | **Production** keys, not test |
| `JWT_SECRET` | rotate | NOT reused from dev/preview |
| `COOKIE_DOMAIN` | this doc | Match chosen apex (see B5) |
| **`IC_PAYOUTS_V2_ENABLED=false`** | this doc | **Mandatory — see B8** |
| **`REDIS_URL`** | Upstash | **Mandatory — silently falls back to localhost** if absent |

**Email deliverability:**
- [ ] Production sender domain verified (SPF, DKIM, DMARC)
- [ ] Resend domain ownership confirmed
- [ ] R2 custom domain bound for attachments

**Sync verification (mandatory):**
- [ ] Every Doppler `prd` key present in **Railway** service envs (API + worker services)
- [ ] Every Doppler `prd` key present in **Vercel** production envs (admin, client, ota)
- [ ] `NEXT_PUBLIC_*` vars confirmed at **build time** not runtime in Vercel

---

### B8. IC Payouts gate — must be explicit
**Owner:** Claude · **Effort:** 5 min (set env var) · **Blocks:** Phase 2 · **Status:** `[ ]` · **Issue:** _runbook item_

Surprise finding: IC payouts is already on `main`. Despite "deferred" classification:
- `apps/api/src/app.module.ts:259` imports `IcPayoutsModule`
- `apps/api/src/financials/commission/commission.controller.ts:51` gates legacy endpoints by `IC_PAYOUTS_V2_ENABLED`
- May 9-11 IC migrations are in `packages/database/migrations/`
- Runbook exists at `docs/runbooks/ic-payouts-cutover.md`

**Acceptance:**
- [ ] **`IC_PAYOUTS_V2_ENABLED=false` set explicitly** in Doppler `prd` (do NOT rely on default)
- [ ] Run all IC migrations as part of standard prod migration set (they ship regardless)
- [ ] Verify legacy commission endpoints work with the flag off (sanity test)
- [ ] Schedule with finance: when to flip the flag

---

### B9. Migration scope verification + apply
**Owner:** Claude · **Effort:** Half day (clone + dry-run + diff + apply) · **Blocks:** Phase 3-4 · **Status:** `[ ]` · **Issue:** _runbook item_

`main` includes MORE than the original 5 portal PRs. Treat as "apply all current main Drizzle migrations."

**Acceptance:**
- [ ] Full migration list extracted from `packages/database/migrations/` against current `main` HEAD
- [ ] Clone prod DB → run migration job against clone → verify clean exit
- [ ] Compare `drizzle.__drizzle_migrations` against Preview row-for-row at same SHA
- [ ] Apply to Tailfire-Prod only after successful clone dry-run
- [ ] Enum additions run via pre-migration `psql` step (`ALTER TYPE ADD VALUE` cannot be in transactions)
- [ ] DDL via session pooler or direct connection — **NEVER transaction pooler**
- [ ] **Recovery-script gap addressed** — the older "silent reconcile" behavior was removed (PR #335), but the project still lacks an automated path to restore drift if migration tracking gets out of sync with actual DDL. Document the manual recovery procedure in `docs/runbooks/migration-recovery.md` (new). At minimum: a script that diffs `__drizzle_migrations` against `packages/database/migrations/` and reports orphans both directions.

---

### B10. Production smoke test thinness
**Owner:** Claude · **Effort:** Half day to 1 day (per v3 changelog — Codex bumped from 2-3 hrs after scope review) · **Blocks:** Phase 6 confidence · **Status:** `[ ]` · **Issue:** _file_

`.github/workflows/deploy-prod.yml:201` only checks API health. Missing:
- OTA homepage / search
- Portal auth flow (magic-link → callback → session)
- Admin authenticated page load
- Supabase magic-link redirect chain
- `/portal/my-profile` (verifies portal scoping)
- OTA service-key proxy smoke (`/api/consumer-activity`)
- Email send (Resend transactional)
- R2 signed-URL fetch
- Stripe webhook accept

**Acceptance:**
- [ ] New `post-deploy-smoke.yml` (or inline step) with all checks above
- [ ] Fails the deploy if smoke fails (auto-revert or pin previous alias)
- [ ] Smoke test runs in <5 min total

---

### B11. TES → production data cutover
**Owner:** Al (TES creds) · Claude (script + validation) · **Effort:** 1 day · **Blocks:** Phase 5 UAT · **Status:** `[ ]` · **Issue:** _follow `docs/TES_MIGRATION_RUNBOOK.md`_

**Pre-import (W1-W5 from `project_tes_commission_mapping.md`):**
- [ ] Agent→user mapping fixed (no admin fixture fallback)
- [ ] `trip_collaborators` backfill against real agents
- [ ] `commission_adjustments` decision: carry-over balances?
- [ ] Paid-checks decision: import historical or skip?

**Import:**
- [ ] Run full 426-trip import with **mguertin TES account** (aguertin returns NULL PII)
- [ ] **Run `POST /trips/backfill-lifecycle` immediately after**
- [ ] **Run `POST /contacts/backfill-lifecycle` after the trip backfill** (separate endpoint at `apps/api/src/contacts/contact-lifecycle.controller.ts:18`)
- [ ] Validate counts: trips, activities, payment_transactions, received_checks, commissions

**Critical:** Run BEFORE DNS flip (Phase 6). Flipping DNS first exposes users to empty/partially-migrated state.

---

### B12. API typecheck governance
**Owner:** Claude · **Effort:** Half day · **Blocks:** Phase 1 (or accept as risk) · **Status:** `[ ]` · **Issue:** _file_

`pnpm --filter @tailfire/api typecheck` fails. Build passes only because Nest uses SWC (`nest-cli.json` `"typeCheck": false`). PR validation has it informational.

**Why it's a launch blocker:**
- Latent type errors won't be caught by CI
- Re-enabling `typeCheck: true` breaks Railway Docker builds until errors are fixed
- Currently masked by deploy keeping the stale container if build fails

**Acceptance:**
- [ ] Triage every API TS error: fix, suppress with reason, or accept-as-risk
- [ ] API typecheck CI step graduated to **blocking**
- [ ] Document known-good baseline for regression detection

**Alternative path:** Accept-as-risk for launch, target fix within 2 weeks post-launch. Document the accepted error count in `docs/KNOWN_ISSUES.md`.

---

### B13. Pre-launch silent failure audit
**Owner:** Claude · **Effort:** 2-3 hrs · **Blocks:** soft launch tolerance, not hard launch · **Status:** `[ ]` · **Issue:** _file_

`apps/ota/src/app/api/consumer-activity/route.ts:16` intentionally returns 204 on all failures. Acceptable for analytics. The pattern may exist in other catch-blocks that should be audited.

**Acceptance:**
- [ ] Grep all `try { ... } catch { ... }` with empty/204 catches
- [ ] For each: confirm intent is analytics, OR add Sentry breadcrumb / error capture
- [ ] Document accepted silent failures in `docs/KNOWN_ISSUES.md`

---

### B14. TES import script re-validation against current `main`
**Owner:** Claude + Al · **Effort:** 2-3 days · **Blocks:** Phase 3-4 (gating real prod data import) · **Status:** `[ ]` · **Issue:** _file_

The TES import script (`/Users/alguertin/Development/tailfire-project/scripts/migration/import-to-tailfire.ts`, **117KB, outside git**) was last validated on **2026-04-02**. Six weeks of codebase changes have happened since then — none verified compatible.

**Specific risks identified from the diff between 2026-04-02 and `origin/main @ 42d03684`:**

| Risk | Severity | Detail |
|---|---|---|
| Activity create auto-assigns trip travelers (PRs #354, #359, #366) | 🔴 HIGH | Import calls `activities.create()`; script may have its own traveler-assignment logic that races against the new `ActivityTravelerAssignmentPolicy.tryAssignAllTripTravelersToActivity` policy. Idempotent at the DB layer via `ON CONFLICT`, but script behavior unverified. |
| `PaymentScheduleLockPolicy` (PR #372) | 🔴 HIGH | TES historical data has many travelled trips. New lock policy throws `BadRequestException` on payment-schedule edits when `trip.status ∈ ('travelling', 'travelled', 'cancelled')` and actor not admin. Import will fail mid-run if it PATCHes payment-schedule fields on those trips. |
| IC payouts module on `main` (post-April 2) | 🔴 HIGH | April-2 import script almost certainly does NOT populate `ic_invoices` / `ic_disbursements` / `commission_adjustments`. With `IC_PAYOUTS_V2_ENABLED=false` this is OK for launch, but commission data will be incomplete. Decide: legacy commission only, OR backfill IC payouts schema. |
| W1-W5 fixes from `project_tes_commission_mapping.md` | 🔴 HIGH | Listed as required pre-import; current status unknown. Dev import used admin-fixture for all 426 trips. Real agents needed for prod. |
| TICO §38 gate expansion (B4) | MEDIUM | Doesn't block import (gate is on Trip Order finalization, not activity create), but imported trips may not be finalizable until B4 ships. |
| Activity `referralUrl` field (migration `20260514020444`) | LOW | Import doesn't send; field stays null. |
| Booking-detail hydration fix (#355) | LOW | Import only writes, doesn't read. |

**Acceptance:**
- [ ] Get import script into version control (copy into `tailfire/scripts/migration/` or add as git submodule — see "Risks the import script lives outside git")
- [ ] Re-run import against fresh tf-demo (preview) with current `main` codebase
- [ ] Capture every failure during the dry-run; patch the script for each
- [ ] Complete W1-W5 (real agent mapping, `trip_collaborators` backfill, `commission_adjustments` decision, paid-checks decision)
- [ ] Decide IC payouts treatment (legacy only vs backfill IC schema)
- [ ] Run `validate-import.ts` against preview, confirm counts match expected
- [ ] Update compatibility table in `docs/TES_MIGRATION_RUNBOOK.md` through `2026-05-15`
- [ ] Document any newly-discovered import gotchas in the runbook

**Risks the import script lives outside git:**
- No audit trail for changes since April 2
- No PR review on the script logic
- Coordination risk if multiple people edit the local copy
- Recovery risk if the script disk is lost
- **Recommendation:** copy into the repo at `tailfire/scripts/migration/` even if it's normally invoked from the outer directory. Provides version control without changing the invocation flow.

---

## 🟡 STRONGLY RECOMMENDED — Track but Not Blocking

### Monitoring & Observability
- [ ] Sentry production project (separate DSN from dev/preview)
- [ ] Sentry alert rules: error-level + ingest spikes + new-issue alerts
- [ ] Sentry source maps uploaded from CI (all 3 frontends + API)
- [ ] Uptime monitoring (BetterStack/Pingdom) on API health + each frontend
- [ ] Log retention policy decided
- [ ] Vercel Analytics + Web Vitals enabled

### Email Infrastructure
- [ ] Agency-level IMAP/SMTP credentials in Doppler `prd` (per-agent, not just dev fixture)
- [ ] R2 custom domain bound for production attachments
- [ ] Transactional templates audited: magic link, welcome, payment receipt, invoice, portal message notification
- [ ] Email Lazy Sync verified against prod Microsoft 365 / Gmail accounts

### Performance
- [ ] Vercel function size limits checked (admin bundle is the largest)
- [ ] Image optimization on OTA hero images / destination cards
- [ ] DB indexes verified for production query patterns (`consumer_activity`, `portal_messages`, `trip_orders`)
- [ ] Postgres pool sized appropriately (see Gotchas)
- [ ] Upstash plan sized for production command volume

### Soft Launch / UAT
- [ ] 2+ real agents test full booking flow end-to-end
- [ ] 3+ real consumers test register → board → submit → portal experience
- [ ] Magic link delivery from prod email infra (not localhost)
- [ ] Payment flow tested with real Stripe + immediate refund
- [ ] Mobile responsive audit (iOS Safari + Android Chrome)
- [ ] At least one full TICO-compliant invoice generated and reviewed
- [ ] Cross-subdomain SSO tested **between consumer-facing surfaces** (sign in on OTA → access portal as client). ⚠️ **Note:** admin Supabase cookies are currently host-only (`apps/admin/src/middleware.ts`) — "sign in on admin → access portal as agent" is NOT a valid acceptance test unless `COOKIE_DOMAIN` is intentionally changed on the admin app. Codex retrospective 2026-05-15.

---

## 🟢 KNOWN DEFERRED (Post-Launch Backlog)

- Social login (Google + Apple) — magic-link-first launch does not require this
- Dashboard Booked Sales + Departed Sales metrics
- Calendar event priority ordering
- Flight Tracking & Alerts (AeroDataBox)
- Destination Mapping Layer (IATA, geocoding, Amadeus city codes)
- Vacation Package Library UI polish
- AI Concierge deferred items (cross-session memory, RAG, better destination matching)

**No longer deferred (promoted to blockers):**
- ~~API silent failure audit~~ → **B13**
- ~~feature/ic-commission-payouts branch~~ → **B8** (already on `main`)

---

## ⚠️ Project-Specific Gotchas (Code-Verified)

### Redis / BullMQ
- **`REDIS_URL` is mandatory in prod.** API falls back to localhost when absent (`apps/api/src/automation/automation.module.ts:52`).
- **Upstash supports BullMQ**, but their docs warn about command-volume cost. Use fixed plan, not pay-per-command.
- Codebase already distrusts Upstash delayed jobs for email sync (`apps/api/src/email-accounts/email-sync-scheduler.service.ts:11`). Use `setInterval` for recurring tasks.
- **Smoke-test every queue:** notifications, document render, vacation search, OCR, IC payout (even if IC gated off).

### Postgres Connection Pooling
- Pool defaults to `max: 10` per API instance (`packages/database/src/client.ts:29`).
- Confirm: `Railway instance count × 10 ≤ Supabase prod connection limit`.
- Use **session pooler or direct** for app runtime. **NEVER transaction pooler for migrations.**

### Cookies & SSO
- Cross-subdomain Supabase cookies wired via `COOKIE_DOMAIN`.
- **OTA anonymous cookies are host-only** (`apps/ota/src/middleware.ts:23`). If apex strategy ever changes from subdomain to apex, plan session/ref attribution migration.

### Build vs Runtime
- `nest-cli.json` uses SWC with `"typeCheck": false`.
- Setting `typeCheck: true` breaks Railway Docker builds while TS errors exist (see B12).

---

## ✅ Cutover Sequence (Codex-Validated)

**Critical rule: TES import BEFORE DNS flip. Never the reverse.**

1. Freeze prod writes/imports. Take a restorable prod DB backup.
2. Clone prod DB to staging. Run exact `main` migration job against clone.
3. Compare `__drizzle_migrations`, enum labels, key table counts, representative portal/commission queries against Preview at same SHA.
4. **Configure Supabase redirects, Vercel envs, Railway envs, R2 buckets, Stripe webhooks, email sender, `COOKIE_DOMAIN`.** ⚠️ **Order corrected per Codex 2026-05-15:** envs must be configured BEFORE deploy so the deployment can verify them. Prior version had this step after deploy — wrong order.
5. Deploy API/apps to production infrastructure behind non-public URLs (`vercel --prod --skip-domain`).
6. Re-validate env configuration AFTER deploy (smoke probes against alias).
7. **Run B14 TES dry-run on the prod clone first**, then run TES full import to prod → validate → `/trips/backfill-lifecycle` → `/contacts/backfill-lifecycle`.
8. UAT on production aliases with real agents and real consumer accounts.
9. **Flip DNS / custom domains last.**

---

## Sources & References

### External
- [TICO Disclosure & Invoicing Guidelines](https://tico.ca/travel-professionals/resources-guidelines/disclosure-invoicing.html)
- [TICO Guidelines PDF (Aug 2016)](https://www.tico.ca/files/Disclosure%20and%20Invoicing%20Guidelines-August2016-Final.pdf)
- [OPC: Online Privacy, Tracking, and Cookies](https://www.priv.gc.ca/en/privacy-topics/technology/online-privacy-tracking-cookies/)
- [Upstash BullMQ Integration](https://upstash.com/docs/redis/integrations/bullmq)
- [Vercel Deploy CLI](https://vercel.com/docs/cli/deploy)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)

### Internal runbooks
- `docs/runbooks/ic-payouts-cutover.md`
- `docs/TES_MIGRATION_RUNBOOK.md`
- `docs/DEPLOYMENT_API.md`
- `docs/ENVIRONMENTS.md`

---

## Changelog

- **2026-05-15 (v3 — Codex second-opinion + TES gap)** — Codex SMALL FIXES verdict applied: phases 0+1 marked parallel-able, cutover steps 4-5 reordered (envs BEFORE deploy), effort estimates bumped (B2 30-45min→2-4hr, B4 2-4hr→1 day, B10 2-3hr→half-day to 1 day, B12 governance gap reframed), top-3 longest pole updated (replaced "domain decision" with "prod auth/email/env/smoke readiness"). Added: TICO registration drift to B4, migration recovery-script gap to B9, `my.` vs `client.` portal hostname sub-decision to B5, admin Supabase cookies are host-only caveat on cross-subdomain SSO UAT. **NEW BLOCKER B14** added: TES import script (lives outside git, last validated 2026-04-02) must be re-validated against current `main` before prod import — six weeks of changes including IC payouts module, traveler auto-assign policy, payment-schedule lock policy. Launch window updated 7-10 → 8-12 working days.
- **2026-05-15 (v2 — operational tracker)** — Reformatted as operational tracker with phase plan, owner/effort/dependency tracking per blocker, soft-launch path documented, 3 longest-pole items called out, recommendation on apex vs subdomain decision (Option B for launch).
- **2026-05-15 (v1 — initial)** — First draft validated against `origin/main @ 42d03684` via Codex review. 13 code-backed blockers, revised cutover sequence (TES import before DNS flip), project gotchas section.
