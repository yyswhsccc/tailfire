# Unified Template System — Design Spec

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Consolidate email_templates + document_templates into one system with multi-channel support, agent forking, and form builder

---

## Problem

1. Two separate template tables (`document_templates` and `email_templates`) with overlapping data — many templates duplicated across both
2. Email templates use simple `{{variable}}` substitution; document templates use Handlebars — inconsistent rendering
3. No agent-level customization — agents can't personalize templates for their communication style
4. No form templates — the insurance waiver form is hardcoded HTML
5. No SMS template support
6. Library UI has confusing split: `/library/templates` (documents) vs `/library/notifications` (emails)

## Goals

1. Single `document_templates` table serves ALL channels (email, PDF, form, SMS)
2. Agent-level forking: agents customize templates without affecting system defaults
3. Resolution order: agent fork → agency override → system default
4. Form templates use JSON schema for fields + Handlebars for wrapper text
5. SMS templates with character limit awareness
6. Library UI unified with tab navigation by channel
7. Migrate all `email_templates` data into `document_templates`
8. Insurance waiver form + client intake form as first form templates

---

## Design

### 1. Schema Changes to `document_templates`

**New columns:**

```sql
-- Agent-level forking
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS user_id uuid;

-- Channel type (replaces ambiguous category for filtering)
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS channel varchar(20);

-- Form support
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS form_json jsonb;

-- SMS support
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS sms_template text;

-- System lock (admins only can edit)
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_user_id ON document_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_channel ON document_templates(channel);
```

**Channel values:** `email`, `pdf`, `form`, `sms`

**Backfill `channel`:**
```sql
UPDATE document_templates SET channel = 'email' WHERE category = 'email' AND channel IS NULL;
UPDATE document_templates SET channel = 'pdf' WHERE category IN ('trip_order', 'proposal') AND channel IS NULL;
UPDATE document_templates SET channel = 'email' WHERE category = 'payment' AND channel IS NULL;
UPDATE document_templates SET channel = 'email' WHERE channel IS NULL; -- default fallback
```

### 2. Template Resolution

When the system needs a template (e.g., to send an insurance proposal email):

```typescript
async resolveTemplate(slug: string, agencyId: string, userId?: string): Promise<DocumentTemplate> {
  // 1. Agent fork (user-specific)
  if (userId) {
    const agentFork = await findTemplate({ slug, userId, status: 'published' })
    if (agentFork) return agentFork
  }

  // 2. Agency override (agency-specific, no user)
  const agencyOverride = await findTemplate({ slug, agencyId, userId: null, status: 'published' })
  if (agencyOverride) return agencyOverride

  // 3. System default (no agency, no user)
  const systemDefault = await findTemplate({ slug, agencyId: null, userId: null, status: 'published' })
  if (systemDefault) return systemDefault

  throw new NotFoundException(`Template "${slug}" not found`)
}
```

### 3. Agent Forking

When an agent clicks "Customize" on a system/agency template:

1. Clone the template: copy all fields
2. Set `user_id` = current agent, `parent_id` = original template ID, `parent_version` = original version
3. Set `status` = 'draft' (agent edits, then publishes)
4. Badge on UI: "Custom" (agent fork), "Agency" (agency override), "System" (default)

**Fork rules:**
- System templates: `is_system = true` — only admins can edit the original. Anyone can fork.
- Agent forks: `user_id IS NOT NULL` — only that agent can edit their fork
- Agency overrides: `agency_id IS NOT NULL AND user_id IS NULL` — admin-created for the whole agency

### 4. Form JSON Schema

Form templates store field definitions in `form_json`:

```typescript
interface FormSchema {
  fields: FormField[]
  settings?: {
    submitButtonText?: string
    showProgressBar?: boolean
  }
}

interface FormField {
  id: string                    // unique field identifier
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'email' | 'phone' | 'signature' | 'heading' | 'paragraph'
  label: string                 // display label
  placeholder?: string          // input placeholder
  required?: boolean            // validation
  options?: string[]            // for select/radio
  showWhen?: {                  // conditional visibility
    field: string               // other field id
    value: string               // show when that field has this value
  }
  validation?: {
    minLength?: number
    maxLength?: number
    pattern?: string            // regex
  }
  defaultValue?: string
}
```

**Form rendering:** The client portal reads `form_json` to dynamically build the form. The `form_html` (Handlebars) wraps it with:
- Agency branding header
- Intro text (customizable)
- `{{{form_fields}}}` placeholder where dynamic fields render
- Disclaimer/footer text (customizable)

### 5. SMS Template

SMS templates use `sms_template` field with `{{variable}}` substitution (same as email subject). The editor shows a character counter with SMS segment awareness:
- 160 chars = 1 segment (GSM-7)
- 70 chars = 1 segment (Unicode)
- Warns when exceeding 1 segment

### 6. Library UI — Tab Navigation

`/library/templates` gets horizontal tabs:

```
[Email] [PDF] [Forms] [SMS] [All]
```

Each tab filters by `channel`. The existing template cards, editor, and Handlebars system remain unchanged — just filtered by tab.

**Badge per template:**
- "System" (gray) — `is_system = true, user_id IS NULL, agency_id IS NULL`
- "Agency" (blue) — `agency_id IS NOT NULL, user_id IS NULL`
- "Custom" (gold) — `user_id IS NOT NULL` (agent's fork)

**Actions per template:**
- System: View, Fork (creates agent copy)
- Agency: Edit (admin only), Fork (creates agent copy)
- Custom: Edit, Delete, Reset (delete fork, revert to parent)

### 7. Email Templates Migration

Migrate all rows from `email_templates` into `document_templates`:

```sql
INSERT INTO document_templates (slug, name, description, category, channel, subject_template, email_html, text_template, variables, output_types, status, is_system, is_active, created_at, updated_at)
SELECT slug, name, description,
  CASE category
    WHEN 'notification' THEN 'notification'
    WHEN 'system' THEN 'system'
    WHEN 'payment' THEN 'payment'
    WHEN 'client_care' THEN 'client_care'
    WHEN 'trip_order' THEN 'trip_order'
    ELSE category
  END,
  'email' as channel,
  subject, body_html, body_text, variables, '{email}'::text[], 'published', is_system, is_active, created_at, updated_at
FROM email_templates
ON CONFLICT (slug) DO UPDATE SET
  email_html = COALESCE(EXCLUDED.email_html, document_templates.email_html),
  subject_template = COALESCE(EXCLUDED.subject_template, document_templates.subject_template),
  text_template = COALESCE(EXCLUDED.text_template, document_templates.text_template),
  channel = 'email';
```

After migration, update all API code that reads from `email_templates` to use `document_templates`.

### 8. Initial Form Templates

**Insurance Waiver Form:**
```json
{
  "fields": [
    { "id": "decision", "type": "radio", "label": "Insurance Decision", "required": true, "options": ["I want to purchase insurance", "I decline insurance coverage"] },
    { "id": "package_id", "type": "select", "label": "Select Insurance Package", "required": true, "showWhen": { "field": "decision", "value": "I want to purchase insurance" } },
    { "id": "acknowledge", "type": "checkbox", "label": "I understand that by declining insurance, I assume all financial risk for trip cancellation, medical emergencies, and other travel-related losses.", "required": true, "showWhen": { "field": "decision", "value": "I decline insurance coverage" } },
    { "id": "reason", "type": "textarea", "label": "Reason for declining (optional)", "showWhen": { "field": "decision", "value": "I decline insurance coverage" } }
  ],
  "settings": { "submitButtonText": "Submit Decision" }
}
```

**Client Intake Form:**
```json
{
  "fields": [
    { "id": "heading_personal", "type": "heading", "label": "Personal Information" },
    { "id": "first_name", "type": "text", "label": "First Name", "required": true },
    { "id": "last_name", "type": "text", "label": "Last Name", "required": true },
    { "id": "email", "type": "email", "label": "Email Address", "required": true },
    { "id": "phone", "type": "phone", "label": "Phone Number" },
    { "id": "date_of_birth", "type": "date", "label": "Date of Birth" },
    { "id": "heading_travel", "type": "heading", "label": "Travel Preferences" },
    { "id": "travel_style", "type": "select", "label": "Travel Style", "options": ["Luxury", "Mid-range", "Budget-friendly", "Adventure", "Family-friendly"] },
    { "id": "interests", "type": "textarea", "label": "Travel Interests & Special Requests" },
    { "id": "passport_country", "type": "text", "label": "Passport Country" },
    { "id": "heading_emergency", "type": "heading", "label": "Emergency Contact" },
    { "id": "emergency_name", "type": "text", "label": "Emergency Contact Name" },
    { "id": "emergency_phone", "type": "phone", "label": "Emergency Contact Phone" }
  ],
  "settings": { "submitButtonText": "Submit Information" }
}
```

---

## API Changes

### Updated Services
- `DocumentTemplatesService.resolveTemplate()` → add `userId` parameter for agent fork resolution
- `DocumentTemplatesService.forkTemplate()` → new method to create agent/agency fork
- `EmailTemplatesService` → deprecate, redirect to `DocumentTemplatesService`

### New Endpoints
- `POST /templates/:id/fork` — create agent fork of a template
- `DELETE /templates/:id/fork` — delete agent fork (revert to parent)
- `GET /templates?channel=email|pdf|form|sms` — filter by channel

### Updated Endpoints
- `GET /templates` — add `channel` filter parameter
- Insurance email processor → use `DocumentTemplatesService.resolveTemplate()` instead of `EmailTemplatesService`

---

## Migration Plan Summary

1. **Schema migration** — add columns to `document_templates`
2. **Data migration** — move `email_templates` rows into `document_templates`
3. **Seed form templates** — insurance waiver + client intake
4. **Update Library UI** — tab navigation by channel
5. **Update template resolution** — agent → agency → system
6. **Add fork UI** — Customize/Reset buttons
7. **Update processors** — use unified resolution
8. **Update client portal** — render form templates from JSON schema
9. **Deprecate email_templates** — remove reads, keep table for safety

---

## Non-Goals (v1)

- No drag-drop form builder UI (agents edit JSON in the existing block editor for now)
- No SMS sending (template storage only — sending comes later)
- No template marketplace/sharing between agencies
- No template analytics (open rates, etc.)
- No A/B testing of template variants
- No automatic migration of agent customizations from email_templates (fresh start)
