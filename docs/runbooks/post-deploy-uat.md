# Post-Deploy UAT Manual Checklist

Auth-gated and externally-side-effecting paths that the CI smoke check
(`.github/workflows/deploy-prod.yml`) cannot exercise without test
credentials. Run this after every prod deploy until UAT credentials are
wired into CI secrets.

Checklist time budget: ~15 min.

---

## Required test accounts

| Account | Purpose | Where to get |
|---|---|---|
| Test agent | Admin login | A staging-only Phoenix Voyages user provisioned for smoke. Do NOT use a real agent's account. |
| Test consumer | Portal login | A test-only @phoenixvoyages.ca address that won't break analytics. |
| Stripe test webhook | Webhook accept | Stripe dashboard → Webhooks → "Send test event" |

---

## Magic-link request → callback → session
1. Go to https://my.phoenixvoyages.ca (or the consumer portal hostname)
2. Submit the test consumer email
3. Confirm the magic-link email arrives within ~30s (check Resend dashboard if not)
4. Click the link
5. Verify it redirects to the portal home with an authenticated session
6. Check Sentry for any auth errors from the last 5 min

## /portal/my-profile (portal scoping verifier)
1. While signed in as the test consumer, hit `/portal/my-profile`
2. Confirm the page renders with the test consumer's data
3. Open dev tools → Network → check the underlying API request returns the
   correct contact (NOT another contact's data)
4. **If wrong contact returns:** stop, this is a B1-style cross-agency leak,
   roll back immediately

## OTA service-key proxy POST
1. With dev tools open, browse a destination on https://ota.phoenixvoyages.ca (pre-WordPress-cutover) or https://phoenixvoyages.ca (post-cutover, B5)
2. Confirm a `POST /api/consumer-activity` request fires from the page
3. Confirm it returns 204 (analytics ingest, expected silent success)
4. **Do NOT see this request fail in red** — if it does, OTA proxy or API
   service-key auth is broken

## Email send (Resend)
- The magic-link test above already exercises this. If the email did not
  arrive, the Resend integration is broken — check:
  - Resend dashboard for delivery status
  - `RESEND_API_KEY` in Doppler `prd` matches Resend's active key
  - Sender domain (SPF/DKIM/DMARC) is verified

## R2 signed-URL fetch
1. While signed in as the test agent, open any contact with attached
   documents (or upload a new test PDF)
2. Click to view the document — should open in browser via signed URL
3. **If signed URL fails:** check `R2_*` keys in Doppler `prd`, R2 custom
   domain bound, bucket policy

## Stripe webhook accept
1. Stripe dashboard → Developers → Webhooks → click the prod endpoint
2. "Send test webhook" → pick `payment_intent.succeeded`
3. Verify Stripe shows 2xx response within ~3s
4. Check API logs for the webhook handler running
5. If the handler 4xx'd: verify `STRIPE_WEBHOOK_SECRET` and signature
   verification logic match

## Cross-subdomain SSO (consumer surfaces only)
1. Sign in to OTA (`ota.phoenixvoyages.ca` pre-cutover / `phoenixvoyages.ca` post-cutover, B5) — receive a session cookie
2. Navigate to portal (`my.phoenixvoyages.ca`, B5)
3. Confirm you arrive signed in
4. **Note:** "sign in on admin → access portal as agent" is NOT a valid
   acceptance test (admin Supabase cookies are host-only per
   `apps/admin/src/middleware.ts`). Codex retrospective 2026-05-15.

## B2 registration throttling smoke
1. Open the OTA host (https://ota.phoenixvoyages.ca pre-cutover / https://phoenixvoyages.ca post-cutover, B5) and trigger the email-capture modal
2. Confirm the Cloudflare Turnstile widget renders
3. Submit a test email — confirm it succeeds (200 from `/api/consumer-auth/register`)
4. Submit the SAME email 4 times rapidly — confirm the 4th returns 429
5. From a different IP, submit a different email — should succeed (per-email throttler keyed correctly)

---

## Sign-off

Once all checks pass, post a green ✅ in the deploy thread with:
- Deploy commit SHA
- UAT pass time
- Any items skipped (with reason)
- Any items that needed retries

If anything failed, follow `docs/runbooks/post-deploy-rollback.md`.
