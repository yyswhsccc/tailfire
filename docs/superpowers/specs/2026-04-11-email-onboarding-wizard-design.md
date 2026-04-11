# Email Onboarding Wizard + Default Signature

**Date:** 2026-04-11
**Status:** Approved

## Overview

Optimize the new user onboarding experience for IMAP email setup. Replace the current "figure it out yourself on the profile page" flow with a focused two-step wizard that pre-fills server details and sets up a professional email signature.

## 1. Setup Wizard

Triggered when user navigates to `/profile?setup=true` (after set-password flow). Renders as a focused overlay card — not the full profile page.

### Step 1: Connect Email

All fields pre-filled except password:

| Field | Value | Editable |
|-------|-------|----------|
| Email Address | `{user_profiles.email}` | Read-only |
| Username | `{user_profiles.email}` | Read-only, visible |
| Password | Empty | User enters |
| Incoming Server | `mail.phoenixvoyages.ca` | Read-only, visible |
| IMAP Port | `993` | Read-only, visible |
| Outgoing Server | `mail.phoenixvoyages.ca` | Read-only, visible |
| SMTP Port | `465` | Read-only, visible |
| TLS/SSL | Enabled | Read-only, visible |

- "Test & Connect" button validates IMAP connection then creates the email account
- On success: advance to Step 2
- On failure: show error message, keep user on Step 1

### Step 2: Email Signature

Auto-generated signature preview built from profile + agency data:

```
{firstName} {lastName}, {designations} | {title || "Travel Advisor"}
{microSiteUrl}
Phoenix Voyages
(855) 383-5771 ext {extension}
600 Du Golf Rd, Hammond ON K0A2A0

TICO Ontario Registration No: 50028032
```

User controls:
- **Avatar toggle**: checkbox to include/exclude profile photo in signature
- **Personal tagline**: textarea for custom text (e.g., "Turning dreams into destinations")
- Structured fields (name, title, agency info) are NOT editable in this wizard. A hint below reads: "Update these in your profile settings"

On "Save & Continue":
1. Save signature config to `user_profiles.emailSignatureConfig`
2. Show success message
3. "Next: Complete your profile" button navigates to `/profile`

## 2. Signature Data Model

Uses existing `user_profiles.emailSignatureConfig` JSONB field:

```typescript
{
  tagline?: string       // user's personal tagline
  showAvatar?: boolean   // include profile photo in signature
}
```

Structured signature fields are NOT duplicated in the config — they are pulled live from:
- `user_profiles`: firstName, lastName, publicPhone, licensingInfo (designations), emailSignatureConfig
- `agency_settings`: company_name, phone, full_address, tico_registration

This ensures signature stays current when profile data changes.

## 3. Signature Rendering

When composing/sending emails, build the signature dynamically:

1. Pull user data from `user_profiles` (name, title, designations, extension, microsite URL, avatar URL)
2. Pull agency data from `agency_settings` (company name, phone, address, TICO)
3. Merge with `emailSignatureConfig` (tagline, showAvatar)
4. Render as HTML for email footer

The rendering function lives server-side (used by SMTP send) and is also available client-side for the signature preview in the wizard and profile page.

## 4. Server Configuration

For `@phoenixvoyages.ca` accounts, server details are hardcoded:

```typescript
const PHOENIX_VOYAGES_MAIL_CONFIG = {
  imapHost: 'mail.phoenixvoyages.ca',
  imapPort: 993,
  imapTls: true,
  smtpHost: 'mail.phoenixvoyages.ca',
  smtpPort: 465,
  smtpTls: true,
}
```

Custom domain email support is deferred behind a feature flag (hidden for now).

## 5. Files to Modify/Create

### Frontend (apps/admin/src/)
- **Create**: `app/profile/_components/email-setup-wizard.tsx` — the two-step wizard component
- **Create**: `app/profile/_components/signature-preview.tsx` — signature preview with live data
- **Modify**: `app/profile/page.tsx` — detect `setup=true` and render wizard overlay instead of tabs
- **Modify**: `app/profile/_components/email-tab.tsx` — reuse signature preview for existing users

### Backend (apps/api/src/)
- **Modify**: `email-accounts/email-accounts.service.ts` — add helper for default Phoenix Voyages config
- **Create or modify**: signature rendering utility (if not already in email send path)

### Shared
- **Modify**: `packages/shared-types` — add signature config types if needed

## 6. Profile Email Tab Improvements (Post-Onboarding)

The existing email tab (`email-tab.tsx`) gets the same UX improvements:

- **Pre-fill email address** from `user_profiles.email` when adding a new account
- **Pre-fill server details** for `@phoenixvoyages.ca` — same read-only defaults as wizard
- **Username defaults** to the user's email address
- **Signature management section**: same preview + tagline textarea + avatar toggle, editable anytime
- Users who completed onboarding see their connected account + signature in the tab
- "Add Account" form uses the same pre-filled pattern (password-only entry for Phoenix Voyages domain)

This ensures consistency — the wizard and the profile tab use the same components and behavior.

## 7. Not in Scope

- Custom domain email (deferred, feature flagged)
- Signature template customization beyond tagline + avatar toggle
- Email forwarding or alias configuration
