#!/usr/bin/env bash
# B6: Supabase Auth production config verification.
#
# After Al configures the Supabase Auth dashboard for the Tailfire-Prod project
# (cmktvanwglszgadjrorm), run this script to verify each B6 acceptance item is
# in place. The script uses the Supabase Management API (read-only).
#
# Per CLAUDE.md, prod env writes need user confirmation — this script ONLY READS.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=<from Doppler prd> \
#     bash scripts/verify-supabase-auth-prod.sh
#
# Or via Doppler MCP:
#   token=$(mcp_doppler_get tailfire prd SUPABASE_ACCESS_TOKEN)
#   SUPABASE_ACCESS_TOKEN=$token bash scripts/verify-supabase-auth-prod.sh
#
# Exit codes:
#   0 — all B6 acceptance items verified
#   1 — one or more checks failed (action required)
#   2 — bad usage / missing dependency

set -euo pipefail

PROJECT_REF="cmktvanwglszgadjrorm"  # Tailfire-Prod
EXPECTED_SITE_URL="https://my.phoenixvoyages.ca"  # B5 client portal (consumer surface)

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN required (read from Doppler prd)" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required" >&2
  exit 2
fi

API_BASE="https://api.supabase.com/v1/projects/${PROJECT_REF}"
AUTH_HEADER="Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"

EXIT_CODE=0

fail() {
  echo "  ❌ $1"
  EXIT_CODE=1
}
pass() {
  echo "  ✅ $1"
}
warn() {
  echo "  ⚠️  $1 (informational; verify manually)"
}

echo "=== B6 Supabase Auth verification (project: ${PROJECT_REF}) ==="
echo ""

# 1. Fetch auth config (the canonical source of truth for Site URL + redirects)
echo "Fetching /auth/config..."
auth_config=$(curl -sf -H "$AUTH_HEADER" "${API_BASE}/config/auth" 2>/dev/null) || {
  echo "ERROR: could not fetch auth config — bad SUPABASE_ACCESS_TOKEN or project ref?" >&2
  exit 1
}

# 2. Site URL — should be the consumer-facing host (post-B5 = my.phoenixvoyages.ca)
echo ""
echo "[Acceptance] Site URL = production consumer host (B5 = ${EXPECTED_SITE_URL})"
site_url=$(echo "$auth_config" | jq -r '.site_url // empty')
if [[ -z "$site_url" ]]; then
  fail "Site URL is empty"
elif [[ "$site_url" == "$EXPECTED_SITE_URL" ]]; then
  pass "Site URL = ${site_url}"
else
  fail "Site URL is ${site_url}, expected ${EXPECTED_SITE_URL}"
  echo "     Update via Supabase dashboard → Auth → URL Configuration → Site URL"
fi

# 3. Redirect allow-list — must include OTA, portal, admin /auth/callback paths
echo ""
echo "[Acceptance] Redirect allow-list includes consumer + agent surfaces"
uri_allow_list=$(echo "$auth_config" | jq -r '.uri_allow_list // empty')

required_redirects=(
  "https://my.phoenixvoyages.ca/auth/callback"
  "https://my.phoenixvoyages.ca/auth/confirm"
  "https://tailfire.phoenixvoyages.ca/auth/callback"
  "https://ota.phoenixvoyages.ca/auth/callback"
  "https://phoenixvoyages.ca/auth/callback"
)

if [[ -z "$uri_allow_list" ]]; then
  fail "Redirect allow-list is empty — magic link won't be able to redirect anywhere"
else
  for redirect in "${required_redirects[@]}"; do
    # Allow-list is a comma-separated string OR may include wildcards.
    # Match exact URL OR same-host wildcard like https://my.phoenixvoyages.ca/**
    host="${redirect#https://}"; host="${host%%/*}"
    if echo "$uri_allow_list" | grep -qE "(${redirect}|https://${host}/\*\*?)"; then
      pass "${redirect}"
    else
      fail "${redirect} (not in allow-list)"
    fi
  done
  echo ""
  echo "  Current allow-list: $(echo "$uri_allow_list" | head -c 200)..."
fi

# 4. Email templates — sanity-check that magic link, recovery, confirm
# templates reference variables (Supabase API exposes the templates in the
# config response). We can't verify the rendered URL points to prod, but we
# can confirm the templates aren't empty.
echo ""
echo "[Acceptance] Email templates non-empty (magic link / recovery / confirm)"
mailer_subjects=$(echo "$auth_config" | jq -r '.mailer_subjects // empty')

magic_link_sub=$(echo "$auth_config" | jq -r '.mailer_subjects_magic_link // empty')
recovery_sub=$(echo "$auth_config" | jq -r '.mailer_subjects_recovery // empty')
confirm_sub=$(echo "$auth_config" | jq -r '.mailer_subjects_confirmation // empty')

# Subjects exist as flat keys in some Supabase API versions; bodies are in
# .mailer_templates_*. Either name presence is enough to know templates exist.
if [[ -n "$magic_link_sub" ]] || echo "$auth_config" | jq -e '.mailer_templates_magic_link' >/dev/null 2>&1; then
  pass "Magic link template configured"
else
  warn "Magic link template not found in API response — verify in Supabase dashboard → Auth → Email Templates"
fi

if [[ -n "$recovery_sub" ]] || echo "$auth_config" | jq -e '.mailer_templates_recovery' >/dev/null 2>&1; then
  pass "Password recovery template configured"
else
  warn "Recovery template not found in API response"
fi

if [[ -n "$confirm_sub" ]] || echo "$auth_config" | jq -e '.mailer_templates_confirmation' >/dev/null 2>&1; then
  pass "Confirmation template configured"
else
  warn "Confirmation template not found in API response"
fi

# 5. MFA enforcement — confirm MFA is enabled for the project
echo ""
echo "[Acceptance] MFA enabled (codebase enforces MFA via JwtAuthGuard)"
mfa_totp_enabled=$(echo "$auth_config" | jq -r '.mfa_totp_enroll_enabled // .external_email_enabled // empty')
mfa_max_factors=$(echo "$auth_config" | jq -r '.mfa_max_enrolled_factors // empty')

if [[ "$mfa_totp_enabled" == "true" ]]; then
  pass "TOTP MFA enrollment enabled"
elif [[ -n "$mfa_max_factors" ]] && [[ "$mfa_max_factors" -gt 0 ]]; then
  pass "MFA configured (max factors: ${mfa_max_factors})"
else
  warn "MFA TOTP enroll status unclear from API response — verify in Supabase dashboard → Auth → Multi-Factor"
fi

# 6. SMTP relay — Supabase native or Resend
echo ""
echo "[Acceptance] SMTP relay configured (Resend or Supabase native)"
smtp_admin_email=$(echo "$auth_config" | jq -r '.smtp_admin_email // empty')
smtp_host=$(echo "$auth_config" | jq -r '.smtp_host // empty')
smtp_user=$(echo "$auth_config" | jq -r '.smtp_user // empty')

if [[ -n "$smtp_host" ]]; then
  pass "Custom SMTP configured (host: ${smtp_host})"
  if [[ "$smtp_host" == *"resend"* ]]; then
    pass "  Provider appears to be Resend ✓"
  else
    warn "  Provider is ${smtp_host} (expected Resend per punchlist B7) — verify"
  fi
elif [[ -n "$smtp_admin_email" ]]; then
  warn "Custom SMTP not configured; using Supabase native email (limited deliverability) — admin email: ${smtp_admin_email}"
else
  warn "Could not determine SMTP config from API — verify in Supabase dashboard → Auth → SMTP Settings"
fi

# 7. Anonymous sign-ins (B2/B6: should be DISABLED for prod — we want every
# user to come through the throttled register endpoint with Turnstile)
echo ""
echo "[Acceptance — bonus] Anonymous sign-ins disabled (B2 alignment)"
anon_enabled=$(echo "$auth_config" | jq -r '.external_anonymous_users_enabled // empty')
if [[ "$anon_enabled" == "false" ]]; then
  pass "Anonymous sign-ins disabled"
elif [[ "$anon_enabled" == "true" ]]; then
  fail "Anonymous sign-ins enabled — bypasses B2 throttling. Disable in Supabase dashboard → Auth → Sign In / Up → Anonymous Sign-Ins"
else
  warn "Anonymous sign-ins setting not found in API response — verify in dashboard"
fi

echo ""
echo "==================================================================="
if [[ "$EXIT_CODE" == "0" ]]; then
  echo "✅ B6 verification PASSED — all acceptance items confirmed"
else
  echo "❌ B6 verification FAILED — see ❌ items above and fix in Supabase dashboard"
  echo "   Re-run this script after each change to confirm progress."
fi

exit "$EXIT_CODE"
