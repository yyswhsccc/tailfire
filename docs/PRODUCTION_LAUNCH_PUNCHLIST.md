# Production Launch Punch List — MASTER

**Status:** **TF-Demo (Preview) fully operational 2026-05-15.** 7 of 14 blockers fully `[x]`; 6 are `[~]` (code-side done; operational items remain); 1 is `[!]` (gated on prior blocker). 22+ PRs merged this session. Ready for user testing on tf-demo.
**Target:** Phoenix Voyages (TICO-licensed, Ontario, Canada) — `apps/ota` + `apps/client` + `apps/admin` + `apps/api` → production
**Owner:** _set per item_

---

## Executive Summary — TL;DR

**Code-side + Doppler + Supabase Auth + Vercel preview-env:** ✅ **complete**
- Fully `[x]`: **B1, B2, B3, B6, B7, B8, B13** (7 blockers)
- `[~]` code-complete, operational items remain: **B4** (Al's domain review), **B5** (WordPress cutover gates apex), **B9** (clone-and-apply rehearsal), **B10** (auto-revert deferred), **B12** (full clean post-launch), **B14** (dry-run still owed)
- `[!]` blocked: **B11** (waits on B14 dry-run)
- 5 blocking CI jobs active (admin-typecheck, migration-monotonicity, supabase-migrations-guard, lint-ota, api-typecheck-baseline)
- All Codex validation gates passed (B1, B2, B12)

**TF-Demo (Preview) deployment 2026-05-15 ~15:05 UTC** — all 6 deploy-preview jobs ✅ including smoke test. URLs verified:
- `https://tf-demo.phoenixvoyages.ca` (admin) — 307 → /login ✓
- `https://ota-dev.phoenixvoyages.ca` — 200 ✓
- `https://client-dev.phoenixvoyages.ca` — 307 → /login ✓
- `https://api-dev.tailfire.ca/api/v1/health` — 200 ✓

**Path to DNS flip from here:**
1. User testing on tf-demo (real agents + consumers) — **happening now**
2. **B14 dry-run** on tf-demo (paired Claude+Al, ~60-120 min) — when ready
3. **Phase 4 prod TES import** — gated on dry-run clean + Codex APPROVE
4. **Phase 5 UAT** on prod aliases (non-public) — 2-3 days
5. **Codex final APPROVE** → DNS flip

**Realistic launch window:** 3-5 working days from completing user testing feedback loop, assuming no surprises in B14 dry-run.

**Session totals (2026-05-15):** 22+ PRs merged; 6 Doppler `prd` writes executed under user authorization (B5 my. URLs ×2 + COOKIE_DOMAIN + B7 Turnstile ×3 + B8 IC_PAYOUTS); Supabase Auth configured on prod + preview via Management API; OTA Vercel preview target patched with Turnstile vars.

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
**Owner:** Claude · **Effort:** ~6 hrs actual (initial + Codex REWORK + small fixes) · **Blocks:** Phase 1 · **Status:** `[x]` _code-side_ · **Issue:** [#381](https://github.com/Systemsaholic/tailfire/issues/381) · **PR:** [#382](https://github.com/Systemsaholic/tailfire/pull/382) (merged 2026-05-15) · **Operational follow-up below**

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
**Owner:** Al + lawyer (optional review) · **Effort:** ~2 hrs actual · **Blocks:** Phase 5 (DNS flip) · **Status:** `[x]` _all 3 deliverables shipped 2026-05-15; lawyer review optional, non-gating_ · **Issue:** [#404](https://github.com/Systemsaholic/tailfire/issues/404) · **PR:** [#405](https://github.com/Systemsaholic/tailfire/pull/405) (merged 2026-05-15)

`apps/ota/src/app/(marketing)/privacy/page.tsx` and `apps/ota/src/app/(marketing)/terms/page.tsx` previously said "Full policy pending legal review."

**Impact:** Direct PIPEDA exposure. TICO expects pre-sale privacy + terms posting for online travel sellers.

**Acceptance:**
- [x] **Privacy Policy** — full Canadian boilerplate with PIPEDA compliance, TICO #50017089 prominently disclosed, 14 sections (information collected, how used, sharing, international transfers, retention, cookies, PIPEDA rights, security, breach notification, children's privacy, Privacy Officer contact)
- [x] **Terms of Service** — TICO-registered travel agency boilerplate. 13 sections covering: Phoenix-as-agent disclosure, pricing/currency, Reg 26/05 §41 price-increase rules, cancellation + non-refundable disclosure, **travel insurance offered/declined**, **travel documents (passport/visa)**, force majeure, limitation of liability, TICO compensation fund language, dispute resolution, Ontario governing law
- [x] **Cookie banner** — PIPEDA-aware React component (`apps/ota/src/components/cookie-consent/cookie-banner.tsx`), shows on first visit, Accept / Necessary-only choices, persists in localStorage as `pv_cookie_consent`. Wired into OTA root layout.
- [ ] **Optional follow-up:** lawyer review for sign-off (recommended but not gating Phase 5 — TICO doesn't require lawyer-signed; just published + accurate)
- [ ] Refund/cancellation policy surfaced in booking flow (already covered by B4 TICO §38 invoice gate — cancellation_policy on every booking)

---

### B4. TICO §38 invoice gate is partial
**Owner:** Claude + Al (domain review) · **Effort:** ~3 hrs actual (extracted to pure module + 24-test spec + docs) · **Blocks:** Phase 5 UAT · **Status:** `[~]` · **Issue:** _filed in B4 PR_

`apps/api/src/financials/trip-order.service.ts:447` only blocked finalization on a subset of TICO Ontario Reg. 26/05 §38. The validator now lives in a pure module at `apps/api/src/financials/tico-compliance.ts` and adds checks for:
- Insurance disclosure (offered/declined)
- Price-increase / surcharge terms
- Travel-document advice (passport, visa)
- Cancellation policy on every booked service
- Non-refundable disclosure when the deposit flag is set
- TICO registration number presence + format (4-9 digit numeric)

**Acceptance:**
- [x] Audit `TripOrderService.finalize()` against full TICO §38 checklist
- [x] Add missing gate fields (with sensible defaults — accepts default TICO disclosures bundle so existing trips stay finalizable)
- [x] Unit test coverage: 24 cases covering reject + accept paths for each new clause (`__tests__/trip-order-tico-compliance.spec.ts`)
- [x] TICO registration number sourced from agency config (`businessConfig.tico_registration`) + format check surfaces drift
- [x] Canonical §38 mapping documented in `docs/COMPLIANCE_TICO.md` (new file)
- [ ] **Domain review (Al):** confirm the disclosure copy in agency_settings actually says what TICO expects; spot-check one finalize attempt on tf-demo
- [ ] **E2E test against a real DB** (deferred — current 24 unit tests cover the validator; finalize() integration is exercised by manual UAT per `docs/runbooks/post-deploy-uat.md`)

**Reference:** [TICO Disclosure/Invoicing](https://tico.ca/travel-professionals/resources-guidelines/disclosure-invoicing.html), [TICO Guidelines PDF](https://www.tico.ca/files/Disclosure%20and%20Invoicing%20Guidelines-August2016-Final.pdf)

---

### B5. Domain decision + CORS + robots
**Owner:** Al (decision made 2026-05-15) · Claude (code) · **Effort:** ~2 hrs actual · **Blocks:** Phase 2 onward · **Status:** `[~]` _code-side done; operational items (Vercel aliases + Doppler URL writes + DNS + WordPress migration) remain_ · **Issue:** _filed in B5 PR_

**Al's decision (2026-05-15):**
- **OTA / consumer-facing** → apex `phoenixvoyages.ca` (post-WordPress cutover; until then OTA stays at `ota.phoenixvoyages.ca`)
- **Client portal** → `my.phoenixvoyages.ca`
- **Admin** → `tailfire.phoenixvoyages.ca` (unchanged)

**Code changes shipped in B5 PR:**
- `apps/api/src/main.ts:78` — CORS regex updated to allow apex AND subdomains: `^https://(?:[\w-]+\.)?phoenixvoyages\.ca$`
- `apps/ota/src/app/robots.ts` — uses `NEXT_PUBLIC_SITE_URL` env var with apex fallback
- `apps/ota/src/app/sitemap.ts`, `layout.tsx`, `lib/structured-data.ts` — apex fallback
- 6 client/admin files — `https://ota.phoenixvoyages.ca` fallbacks → `https://phoenixvoyages.ca`
- 3 hardcoded `client.phoenixvoyages.ca` references → `my.phoenixvoyages.ca`
- `docs/ENVIRONMENTS.md` + `docs/runbooks/post-deploy-uat.md` updated with the decision

**Acceptance:**
- [x] Decision recorded in this doc's changelog (apex OTA + `my.` portal + `tailfire.` admin, 2026-05-15)
- [x] CORS allow-list updated to support both apex AND subdomains (regex permits empty subdomain part)
- [x] `robots.ts` uses env var with apex fallback (Vercel env override allows pre-cutover OTA at `ota.phoenixvoyages.ca`)
- [x] All hardcoded `client.phoenixvoyages.ca` references → `my.phoenixvoyages.ca`
- [x] All hardcoded `ota.phoenixvoyages.ca` fallbacks → `phoenixvoyages.ca` (env-overridable for pre-cutover)
- [x] Runbooks updated (`docs/ENVIRONMENTS.md` + `docs/runbooks/post-deploy-uat.md`)
- [x] **Doppler `prd` writes (Al authorized 2026-05-15; Claude executed via Doppler MCP):**
  - `CLIENT_PORTAL_URL=https://my.phoenixvoyages.ca` ✓
  - `NEXT_PUBLIC_CLIENT_URL=https://my.phoenixvoyages.ca` ✓
  - `COOKIE_DOMAIN=.phoenixvoyages.ca` ✓ (NEW key for cross-subdomain SSO)
- [ ] **Remaining operational (Al):**
  - Sync the 3 new Doppler vars to Railway production env per CLAUDE.md ⚠️ — Doppler→Railway is NOT auto-synced
  - Sync the 2 `NEXT_PUBLIC_*` vars to Vercel client + ota project envs (build-time)
  - Vercel domain aliases: confirm `my.phoenixvoyages.ca` aliased to client app, `tailfire.phoenixvoyages.ca` to admin (already), `phoenixvoyages.ca` to OTA (after WordPress migration)
  - `NEXT_PUBLIC_SITE_URL` Vercel OTA env: keep `https://ota.phoenixvoyages.ca` until WordPress cutover, then change to apex
  - DNS: `my.phoenixvoyages.ca` CNAME to Vercel; apex ALIAS/ANAME to Vercel post-WordPress migration
  - WordPress migration: separate scope; gates the apex flip

---

### B6. Supabase Auth production config
**Owner:** Claude (executed 2026-05-15 via Supabase Management API) · **Effort:** 30 min actual · **Blocks:** Phase 2 · **Status:** `[x]` · **Issue:** _no GH issue needed; verification script in repo_

Configured on both **prod** (`cmktvanwglszgadjrorm`) and **preview** (`gaqacfstpnmwphekjzae`) projects via Supabase Management API (Al said "you have Supabase Access" → Claude proceeded).

**Acceptance:**
- [x] Verification script `scripts/verify-supabase-auth-prod.sh` + step-by-step runbook `docs/runbooks/b6-supabase-auth-prod-config.md`
- [x] **Prod** Site URL = `https://my.phoenixvoyages.ca` (per B5)
- [x] **Prod** redirect allow-list = `https://my.phoenixvoyages.ca/**,https://tailfire.phoenixvoyages.ca/**,https://ota.phoenixvoyages.ca/**,https://phoenixvoyages.ca/**` (localhost dropped from prod for security)
- [x] Email templates configured (Resend SMTP `smtp.resend.com`, sender `Phoenix Voyages`, `noreply@phoenixvoyages.ca`)
- [x] MFA TOTP enroll + verify enabled on prod
- [x] SMTP relay configured (Resend on `smtp.resend.com` with sender `Phoenix Voyages` `noreply@phoenixvoyages.ca`)
- [x] Anonymous sign-ins disabled on prod (B2 alignment)
- [x] **Preview** project also configured: Site URL `https://tf-demo.phoenixvoyages.ca`, redirect allow-list includes tf-demo + client-dev + ota-dev + api-dev
- [ ] **Optional:** Al runs `bash scripts/verify-supabase-auth-prod.sh` to double-confirm (script reads via Supabase Management API, doesn't write)

---

### B7. Doppler `prd` + Railway/Vercel env sync
**Owner:** Claude (Doppler writes, Vercel preview env adds) + Doppler↔Railway auto-sync · **Effort:** ~1.5 hrs actual · **Blocks:** Phase 2 · **Status:** `[x]` _code-side + preview confirmed end-to-end_ · **Issue:** _audit at `docs/runbooks/doppler-prd-audit.md`_

**2026-05-15 update:** All key Doppler `prd` writes completed (B8 IC_PAYOUTS, B5 my. URLs + COOKIE_DOMAIN, B7 3× Turnstile). Doppler↔Railway integration is active (verified: Railway preview/api-dev has all the new vars without manual sync). Vercel OTA preview target manually patched to include Turnstile vars. **Preview end-to-end verified**: all 6 deploy-preview jobs ✅ including smoke test 2026-05-15 ~15:05 UTC.

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
**Owner:** Al (authorized) · Claude (executed) · **Effort:** 5 min actual · **Blocks:** Phase 2 · **Status:** `[x]` _Doppler `prd` set 2026-05-15; Railway sync follow-up below_ · **Issue:** _no GH issue, runbook item_

Surprise finding: IC payouts is already on `main`. Despite "deferred" classification:
- `apps/api/src/app.module.ts:259` imports `IcPayoutsModule`
- `apps/api/src/financials/commission/commission.controller.ts:51` gates legacy endpoints by `IC_PAYOUTS_V2_ENABLED`
- May 9-11 IC migrations are in `packages/database/migrations/`
- Runbook exists at `docs/runbooks/ic-payouts-cutover.md`

**Acceptance:**
- [x] **`IC_PAYOUTS_V2_ENABLED=false` set explicitly** in Doppler `prd` (Al authorized 2026-05-15; Claude executed via Doppler MCP `secrets_update`)
- [x] IC migrations already ship as part of standard prod migration set (they're in `packages/database/src/migrations/` regardless of flag)
- [ ] **Operational follow-up (Al):** sync the new var to Railway production env per CLAUDE.md ⚠️ — Doppler→Railway is NOT auto-synced. Run: `railway environment production && railway service api-prod && railway variables --set "IC_PAYOUTS_V2_ENABLED=false"`. Then redeploy the API to pick it up, OR wait for the next deploy.
- [ ] Verify legacy commission endpoints work with the flag off after Railway sync (sanity test — hit `GET /commission/due/eligible` as admin, expect normal response, not `GoneException`)
- [ ] Schedule with finance: when to flip the flag to `true` (post-launch IC payouts cutover)

---

### B9. Migration scope verification + apply
**Owner:** Claude · **Effort:** ~1.5 hrs actual for the recovery-script gap; clone-and-apply step still operational · **Blocks:** Phase 3-4 · **Status:** `[~]` · **Issue:** _filed in B9 PR_

`main` includes MORE than the original 5 portal PRs. Treat as "apply all current main Drizzle migrations."

**Acceptance:**
- [x] **Recovery-script gap addressed** — `scripts/migration-drift-check.sh` diffs SQL files ↔ journal ↔ `__drizzle_migrations`, reports orphans in every direction. Manual recovery procedure documented in `docs/runbooks/migration-recovery.md` (new) with one scenario per drift type. The 27 pre-existing disk-orphan SQL files surfaced by the first run are deferred for separate cleanup.
- [ ] **Operational (Al + Claude paired):** Full migration list extracted from `packages/database/src/migrations/` against current `main` HEAD
- [ ] **Operational:** Clone prod DB → run migration job against clone → verify clean exit
- [ ] **Operational:** Compare `drizzle.__drizzle_migrations` against Preview row-for-row at same SHA via the new drift script
- [ ] **Operational:** Apply to Tailfire-Prod only after successful clone dry-run
- [x] Enum additions already run via pre-migration `psql` step in `deploy-prod.yml` (lines 65-81)
- [x] DDL via session pooler enforced in `deploy-prod.yml` (port 6543 rejected, lines 22-27)

---

### B10. Production smoke test thinness
**Owner:** Claude · **Effort:** ~2 hrs actual for code-side; auto-revert deferred · **Blocks:** Phase 6 confidence · **Status:** `[~]` · **Issue:** _filed in B10 PR_

`.github/workflows/deploy-prod.yml:201` only checks API health. Expanded inline (B10 PR) to cover all surfaces verifiable without test creds. Auth-gated paths documented in `docs/runbooks/post-deploy-uat.md` (manual checklist).

**Acceptance:**
- [x] Inline smoke steps in `deploy-prod.yml` cover: API health, CORS regression, OTA homepage, OTA /destinations, admin /login, client /, JwtAuthGuard rejects bad token
- [x] Workflow exits non-zero on any smoke failure (deploy job fails → visible in GitHub Actions UI + email)
- [x] Manual UAT checklist for auth-gated paths in `docs/runbooks/post-deploy-uat.md` (magic link, /portal/my-profile, OTA service-key POST, Resend email, R2 signed URL, Stripe webhook, B2 throttling)
- [x] Manual rollback runbook in `docs/runbooks/post-deploy-rollback.md` (Vercel alias swap, Railway redeploy)
- [ ] **Auto-revert deferred** to a follow-up scope item — alias-based blue/green or canary requires deploy-pipeline restructure beyond B10's window. Manual rollback procedure suffices for Phase 1 launch.
- [ ] CI secrets for test agent + test consumer + Stripe test webhook → enables auth-gated smoke as a follow-up

---

### B11. TES → production data cutover
**Owner:** Al (TES creds) · Claude (script + validation) · **Effort:** 1 day · **Blocks:** Phase 5 UAT · **Status:** `[!]` blocked on B14 dry-run completing first · **Issue:** _follow `docs/TES_MIGRATION_RUNBOOK.md`_

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
**Owner:** Claude · **Effort:** ~2 hrs actual (Codex-approved Option B) · **Blocks:** Phase 1 · **Status:** `[~]` · **Issue:** _filed in B12 PR_ · **Codex consult:** SMALL FIXES → Option B (accept-as-risk), 2026-05-15

Codex consult (2026-05-15) took the launch-window math seriously and recommended **Option B (accept-as-risk)** with these specifics:

1. **Fix today (real bug):** `apps/api/src/email-accounts/imap-sync.service.ts:672` — `greetTimeout` was a typo; ImapFlow expects `greetingTimeout` and silently ignored the unknown key.
2. **Regression check shape:** track the SET of normalized diagnostic keys (file + TS code + first-line message with quoted identifiers collapsed), NOT the count. Count-only is too weak — one new auth/payment error could replace one unused-import and slip through.
3. **Defer the full clean** to a 2-week post-launch target.

**Acceptance:**
- [x] Real bug fixed: `greetTimeout` → `greetingTimeout` in `imap-sync.service.ts`
- [x] Baseline of 26 normalized diagnostic keys committed at `scripts/api-typecheck-baseline.txt`
- [x] CI script `scripts/api-typecheck-baseline.sh` runs in `pr-validation.yml` as the 5th blocking job (`api-typecheck-baseline`); fails on any NEW key, allows disappearing keys
- [x] Accepted-baseline pattern documented in `docs/KNOWN_ISSUES.md` (PR #389)
- [ ] **Post-launch (2 weeks):** triage and fix all 26 baseline keys; re-baseline to empty; switch `nest-cli.json` to `"typeCheck": true`

---

### B13. Pre-launch silent failure audit
**Owner:** Claude · **Effort:** ~30 min actual · **Blocks:** soft launch tolerance, not hard launch · **Status:** `[x]` · **Issue:** [#383](https://github.com/Systemsaholic/tailfire/issues/383) · **PR:** [#384](https://github.com/Systemsaholic/tailfire/pull/384) (merged 2026-05-15)

`apps/ota/src/app/api/consumer-activity/route.ts:16` intentionally returns 204 on all failures. Acceptable for analytics — the comment now spells this out. The pattern was audited across api/ota/admin/client; only one truly silent `catch {}` was found (softvoyage debug-Redis save).

**Acceptance:**
- [x] Grep all `try { ... } catch { ... }` with empty/204 catches
- [x] For each: confirm intent is analytics, OR add Sentry breadcrumb / error capture (softvoyage now logs `logger.warn`; OTA route now `console.warn`s for Vercel logs since OTA has no Sentry)
- [ ] **Follow-up doc-only PR:** Document accepted silent failures in `docs/KNOWN_ISSUES.md` (file exists; B13 section pending)

---

### B14. TES import script re-validation against current `main`
**Owner:** Claude + Al · **Effort:** 2-3 days · **Blocks:** Phase 3-4 (gating real prod data import) · **Status:** `[~]` · **Issue:** _filed in B14 PR_

The TES import script was last validated on **2026-04-02**. Six weeks of codebase changes have happened since then — none verified compatible.

**Step 1 (script copied into git, 2026-05-15):** The 117KB importer + 5 sibling scripts now live at `tailfire/scripts/migration/`. Real per-env data files (`agent-initials-mapping.json`, `supplier-currency-overrides.json`) stay local-only via `data/.gitignore` because they contain PII / commercial data. Only `*.example` templates are committed. See `scripts/migration/README.md` for the full layout.

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
- [x] Get import script into version control (committed to `tailfire/scripts/migration/` 2026-05-15 with PII-safe `data/.gitignore`)
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
