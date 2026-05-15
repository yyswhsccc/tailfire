# Doppler `prd` Audit — Production Launch (B7)

Snapshot taken via Doppler MCP `secrets_names(project: "tailfire", config: "prd")` on **2026-05-15**. Compare against the requirements list in `docs/PRODUCTION_LAUNCH_PUNCHLIST.md` B7.

This file is read-only — it tells you what's there and what's missing. **Writing to `prd` requires Al's explicit confirmation per CLAUDE.md.**

---

## ✅ Already in `prd` (verified present)

| Punchlist requirement | Doppler key(s) | Notes |
|---|---|---|
| `DATABASE_URL` | `DATABASE_URL` | ✅ |
| `SUPABASE_URL` | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | ✅ both server + Next public |
| `SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ both surfaces |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `SUPABASE_JWT_SECRET` | `SUPABASE_JWT_SECRET` | ✅ (verify it's the prod project's, not dev's — past incident pattern) |
| R2 (Cloudflare) | `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_BUCKET_NAME`, `R2_MEDIA_BUCKET`, `R2_MEDIA_PUBLIC_URL` | ✅ all 6 keys present |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN_API`, `SENTRY_DSN_ADMIN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ENVIRONMENT`, `SENTRY_ORG`, `SENTRY_PROJECT_API`, `SENTRY_PROJECT_ADMIN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | ✅ comprehensive |
| Amadeus | `AMADEUS_API_URL`, `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` | ✅ |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | ✅ |
| Stripe | `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` | ✅ (verify these are LIVE keys, not test) |
| Redis | `REDIS_URL` | ✅ — code falls back to localhost when absent (`apps/api/src/automation/automation.module.ts:52`) so this MUST be set |
| Encryption | `ENCRYPTION_KEY` | ✅ |
| OTA service-key proxy | `OTA_SERVICE_KEY`, `CATALOG_API_KEY`, `INTERNAL_API_KEY` | ✅ |
| Cookie/CORS / app URLs | `ADMIN_URL`, `API_URL`, `CLIENT_PORTAL_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLIENT_URL`, `OTA_REVALIDATION_URL`, `REVALIDATION_SECRET` | ✅ |
| MFA | `MFA_REQUIRED`, `NEXT_PUBLIC_MFA_REQUIRED` | ✅ |
| Cruise (Traveltek FusionAPI) | `TRAVELTEK_API_URL`, `TRAVELTEK_USERNAME`, `TRAVELTEK_PASSWORD`, `TRAVELTEK_SID`, `TRAVELTEK_FTP_HOST`, `TRAVELTEK_FTP_USER`, `TRAVELTEK_FTP_PASSWORD` | ✅ — punchlist's "FUSION_API_KEY" is the same provider, exposed via these 4 keys |
| Vacation pricing (Softvoyage) | `SOFTVOYAGE_VCO_ALIAS`, `SOFTVOYAGE_VCO_BASE_URL`, `SOFTVOYAGE_VCO_CODE_AG`, `VACATION_*` cache flags | ✅ |
| Other API providers | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `UNSPLASH_ACCESS_KEY`, `GOOGLE_PLACES_API_KEY`, `AERODATABOX_RAPIDAPI_KEY` | ✅ |
| CI/deploy infra | `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_*_PROJECT_ID`, `GITHUB_TOKEN`, `GITHUB_REPO_*` | ✅ |
| Sync flags | `ENABLE_SCHEDULED_CRUISE_SYNC`, `ENABLE_VACATION_CATALOG_SYNC`, `ENABLE_VACATION_LIVE_PRICING` | ✅ |

---

## ❌ Missing — required by punchlist

These keys are NOT in `prd` today and **must be added before Phase 2 → Phase 6 launch**.

### B2 (registration throttling + CAPTCHA) — required for stg AND prd
| Key | Value | Required because |
|---|---|---|
| `TURNSTILE_SECRET` | _Cloudflare Turnstile site secret_ | API verifies CAPTCHA tokens. Without this, `TurnstileService` startup throws when `NODE_ENV=production` (B2 PR #382 fail-closed). |
| `TURNSTILE_REQUIRED` | `true` | Strict-mode flag. Mistype (`yes`, `1`, etc.) also throws on startup per Codex review. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | _Cloudflare Turnstile site key_ | OTA build-time. Without this, `email-capture-modal.tsx` throws at module load on production builds (Codex small-fix). |

### B8 (IC payouts gate) — required to keep legacy commission path active
| Key | Value | Required because |
|---|---|---|
| `IC_PAYOUTS_V2_ENABLED` | `false` | IC payouts module is on `main`. Without this var explicitly set, runtime behavior depends on the default — code reviews differ. **Set explicitly per B8 acceptance.** |

### Punchlist mentioned but possibly redundant
| Punchlist key | Status | Recommendation |
|---|---|---|
| `DIRECT_URL` | NOT in `prd` | The `DATABASE_URL` is the session-pooler URL (`deploy-prod.yml:22-34` enforces port-5432). If migrations need a separate direct connection, add `DIRECT_URL`. Otherwise this is a no-op. **Verify with Al.** |
| `JWT_SECRET` | NOT as standalone key | `SUPABASE_JWT_SECRET` exists. Confirm with Al that the codebase only reads the Supabase-prefixed name (current grep shows yes). |
| `COOKIE_DOMAIN` | NOT in `prd` | Required for cross-subdomain SSO. **Critical for B5 + portal SSO.** Set to `.phoenixvoyages.ca` (with leading dot) once B5 domain decision is locked. |
| `SERP_API_KEY` (TripAdvisor enrichment) | NOT in `prd` | Codebase reads via `apps/api/src/vacation-enrichment/`. If TripAdvisor enrichment is launching in Phase 1, set it. Otherwise non-blocking. **Confirm with Al.** |

---

## 🔁 Doppler → Railway / Doppler → Vercel sync

Per CLAUDE.md ⚠️ section: **there is NO automatic sync.** Whenever a key is added, edited, or removed in Doppler `prd`, the corresponding Railway/Vercel environments must be updated **manually**.

After resolving the missing keys above, run the verification workflow per the CLAUDE.md "Doppler/Railway sync" section:
- For Railway (API): `railway environment production && railway service api-prod && railway variables --kv | grep <KEY>`
- For Vercel (admin/ota/client): Vercel dashboard → project → Settings → Environment Variables → ensure each `NEXT_PUBLIC_*` is set at **build time** (not runtime).

Critical pairs to verify:
- `DATABASE_URL` (must point to Tailfire-Prod project ref `cmktvanwglszgadjrorm`)
- `SUPABASE_URL` (must point to `https://cmktvanwglszgadjrorm.supabase.co`)
- `SUPABASE_JWT_SECRET` (must be the prod project's JWT, not dev/preview's — past 401 incidents traced to this)

---

## ✉️ Email deliverability spot-checks (not in Doppler, but required for B7)

These aren't keys but are part of B7 acceptance:
- [ ] Production sender domain verified in Resend (SPF, DKIM, DMARC)
- [ ] Resend domain ownership confirmed
- [ ] R2 custom domain bound for attachments (the `R2_MEDIA_PUBLIC_URL` should be a Phoenix Voyages-controlled hostname, not `*.r2.cloudflarestorage.com`)

---

## How to apply this checklist

1. Read this doc top-to-bottom.
2. For each ❌ row, decide: add now, defer, or remove from punchlist.
3. Use Doppler MCP (`mcp__doppler__secrets_update`) to add the keys. **Confirm each write with the user before executing.**
4. Sync the same key + value to Railway (`railway variables --set`) and Vercel (dashboard or `vercel env add`).
5. Re-run this audit after all changes: `mcp__doppler__secrets_names(project: "tailfire", config: "prd")` and diff against the punchlist B7 requirements list.
6. Mark B7 `[~]` → `[x]` in `docs/PRODUCTION_LAUNCH_PUNCHLIST.md` once all keys are in place AND the sync verification passes.
