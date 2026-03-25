# Unified Template System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `document_templates` with multi-channel support (email, PDF, form, SMS), agent forking, and form JSON schema. Seed insurance proposal + client intake form templates. Add channel tab navigation to Library UI.

**Architecture:** Add columns to existing `document_templates` table. Extend `DocumentTemplatesService.resolvePublishedTemplate()` with 3-tier resolution (agent → agency → system). No migration from `email_templates` — that table stays as-is for now. New templates are created directly in `document_templates`.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, Next.js, shadcn/ui Tabs

**Spec:** `docs/superpowers/specs/2026-03-25-unified-template-system-design.md`

---

## File Structure

### New Files
- `packages/database/src/migrations/YYYYMMDDHHMMSS_document_templates_unified.sql` — Schema additions
- `packages/database/src/migrations/YYYYMMDDHHMMSS_seed_form_templates.sql` — Insurance waiver + client intake seeds

### Modified Files
- `packages/database/src/schema/document-templates.schema.ts` — Add columns
- `packages/database/src/migrations/meta/_journal.json` — Register migrations
- `apps/api/src/document-templates/document-templates.service.ts` — 3-tier resolution + fork method
- `apps/api/src/automation/processors/client-care.processor.ts` — Use document template for insurance email
- `apps/admin/src/app/library/templates/page.tsx` — Channel tab navigation
- `apps/admin/src/hooks/use-document-templates.ts` — Add channel filter

---

## Task 1: Schema Migration — Add Columns

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_document_templates_unified.sql`
- Modify: `packages/database/src/schema/document-templates.schema.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration**

```sql
-- Unified Template System: add multi-channel + forking support

-- Agent-level forking
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS user_id uuid;

-- Channel type for tab filtering
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS channel varchar(20);

-- Form support (JSON schema for dynamic form fields)
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS form_json jsonb;

-- SMS support
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS sms_template text;

-- System lock flag
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_user_id ON document_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_channel ON document_templates(channel);

-- Backfill channel from existing category + output_types
UPDATE document_templates SET channel = 'pdf' WHERE category IN ('trip_order', 'proposal') AND output_types @> '{pdf}' AND channel IS NULL;
UPDATE document_templates SET channel = 'email' WHERE channel IS NULL;

-- Mark existing system templates
UPDATE document_templates SET is_system = true WHERE agency_id IS NULL AND user_id IS NULL;
```

- [ ] **Step 2: Update Drizzle schema**

Add to `document-templates.schema.ts`:
```typescript
userId: uuid('user_id'),
channel: varchar('channel', { length: 20 }),
formJson: jsonb('form_json'),
smsTemplate: text('sms_template'),
isSystem: boolean('is_system').notNull().default(false),
```

- [ ] **Step 3: Register, run migration, rebuild, commit**

```
git commit -m "feat(database): add unified template columns — channel, user_id, form_json, sms, is_system"
```

---

## Task 2: Seed Insurance Proposal + Client Intake Form Templates

**Files:**
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_seed_form_templates.sql`

- [ ] **Step 1: Create seed migration**

Insert the insurance proposal as a document template (email channel) AND the insurance waiver form (form channel), plus client intake form:

```sql
-- Insurance Proposal Email (in document_templates)
INSERT INTO document_templates (slug, name, description, category, channel, subject_template, email_html, text_template, variables, output_types, status, is_system, is_active, blocks_json)
VALUES (
  'insurance-proposal-email',
  'Insurance Proposal Email',
  'Sent to travelers to review insurance options. Contains a link to the waiver form.',
  'notification',
  'email',
  'Insurance Coverage — {{trip_name}}',
  /* ... full HTML template (same as what was seeded in email_templates) ... */
  '<HTML content>',
  'Dear {{traveler_name}}, ...',
  '[{"name":"agency_name"},{"name":"traveler_name"},{"name":"trip_name"},{"name":"trip_dates"},{"name":"waiver_url"},{"name":"expires_date"},{"name":"dependent_names"}]'::jsonb,
  '{email}'::text[],
  'published',
  true,
  true,
  '{"blocks":[]}'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Insurance Waiver Form
INSERT INTO document_templates (slug, name, description, category, channel, form_json, email_html, variables, output_types, status, is_system, is_active, blocks_json)
VALUES (
  'insurance-waiver-form',
  'Insurance Waiver Form',
  'Client-facing form for travelers to purchase insurance or sign a waiver.',
  'form',
  'form',
  '{
    "fields": [
      {"id":"decision","type":"radio","label":"Insurance Decision","required":true,"options":["I want to purchase insurance","I decline insurance coverage"]},
      {"id":"package_id","type":"select","label":"Select Insurance Package","required":true,"showWhen":{"field":"decision","value":"I want to purchase insurance"}},
      {"id":"acknowledge","type":"checkbox","label":"I understand that by declining insurance, I assume all financial risk for trip cancellation, medical emergencies, and other travel-related losses.","required":true,"showWhen":{"field":"decision","value":"I decline insurance coverage"}},
      {"id":"reason","type":"textarea","label":"Reason for declining (optional)","showWhen":{"field":"decision","value":"I decline insurance coverage"}}
    ],
    "settings":{"submitButtonText":"Submit Decision"}
  }'::jsonb,
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h1 style="color:#c59746;">{{agency_name}}</h1><h2>Insurance Coverage — {{trip_name}}</h2><p>Dear {{traveler_name}},</p><p>Please review the insurance options for your trip ({{trip_dates}}).</p>{{{form_fields}}}<p style="color:#71717a;font-size:12px;margin-top:24px;">This form expires on {{expires_date}}.</p></div>',
  '[{"name":"agency_name"},{"name":"traveler_name"},{"name":"trip_name"},{"name":"trip_dates"},{"name":"expires_date"}]'::jsonb,
  '{form}'::text[],
  'published',
  true,
  true,
  '{"blocks":[]}'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Client Intake Form
INSERT INTO document_templates (slug, name, description, category, channel, form_json, email_html, variables, output_types, status, is_system, is_active, blocks_json)
VALUES (
  'client-intake-form',
  'Client Intake Form',
  'Collect new client information — personal details, travel preferences, emergency contacts.',
  'form',
  'form',
  '{
    "fields": [
      {"id":"heading_personal","type":"heading","label":"Personal Information"},
      {"id":"first_name","type":"text","label":"First Name","required":true},
      {"id":"last_name","type":"text","label":"Last Name","required":true},
      {"id":"email","type":"email","label":"Email Address","required":true},
      {"id":"phone","type":"phone","label":"Phone Number"},
      {"id":"date_of_birth","type":"date","label":"Date of Birth"},
      {"id":"heading_travel","type":"heading","label":"Travel Preferences"},
      {"id":"travel_style","type":"select","label":"Travel Style","options":["Luxury","Mid-range","Budget-friendly","Adventure","Family-friendly"]},
      {"id":"interests","type":"textarea","label":"Travel Interests & Special Requests"},
      {"id":"passport_country","type":"text","label":"Passport Country"},
      {"id":"heading_emergency","type":"heading","label":"Emergency Contact"},
      {"id":"emergency_name","type":"text","label":"Emergency Contact Name"},
      {"id":"emergency_phone","type":"phone","label":"Emergency Contact Phone"}
    ],
    "settings":{"submitButtonText":"Submit Information"}
  }'::jsonb,
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h1 style="color:#c59746;">{{agency_name}}</h1><h2>Welcome! Please Tell Us About Yourself</h2><p>We are excited to help plan your next adventure. Please fill out the form below so we can better serve you.</p>{{{form_fields}}}</div>',
  '[{"name":"agency_name"}]'::jsonb,
  '{form}'::text[],
  'published',
  true,
  true,
  '{"blocks":[]}'::jsonb
) ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Register, run, commit**

```
git commit -m "feat(database): seed insurance proposal email + waiver form + client intake form templates"
```

---

## Task 3: Extend DocumentTemplatesService — 3-Tier Resolution + Fork

**Files:**
- Modify: `apps/api/src/document-templates/document-templates.service.ts`

- [ ] **Step 1: Read existing resolvePublishedTemplate method**

Understand current agency-level resolution logic.

- [ ] **Step 2: Add userId parameter for 3-tier resolution**

Extend `resolvePublishedTemplate(slug, agencyId, userId?)`:
```typescript
// 1. Agent fork (user_id = userId, slug match)
// 2. Agency override (agency_id = agencyId, user_id IS NULL)
// 3. System default (agency_id IS NULL, user_id IS NULL)
```

- [ ] **Step 3: Add forkTemplate method**

```typescript
async forkTemplate(templateId: string, userId: string, agencyId: string): Promise<DocumentTemplate> {
  // 1. Load source template
  // 2. Clone all fields
  // 3. Set user_id, parent_id, parent_version, status='draft'
  // 4. Insert and return
}
```

- [ ] **Step 4: Add deleteFork method**

```typescript
async deleteFork(templateId: string, userId: string): Promise<void> {
  // Delete only if user_id matches
}
```

- [ ] **Step 5: Commit**

```
git commit -m "feat(api): extend DocumentTemplatesService with 3-tier resolution + fork/delete"
```

---

## Task 4: Update Insurance Email Processor

**Files:**
- Modify: `apps/api/src/automation/processors/client-care.processor.ts`

- [ ] **Step 1: Switch insurance email to use DocumentTemplatesService**

Replace `EmailTemplatesService.renderTemplate('insurance-proposal', ...)` with `DocumentTemplatesService.resolvePublishedTemplate('insurance-proposal-email', agencyId)` and render the Handlebars HTML with variables.

The existing fallback (`buildInsuranceEmailHtml`) stays as safety net.

- [ ] **Step 2: Commit**

```
git commit -m "feat(api): use document template for insurance proposal email"
```

---

## Task 5: Library UI — Channel Tab Navigation

**Files:**
- Modify: `apps/admin/src/app/library/templates/page.tsx`
- Modify: `apps/admin/src/hooks/use-document-templates.ts`

- [ ] **Step 1: Add channel filter to hooks**

Read `apps/admin/src/hooks/use-document-templates.ts`. Add `channel` to the filter interface and query params.

- [ ] **Step 2: Add tab navigation to the templates page**

Read `apps/admin/src/app/library/templates/page.tsx`. Add horizontal tabs above the template grid:

```tsx
<Tabs value={channelFilter} onValueChange={setChannelFilter}>
  <TabsList>
    <TabsTrigger value="all">All</TabsTrigger>
    <TabsTrigger value="email">Email</TabsTrigger>
    <TabsTrigger value="pdf">PDF</TabsTrigger>
    <TabsTrigger value="form">Forms</TabsTrigger>
    <TabsTrigger value="sms">SMS</TabsTrigger>
  </TabsList>
</Tabs>
```

Wire `channelFilter` into the existing filter state.

- [ ] **Step 3: Add template badges**

On each template card, show a badge:
- "System" (gray) when `isSystem && !userId && !agencyId`
- "Agency" (blue) when `agencyId && !userId`
- "Custom" (gold) when `userId`

- [ ] **Step 4: Add Fork/Reset actions**

On system templates: "Customize" button → calls `POST /templates/:id/fork`
On agent forks: "Reset" button → calls `DELETE /templates/:id/fork`

- [ ] **Step 5: Commit**

```
git commit -m "feat(admin): add channel tab navigation + fork badges to Library templates"
```

---

## Task 6: Add Fork/Delete API Endpoints

**Files:**
- Modify: `apps/api/src/document-templates/document-templates.controller.ts`

- [ ] **Step 1: Add fork endpoint**

```typescript
@Post(':id/fork')
async forkTemplate(@GetAuthContext() auth: AuthContext, @Param('id') id: string) {
  return this.templatesService.forkTemplate(id, auth.userId, auth.agencyId)
}
```

- [ ] **Step 2: Add delete fork endpoint**

```typescript
@Delete(':id/fork')
async deleteFork(@GetAuthContext() auth: AuthContext, @Param('id') id: string) {
  return this.templatesService.deleteFork(id, auth.userId)
}
```

- [ ] **Step 3: Add channel filter to list endpoint**

The existing `GET /document-templates` endpoint needs to accept `?channel=email` query parameter.

- [ ] **Step 4: Commit**

```
git commit -m "feat(api): add template fork/delete endpoints + channel filter"
```

---

## Task 7: Integration Test + Push

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep -c "error TS"
npx tsc --noEmit --project apps/admin/tsconfig.json 2>&1 | grep -c "error TS"
```

- [ ] **Step 2: Verify templates seeded**

```bash
psql "$DATABASE_URL" -c "SELECT slug, name, channel, is_system FROM document_templates WHERE channel IN ('form', 'sms') OR slug LIKE 'insurance%' ORDER BY channel, slug"
```

- [ ] **Step 3: Manual test**

1. Open Library > Templates → verify tabs (Email, PDF, Forms, SMS, All)
2. Click Forms tab → verify insurance waiver + client intake appear
3. Click a system template → verify "Customize" button
4. Fork a template → verify "Custom" badge appears
5. Reset fork → verify reverts to system

- [ ] **Step 4: Push**

```bash
git push origin main
git checkout preview && git merge main --no-edit && git push origin preview && git checkout main
```
