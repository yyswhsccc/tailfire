# Email Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline new user email setup with a two-step wizard (connect email + signature) and improve the profile email tab for existing users.

**Architecture:** Add 3 new user profile fields + 5 agency business config fields via migration. Build a wizard component rendered at `/profile?setup=true` that pre-fills Phoenix Voyages mail server details and generates an HTML signature from profile + agency data. The same signature builder is reused in the profile email tab.

**Tech Stack:** Next.js (React), NestJS, Drizzle ORM, PostgreSQL, shadcn/ui

---

### Task 1: Database migration — new user profile + agency settings fields

**Files:**
- Create: `packages/database/src/migrations/20260411120000_add_profile_and_agency_business_fields.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create the migration**

```sql
-- Add agent identity fields to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS designations VARCHAR(255);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS job_title VARCHAR(100) DEFAULT 'Travel Advisor';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_extension VARCHAR(20);

-- Add business details to agency_settings
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_phone VARCHAR(50);
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_toll_free VARCHAR(50);
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_email VARCHAR(255);
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_address TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS tico_registration VARCHAR(50);

-- Seed Phoenix Voyages business details
UPDATE agency_settings SET
  company_phone = '(855) 383-5771',
  company_toll_free = '(855) 383-5771',
  company_email = 'info@phoenixvoyages.ca',
  company_address = '600 Du Golf Rd, Hammond ON K0A2A0',
  tico_registration = '50028032',
  updated_at = NOW()
WHERE agency_id = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 2: Register in migration journal**

Read `packages/database/src/migrations/meta/_journal.json`, find the last entry, add:
```json
{
  "idx": 195,
  "version": "7",
  "when": 1775908800000,
  "tag": "20260411120000_add_profile_and_agency_business_fields",
  "breakpoints": true
}
```

- [ ] **Step 3: Update Drizzle schema**

In `packages/database/src/schema/user-profiles.schema.ts`, add after `publicPhone`:
```typescript
designations: varchar('designations', { length: 255 }),
jobTitle: varchar('job_title', { length: 100 }).default('Travel Advisor'),
phoneExtension: varchar('phone_extension', { length: 20 }),
```

In `packages/database/src/schema/financials.schema.ts`, add to `agencySettings` after `primaryColor`:
```typescript
// Business details for invoices and signatures
companyPhone: varchar('company_phone', { length: 50 }),
companyTollFree: varchar('company_toll_free', { length: 50 }),
companyEmail: varchar('company_email', { length: 255 }),
companyAddress: text('company_address'),
ticoRegistration: varchar('tico_registration', { length: 50 }),
```

- [ ] **Step 4: Run migration locally**

```bash
cd apps/api && pnpm db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/migrations/ packages/database/src/schema/user-profiles.schema.ts packages/database/src/schema/financials.schema.ts
git commit -m "feat: add profile fields (designations, jobTitle, extension) + agency business config"
```

---

### Task 2: Shared types — add new fields to DTOs

**Files:**
- Modify: `packages/shared-types/src/api/user-profiles.types.ts`

- [ ] **Step 1: Add to UserProfileResponseDto**

After `publicPhone`:
```typescript
designations: string | null
jobTitle: string | null
phoneExtension: string | null
```

- [ ] **Step 2: Add to UpdateUserProfileDto**

```typescript
designations?: string
jobTitle?: string
phoneExtension?: string
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/
git commit -m "feat: add designations, jobTitle, phoneExtension to profile types"
```

---

### Task 3: Backend — handle new profile fields + expose business config

**Files:**
- Modify: `apps/api/src/user-profiles/user-profiles.service.ts`
- Modify: `apps/api/src/user-profiles/dto/update-user-profile.dto.ts`

- [ ] **Step 1: Add validation to UpdateUserProfileDto**

```typescript
@IsOptional()
@IsString()
@MaxLength(255)
designations?: string

@IsOptional()
@IsString()
@MaxLength(100)
jobTitle?: string

@IsOptional()
@IsString()
@MaxLength(20)
phoneExtension?: string
```

- [ ] **Step 2: Handle new fields in updateMyProfile**

In `user-profiles.service.ts`, add to the updateData builder:
```typescript
if (dto.designations !== undefined) updateData.designations = dto.designations
if (dto.jobTitle !== undefined) updateData.jobTitle = dto.jobTitle
if (dto.phoneExtension !== undefined) updateData.phoneExtension = dto.phoneExtension
```

- [ ] **Step 3: Add business config to profile response**

In `normalizeProfile()`, add agency business config. Read `agency_settings` for the user's agency and include it:

Add a new method `getAgencyBusinessConfig(agencyId)` that queries `agency_settings` and returns:
```typescript
{
  companyName: string
  companyPhone: string | null
  companyTollFree: string | null
  companyEmail: string | null
  companyAddress: string | null
  ticoRegistration: string | null
  logoUrl: string | null
}
```

Add this to the `getMyProfile` response as `agencyBusinessConfig`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/user-profiles/
git commit -m "feat: handle new profile fields + expose agency business config"
```

---

### Task 4: Frontend — add new fields to Agent Info tab

**Files:**
- Modify: `apps/admin/src/app/profile/_components/agent-info-tab.tsx`

- [ ] **Step 1: Add fields to the form**

Add to `AgentInfoFormData`:
```typescript
designations: string
jobTitle: string
phoneExtension: string
```

Add form fields in a new "Agent Identity" card before Emergency Contact:
- Designations (text input, placeholder "CTC, ACC")
- Job Title (text input, default "Travel Advisor")
- Phone Extension (text input, placeholder "101")

Wire into the reset effect and onSubmit handler following the existing pattern.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/profile/_components/agent-info-tab.tsx
git commit -m "feat: add designations, job title, phone extension to agent info tab"
```

---

### Task 5: Signature HTML builder (shared client-side utility)

**Files:**
- Create: `apps/admin/src/lib/email/build-signature-html.ts`

- [ ] **Step 1: Create the signature builder**

```typescript
interface SignatureData {
  firstName: string
  lastName: string
  designations?: string | null
  jobTitle?: string | null
  phoneExtension?: string | null
  avatarUrl?: string | null
  // From advisor profile
  microSiteUrl?: string | null
  // From agency business config
  companyName: string
  companyPhone?: string | null
  companyAddress?: string | null
  ticoRegistration?: string | null
  // User controls
  tagline?: string | null
  showAvatar?: boolean
}

export function buildSignatureHtml(data: SignatureData): string {
  // Build professional HTML signature
  // Line 1: Name, Designations | Title
  // Line 2: MicroSite URL (if exists)
  // Line 3: Company Name
  // Line 4: Phone ext Extension
  // Line 5: Address
  // Line 6: TICO
  // Optional: Tagline
  // Optional: Avatar image
}
```

The function returns a complete HTML string suitable for `emailSignatureConfig.signatureHtml`.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/lib/email/build-signature-html.ts
git commit -m "feat: add signature HTML builder utility"
```

---

### Task 6: Email setup wizard component

**Files:**
- Create: `apps/admin/src/app/profile/_components/email-setup-wizard.tsx`

- [ ] **Step 1: Build the two-step wizard**

A card-based wizard with:

**Step 1 — Connect Email:**
- Pre-fills email from `useMyProfile()` (read-only)
- Pre-fills username = email (read-only, visible)
- Password input (only editable field)
- Server details shown as read-only fields (mail.phoenixvoyages.ca, 993, 465, TLS)
- "Test & Connect" button:
  1. Calls `useTestEmailConnection` with all fields
  2. On success, calls `useCreateEmailAccount` to create the account
  3. On failure, shows error
  4. On success, advances to Step 2

**Step 2 — Email Signature:**
- Live signature preview using `buildSignatureHtml()` with data from `useMyProfile()` + `agencyBusinessConfig`
- Avatar toggle (checkbox)
- Tagline textarea
- Hint: "Update name, title, and designations in your profile settings"
- "Save & Continue" button:
  1. Generates HTML with `buildSignatureHtml()`
  2. Saves to `emailSignatureConfig`: `{ enabled: true, signatureHtml, includeInReplies: true, tagline, showAvatar }`
  3. Sets `platformPreferences.onboardingCompletedAt = new Date().toISOString()`
  4. Shows success state with "Next: Complete your profile" button → `/profile`

Uses existing hooks: `useMyProfile`, `useUpdateMyProfile`, `useCreateEmailAccount`, `useTestEmailConnection`

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/profile/_components/email-setup-wizard.tsx
git commit -m "feat: email setup wizard with two-step connect + signature flow"
```

---

### Task 7: Wire wizard into profile page

**Files:**
- Modify: `apps/admin/src/app/profile/page.tsx`

- [ ] **Step 1: Detect setup=true and render wizard**

In `ProfilePage` component, read `searchParams` for `setup=true`. When present, render `EmailSetupWizard` instead of `ProfileFormProvider` + tabs:

```typescript
'use client'
import { useSearchParams } from 'next/navigation'
import { EmailSetupWizard } from './_components/email-setup-wizard'

export default function ProfilePage() {
  const searchParams = useSearchParams()
  const isSetup = searchParams.get('setup') === 'true'

  if (isSetup) {
    return (
      <DashboardLayout>
        <EmailSetupWizard />
      </DashboardLayout>
    )
  }

  // ... existing profile content
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/profile/page.tsx
git commit -m "feat: render email wizard when setup=true query param present"
```

---

### Task 8: Improve email tab with pre-fill + signature management

**Files:**
- Modify: `apps/admin/src/app/profile/_components/email-tab.tsx`

- [ ] **Step 1: Pre-fill server details for @phoenixvoyages.ca**

When adding a new account:
- Pre-fill `emailAddress` from `useMyProfile().email`
- Pre-fill `username` = email
- Pre-fill `imapHost`, `smtpHost` = `mail.phoenixvoyages.ca`
- Pre-fill ports (993/465) and TLS (true) — already the defaults
- Make server fields read-only when email domain is `@phoenixvoyages.ca`

- [ ] **Step 2: Add signature management section**

Below the accounts list, add a "Email Signature" card with:
- Live signature preview using `buildSignatureHtml()`
- Avatar toggle + tagline textarea
- "Update Signature" button that re-generates HTML and saves

- [ ] **Step 3: Remove signature from preferences tab**

In `preferences-tab.tsx`, remove the `emailSignatureEnabled`, `emailSignatureHtml`, `emailSignatureIncludeInReplies` fields and their form logic. Add a note: "Email signature is managed in the Email tab."

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/profile/_components/email-tab.tsx apps/admin/src/app/profile/_components/preferences-tab.tsx
git commit -m "feat: pre-fill email tab for phoenixvoyages.ca + move signature management here"
```

---

### Task 9: Update trip-order business config to use DB fields

**Files:**
- Modify: `apps/api/src/financials/trip-order.service.ts`

- [ ] **Step 1: Replace hardcoded defaults with DB values**

In `getBusinessConfiguration()`, read the new agency_settings fields:
```typescript
const [settings] = await this.db.client
  .select({
    logoUrl: this.db.schema.agencySettings.logoUrl,
    primaryColor: this.db.schema.agencySettings.primaryColor,
    companyPhone: this.db.schema.agencySettings.companyPhone,
    companyTollFree: this.db.schema.agencySettings.companyTollFree,
    companyEmail: this.db.schema.agencySettings.companyEmail,
    companyAddress: this.db.schema.agencySettings.companyAddress,
    ticoRegistration: this.db.schema.agencySettings.ticoRegistration,
  })
  .from(this.db.schema.agencySettings)
  .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
  .limit(1)
```

Map to `BusinessConfiguration`:
```typescript
return {
  company_name: agency?.name || 'Phoenix Voyages',
  full_address: settings?.companyAddress || '',
  phone: settings?.companyPhone || undefined,
  toll_free: settings?.companyTollFree || undefined,
  email: settings?.companyEmail || '',
  tico_registration: settings?.ticoRegistration || '',
  logo_url: settings?.logoUrl || undefined,
  primary_color: settings?.primaryColor || '#c59746',
  // ... keep other defaults
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/financials/trip-order.service.ts
git commit -m "feat: trip-order business config reads from agency_settings instead of hardcoding"
```

---

### Task 10: Type-check + push to preview

- [ ] **Step 1: Type-check both apps**

```bash
npx tsc --noEmit -p apps/admin/tsconfig.json
```

- [ ] **Step 2: Push and merge to preview**

```bash
git push -u origin feature/email-onboarding-wizard
git checkout preview && git merge feature/email-onboarding-wizard --no-edit && git push
git checkout feature/email-onboarding-wizard
```

- [ ] **Step 3: Run migration on preview**

Migration runs automatically via deploy-preview.yml.

- [ ] **Step 4: Test on tf-demo**

1. Navigate to `/profile?setup=true` → wizard should appear
2. Enter email password → Test & Connect → should create account
3. Signature preview should show with profile data + agency info
4. Save → onboardingCompletedAt set → redirect to profile
5. Profile email tab → signature management section visible
6. Profile email tab → add new account pre-fills phoenixvoyages.ca server

- [ ] **Step 5: Create PR**

```bash
gh pr create --base main --head feature/email-onboarding-wizard \
  --title "feat: email onboarding wizard + signature setup" \
  --body "..."
```
