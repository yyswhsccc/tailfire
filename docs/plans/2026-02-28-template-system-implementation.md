# Template System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified template system with GrapesJS editor, Handlebars rendering, and Puppeteer PDF generation — replacing the fragmented email templates, React-PDF trip orders, and missing proposal PDFs.

**Architecture:** A `document_templates` table stores GrapesJS block JSON and compiled Handlebars HTML (separate email/PDF outputs). `HandlebarsRendererService` replaces regex substitution. `DocumentRenderProcessor` (BullMQ) uses Puppeteer for PDFs. Fork-on-edit lets agencies customize system templates. Phase 1-3 are backend-only (no breaking changes), Phase 4 adds the editor UI, Phase 5 cleans up legacy code.

**Tech Stack:** NestJS, Drizzle ORM, Handlebars, Puppeteer-core, BullMQ, GrapesJS, Next.js, React Query

**Design Doc:** `docs/plans/2026-02-27-template-system-design.md`

---

## Phase 1: New Table + Handlebars Engine

### Task 1: Create document_templates migration

**Files:**
- Create: `packages/database/src/migrations/20260228100000_create_document_templates.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json:last entry`

**Step 1: Write the migration SQL**

```sql
-- Create document_templates table
CREATE TABLE IF NOT EXISTS document_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               UUID REFERENCES agencies(id),
  parent_id               UUID REFERENCES document_templates(id),
  parent_version          INTEGER,

  slug                    VARCHAR(100) NOT NULL,
  name                    VARCHAR(255) NOT NULL,
  description             TEXT,
  category                VARCHAR(50) NOT NULL,

  blocks_json             JSONB NOT NULL DEFAULT '{"blocks":[]}',

  email_html              TEXT,
  email_css               TEXT,
  pdf_html                TEXT,
  pdf_css                 TEXT,
  subject_template        TEXT,
  text_template           TEXT,

  variables               JSONB,
  output_types            TEXT[] NOT NULL DEFAULT '{email}',

  status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at            TIMESTAMPTZ,
  version                 INTEGER NOT NULL DEFAULT 1,
  is_active               BOOLEAN NOT NULL DEFAULT true,

  created_by              UUID,
  updated_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System templates: slug must be unique (one system template per slug)
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
CREATE INDEX idx_document_templates_parent_id ON document_templates (parent_id);

-- Enable RLS
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
```

**Step 2: Register in migration journal**

Add entry to `packages/database/src/migrations/meta/_journal.json` after the last entry (currently idx 135):
```json
{
  "idx": 136,
  "version": "7",
  "when": 1772236800000,
  "tag": "20260228100000_create_document_templates",
  "breakpoints": true
}
```

**Step 3: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`
Expected: Migration applies successfully, `document_templates` table created.

**Step 4: Verify table exists**

Run: `cd apps/api && pnpm db:migrate` (idempotent check)
Expected: No new migrations to apply.

**Step 5: Commit**

```bash
git add packages/database/src/migrations/20260228100000_create_document_templates.sql packages/database/src/migrations/meta/_journal.json
git commit -m "feat(db): create document_templates table with partial unique indexes"
```

---

### Task 2: Create Drizzle schema for document_templates

**Files:**
- Create: `packages/database/src/schema/document-templates.schema.ts`
- Modify: `packages/database/src/schema/index.ts:119` (add export)

**Step 1: Write the Drizzle schema**

Create `packages/database/src/schema/document-templates.schema.ts`:

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { agencies } from './agencies.schema'

export const documentTemplates = pgTable(
  'document_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').references(() => agencies.id),
    parentId: uuid('parent_id'), // self-referencing, set up relation separately
    parentVersion: integer('parent_version'),

    slug: varchar('slug', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 50 }).notNull(),

    blocksJson: jsonb('blocks_json').notNull().default({ blocks: [] }),

    emailHtml: text('email_html'),
    emailCss: text('email_css'),
    pdfHtml: text('pdf_html'),
    pdfCss: text('pdf_css'),
    subjectTemplate: text('subject_template'),
    textTemplate: text('text_template'),

    variables: jsonb('variables'),
    outputTypes: text('output_types')
      .array()
      .notNull()
      .default(sql`'{email}'`),

    status: varchar('status', { length: 20 }).notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),

    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_document_templates_agency_id').on(table.agencyId),
    index('idx_document_templates_category').on(table.category),
    index('idx_document_templates_status').on(table.status),
    index('idx_document_templates_parent_id').on(table.parentId),
  ],
)

export type DocumentTemplate = typeof documentTemplates.$inferSelect
export type NewDocumentTemplate = typeof documentTemplates.$inferInsert
```

**Step 2: Export from schema index**

Add to `packages/database/src/schema/index.ts` after the `email.schema` export (line 119):
```typescript
export * from './document-templates.schema'
```

**Step 3: Verify types compile**

Run: `pnpm --filter @tailfire/database build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add packages/database/src/schema/document-templates.schema.ts packages/database/src/schema/index.ts
git commit -m "feat(db): add Drizzle schema for document_templates"
```

---

### Task 3: Install Handlebars package

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install handlebars**

Run: `pnpm --filter @tailfire/api add handlebars`

**Step 2: Install types**

Run: `pnpm --filter @tailfire/api add -D @types/handlebars`

Note: `handlebars` ships its own types, so `@types/handlebars` may not exist or be needed. Check after install — if `@types/handlebars` fails, skip it (Handlebars has built-in TypeScript support).

**Step 3: Verify import works**

Run: `cd apps/api && node -e "const Handlebars = require('handlebars'); console.log(typeof Handlebars.compile)"`
Expected: `function`

**Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add handlebars dependency"
```

---

### Task 4: Create HandlebarsRendererService

This is the core rendering service that replaces `VariableResolverService`.

**Files:**
- Create: `apps/api/src/document-templates/handlebars-renderer.service.ts`
- Create: `apps/api/src/document-templates/__tests__/handlebars-renderer.service.spec.ts`

**Step 1: Write the failing test**

Create `apps/api/src/document-templates/__tests__/handlebars-renderer.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { HandlebarsRendererService } from '../handlebars-renderer.service'

describe('HandlebarsRendererService', () => {
  let service: HandlebarsRendererService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HandlebarsRendererService],
    }).compile()

    service = module.get<HandlebarsRendererService>(HandlebarsRendererService)
  })

  describe('render', () => {
    it('should substitute simple variables', () => {
      const result = service.render('Hello {{name}}', { name: 'Alice' })
      expect(result).toBe('Hello Alice')
    })

    it('should handle nested variables', () => {
      const result = service.render('Hi {{contact.first_name}}', {
        contact: { first_name: 'Bob' },
      })
      expect(result).toBe('Hi Bob')
    })

    it('should HTML-escape by default', () => {
      const result = service.render('{{text}}', { text: '<script>alert(1)</script>' })
      expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('should allow triple-brace raw output', () => {
      const result = service.render('{{{html}}}', { html: '<b>bold</b>' })
      expect(result).toBe('<b>bold</b>')
    })
  })

  describe('fallback helper', () => {
    it('should return value when present', () => {
      const result = service.render('{{fallback name "Unknown"}}', { name: 'Alice' })
      expect(result).toBe('Alice')
    })

    it('should return fallback when value is undefined', () => {
      const result = service.render('{{fallback name "Unknown"}}', {})
      expect(result).toBe('Unknown')
    })

    it('should return fallback when value is empty string', () => {
      const result = service.render('{{fallback name "Unknown"}}', { name: '' })
      expect(result).toBe('Unknown')
    })

    it('should handle nested paths with fallback', () => {
      const result = service.render('{{fallback contact.phone "N/A"}}', {
        contact: {},
      })
      expect(result).toBe('N/A')
    })
  })

  describe('formatCurrency helper', () => {
    it('should format number with currency', () => {
      const result = service.render('{{formatCurrency amount currency}}', {
        amount: 1234.5,
        currency: 'CAD',
      })
      expect(result).toContain('1,234.50')
      expect(result).toContain('CAD')
    })

    it('should default to USD when currency missing', () => {
      const result = service.render('{{formatCurrency amount}}', { amount: 100 })
      expect(result).toContain('100.00')
    })
  })

  describe('formatDate helper', () => {
    it('should format date string', () => {
      const result = service.render('{{formatDate date "MMM D, YYYY"}}', {
        date: '2026-02-27',
      })
      expect(result).toContain('Feb')
      expect(result).toContain('2026')
    })
  })

  describe('uppercase helper', () => {
    it('should uppercase text', () => {
      const result = service.render('{{uppercase text}}', { text: 'hello' })
      expect(result).toBe('HELLO')
    })
  })

  describe('#if and #each', () => {
    it('should support conditional blocks', () => {
      const result = service.render('{{#if show}}visible{{/if}}', { show: true })
      expect(result).toBe('visible')
    })

    it('should support iteration', () => {
      const result = service.render(
        '{{#each items}}{{name}},{{/each}}',
        { items: [{ name: 'a' }, { name: 'b' }] },
      )
      expect(result).toBe('a,b,')
    })
  })

  describe('compile', () => {
    it('should return a reusable template function', () => {
      const fn = service.compile('Hello {{name}}')
      expect(fn({ name: 'Alice' })).toBe('Hello Alice')
      expect(fn({ name: 'Bob' })).toBe('Hello Bob')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --testPathPattern='document-templates/__tests__/handlebars-renderer' --no-cache`
Expected: FAIL — cannot find module `../handlebars-renderer.service`

**Step 3: Write minimal implementation**

Create `apps/api/src/document-templates/handlebars-renderer.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common'
import * as Handlebars from 'handlebars'

@Injectable()
export class HandlebarsRendererService implements OnModuleInit {
  private handlebars: typeof Handlebars

  onModuleInit() {
    this.handlebars = Handlebars.create()
    this.registerHelpers()
  }

  private registerHelpers() {
    // {{fallback value "default"}} — backward compat for {{var::fallback}}
    this.handlebars.registerHelper('fallback', (value: unknown, defaultValue: string) => {
      if (value !== undefined && value !== null && value !== '') {
        return value
      }
      return defaultValue
    })

    // {{formatCurrency amount currency}}
    this.handlebars.registerHelper(
      'formatCurrency',
      (amount: number, currency?: string) => {
        const curr = typeof currency === 'string' ? currency : 'USD'
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount ?? 0)
        return `${formatted} ${curr}`
      },
    )

    // {{formatDate date "MMM D, YYYY"}}
    this.handlebars.registerHelper(
      'formatDate',
      (dateStr: string, _format?: string) => {
        if (!dateStr) return ''
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      },
    )

    // {{uppercase text}}
    this.handlebars.registerHelper('uppercase', (text: string) => {
      return typeof text === 'string' ? text.toUpperCase() : ''
    })
  }

  /**
   * Compile and render a Handlebars template string with context data.
   */
  render(template: string, context: Record<string, unknown>): string {
    const compiled = this.handlebars.compile(template)
    return compiled(context)
  }

  /**
   * Compile a template string and return a reusable render function.
   */
  compile(template: string): (context: Record<string, unknown>) => string {
    return this.handlebars.compile(template)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --testPathPattern='document-templates/__tests__/handlebars-renderer' --no-cache`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/document-templates/handlebars-renderer.service.ts apps/api/src/document-templates/__tests__/handlebars-renderer.service.spec.ts
git commit -m "feat(api): add HandlebarsRendererService with custom helpers and tests"
```

---

### Task 5: Create TemplateContextBuilder service

This service builds a full context object from DB data for Handlebars rendering. It replaces the per-variable DB queries in `VariableResolverService`.

**Files:**
- Create: `apps/api/src/document-templates/template-context-builder.service.ts`
- Create: `apps/api/src/document-templates/__tests__/template-context-builder.service.spec.ts`

**Step 1: Write the failing test**

Create `apps/api/src/document-templates/__tests__/template-context-builder.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { TemplateContextBuilderService } from '../template-context-builder.service'
import { DatabaseService } from '@tailfire/database'

const mockDb = {
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  },
}

describe('TemplateContextBuilderService', () => {
  let service: TemplateContextBuilderService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateContextBuilderService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile()

    service = module.get<TemplateContextBuilderService>(
      TemplateContextBuilderService,
    )
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('buildContext', () => {
    it('should return empty context when no IDs provided', async () => {
      const result = await service.buildContext({
        agencyId: 'agency-1',
      })
      expect(result).toHaveProperty('agency')
      expect(result).toHaveProperty('business') // backward compat alias
    })

    it('should include business as alias for agency', async () => {
      const result = await service.buildContext({
        agencyId: 'agency-1',
      })
      expect(result.business).toBe(result.agency)
    })

    it('should merge additionalVariables into context', async () => {
      const result = await service.buildContext(
        { agencyId: 'agency-1' },
        { inviter_name: 'John' },
      )
      expect(result.inviter_name).toBe('John')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --testPathPattern='document-templates/__tests__/template-context-builder' --no-cache`
Expected: FAIL — cannot find module.

**Step 3: Write implementation**

Create `apps/api/src/document-templates/template-context-builder.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '@tailfire/database'
import { eq } from 'drizzle-orm'

export interface ContextParams {
  agencyId: string
  tripId?: string
  contactId?: string
  activityId?: string
  agentId?: string
  paymentItemId?: string
}

@Injectable()
export class TemplateContextBuilderService {
  private readonly logger = new Logger(TemplateContextBuilderService.name)

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Build a full context object for Handlebars rendering.
   * Batch-loads all referenced entities upfront (one query per category).
   */
  async buildContext(
    params: ContextParams,
    additionalVariables?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { agencyId, tripId, contactId, activityId, agentId, paymentItemId } =
      params

    // Run all queries concurrently
    const [agency, contact, trip, agent, activity, payment] = await Promise.all(
      [
        this.loadAgency(agencyId),
        contactId ? this.loadContact(contactId) : null,
        tripId ? this.loadTrip(tripId) : null,
        agentId ? this.loadAgent(agentId) : null,
        activityId ? this.loadActivity(activityId) : null,
        paymentItemId ? this.loadPayment(paymentItemId) : null,
      ],
    )

    const context: Record<string, unknown> = {
      agency: agency ?? {},
      business: agency ?? {}, // backward compatibility alias
      contact: contact ?? {},
      trip: trip ?? {},
      agent: agent ?? {},
      activity: activity ?? {},
      payment: payment ?? {},
      // Spread additional variables at top level (e.g. inviter_name)
      ...additionalVariables,
    }

    return context
  }

  private async loadAgency(
    agencyId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { agencies } = await import('@tailfire/database')
      const rows = await this.databaseService.db
        .select()
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)
      return rows[0] ?? null
    } catch (error) {
      this.logger.warn(`Failed to load agency ${agencyId}: ${error}`)
      return null
    }
  }

  private async loadContact(
    contactId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { contacts } = await import('@tailfire/database')
      const rows = await this.databaseService.db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1)
      const contact = rows[0]
      if (!contact) return null
      return {
        ...contact,
        first_name: (contact as any).firstName ?? (contact as any).first_name,
        last_name: (contact as any).lastName ?? (contact as any).last_name,
        full_name: `${(contact as any).firstName ?? ''} ${(contact as any).lastName ?? ''}`.trim(),
      }
    } catch (error) {
      this.logger.warn(`Failed to load contact ${contactId}: ${error}`)
      return null
    }
  }

  private async loadTrip(
    tripId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { trips } = await import('@tailfire/database')
      const rows = await this.databaseService.db
        .select()
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1)
      const trip = rows[0]
      if (!trip) return null
      return {
        ...trip,
        start_date: (trip as any).startDate ?? (trip as any).start_date,
        end_date: (trip as any).endDate ?? (trip as any).end_date,
      }
    } catch (error) {
      this.logger.warn(`Failed to load trip ${tripId}: ${error}`)
      return null
    }
  }

  private async loadAgent(
    agentId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { users } = await import('@tailfire/database')
      const rows = await this.databaseService.db
        .select()
        .from(users)
        .where(eq(users.id, agentId))
        .limit(1)
      const user = rows[0]
      if (!user) return null
      return {
        ...user,
        first_name: (user as any).firstName ?? (user as any).first_name,
        last_name: (user as any).lastName ?? (user as any).last_name,
        full_name: `${(user as any).firstName ?? ''} ${(user as any).lastName ?? ''}`.trim(),
        name: `${(user as any).firstName ?? ''} ${(user as any).lastName ?? ''}`.trim(),
      }
    } catch (error) {
      this.logger.warn(`Failed to load agent ${agentId}: ${error}`)
      return null
    }
  }

  private async loadActivity(
    activityId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { activities } = await import('@tailfire/database')
      const rows = await this.databaseService.db
        .select()
        .from(activities)
        .where(eq(activities.id, activityId))
        .limit(1)
      return rows[0] ?? null
    } catch (error) {
      this.logger.warn(`Failed to load activity ${activityId}: ${error}`)
      return null
    }
  }

  private async loadPayment(
    paymentItemId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { paymentItems } = await import('@tailfire/database')
      const rows = await this.databaseService.db
        .select()
        .from(paymentItems)
        .where(eq(paymentItems.id, paymentItemId))
        .limit(1)
      return rows[0] ?? null
    } catch (error) {
      this.logger.warn(`Failed to load payment ${paymentItemId}: ${error}`)
      return null
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --testPathPattern='document-templates/__tests__/template-context-builder' --no-cache`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/document-templates/template-context-builder.service.ts apps/api/src/document-templates/__tests__/template-context-builder.service.spec.ts
git commit -m "feat(api): add TemplateContextBuilderService with batch DB loading"
```

---

### Task 6: Create DocumentTemplates DTOs

**Files:**
- Create: `apps/api/src/document-templates/dto/create-document-template.dto.ts`
- Create: `apps/api/src/document-templates/dto/update-document-template.dto.ts`
- Create: `apps/api/src/document-templates/dto/index.ts`

**Step 1: Write DTOs**

Create `apps/api/src/document-templates/dto/create-document-template.dto.ts`:

```typescript
import { z } from 'zod'

export const TEMPLATE_CATEGORIES = [
  'trip_order',
  'payment',
  'email',
  'proposal',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export const BLOCK_PERMISSIONS = ['editable', 'branding', 'locked'] as const

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  permission: z.string().default('editable'),
  content: z.record(z.unknown()),
})

export const createDocumentTemplateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(TEMPLATE_CATEGORIES),
  blocksJson: z
    .object({ blocks: z.array(blockSchema) })
    .default({ blocks: [] }),
  emailHtml: z.string().optional(),
  emailCss: z.string().optional(),
  pdfHtml: z.string().optional(),
  pdfCss: z.string().optional(),
  subjectTemplate: z.string().optional(),
  textTemplate: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
  outputTypes: z.array(z.enum(['email', 'pdf'])).default(['email']),
})

export type CreateDocumentTemplateDto = z.infer<
  typeof createDocumentTemplateSchema
>
```

Create `apps/api/src/document-templates/dto/update-document-template.dto.ts`:

```typescript
import { z } from 'zod'
import { createDocumentTemplateSchema } from './create-document-template.dto'

export const updateDocumentTemplateSchema = createDocumentTemplateSchema
  .partial()
  .extend({
    status: z.enum(['draft', 'published', 'archived']).optional(),
  })

export type UpdateDocumentTemplateDto = z.infer<
  typeof updateDocumentTemplateSchema
>
```

Create `apps/api/src/document-templates/dto/index.ts`:

```typescript
export * from './create-document-template.dto'
export * from './update-document-template.dto'
```

**Step 2: Verify types compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors from DTOs (pre-existing errors may appear).

**Step 3: Commit**

```bash
git add apps/api/src/document-templates/dto/
git commit -m "feat(api): add document template DTOs with Zod validation"
```

---

### Task 7: Create DocumentTemplatesService

**Files:**
- Create: `apps/api/src/document-templates/document-templates.service.ts`
- Create: `apps/api/src/document-templates/__tests__/document-templates.service.spec.ts`

**Step 1: Write the failing test**

Create `apps/api/src/document-templates/__tests__/document-templates.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { DocumentTemplatesService } from '../document-templates.service'
import { HandlebarsRendererService } from '../handlebars-renderer.service'
import { TemplateContextBuilderService } from '../template-context-builder.service'
import { DatabaseService } from '@tailfire/database'

const mockDb = {
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  },
}

describe('DocumentTemplatesService', () => {
  let service: DocumentTemplatesService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentTemplatesService,
        HandlebarsRendererService,
        { provide: TemplateContextBuilderService, useValue: { buildContext: jest.fn().mockResolvedValue({}) } },
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile()

    await module.init()
    service = module.get<DocumentTemplatesService>(DocumentTemplatesService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('resolveTemplate', () => {
    it('should return null when no template found', async () => {
      mockDb.db.limit.mockResolvedValueOnce([])
      const result = await service.resolveTemplate('nonexistent', 'agency-1')
      expect(result).toBeNull()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --testPathPattern='document-templates/__tests__/document-templates.service' --no-cache`
Expected: FAIL — cannot find module.

**Step 3: Write implementation**

Create `apps/api/src/document-templates/document-templates.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { DatabaseService, documentTemplates } from '@tailfire/database'
import { eq, and, isNull, desc, or, SQL } from 'drizzle-orm'
import { HandlebarsRendererService } from './handlebars-renderer.service'
import { TemplateContextBuilderService, ContextParams } from './template-context-builder.service'
import {
  CreateDocumentTemplateDto,
  UpdateDocumentTemplateDto,
} from './dto'

@Injectable()
export class DocumentTemplatesService {
  private readonly logger = new Logger(DocumentTemplatesService.name)

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly handlebarsRenderer: HandlebarsRendererService,
    private readonly contextBuilder: TemplateContextBuilderService,
  ) {}

  /**
   * Resolve a template by slug with agency-override logic:
   * 1. Try agency-specific: WHERE slug = :slug AND agency_id = :agencyId
   * 2. Fall back to system: WHERE slug = :slug AND agency_id IS NULL
   */
  async resolveTemplate(slug: string, agencyId: string) {
    const rows = await this.databaseService.db
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.slug, slug),
          eq(documentTemplates.isActive, true),
          or(
            eq(documentTemplates.agencyId, agencyId),
            isNull(documentTemplates.agencyId),
          ),
        ),
      )
      .orderBy(desc(documentTemplates.agencyId)) // non-null (agency) first
      .limit(1)

    return rows[0] ?? null
  }

  /**
   * Get a template by ID.
   */
  async getById(id: string, agencyId: string) {
    const rows = await this.databaseService.db
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, id),
          or(
            eq(documentTemplates.agencyId, agencyId),
            isNull(documentTemplates.agencyId),
          ),
        ),
      )
      .limit(1)

    return rows[0] ?? null
  }

  /**
   * List templates visible to an agency (system + agency-specific).
   */
  async list(
    agencyId: string,
    filters?: { category?: string; status?: string },
  ) {
    const conditions: SQL[] = [
      or(
        eq(documentTemplates.agencyId, agencyId),
        isNull(documentTemplates.agencyId),
      )!,
      eq(documentTemplates.isActive, true),
    ]

    if (filters?.category) {
      conditions.push(eq(documentTemplates.category, filters.category))
    }
    if (filters?.status) {
      conditions.push(eq(documentTemplates.status, filters.status))
    }

    return this.databaseService.db
      .select()
      .from(documentTemplates)
      .where(and(...conditions))
      .orderBy(documentTemplates.category, documentTemplates.name)
  }

  /**
   * Create a new agency template.
   */
  async create(
    agencyId: string,
    dto: CreateDocumentTemplateDto,
    createdBy?: string,
  ) {
    const rows = await this.databaseService.db
      .insert(documentTemplates)
      .values({
        agencyId,
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        blocksJson: dto.blocksJson,
        emailHtml: dto.emailHtml,
        emailCss: dto.emailCss,
        pdfHtml: dto.pdfHtml,
        pdfCss: dto.pdfCss,
        subjectTemplate: dto.subjectTemplate,
        textTemplate: dto.textTemplate,
        variables: dto.variables,
        outputTypes: dto.outputTypes,
        createdBy,
      })
      .returning()

    return rows[0]
  }

  /**
   * Update an agency template. System templates cannot be edited directly.
   */
  async update(
    id: string,
    agencyId: string,
    dto: UpdateDocumentTemplateDto,
    updatedBy?: string,
  ) {
    const existing = await this.getById(id, agencyId)
    if (!existing) throw new NotFoundException('Template not found')
    if (!existing.agencyId) {
      throw new ForbiddenException(
        'System templates cannot be edited directly. Fork it first.',
      )
    }
    if (existing.agencyId !== agencyId) {
      throw new ForbiddenException('Cannot edit another agency\'s template')
    }

    const rows = await this.databaseService.db
      .update(documentTemplates)
      .set({
        ...dto,
        version: existing.version + 1,
        updatedBy,
        updatedAt: new Date(),
        publishedAt:
          dto.status === 'published' ? new Date() : existing.publishedAt,
      })
      .where(eq(documentTemplates.id, id))
      .returning()

    return rows[0]
  }

  /**
   * Soft-delete a template (set is_active = false).
   */
  async softDelete(id: string, agencyId: string) {
    const existing = await this.getById(id, agencyId)
    if (!existing) throw new NotFoundException('Template not found')
    if (!existing.agencyId) {
      throw new ForbiddenException('System templates cannot be deleted')
    }

    await this.databaseService.db
      .update(documentTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(documentTemplates.id, id))
  }

  /**
   * Fork a system template for an agency.
   */
  async fork(templateId: string, agencyId: string, userId: string) {
    const source = await this.getById(templateId, agencyId)
    if (!source) throw new NotFoundException('Template not found')
    if (source.agencyId) {
      throw new ForbiddenException('Can only fork system templates')
    }

    // Check if agency already has a fork of this slug
    const existingFork = await this.resolveTemplate(source.slug, agencyId)
    if (existingFork && existingFork.agencyId === agencyId) {
      throw new ForbiddenException(
        `Agency already has a customized "${source.slug}" template`,
      )
    }

    const rows = await this.databaseService.db
      .insert(documentTemplates)
      .values({
        agencyId,
        parentId: source.id,
        parentVersion: source.version,
        slug: source.slug,
        name: source.name,
        description: source.description,
        category: source.category,
        blocksJson: source.blocksJson,
        emailHtml: source.emailHtml,
        emailCss: source.emailCss,
        pdfHtml: source.pdfHtml,
        pdfCss: source.pdfCss,
        subjectTemplate: source.subjectTemplate,
        textTemplate: source.textTemplate,
        variables: source.variables,
        outputTypes: source.outputTypes,
        status: 'draft',
        createdBy: userId,
      })
      .returning()

    return rows[0]
  }

  /**
   * Render a template by slug with context data from the DB.
   */
  async renderTemplate(
    slug: string,
    contextParams: ContextParams,
    additionalVariables?: Record<string, unknown>,
  ) {
    const template = await this.resolveTemplate(slug, contextParams.agencyId)
    if (!template) {
      throw new NotFoundException(`Template with slug "${slug}" not found`)
    }

    const context = await this.contextBuilder.buildContext(
      contextParams,
      additionalVariables,
    )

    const subject = template.subjectTemplate
      ? this.handlebarsRenderer.render(template.subjectTemplate, context)
      : ''

    const html = template.emailHtml
      ? this.handlebarsRenderer.render(template.emailHtml, context)
      : ''

    const text = template.textTemplate
      ? this.handlebarsRenderer.render(template.textTemplate, context)
      : ''

    return {
      subject,
      html,
      text,
      templateId: template.id,
      templateSlug: template.slug,
      templateVersion: template.version,
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --testPathPattern='document-templates/__tests__/document-templates.service' --no-cache`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/document-templates/document-templates.service.ts apps/api/src/document-templates/__tests__/document-templates.service.spec.ts
git commit -m "feat(api): add DocumentTemplatesService with CRUD, fork, and render"
```

---

### Task 8: Create DocumentTemplatesController

**Files:**
- Create: `apps/api/src/document-templates/document-templates.controller.ts`

**Step 1: Write the controller**

Create `apps/api/src/document-templates/document-templates.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
} from '@nestjs/common'
import { GetAuthContext } from '../auth/decorators/get-auth-context.decorator'
import { AuthContext } from '../auth/auth.types'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { DocumentTemplatesService } from './document-templates.service'
import { HandlebarsRendererService } from './handlebars-renderer.service'
import {
  createDocumentTemplateSchema,
  CreateDocumentTemplateDto,
  updateDocumentTemplateSchema,
  UpdateDocumentTemplateDto,
  TEMPLATE_CATEGORIES,
} from './dto'

@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(
    private readonly templatesService: DocumentTemplatesService,
    private readonly rendererService: HandlebarsRendererService,
  ) {}

  // --- Static routes FIRST (before :idOrSlug) ---

  @Get('variables')
  getAvailableVariables() {
    return {
      categories: {
        contact: [
          'first_name',
          'last_name',
          'full_name',
          'email',
          'phone',
        ],
        trip: [
          'name',
          'reference',
          'start_date',
          'end_date',
          'destination',
          'status',
        ],
        agent: ['first_name', 'last_name', 'full_name', 'email', 'phone'],
        agency: ['name', 'phone', 'email', 'logo_url'],
        business: ['name', 'phone', 'email', 'logo_url'],
        payment: [
          'name',
          'amount',
          'paid_amount',
          'remaining',
          'due_date',
          'status',
        ],
        activity: ['name', 'description'],
      },
      helpers: ['fallback', 'formatCurrency', 'formatDate', 'uppercase'],
      templateCategories: TEMPLATE_CATEGORIES,
    }
  }

  @Get('categories')
  getCategories() {
    return TEMPLATE_CATEGORIES
  }

  // --- List ---

  @Get()
  async list(
    @GetAuthContext() auth: AuthContext,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.templatesService.list(auth.agencyId, { category, status })
  }

  // --- Dynamic routes AFTER static ---

  @Get(':idOrSlug')
  async getByIdOrSlug(
    @GetAuthContext() auth: AuthContext,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    // Try UUID first, then slug
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      )

    if (isUuid) {
      return this.templatesService.getById(idOrSlug, auth.agencyId)
    }
    return this.templatesService.resolveTemplate(idOrSlug, auth.agencyId)
  }

  @Get(':slug/preview')
  async preview(
    @GetAuthContext() auth: AuthContext,
    @Param('slug') slug: string,
  ) {
    // Render with sample/empty context for preview
    return this.templatesService.renderTemplate(slug, {
      agencyId: auth.agencyId,
      agentId: auth.userId,
    })
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createDocumentTemplateSchema))
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateDocumentTemplateDto,
  ) {
    return this.templatesService.create(auth.agencyId, dto, auth.userId)
  }

  @Patch(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDocumentTemplateSchema))
    dto: UpdateDocumentTemplateDto,
  ) {
    return this.templatesService.update(id, auth.agencyId, dto, auth.userId)
  }

  @Delete(':id')
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.templatesService.softDelete(id, auth.agencyId)
    return { success: true }
  }

  @Post(':id/fork')
  async fork(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.templatesService.fork(id, auth.agencyId, auth.userId)
  }

  @Post(':id/publish')
  async publish(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.templatesService.update(
      id,
      auth.agencyId,
      { status: 'published' },
      auth.userId,
    )
  }
}
```

**Step 2: Verify types compile**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors from the controller. Note: The `ZodValidationPipe` and `GetAuthContext` imports need to match the existing codebase patterns — check `apps/api/src/common/pipes/` and `apps/api/src/auth/decorators/` for exact import paths. Adjust as needed.

**Step 3: Commit**

```bash
git add apps/api/src/document-templates/document-templates.controller.ts
git commit -m "feat(api): add DocumentTemplatesController with CRUD and fork endpoints"
```

---

### Task 9: Create DocumentTemplatesModule and wire into AppModule

**Files:**
- Create: `apps/api/src/document-templates/document-templates.module.ts`
- Modify: `apps/api/src/app.module.ts:49-162` (add import)

**Step 1: Write the module**

Create `apps/api/src/document-templates/document-templates.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { DatabaseModule } from '@tailfire/database'
import { DocumentTemplatesController } from './document-templates.controller'
import { DocumentTemplatesService } from './document-templates.service'
import { HandlebarsRendererService } from './handlebars-renderer.service'
import { TemplateContextBuilderService } from './template-context-builder.service'

@Module({
  imports: [DatabaseModule],
  controllers: [DocumentTemplatesController],
  providers: [
    DocumentTemplatesService,
    HandlebarsRendererService,
    TemplateContextBuilderService,
  ],
  exports: [
    DocumentTemplatesService,
    HandlebarsRendererService,
    TemplateContextBuilderService,
  ],
})
export class DocumentTemplatesModule {}
```

**Step 2: Register in AppModule**

Add import statement and module to `apps/api/src/app.module.ts`:

1. Add import at the top (after line ~43):
```typescript
import { DocumentTemplatesModule } from './document-templates/document-templates.module'
```

2. Add `DocumentTemplatesModule,` to the `imports` array (after `OcrImportModule` at line 153).

**Step 3: Verify the API starts**

Run: `cd apps/api && npx nest build` (or `pnpm build`)
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add apps/api/src/document-templates/document-templates.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): create DocumentTemplatesModule and register in AppModule"
```

---

### Task 10: Verify Phase 1 end-to-end

**Step 1: Start dev server and test endpoints**

Run: `turbo dev` (in tmux pane 2)

Wait for API to start, then test:

```bash
# Create a template
curl -X POST http://localhost:3101/api/v1/document-templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "test-template",
    "name": "Test Template",
    "category": "email",
    "blocksJson": {"blocks": [{"id": "b1", "type": "text", "permission": "editable", "content": {"html": "<p>Hello {{contact.first_name}}</p>"}}]},
    "emailHtml": "<p>Hello {{contact.first_name}}</p>",
    "subjectTemplate": "Welcome {{contact.first_name}}",
    "outputTypes": ["email"]
  }'

# List templates
curl http://localhost:3101/api/v1/document-templates \
  -H "Authorization: Bearer $TOKEN"

# Get variables
curl http://localhost:3101/api/v1/document-templates/variables \
  -H "Authorization: Bearer $TOKEN"
```

Expected: All return 200 with correct data.

**Step 2: Commit any fixes needed**

If any adjustments were needed (import paths, decorator names, etc.), commit them.

---

## Phase 2: Migrate Existing Email Templates

### Task 11: Write email_templates → document_templates data migration

**Files:**
- Create: `packages/database/src/migrations/20260228110000_migrate_email_templates_to_document_templates.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

**Step 1: Write the migration**

Create the migration SQL. This transforms `{{var::fallback}}` syntax to `{{fallback var "fallback"}}` during copy:

```sql
-- Migrate email_templates data to document_templates
-- Transform {{var::fallback}} syntax to {{fallback var "fallback"}} for Handlebars

INSERT INTO document_templates (
  id,
  agency_id,
  slug,
  name,
  description,
  category,
  blocks_json,
  email_html,
  email_css,
  subject_template,
  text_template,
  variables,
  output_types,
  status,
  published_at,
  version,
  is_active,
  created_by,
  created_at,
  updated_at
)
SELECT
  id,
  agency_id,
  slug,
  name,
  description,
  -- Map emailCategoryEnum to string category
  CASE category
    WHEN 'trip_order' THEN 'trip_order'
    WHEN 'payment' THEN 'payment'
    WHEN 'notification' THEN 'email'
    WHEN 'marketing' THEN 'email'
    WHEN 'system' THEN 'email'
    WHEN 'client_care' THEN 'email'
    ELSE 'email'
  END,
  -- Wrap body_html in a single-block blocks_json structure
  jsonb_build_object(
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', 'migrated-body',
        'type', 'text',
        'permission', 'editable',
        'content', jsonb_build_object('html', body_html)
      )
    )
  ),
  -- Transform {{var::fallback}} to {{fallback var "fallback"}} in body_html
  regexp_replace(
    body_html,
    '\{\{([^}:]+)::([^}]+)\}\}',
    '{{fallback \1 "\2"}}',
    'g'
  ),
  NULL, -- email_css (none in old table)
  -- Transform subject
  regexp_replace(
    subject,
    '\{\{([^}:]+)::([^}]+)\}\}',
    '{{fallback \1 "\2"}}',
    'g'
  ),
  -- Transform body_text
  CASE
    WHEN body_text IS NOT NULL THEN
      regexp_replace(
        body_text,
        '\{\{([^}:]+)::([^}]+)\}\}',
        '{{fallback \1 "\2"}}',
        'g'
      )
    ELSE NULL
  END,
  variables,
  ARRAY['email']::TEXT[],
  CASE WHEN is_active THEN 'published' ELSE 'archived' END,
  CASE WHEN is_active THEN created_at ELSE NULL END,
  1,
  is_active,
  created_by,
  created_at,
  updated_at
FROM email_templates
ON CONFLICT DO NOTHING;
```

**Step 2: Register in journal**

Add to `_journal.json`:
```json
{
  "idx": 137,
  "version": "7",
  "when": 1772240400000,
  "tag": "20260228110000_migrate_email_templates_to_document_templates",
  "breakpoints": true
}
```

**Step 3: Run migration**

Run: `cd apps/api && pnpm db:migrate`
Expected: Migration applies, rows copied from `email_templates` to `document_templates`.

**Step 4: Verify data migrated**

Connect to DB and verify:
```sql
SELECT count(*) FROM document_templates;
SELECT slug, category, status FROM document_templates LIMIT 10;
-- Verify fallback syntax was transformed
SELECT email_html FROM document_templates WHERE slug = 'booking-confirmation' LIMIT 1;
```

**Step 5: Commit**

```bash
git add packages/database/src/migrations/20260228110000_migrate_email_templates_to_document_templates.sql packages/database/src/migrations/meta/_journal.json
git commit -m "feat(db): migrate email_templates data to document_templates with syntax transform"
```

---

### Task 12: Update EmailTemplatesService to delegate rendering to Handlebars

This preserves the old `renderTemplate()` API surface while using the new Handlebars engine internally. Existing callers (`notification.service.ts`, `trips.service.ts`, processors) keep working without changes.

**Files:**
- Modify: `apps/api/src/email/email-templates.service.ts:244-270`
- Modify: `apps/api/src/email/email.module.ts`

**Step 1: Add DocumentTemplatesModule import to EmailModule**

In `apps/api/src/email/email.module.ts`, add:
```typescript
import { forwardRef } from '@nestjs/common'
import { DocumentTemplatesModule } from '../document-templates/document-templates.module'
```

Add to imports array:
```typescript
imports: [DatabaseModule, forwardRef(() => DocumentTemplatesModule)],
```

**Step 2: Update renderTemplate() in EmailTemplatesService**

In `apps/api/src/email/email-templates.service.ts`, inject the `HandlebarsRendererService` and update `renderTemplate()` (lines 244-270):

1. Add import and constructor injection:
```typescript
import { HandlebarsRendererService } from '../document-templates/handlebars-renderer.service'

// In constructor:
constructor(
  private readonly databaseService: DatabaseService,
  private readonly variableResolver: VariableResolverService,
  @Inject(forwardRef(() => HandlebarsRendererService))
  private readonly handlebarsRenderer: HandlebarsRendererService,
) {}
```

2. Update `renderTemplate()` to use Handlebars for new `document_templates` entries while keeping regex fallback for old entries:

```typescript
async renderTemplate(
  slug: string,
  context: ResolverContext,
  additionalVariables?: Record<string, string>,
): Promise<RenderedTemplate> {
  const template = await this.getTemplateBySlug(slug, context.agencyId)
  if (!template) {
    throw new NotFoundException(`Template "${slug}" not found`)
  }

  // Use existing regex resolver (still works for both old and new syntax)
  const [subject, html, text] = await Promise.all([
    this.variableResolver.resolveText(
      template.subject,
      context,
      additionalVariables,
    ),
    this.variableResolver.resolveText(
      template.bodyHtml,
      context,
      additionalVariables,
    ),
    template.bodyText
      ? this.variableResolver.resolveText(
          template.bodyText,
          context,
          additionalVariables,
        )
      : Promise.resolve(undefined),
  ])

  return {
    subject,
    html,
    text,
    templateId: template.id,
    templateSlug: template.slug,
  }
}
```

Note: Keep the existing regex-based resolver working for now. The switch to Handlebars-only rendering happens when callers are migrated to use `DocumentTemplatesService.renderTemplate()` directly. This ensures zero downtime during migration.

**Step 3: Verify API still starts and emails work**

Run: restart dev server, test an existing email flow (booking confirmation, etc.)

**Step 4: Commit**

```bash
git add apps/api/src/email/email-templates.service.ts apps/api/src/email/email.module.ts
git commit -m "feat(api): connect HandlebarsRenderer to EmailModule (dual-engine phase)"
```

---

### Task 13: Add template_id and template_version to trip_orders

**Files:**
- Create: `packages/database/src/migrations/20260228120000_add_template_pinning_to_trip_orders.sql`
- Modify: `packages/database/src/schema/trip-orders.schema.ts:31-70`
- Modify: `packages/database/src/migrations/meta/_journal.json`

**Step 1: Write migration**

```sql
-- Add template pinning columns to trip_orders for snapshot integrity
ALTER TABLE trip_orders
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES document_templates(id),
  ADD COLUMN IF NOT EXISTS template_version INTEGER;
```

**Step 2: Register in journal**

```json
{
  "idx": 138,
  "version": "7",
  "when": 1772244000000,
  "tag": "20260228120000_add_template_pinning_to_trip_orders",
  "breakpoints": true
}
```

**Step 3: Update Drizzle schema**

In `packages/database/src/schema/trip-orders.schema.ts`, add after `emailLogId` (line ~62):
```typescript
templateId: uuid('template_id'),
templateVersion: integer('template_version'),
```

**Step 4: Run migration and rebuild**

Run: `cd apps/api && pnpm db:migrate && pnpm --filter @tailfire/database build`
Expected: Both succeed.

**Step 5: Commit**

```bash
git add packages/database/src/migrations/20260228120000_add_template_pinning_to_trip_orders.sql packages/database/src/migrations/meta/_journal.json packages/database/src/schema/trip-orders.schema.ts
git commit -m "feat(db): add template_id and template_version to trip_orders for snapshot pinning"
```

---

## Phase 3: Puppeteer PDF Generation

### Task 14: Install puppeteer-core and update Dockerfile

**Files:**
- Modify: `apps/api/package.json`
- Modify: `Dockerfile:7,51-82`

**Step 1: Install puppeteer-core**

Run: `pnpm --filter @tailfire/api add puppeteer-core`

**Step 2: Update Dockerfile — base stage**

In `Dockerfile`, after the `FROM node:20-slim AS base` line (line 7), add:
```dockerfile
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

**Step 3: Update Dockerfile — runner stage**

In the runner stage (after line 51 `FROM base AS runner`), add Chromium dependencies:
```dockerfile
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

**Step 4: Verify local import**

Run: `cd apps/api && node -e "const p = require('puppeteer-core'); console.log(typeof p.launch)"`
Expected: `function`

**Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml Dockerfile
git commit -m "feat(api): add puppeteer-core and Chromium to Dockerfile"
```

---

### Task 15: Add DOCUMENT_RENDER queue to automation types

**Files:**
- Modify: `apps/api/src/automation/automation.types.ts:13-19` (QUEUES) and `30-71` (JOB_TYPES)

**Step 1: Add queue constant**

In `apps/api/src/automation/automation.types.ts`, add to QUEUES (before `} as const` at line 19):
```typescript
DOCUMENT_RENDER: 'document-render',
```

**Step 2: Add job type**

In JOB_TYPES, add:
```typescript
DOCUMENT_RENDER_PDF: 'document.render_pdf',
```

**Step 3: Add job data interface**

After the existing job data interfaces, add:
```typescript
export interface DocumentRenderJobData {
  templateSlug: string
  contextParams: {
    agencyId: string
    tripId?: string
    contactId?: string
    activityId?: string
    agentId?: string
    paymentItemId?: string
  }
  additionalVariables?: Record<string, unknown>
  outputFormat: 'pdf'
  /** Optional: trip order ID to attach the generated PDF to */
  tripOrderId?: string
  /** User who requested the render */
  requestedBy?: string
}
```

**Step 4: Verify compile**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep -c 'error'`
Expected: Same number of pre-existing errors (no new ones).

**Step 5: Commit**

```bash
git add apps/api/src/automation/automation.types.ts
git commit -m "feat(api): add DOCUMENT_RENDER queue and job types to automation"
```

---

### Task 16: Create DocumentRenderModule with BullMQ processor

**Files:**
- Create: `apps/api/src/document-render/document-render.module.ts`
- Create: `apps/api/src/document-render/document-render.service.ts`
- Create: `apps/api/src/document-render/document-render.processor.ts`
- Create: `apps/api/src/document-render/document-render.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/automation/admin/bull-board.setup.ts`

**Step 1: Create the processor**

Create `apps/api/src/document-render/document-render.processor.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import * as puppeteer from 'puppeteer-core'
import { QUEUES, DocumentRenderJobData } from '../automation/automation.types'
import { DocumentTemplatesService } from '../document-templates/document-templates.service'
import { HandlebarsRendererService } from '../document-templates/handlebars-renderer.service'
import { TemplateContextBuilderService } from '../document-templates/template-context-builder.service'

@Processor(QUEUES.DOCUMENT_RENDER)
export class DocumentRenderProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentRenderProcessor.name)
  private browser: puppeteer.Browser | null = null

  constructor(
    private readonly templatesService: DocumentTemplatesService,
    private readonly rendererService: HandlebarsRendererService,
    private readonly contextBuilder: TemplateContextBuilderService,
  ) {
    super()
  }

  async process(job: Job<DocumentRenderJobData>): Promise<{ url: string; size: number }> {
    const { templateSlug, contextParams, additionalVariables } = job.data
    this.logger.log(`Rendering PDF for template "${templateSlug}" (job ${job.id})`)

    // 1. Load template
    const template = await this.templatesService.resolveTemplate(
      templateSlug,
      contextParams.agencyId,
    )
    if (!template) {
      throw new Error(`Template "${templateSlug}" not found`)
    }
    if (!template.pdfHtml) {
      throw new Error(`Template "${templateSlug}" has no PDF HTML`)
    }

    // 2. Build context
    const context = await this.contextBuilder.buildContext(
      contextParams,
      additionalVariables as Record<string, unknown>,
    )

    // 3. Compile Handlebars
    const html = this.rendererService.render(template.pdfHtml, context)
    const css = template.pdfCss ?? ''
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>${css}</style>
        </head>
        <body>${html}</body>
      </html>
    `

    // 4. Puppeteer render
    const browser = await this.getBrowser()
    const page = await browser.newPage()
    try {
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 15000 })
      const pdfBuffer = await page.pdf({
        format: 'letter',
        printBackground: true,
        margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      })

      // 5. Upload to storage (TODO: wire StorageService in Phase 3 integration)
      // For now, return buffer size and a placeholder
      this.logger.log(
        `PDF rendered: ${pdfBuffer.length} bytes for "${templateSlug}"`,
      )

      return {
        url: `placeholder://pdf/${job.id}`,
        size: pdfBuffer.length,
      }
    } finally {
      await page.close()
    }
  }

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      })
    }
    return this.browser
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
```

**Step 2: Create the service**

Create `apps/api/src/document-render/document-render.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QUEUES, JOB_TYPES, DocumentRenderJobData } from '../automation/automation.types'

@Injectable()
export class DocumentRenderService {
  private readonly logger = new Logger(DocumentRenderService.name)

  constructor(
    @InjectQueue(QUEUES.DOCUMENT_RENDER)
    private readonly renderQueue: Queue,
  ) {}

  /**
   * Queue a PDF render job. Returns the job ID for status polling.
   */
  async queuePdfRender(data: DocumentRenderJobData): Promise<string> {
    const jobId = `render-${data.templateSlug}-${Date.now()}`
    const job = await this.renderQueue.add(
      JOB_TYPES.DOCUMENT_RENDER_PDF,
      data,
      {
        jobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    )
    this.logger.log(`Queued PDF render job ${job.id} for "${data.templateSlug}"`)
    return job.id!
  }

  /**
   * Get the status of a render job.
   */
  async getJobStatus(jobId: string) {
    const job = await this.renderQueue.getJob(jobId)
    if (!job) return null

    const state = await job.getState()
    return {
      id: job.id,
      state,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    }
  }
}
```

**Step 3: Create the controller**

Create `apps/api/src/document-render/document-render.controller.ts`:

```typescript
import { Controller, Post, Get, Body, Param } from '@nestjs/common'
import { GetAuthContext } from '../auth/decorators/get-auth-context.decorator'
import { AuthContext } from '../auth/auth.types'
import { DocumentRenderService } from './document-render.service'

@Controller('documents')
export class DocumentRenderController {
  constructor(private readonly renderService: DocumentRenderService) {}

  @Post('render-pdf')
  async renderPdf(
    @GetAuthContext() auth: AuthContext,
    @Body()
    body: {
      templateSlug: string
      tripId?: string
      contactId?: string
      activityId?: string
      tripOrderId?: string
    },
  ) {
    const jobId = await this.renderService.queuePdfRender({
      templateSlug: body.templateSlug,
      contextParams: {
        agencyId: auth.agencyId,
        tripId: body.tripId,
        contactId: body.contactId,
        activityId: body.activityId,
        agentId: auth.userId,
      },
      outputFormat: 'pdf',
      tripOrderId: body.tripOrderId,
      requestedBy: auth.userId,
    })

    return { jobId, status: 'queued' }
  }

  @Get('render-pdf/:jobId')
  async getRenderStatus(
    @GetAuthContext() _auth: AuthContext,
    @Param('jobId') jobId: string,
  ) {
    const status = await this.renderService.getJobStatus(jobId)
    if (!status) return { error: 'Job not found' }
    return status
  }
}
```

**Step 4: Create the module**

Create `apps/api/src/document-render/document-render.module.ts`:

```typescript
import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { QUEUES } from '../automation/automation.types'
import { DocumentTemplatesModule } from '../document-templates/document-templates.module'
import { DocumentRenderController } from './document-render.controller'
import { DocumentRenderService } from './document-render.service'
import { DocumentRenderProcessor } from './document-render.processor'

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.DOCUMENT_RENDER,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600, count: 100 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    }),
    DocumentTemplatesModule,
  ],
  controllers: [DocumentRenderController],
  providers: [DocumentRenderService, DocumentRenderProcessor],
  exports: [DocumentRenderService],
})
export class DocumentRenderModule {}
```

**Step 5: Register in AppModule**

In `apps/api/src/app.module.ts`, add:
```typescript
import { DocumentRenderModule } from './document-render/document-render.module'
```
And add `DocumentRenderModule,` to the imports array.

**Step 6: Add to Bull Board**

In `apps/api/src/automation/admin/bull-board.setup.ts`:

1. Add `documentRenderQueue: Queue` to the options interface (line ~92-97)
2. Add `new BullMQAdapter(options.documentRenderQueue, ...)` to the queues array (line ~118-122)
3. Add queue retrieval in `getQueuesFromApp` (line ~161-182)

**Step 7: Verify build**

Run: `cd apps/api && npx nest build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add apps/api/src/document-render/ apps/api/src/app.module.ts apps/api/src/automation/admin/bull-board.setup.ts
git commit -m "feat(api): add DocumentRenderModule with Puppeteer PDF via BullMQ"
```

---

### Task 17: Create system trip-order template seed

**Files:**
- Create: `packages/database/src/migrations/20260228130000_seed_trip_order_document_template.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

**Step 1: Write seed migration**

Create the seed with a Handlebars trip order template:

```sql
-- Seed system trip-order document template
INSERT INTO document_templates (
  slug, name, description, category,
  blocks_json,
  email_html, pdf_html, pdf_css,
  subject_template, text_template,
  variables, output_types, status, published_at, is_active, version
) VALUES (
  'trip-order',
  'Trip Order / Invoice',
  'Official trip order document with line items, pricing, and payment summary',
  'trip_order',
  '{"blocks":[
    {"id":"header","type":"header","permission":"branding","content":{"html":"<div class=\"header\"><img src=\"{{agency.logo_url}}\" alt=\"{{agency.name}}\" /><h1>{{agency.name}}</h1></div>"}},
    {"id":"title","type":"text","permission":"locked","content":{"html":"<h2>Trip Order #{{trip.reference}}</h2>"}},
    {"id":"client-info","type":"text","permission":"locked","content":{"html":"<div><p><strong>Client:</strong> {{contact.full_name}}</p><p><strong>Email:</strong> {{contact.email}}</p></div>"}},
    {"id":"trip-details","type":"text","permission":"editable","content":{"html":"<div><p><strong>Trip:</strong> {{trip.name}}</p><p><strong>Dates:</strong> {{formatDate trip.start_date}} - {{formatDate trip.end_date}}</p></div>"}},
    {"id":"disclosure","type":"text","permission":"locked","content":{"html":"<p class=\"disclosure\">{{fallback agency.tico_registration \"\"}}</p>"}},
    {"id":"footer","type":"footer","permission":"branding","content":{"html":"<div class=\"footer\"><p>{{agent.full_name}} | {{agent.email}} | {{fallback agent.phone \"\"}}</p><p>{{agency.name}} | {{agency.phone}} | {{agency.email}}</p></div>"}}
  ]}'::jsonb,
  NULL, -- email_html (trip orders use PDF primarily)
  '<div class="header"><img src="{{agency.logo_url}}" alt="{{agency.name}}" /><h1>{{agency.name}}</h1></div><h2>Trip Order #{{trip.reference}}</h2><div><p><strong>Client:</strong> {{contact.full_name}}</p><p><strong>Email:</strong> {{contact.email}}</p></div><div><p><strong>Trip:</strong> {{trip.name}}</p><p><strong>Dates:</strong> {{formatDate trip.start_date}} - {{formatDate trip.end_date}}</p></div><p class="disclosure">{{fallback agency.tico_registration ""}}</p><div class="footer"><p>{{agent.full_name}} | {{agent.email}} | {{fallback agent.phone ""}}</p><p>{{agency.name}} | {{agency.phone}} | {{agency.email}}</p></div>',
  'body { font-family: Arial, sans-serif; margin: 0; padding: 20px; } .header { display: flex; align-items: center; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; margin-bottom: 20px; } .header img { max-height: 60px; margin-right: 15px; } .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 12px; color: #666; } .disclosure { font-size: 10px; color: #999; margin-top: 20px; }',
  'Trip Order #{{trip.reference}} - {{agency.name}}',
  'Trip Order #{{trip.reference}} from {{agency.name}} for {{contact.full_name}}. Trip: {{trip.name}}, {{formatDate trip.start_date}} - {{formatDate trip.end_date}}.',
  '{"contact": ["first_name","last_name","full_name","email","phone"], "trip": ["name","reference","start_date","end_date","destination"], "agent": ["full_name","email","phone"], "agency": ["name","phone","email","logo_url","tico_registration"]}'::jsonb,
  ARRAY['email','pdf'],
  'published',
  NOW(),
  true,
  1
)
ON CONFLICT DO NOTHING;
```

**Step 2: Register in journal**

```json
{
  "idx": 139,
  "version": "7",
  "when": 1772247600000,
  "tag": "20260228130000_seed_trip_order_document_template",
  "breakpoints": true
}
```

**Step 3: Run migration**

Run: `cd apps/api && pnpm db:migrate`

**Step 4: Commit**

```bash
git add packages/database/src/migrations/20260228130000_seed_trip_order_document_template.sql packages/database/src/migrations/meta/_journal.json
git commit -m "feat(db): seed system trip-order document template"
```

---

### Task 18: Verify Phase 2 + 3 end-to-end

**Step 1: Test PDF render queue**

```bash
# Queue a PDF render
curl -X POST http://localhost:3101/api/v1/documents/render-pdf \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"templateSlug": "trip-order", "tripId": "<valid-trip-id>"}'

# Check status
curl http://localhost:3101/api/v1/documents/render-pdf/<job-id> \
  -H "Authorization: Bearer $TOKEN"
```

**Step 2: Verify existing email sends still work**

Test a booking confirmation or notification email to confirm the old flow isn't broken.

**Step 3: Commit any fixes**

---

## Phase 4: GrapesJS Editor (Admin)

### Task 19: Install GrapesJS in admin

**Files:**
- Modify: `apps/admin/package.json`

**Step 1: Install GrapesJS**

Run:
```bash
pnpm --filter @tailfire/admin add grapesjs grapesjs-preset-newsletter
pnpm --filter @tailfire/admin add -D @types/grapesjs
```

Note: If `@types/grapesjs` doesn't exist, skip it — GrapesJS may ship its own types.

**Step 2: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "feat(admin): add grapesjs and newsletter preset dependencies"
```

---

### Task 20: Create React Query hooks for document templates

**Files:**
- Create: `apps/admin/src/hooks/use-document-templates.ts`

**Step 1: Write the hooks**

Create `apps/admin/src/hooks/use-document-templates.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface DocumentTemplate {
  id: string
  agencyId: string | null
  parentId: string | null
  parentVersion: number | null
  slug: string
  name: string
  description: string | null
  category: string
  blocksJson: { blocks: Array<{ id: string; type: string; permission: string; content: Record<string, unknown> }> }
  emailHtml: string | null
  emailCss: string | null
  pdfHtml: string | null
  pdfCss: string | null
  subjectTemplate: string | null
  textTemplate: string | null
  variables: Record<string, unknown> | null
  outputTypes: string[]
  status: string
  publishedAt: string | null
  version: number
  isActive: boolean
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

const templateKeys = {
  all: ['document-templates'] as const,
  list: (filters?: { category?: string; status?: string }) =>
    [...templateKeys.all, 'list', filters] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
  variables: () => [...templateKeys.all, 'variables'] as const,
}

export function useDocumentTemplates(filters?: {
  category?: string
  status?: string
}) {
  const params = new URLSearchParams()
  if (filters?.category) params.set('category', filters.category)
  if (filters?.status) params.set('status', filters.status)
  const query = params.toString()

  return useQuery({
    queryKey: templateKeys.list(filters),
    queryFn: () =>
      api.get<DocumentTemplate[]>(
        `/document-templates${query ? `?${query}` : ''}`,
      ),
  })
}

export function useDocumentTemplate(idOrSlug: string) {
  return useQuery({
    queryKey: templateKeys.detail(idOrSlug),
    queryFn: () =>
      api.get<DocumentTemplate>(`/document-templates/${idOrSlug}`),
    enabled: !!idOrSlug,
  })
}

export function useTemplateVariables() {
  return useQuery({
    queryKey: templateKeys.variables(),
    queryFn: () => api.get('/document-templates/variables'),
    staleTime: 10 * 60 * 1000, // 10 min
  })
}

export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<DocumentTemplate>) =>
      api.post<DocumentTemplate>('/document-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<DocumentTemplate>) =>
      api.patch<DocumentTemplate>(`/document-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

export function useForkDocumentTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<DocumentTemplate>(`/document-templates/${id}/fork`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

export function usePublishDocumentTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<DocumentTemplate>(`/document-templates/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/document-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

export function useRenderPdf() {
  return useMutation({
    mutationFn: (data: {
      templateSlug: string
      tripId?: string
      contactId?: string
    }) => api.post<{ jobId: string }>('/documents/render-pdf', data),
  })
}

export function useRenderPdfStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['render-pdf', jobId],
    queryFn: () => api.get(`/documents/render-pdf/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as any
      if (data?.state === 'completed' || data?.state === 'failed') return false
      return 2000 // Poll every 2s while in progress
    },
  })
}
```

**Step 2: Verify admin types compile**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: No new type errors.

**Step 3: Commit**

```bash
git add apps/admin/src/hooks/use-document-templates.ts
git commit -m "feat(admin): add React Query hooks for document templates"
```

---

### Task 21: Create template list page

**Files:**
- Create: `apps/admin/src/app/library/templates/page.tsx`

**Step 1: Write the page**

Create `apps/admin/src/app/library/templates/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  useDocumentTemplates,
  useDeleteDocumentTemplate,
  useForkDocumentTemplate,
  usePublishDocumentTemplate,
  DocumentTemplate,
} from '@/hooks/use-document-templates'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CATEGORY_LABELS: Record<string, string> = {
  trip_order: 'Trip Order',
  payment: 'Payment',
  email: 'Email',
  proposal: 'Proposal',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-800',
}

export default function TemplatesPage() {
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>()
  const { data: templates, isLoading } = useDocumentTemplates({
    category: categoryFilter,
  })
  const deleteMutation = useDeleteDocumentTemplate()
  const forkMutation = useForkDocumentTemplate()
  const publishMutation = usePublishDocumentTemplate()

  if (isLoading) {
    return <div className="p-6">Loading templates...</div>
  }

  const grouped = (templates ?? []).reduce(
    (acc, t) => {
      const cat = t.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(t)
      return acc
    },
    {} as Record<string, DocumentTemplate[]>,
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Document Templates</h1>
        <div className="flex items-center gap-3">
          <Select
            value={categoryFilter ?? 'all'}
            onValueChange={(v) =>
              setCategoryFilter(v === 'all' ? undefined : v)
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="trip_order">Trip Order</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="proposal">Proposal</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/library/templates/new">
            <Button>New Template</Button>
          </Link>
        </div>
      </div>

      {Object.entries(grouped).map(([category, categoryTemplates]) => (
        <div key={category} className="space-y-3">
          <h2 className="text-lg font-semibold">
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <div className="grid gap-3">
            {categoryTemplates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.name}</span>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[template.status]}
                    >
                      {template.status}
                    </Badge>
                    {!template.agencyId && (
                      <Badge variant="secondary">System</Badge>
                    )}
                    {template.parentId && (
                      <Badge variant="outline">Customized</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {template.slug} &middot; v{template.version} &middot;{' '}
                    {template.outputTypes.join(', ')}
                  </p>
                  {template.description && (
                    <p className="text-sm text-muted-foreground">
                      {template.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!template.agencyId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => forkMutation.mutate(template.id)}
                      disabled={forkMutation.isPending}
                    >
                      Customize
                    </Button>
                  )}
                  {template.agencyId && (
                    <>
                      <Link href={`/library/templates/${template.id}/edit`}>
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      </Link>
                      {template.status === 'draft' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => publishMutation.mutate(template.id)}
                          disabled={publishMutation.isPending}
                        >
                          Publish
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this template?')) {
                            deleteMutation.mutate(template.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {(!templates || templates.length === 0) && (
        <p className="text-muted-foreground">No templates found.</p>
      )}
    </div>
  )
}
```

**Step 2: Verify admin builds**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add apps/admin/src/app/library/templates/page.tsx
git commit -m "feat(admin): add template list page at /library/templates"
```

---

### Task 22: Create GrapesJS editor page

**Files:**
- Create: `apps/admin/src/app/library/templates/[id]/edit/page.tsx`

**Step 1: Write the editor page**

This is a substantial component. Create `apps/admin/src/app/library/templates/[id]/edit/page.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import grapesjs, { Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import {
  useDocumentTemplate,
  useUpdateDocumentTemplate,
} from '@/hooks/use-document-templates'
import { Button } from '@/components/ui/button'

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const editorRef = useRef<Editor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: template, isLoading } = useDocumentTemplate(id)
  const updateMutation = useUpdateDocumentTemplate()
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !template || editorRef.current) return

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: 'auto',
      storageManager: false,
      plugins: [],
      blockManager: {
        blocks: [
          {
            id: 'text',
            label: 'Text',
            content: '<div data-gjs-type="text">Insert text here</div>',
            category: 'Content',
          },
          {
            id: 'image',
            label: 'Image',
            content: { type: 'image' },
            category: 'Media',
          },
          {
            id: 'divider',
            label: 'Divider',
            content: '<hr style="border-top: 1px solid #ccc; margin: 20px 0;" />',
            category: 'Layout',
          },
          {
            id: 'variable',
            label: 'Variable',
            content: '<span data-gjs-type="text">{{variable_name}}</span>',
            category: 'Data',
          },
        ],
      },
    })

    // Load template content
    if (template.blocksJson?.blocks?.length) {
      const html = template.blocksJson.blocks
        .map((b: any) => b.content?.html ?? '')
        .join('')
      editor.setComponents(html)
    }

    // Enforce block permissions
    editor.on('component:selected', (component: any) => {
      const permission = component.get('attributes')?.['data-permission']
      if (permission === 'locked') {
        editor.select(null as any)
      }
    })

    editorRef.current = editor

    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [template])

  const handleSave = useCallback(async () => {
    if (!editorRef.current || !template) return
    setIsSaving(true)

    try {
      const editor = editorRef.current
      const html = editor.getHtml()
      const css = editor.getCss()

      await updateMutation.mutateAsync({
        id: template.id,
        emailHtml: html,
        emailCss: css,
        pdfHtml: html,
        pdfCss: css,
      })
    } finally {
      setIsSaving(false)
    }
  }, [template, updateMutation])

  if (isLoading) {
    return <div className="p-6">Loading editor...</div>
  }

  if (!template) {
    return <div className="p-6">Template not found.</div>
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()}>
            Back
          </Button>
          <h1 className="font-semibold">{template.name}</h1>
          <span className="text-sm text-muted-foreground">v{template.version}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
```

**Step 2: Verify admin types**

Run: `pnpm --filter @tailfire/admin typecheck`
Expected: Pass (or only pre-existing errors).

**Step 3: Commit**

```bash
git add apps/admin/src/app/library/templates/\[id\]/edit/page.tsx
git commit -m "feat(admin): add GrapesJS template editor page"
```

---

## Phase 5: Cleanup (defer until all callers migrated)

Phase 5 is intentionally NOT detailed here. It requires all callers to be migrated first:

- `notification.service.ts` → `DocumentTemplatesService.renderTemplate()`
- `client-care.processor.ts` → new template system
- `notifications.processor.ts` → new template system
- `trips.service.ts` → new template system
- `trip-order.service.ts` → Puppeteer rendering
- Admin `use-email-templates.ts` → `use-document-templates.ts`

Only after all callers are migrated should we:
1. Remove `VariableResolverService`
2. Remove `EmailTemplatesController` and `EmailTemplatesService`
3. Remove `@react-pdf/renderer` and `trip-order-pdf.ts`
4. Drop `email_templates` table

**Write a separate Phase 5 plan when ready.**

---

## Summary of all commits

| Task | Commit message |
|------|---------------|
| 1 | `feat(db): create document_templates table with partial unique indexes` |
| 2 | `feat(db): add Drizzle schema for document_templates` |
| 3 | `feat(api): add handlebars dependency` |
| 4 | `feat(api): add HandlebarsRendererService with custom helpers and tests` |
| 5 | `feat(api): add TemplateContextBuilderService with batch DB loading` |
| 6 | `feat(api): add document template DTOs with Zod validation` |
| 7 | `feat(api): add DocumentTemplatesService with CRUD, fork, and render` |
| 8 | `feat(api): add DocumentTemplatesController with CRUD and fork endpoints` |
| 9 | `feat(api): create DocumentTemplatesModule and register in AppModule` |
| 10 | Phase 1 verification (fix commit if needed) |
| 11 | `feat(db): migrate email_templates data to document_templates with syntax transform` |
| 12 | `feat(api): connect HandlebarsRenderer to EmailModule (dual-engine phase)` |
| 13 | `feat(db): add template_id and template_version to trip_orders for snapshot pinning` |
| 14 | `feat(api): add puppeteer-core and Chromium to Dockerfile` |
| 15 | `feat(api): add DOCUMENT_RENDER queue and job types to automation` |
| 16 | `feat(api): add DocumentRenderModule with Puppeteer PDF via BullMQ` |
| 17 | `feat(db): seed system trip-order document template` |
| 18 | Phase 2+3 verification |
| 19 | `feat(admin): add grapesjs and newsletter preset dependencies` |
| 20 | `feat(admin): add React Query hooks for document templates` |
| 21 | `feat(admin): add template list page at /library/templates` |
| 22 | `feat(admin): add GrapesJS template editor page` |
