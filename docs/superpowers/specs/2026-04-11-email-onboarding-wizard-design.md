# Email Onboarding Wizard + Default Signature

**Date:** 2026-04-11
**Status:** Approved (revised after Codex review)

## Overview

Optimize the new user onboarding experience for IMAP email setup. Replace the current "figure it out yourself on the profile page" flow with a focused two-step wizard that pre-fills server details and sets up a professional email signature.

## 1. Setup Wizard

Triggered when user navigates to `/profile?setup=true` (after set-password flow). Renders as a dedicated wizard component — not the full profile page tabs.

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

Flow:
1. User enters password
2. "Test & Connect" button calls `POST /email-accounts/test-connection` first
3. On test success: calls `POST /email-accounts` to create the account
4. On test failure: show error, keep user on Step 1
5. On create success: advance to Step 2

### Step 2: Email Signature

Auto-generated HTML signature preview. The wizard builds the HTML and saves it to `emailSignatureConfig.signatureHtml` — this is what the email senders already use.

Preview format:
```
{firstName} {lastName}, {designations} | {title || "Travel Advisor"}
{microSiteUrl}
Phoenix Voyages
(855) 383-5771 ext {extension}
600 Du Golf Rd, Hammond ON K0A2A0

TICO Ontario Registration No: 50028032
```

User controls:
- **Avatar toggle**: checkbox to include/exclude profile photo in signature HTML
- **Personal tagline**: textarea for custom text (e.g., "Turning dreams into destinations")
- Structured fields (name, title, agency info) are NOT editable in this wizard. Hint: "Update these in your profile settings"

On "Save & Continue":
1. Build HTML signature from structured data + tagline + avatar choice
2. Save to `user_profiles.emailSignatureConfig`:
   - `enabled: true`
   - `signatureHtml: "<generated HTML>"`
   - `includeInReplies: true`
   - `tagline: "user's tagline"` (for future editing)
   - `showAvatar: true/false` (for future editing)
3. Set `user_profiles.platformPreferences.onboardingCompletedAt` to prevent re-redirect to `/welcome`
4. Show success message + "Next: Complete your profile" button → `/profile`

## 2. Signature Data Model

Uses existing `user_profiles.emailSignatureConfig` JSONB field. Current supported fields:

```typescript
{
  enabled?: boolean          // existing — signature active
  signatureHtml?: string     // existing — the rendered HTML (what senders use)
  includeInReplies?: boolean // existing — append to replies
  tagline?: string           // NEW — for re-generating signature later
  showAvatar?: boolean       // NEW — for re-generating signature later
}
```

The `signatureHtml` field is the source of truth for email sending. The `tagline` and `showAvatar` fields are metadata for re-generating the HTML when the user edits their signature later.

**No changes to DTO validation needed** — `emailSignatureConfig` is already a loose JSONB field that accepts any keys.

## 3. Signature Generation

A shared `buildSignatureHtml()` function that:
1. Takes user profile data (name, title, avatar URL, etc.)
2. Takes agency constants (hardcoded for Phoenix Voyages V1)
3. Takes signature config (tagline, showAvatar)
4. Returns an HTML string

This function is used:
- **Client-side**: for the live preview in the wizard and profile email tab
- **At save time**: to generate `signatureHtml` before persisting

The email senders (`smtp-send.service.ts`, `email.service.ts`) continue to use `signatureHtml` as-is — no changes to the send path.

### Data Sources (V1 — Phoenix Voyages)

| Signature Field | Source |
|----------------|--------|
| Name | `user_profiles.firstName` + `lastName` |
| Designations | `user_profiles.licensingInfo.ticoNumber` or free text from profile |
| Title | Hardcoded "Travel Advisor" (or from advisor profile if available) |
| MicroSite URL | Derived from advisor profile slug if exists |
| Avatar | `user_profiles.avatarUrl` |
| Company Name | Hardcoded: "Phoenix Voyages" |
| Phone | Hardcoded: "(855) 383-5771" |
| Extension | From `user_profiles.publicPhone` or agent info if available |
| Address | Hardcoded: "600 Du Golf Rd, Hammond ON K0A2A0" |
| TICO | Hardcoded: "50028032" |

Future: replace hardcoded values with `agency_settings` / `businessConfig` fields.

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
- **Create**: `app/profile/_components/email-setup-wizard.tsx` — two-step wizard component
- **Create**: `lib/email/build-signature-html.ts` — shared signature HTML builder (client-side)
- **Modify**: `app/profile/page.tsx` — detect `setup=true` and render wizard instead of tabs
- **Modify**: `app/profile/_components/email-tab.tsx` — pre-fill server details for @phoenixvoyages.ca, add signature management section (reuses signature builder)
- **Modify**: `app/profile/_components/preferences-tab.tsx` — remove signature editing from here (move to email tab)

### Backend (apps/api/src/)
- No backend changes needed — existing endpoints support everything:
  - `POST /email-accounts/test-connection` — test IMAP
  - `POST /email-accounts` — create account
  - `PUT /user-profiles/me` — save emailSignatureConfig + platformPreferences

### Shared
- No shared type changes needed — emailSignatureConfig accepts loose JSONB

## 6. Profile Email Tab Improvements (Post-Onboarding)

The existing email tab (`email-tab.tsx`) gets the same UX improvements:

- **Pre-fill email address** from `user_profiles.email` when adding a new account
- **Pre-fill server details** for `@phoenixvoyages.ca` — same read-only defaults as wizard
- **Username defaults** to the user's email address
- **Signature management section**: same preview + tagline textarea + avatar toggle, editable anytime
- When user edits tagline/avatar, signature HTML is re-generated and saved
- Users who completed onboarding see their connected account + signature in the tab
- "Add Account" form uses the same pre-filled pattern (password-only entry for Phoenix Voyages domain)

Signature editing moves FROM Preferences tab TO Email tab for consistency.

## 7. Onboarding Completion

On wizard completion (Step 2 save):
- Set `user_profiles.platformPreferences.onboardingCompletedAt = new Date().toISOString()`
- This prevents the global layout redirect to `/welcome` in `dashboard-layout.tsx`

## 8. Not in Scope

- Custom domain email (deferred, feature flagged)
- Changes to email send path (senders already use signatureHtml)
- New backend endpoints
- Agency settings for business details (hardcoded for V1)
