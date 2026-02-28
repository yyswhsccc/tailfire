# Template System Design

**Date:** 2026-02-27
**Scope:** Unified template system for emails, documents (Trip Orders, Payment Confirmations), and Proposal PDFs with visual block editor, Handlebars rendering, and Puppeteer PDF generation.

---

## Problem

Templates are fragmented across three systems:
1. **Email templates** — `email_templates` table with regex `{{variable}}` substitution (`VariableResolverService`). No conditionals, no loops, no formatting helpers.
2. **Trip Order PDF** — Hardcoded React-PDF components (`@react-pdf/renderer`) in `apps/api/src/financials/pdf/`. Layout changes require code deployments.
3. **No proposal PDF** — Agents cannot generate printable itinerary documents.

Users (agency admins and agents) cannot customize template layout, colors, or branding without developer intervention.

---

## Solution

A single template system where:
- Templates are designed in a **GrapesJS block editor** (drag-and-drop)
- Content uses **Handlebars** for variable substitution, conditionals, and loops
- The same template source produces **email HTML** and **print-ready PDF** (via Puppeteer)
- Templates support **block-level permissions** for fine-grained edit control
- System templates use **fork-on-edit** so agencies get auto-updates until they customize

---

## Architecture

```
                        ┌──────────────────────────────┐
                        │   GrapesJS Block Editor      │
                        │   (apps/admin)               │
                        │                              │
                        │   Blocks with permissions:   │
                        │   - editable (admin only)    │
                        │   - branding (admin + agent) │
                        │   - locked  (nobody)         │
                        └──────────┬───────────────────┘
                                   │ Save
                                   ▼
                        ┌──────────────────────────────┐
                        │   document_templates (DB)    │
                        │                              │
                        │   blocks_json  (source)      │
                        │   email_html   (compiled)    │
                        │   pdf_html     (compiled)    │
                        │   subject_template           │
                        │   text_template              │
                        └──────────┬───────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                     ▼
     ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
     │  Email Output   │  │  PDF Output      │  │  Preview         │
     │                 │  │                  │  │                  │
     │  Handlebars     │  │  Handlebars      │  │  Handlebars      │
     │  compile        │  │  compile         │  │  compile with    │
     │  email_html     │  │  pdf_html        │  │  sample data     │
     │  + context data │  │  + context data  │  │                  │
     │       │         │  │       │          │  │  → iframe        │
     │       ▼         │  │       ▼          │  │    preview       │
     │  Resend API     │  │  BullMQ queue    │  └──────────────────┘
     │  → email        │  │  → Puppeteer     │
     └────────────────┘  │  → PDF buffer    │
                          │  → Storage (R2)  │
                          └─────────────────┘
```

### Why Two HTML Outputs

Email HTML and PDF HTML have different constraints:
- **Email**: Must use inline styles, table-based layout, limited CSS (no flexbox/grid in most clients)
- **PDF**: Can use full CSS (flexbox, grid, @page, @media print), external stylesheets

The GrapesJS editor produces a single `blocks_json` source. On save, the backend compiles it into two optimized HTML strings: `email_html` (inlined styles, table layout) and `pdf_html` (full CSS, print-optimized).

---

## Database Schema

### New Table: `document_templates`

```sql
CREATE TABLE document_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               UUID REFERENCES agencies(id),    -- NULL = system template
  parent_id               UUID REFERENCES document_templates(id),
  parent_version          INTEGER,                          -- version of parent when forked

  -- Identity
  slug                    VARCHAR(100) NOT NULL,
  name                    VARCHAR(255) NOT NULL,
  description             TEXT,
  category                VARCHAR(50) NOT NULL,             -- see categories below

  -- GrapesJS source (editor reloads from this)
  blocks_json             JSONB NOT NULL,

  -- Compiled outputs (generated from blocks_json on save)
  email_html              TEXT,                             -- Handlebars HTML for email
  email_css               TEXT,
  pdf_html                TEXT,                             -- Handlebars HTML for PDF/print
  pdf_css                 TEXT,
  subject_template        TEXT,                             -- Handlebars subject line
  text_template           TEXT,                             -- Plain-text fallback

  -- Metadata
  variables               JSONB,                            -- declared variable definitions
  output_types            TEXT[] NOT NULL DEFAULT '{email}', -- 'email', 'pdf', or both

  -- Lifecycle
  status                  VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, published, archived
  published_at            TIMESTAMPTZ,
  version                 INTEGER NOT NULL DEFAULT 1,
  is_active               BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_by              UUID,
  updated_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System templates: slug must be unique
CREATE UNIQUE INDEX idx_document_templates_system_slug
  ON document_templates (slug)
  WHERE agency_id IS NULL;

-- Agency templates: slug unique per agency
CREATE UNIQUE INDEX idx_document_templates_agency_slug
  ON document_templates (agency_id, slug)
  WHERE agency_id IS NOT NULL;

-- General indexes
CREATE INDEX idx_document_templates_agency_id ON document_templates (agency_id);
CREATE INDEX idx_document_templates_category ON document_templates (category);
CREATE INDEX idx_document_templates_status ON document_templates (status);
```

### Template Categories

| Category | Output Types | Description |
|----------|-------------|-------------|
| `trip_order` | `['email', 'pdf']` | Invoice/booking document with line items, pricing, disclosures |
| `payment` | `['email', 'pdf']` | Payment confirmation receipt |
| `email` | `['email']` | Transactional emails (booking confirmed, itinerary published, welcome, password reset, task reminders, etc.) |
| `proposal` | `['pdf']` | Printable itinerary PDF with day-by-day activities |

### Block-Level Permissions (in `blocks_json`)

```json
{
  "blocks": [
    {
      "id": "header-1",
      "type": "header",
      "permission": "branding",
      "content": {
        "logo": "{{agency.logo_url}}",
        "title": "{{agency.name}}",
        "styles": { "backgroundColor": "#1a1a2e", "color": "#c8a02b" }
      }
    },
    {
      "id": "greeting-1",
      "type": "text",
      "permission": "editable",
      "content": {
        "html": "<p>Dear {{contact.first_name}},</p><p>Thank you for booking with us.</p>"
      }
    },
    {
      "id": "line-items-1",
      "type": "table",
      "permission": "locked",
      "content": {
        "html": "{{#each trip.services}}<tr><td>{{name}}</td><td>{{formatCurrency amount}}</td></tr>{{/each}}"
      }
    },
    {
      "id": "tico-disclosure",
      "type": "text",
      "permission": "locked",
      "content": {
        "html": "<p>TICO Registration #50026633. All prices in CAD.</p>"
      }
    },
    {
      "id": "agent-footer",
      "type": "footer",
      "permission": "branding",
      "content": {
        "html": "<p>{{agent.full_name}} | {{agent.email}} | {{agent.phone}}</p>"
      }
    }
  ]
}
```

**Permission levels:**

| Permission | Agency Admin | Agent | Description |
|------------|-------------|-------|-------------|
| `editable` | Full edit | Read-only | Body content, messaging |
| `branding` | Full edit | Full edit | Logo, colors, agent details |
| `locked` | Read-only | Read-only | Legal disclosures, data tables, compliance text |

The `permission` field is a plain string (not a DB enum) — future RBAC expansion adds new values without schema migrations.

---

## Handlebars Engine

### Replacing VariableResolverService

The existing `VariableResolverService` uses regex `{{variable}}` substitution with `{{variable::fallback}}` syntax. Handlebars uses the same `{{}}` delimiters, so existing templates are mostly compatible.

**Migration strategy:**
1. Register a custom `fallback` helper: `{{fallback variable "default text"}}`
2. Write a one-time migration that transforms `{{var::fallback}}` → `{{fallback var "fallback"}}` in all seeded templates
3. All existing variable categories (`contact.*`, `trip.*`, `agent.*`, `business.*`, `payment.*`, `activity.*`) become Handlebars context properties

### Custom Helpers

| Helper | Usage | Output |
|--------|-------|--------|
| `formatCurrency` | `{{formatCurrency amount currency}}` | `$1,234.56 CAD` |
| `formatDate` | `{{formatDate date "MMM D, YYYY"}}` | `Feb 27, 2026` |
| `fallback` | `{{fallback contact.phone "N/A"}}` | Value or fallback |
| `uppercase` | `{{uppercase text}}` | `UPPERCASE` |
| `portalUrl` | `{{portalUrl contact}}` | `https://client.phoenixvoyages.ca/...` |

### Context Resolution

The existing `VariableResolverService.fetchVariableValue()` logic (DB lookups by category) gets refactored into a `TemplateContextBuilder` that constructs a single context object:

```typescript
interface TemplateContext {
  contact: { first_name, last_name, email, phone, ... }
  trip: { name, reference, start_date, end_date, destination, services: [...], ... }
  agent: { first_name, last_name, full_name, email, phone, ... }
  agency: { name, phone, email, logo_url, ... }
  business: { ... }  // alias for agency — preserves backward compatibility with seeded templates
  payment: { name, amount, paid_amount, remaining, due_date, status, ... }
  activity: { name, description, ... }
}
```

Key difference: the current service resolves each variable individually with per-variable DB queries. The new `TemplateContextBuilder` does batch queries upfront (one for contact, one for trip, etc.) and passes the full object to Handlebars. More efficient, especially for templates with many variables.

**Backward compatibility:** `business.*` is kept as an alias for `agency.*` in the context object (seeded templates use `{{business.name}}`, `{{business.phone}}`, etc.). Both `{{agency.name}}` and `{{business.name}}` resolve to the same data. Custom top-level variables like `inviter_name` are passed through `additionalVariables` just as they are today.

---

## PDF Generation (Puppeteer + BullMQ)

### Architecture

PDF rendering runs as a **BullMQ processor** in the same NestJS process (consistent with how `trip-automation`, `client-care`, `notifications`, `ocr-processing`, and `enrichment` queues all work today). This avoids needing a separate worker startup script or Railway service. The queue is registered in the `DocumentRenderModule` (same pattern as `OcrImportModule` registering `ocr-processing`).

```
API Request: POST /documents/render-pdf
  │
  ▼
  DocumentsService.queuePdfRender(templateSlug, context)
  │
  ▼
  BullMQ: QUEUES.DOCUMENT_RENDER queue
  │
  ▼
  DocumentRenderProcessor (worker)
  │
  ├── 1. Load template from DB
  ├── 2. Build context (TemplateContextBuilder)
  ├── 3. Compile Handlebars (pdf_html + pdf_css)
  ├── 4. Puppeteer: page.setContent(html) → page.pdf()
  ├── 5. Upload PDF to storage (R2/B2)
  └── 6. Return storage URL + metadata
```

### New Queue

Add to `automation.types.ts`:
```typescript
QUEUES.DOCUMENT_RENDER = 'document-render'
JOB_TYPES.DOCUMENT_RENDER_PDF = 'document.render_pdf'
```

### Dockerfile Changes

Use `puppeteer-core` (not full `puppeteer`) to avoid bundled Chromium download during `pnpm install`. Install system Chromium in the Docker base stage:

```dockerfile
# In base stage (before deps install):
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# In runner stage (after deps):
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
```

**Package:** Use `puppeteer-core` in `apps/api/package.json` (not `puppeteer`). This avoids downloading ~300MB Chromium during CI/CD builds.

### Trip Order Snapshot Integration

Trip Orders use immutable versioned snapshots (`trip_orders` table with `order_data`, `payment_summary`, `booking_details`, `business_config` JSONB columns). When rendering a Trip Order PDF:
1. Load the trip order snapshot columns (not live trip data)
2. Load the `trip_order` template at the version pinned to the trip order
3. Render snapshot data through the pinned template
4. This preserves the exact document that was sent to the client

**Schema addition needed:** Add `template_id UUID` and `template_version INTEGER` columns to `trip_orders` table to pin which template version was used for each trip order.

---

## Fork-on-Edit System

### How It Works

```
System Template (agency_id = NULL, slug = 'trip-order', version = 3)
  │
  ├── Agency A: hasn't customized
  │     → Sees system version 3 (auto-updates when we ship v4)
  │
  ├── Agency B: clicked "Customize" when system was at v2
  │     → Own copy created:
  │        agency_id = B
  │        parent_id = system.id
  │        parent_version = 2
  │        slug = 'trip-order'
  │     → Frozen from system updates
  │     → Admin can see "System template updated to v3" notification
  │
  └── Agency C: hasn't customized
        → Sees system version 3
```

### Template Resolution

When rendering a template by slug:
1. Look for agency-specific template: `WHERE slug = :slug AND agency_id = :agencyId`
2. If not found, fall back to system template: `WHERE slug = :slug AND agency_id IS NULL`
3. This matches the existing `EmailTemplatesService.getTemplateBySlug()` pattern (agency takes precedence)

### Fork Flow

```
POST /document-templates/:id/fork
  │
  ├── 1. Load system template
  ├── 2. Deep-copy blocks_json, email_html, pdf_html, etc.
  ├── 3. Set agency_id = auth.agencyId
  ├── 4. Set parent_id = system template ID
  ├── 5. Set parent_version = system template's current version
  ├── 6. Insert as new row
  └── 7. Return agency's copy for editing
```

---

## GrapesJS Editor Integration

### Admin Frontend

New page at `/library/templates` (or expand existing `/library/notifications`):
- List all templates (system + agency) grouped by category
- Template editor page with GrapesJS embedded
- Block permissions enforced in the editor UI (locked blocks are non-interactive, agent role hides editable blocks)

### GrapesJS Configuration

```typescript
const editor = grapesjs.init({
  container: '#editor',
  storageManager: false,  // We manage storage via API
  plugins: ['gjs-preset-newsletter'],  // Email-optimized blocks
  blockManager: {
    blocks: [
      { id: 'header', label: 'Header', content: '...', category: 'Layout' },
      { id: 'text', label: 'Text Block', content: '...', category: 'Content' },
      { id: 'table', label: 'Data Table', content: '...', category: 'Data' },
      { id: 'image', label: 'Image', content: '...', category: 'Media' },
      { id: 'divider', label: 'Divider', content: '<hr/>', category: 'Layout' },
      { id: 'footer', label: 'Footer', content: '...', category: 'Layout' },
      { id: 'variable', label: 'Variable', content: '{{}}', category: 'Data' },
    ]
  }
})
```

### Permission Enforcement in Editor

Each GrapesJS component gets a custom trait `permission` stored in `blocks_json`. On editor load:

```typescript
// For agent role: disable editable and locked blocks
editor.on('component:selected', (component) => {
  const permission = component.get('permission')
  if (userRole === 'agent' && permission !== 'branding') {
    editor.select(null)  // Deselect, prevent editing
  }
  if (permission === 'locked') {
    editor.select(null)  // Nobody can edit locked blocks
  }
})
```

### Save Flow

```
User clicks Save
  │
  ├── 1. Extract blocks_json from GrapesJS (editor.getProjectData())
  ├── 2. Extract HTML + CSS (editor.getHtml(), editor.getCss())
  ├── 3. POST /document-templates/:id
  │      Body: { blocks_json, email_html, pdf_html, email_css, pdf_css }
  ├── 4. Backend validates block permissions haven't been tampered with
  ├── 5. Backend compiles Handlebars to verify syntax
  └── 6. Save to DB, bump version
```

---

## API Endpoints

### DocumentTemplatesModule (`apps/api/src/document-templates/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/document-templates` | JWT | List templates (system + agency, filterable by category) |
| GET | `/document-templates/:idOrSlug` | JWT | Get template by ID or slug (agency override > system fallback) |
| POST | `/document-templates` | JWT (Admin) | Create new agency template |
| PATCH | `/document-templates/:id` | JWT (Admin/Agent) | Update template (permission-gated per block) |
| DELETE | `/document-templates/:id` | JWT (Admin) | Soft-delete (is_active = false) |
| POST | `/document-templates/:id/fork` | JWT (Admin) | Fork a system template for the agency |
| POST | `/document-templates/:id/publish` | JWT (Admin) | Set status = published, snapshot published_at |
| GET | `/document-templates/:slug/preview` | JWT | Render with sample data for preview |
| POST | `/document-templates/:slug/test-email` | JWT | Send test email to current user |
| GET | `/document-templates/variables` | JWT | List available template variables |

**Route ordering:** Static routes (`/variables`, `/:slug/preview`, `/:slug/test-email`) must be declared before the dynamic `/:idOrSlug` route in the controller to avoid NestJS matching `variables` as an ID. This matches the existing pattern in `email-templates.controller.ts` (static routes at lines 89-99 before dynamic routes).

### DocumentRenderModule (`apps/api/src/document-render/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/documents/render-pdf` | JWT | Queue PDF generation, returns job ID |
| GET | `/documents/render-pdf/:jobId` | JWT | Check render status, get download URL |
| POST | `/documents/render-email` | JWT | Render + send email using template |

---

## Migration Plan

### Phase 1: New Table + Handlebars Engine (no breaking changes)

1. Create `document_templates` table (migration)
2. Install `handlebars` package
3. Create `TemplateContextBuilder` service (batch DB queries → context object)
4. Create `HandlebarsRendererService` with custom helpers
5. Register `fallback` helper for `{{var::fallback}}` compatibility
6. Create `DocumentTemplatesModule` with CRUD + preview

### Phase 2: Migrate Existing Email Templates

1. Write migration that copies `email_templates` rows → `document_templates` with full field mapping:
   - `id` → `id`
   - `agency_id` → `agency_id`
   - `slug` → `slug`
   - `name` → `name`
   - `description` → `description`
   - `subject` → `subject_template`
   - `body_html` → `email_html`
   - `body_text` → `text_template`
   - `variables` → `variables`
   - `category` → `category` (map `emailCategoryEnum` values to string)
   - `is_system` → derive from `agency_id IS NULL`
   - `is_active` → `is_active`
   - `created_by` → `created_by`
   - `created_at` → `created_at`
   - `updated_at` → `updated_at`
   - `blocks_json` = auto-generated single-block wrapper from `body_html`
   - `output_types` = `'{email}'`
   - `status` = `'published'` (all existing templates are active/published)
   - Transform `{{var::fallback}}` → `{{fallback var "fallback"}}` in `email_html`, `subject_template`, and `text_template`
2. Update `EmailTemplatesService.renderTemplate()` to use `HandlebarsRendererService`
3. Update all callers (notification.service, client-care.processor, notifications.processor, trips.service) to use new renderer
4. **Keep old `email_templates` table AND `/email-templates` API surface** — existing admin frontend hooks (`use-email-templates.ts`) and controllers continue to work. Migrate admin UI in Phase 4.
5. Add `template_id` and `template_version` columns to `trip_orders` table

### Phase 3: Puppeteer PDF Generation

1. Install `puppeteer` package
2. Update Dockerfile with Chromium dependencies
3. Add `DOCUMENT_RENDER` queue to automation module
4. Create `DocumentRenderProcessor` (BullMQ worker)
5. Create Trip Order Handlebars template (replacing React-PDF component)
6. Create Payment Confirmation template
7. Wire Trip Order generation to use new system (render from snapshot + template)

### Phase 4: GrapesJS Editor

1. Install `grapesjs` + `grapesjs-preset-newsletter` in admin app
2. Create template editor page at `/library/templates/:id/edit`
3. Implement block permission enforcement in editor
4. Implement save flow (extract blocks → compile → POST to API)
5. Create template list page at `/library/templates`
6. Add fork-on-edit flow for system templates

### Phase 5: Cleanup (only after all callers migrated)

**Prerequisites:** All of these must be true before cleanup:
- Admin UI uses `/document-templates` API (not `/email-templates`)
- `notification.service.ts`, `client-care.processor.ts`, `notifications.processor.ts` all use `HandlebarsRendererService`
- `trips.service.ts` booking confirmation uses new template system
- `trip-order.service.ts` uses Puppeteer rendering (not React-PDF)
- `use-email-templates.ts` hooks migrated to `use-document-templates.ts`

Then:
1. Remove `VariableResolverService` (replaced by `HandlebarsRendererService`)
2. Remove `EmailTemplatesController` and `EmailTemplatesService` (replaced by `DocumentTemplatesController`)
3. Remove `@react-pdf/renderer` and `trip-order-pdf.ts` (replaced by Puppeteer)
4. Drop `email_templates` table via migration
5. Update all seed migrations to target `document_templates`

---

## Files Summary

### New Files

| File | Description |
|------|-------------|
| `packages/database/src/schema/document-templates.schema.ts` | Drizzle schema |
| `packages/database/src/migrations/YYYYMMDD_create_document_templates.sql` | Migration |
| `packages/database/src/migrations/YYYYMMDD_migrate_email_templates.sql` | Data migration |
| `apps/api/src/document-templates/document-templates.module.ts` | NestJS module |
| `apps/api/src/document-templates/document-templates.controller.ts` | CRUD + preview + fork endpoints |
| `apps/api/src/document-templates/document-templates.service.ts` | Template resolution, fork, CRUD |
| `apps/api/src/document-templates/handlebars-renderer.service.ts` | Handlebars compile + helpers |
| `apps/api/src/document-templates/template-context-builder.service.ts` | Batch DB → context object |
| `apps/api/src/document-templates/template-compiler.service.ts` | blocks_json → email_html + pdf_html |
| `apps/api/src/document-templates/dto/*.ts` | DTOs for create, update, fork, render |
| `apps/api/src/document-render/document-render.module.ts` | PDF render module |
| `apps/api/src/document-render/document-render.processor.ts` | BullMQ Puppeteer worker |
| `apps/api/src/document-render/document-render.service.ts` | Queue + status API |
| `apps/admin/src/app/library/templates/page.tsx` | Template list page |
| `apps/admin/src/app/library/templates/[id]/edit/page.tsx` | GrapesJS editor page |
| `apps/admin/src/hooks/use-document-templates.ts` | React Query hooks |

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/automation/automation.types.ts` | Add `DOCUMENT_RENDER` queue + job types |
| `apps/api/src/automation/automation.module.ts` | Register new queue |
| `apps/api/src/automation/admin/bull-board.setup.ts` | Add `document-render` queue to Bull Board dashboard |
| `apps/api/src/app.module.ts` | Import `DocumentTemplatesModule`, `DocumentRenderModule` |
| `apps/api/src/email/email-templates.service.ts` | Delegate rendering to `HandlebarsRendererService` |
| `apps/api/src/financials/trip-order.service.ts` | Use new template system for PDF generation |
| `Dockerfile` | Add Chromium dependencies |
| `apps/api/package.json` | Add `handlebars`, `puppeteer-core` |
| `apps/admin/package.json` | Add `grapesjs`, `grapesjs-preset-newsletter` |
| `packages/database/src/schema/index.ts` | Export new schema |

---

## Security Considerations

1. **Handlebars SafeString**: All variable output is HTML-escaped by default. Only `{{{triple-braces}}}` outputs raw HTML — this should only be used for pre-sanitized content (agency logos, etc.)
2. **Block permission server-side validation**: On PATCH, the backend compares submitted `blocks_json` against the stored version. If a locked/editable block was modified by an agent, reject the update.
3. **Template injection**: Handlebars does not execute arbitrary JS. Custom helpers are registered server-side only.
4. **PDF rendering isolation**: Puppeteer runs in a BullMQ worker with timeout limits (30s per render). No user-supplied URLs are navigated to.

---

## Verification

- **Phase 1**: Create a document template via API, preview with sample data renders correctly
- **Phase 2**: Existing email sends (booking confirmation, payment reminders, etc.) still work with new Handlebars engine
- **Phase 3**: Trip Order PDF generates via Puppeteer, matches existing React-PDF output quality
- **Phase 4**: Admin user can open GrapesJS editor, rearrange blocks, change colors, save, and preview
- **Phase 5**: No references to old `email_templates` table or `VariableResolverService` remain
