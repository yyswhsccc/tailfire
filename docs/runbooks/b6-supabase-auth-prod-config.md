# B6 — Supabase Auth Production Configuration

Step-by-step config for the Tailfire-Prod Supabase project (`cmktvanwglszgadjrorm`). Run the verification script after each section to confirm.

**Verification script:** `scripts/verify-supabase-auth-prod.sh` (B6 PR).
**Run via:**
```bash
SUPABASE_ACCESS_TOKEN=$(mcp_doppler_get tailfire prd SUPABASE_ACCESS_TOKEN) \
  bash scripts/verify-supabase-auth-prod.sh
```

---

## 1. Site URL

**Where:** Supabase dashboard → Project (`cmktvanwglszgadjrorm`) → Authentication → URL Configuration → Site URL.

**Set to:** `https://my.phoenixvoyages.ca` (per B5 — client portal is the primary consumer-facing surface for auth).

**Why:** This is what Supabase uses as the default redirect after auth flows when no explicit `redirectTo` is provided.

## 2. Redirect allow-list

**Where:** Same page → Redirect URLs.

**Add (use exact match or `https://<host>/**` wildcard):**
- `https://my.phoenixvoyages.ca/auth/callback`
- `https://my.phoenixvoyages.ca/auth/confirm`
- `https://tailfire.phoenixvoyages.ca/auth/callback` (admin sign-in)
- `https://ota.phoenixvoyages.ca/auth/callback` (OTA pre-WordPress-cutover)
- `https://phoenixvoyages.ca/auth/callback` (OTA post-cutover)
- (optional) `https://tf-demo.phoenixvoyages.ca/**` — if Preview deploys ever use the prod project (they shouldn't; Preview has its own Supabase project)

**Why:** Without these, the magic link will refuse to redirect to anywhere except Site URL, breaking the flow.

## 3. Email templates

**Where:** Supabase dashboard → Project → Authentication → Email Templates.

**For each template (Confirm signup, Magic link, Invite, Reset password, Change email):**
- Verify the link in the body uses `{{ .ConfirmationURL }}` (or equivalent) — Supabase auto-substitutes with the configured Site URL + redirect.
- Confirm the "From" email matches `EMAIL_FROM_ADDRESS=noreply@phoenixvoyages.ca` (per Doppler `prd`).
- Subject line should be production-appropriate (no "TEST" / "DEV").

## 4. SMTP relay (Resend)

**Where:** Supabase dashboard → Project → Authentication → SMTP Settings.

**Configure:**
- Enable Custom SMTP
- Sender name: `Phoenix Voyages (Tailfire)` (matches `EMAIL_FROM_NAME`)
- Sender email: `noreply@phoenixvoyages.ca` (matches `EMAIL_FROM_ADDRESS`)
- Host: `smtp.resend.com`
- Port: `587`
- Username: `resend`
- Password: the `RESEND_API_KEY` from Doppler `prd` (paste the raw key)

**Why:** Without custom SMTP, Supabase native email is rate-limited (4 emails/hour) and from `noreply@mail.app.supabase.com` — visible in headers and looks unprofessional. Phoenix Voyages domain on Resend already has SPF/DKIM/DMARC verified per B7 audit.

## 5. MFA enforcement

**Where:** Supabase dashboard → Project → Authentication → Multi-Factor Authentication.

**Configure:**
- Enable TOTP MFA enrollment.
- Per `apps/api/src/auth/guards/jwt-auth.guard.ts` and `MFA_REQUIRED=true` in Doppler `prd`, the API enforces MFA for admin users — this dashboard setting just enables the **enrollment** UI for new factors.

## 6. Anonymous sign-ins (B2 alignment)

**Where:** Supabase dashboard → Project → Authentication → Sign In / Up → Anonymous Sign-Ins.

**Set to:** **Disabled.**

**Why:** Anonymous Supabase sign-ins would bypass the throttling + Turnstile we built in B2 (`/consumer-auth/register`). Force every user through the throttled register endpoint.

---

## Verification

After all 6 sections are configured, run:
```bash
SUPABASE_ACCESS_TOKEN=$(mcp_doppler_get tailfire prd SUPABASE_ACCESS_TOKEN) \
  bash scripts/verify-supabase-auth-prod.sh
```

Exit 0 = all B6 acceptance items confirmed. Exit 1 = at least one ❌ item to fix.

After verification passes, mark B6 `[x]` in the punchlist.

---

## What's NOT in this script

- Email template body content review (Supabase API doesn't expose the bodies in a stable schema; manual visual check in dashboard).
- Resend domain SPF/DKIM/DMARC status (covered by B7 audit doc).
- Rate-limit policy review (Supabase auth has its own per-IP rate limits; complementary to our `ThrottlerGuard`).

These are documented as additional manual checks during the post-deploy UAT.
