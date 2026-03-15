# Email Integration (IMAP/SMTP) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agents to connect their cPanel email accounts (IMAP/SMTP), sync emails locally, read/write emails from within the CRM, and automatically match emails to contacts.

**Architecture:** New `email-accounts` module in the API handles IMAP sync via ImapFlow (BullMQ jobs per account, 2-min polling + on-demand), SMTP sending via Nodemailer, and email parsing via postal-mime. Emails are stored in a `synced_emails` table with attachments cached on-demand in Supabase storage. Contact matching is done by comparing `from`/`to`/`cc`/`bcc` addresses against contacts' `email` field. Admin settings store allowed domains and a global compliance footer.

**Tech Stack:** ImapFlow, Nodemailer, postal-mime, email-reply-parser, AES-256-GCM (existing EncryptionService), BullMQ (existing), Drizzle ORM, NestJS, Next.js + shadcn/ui, Tiptap (rich text signature editor)

---

## Critical Constraint: Do NOT Break Existing Email Automation

The existing `EmailModule` (`apps/api/src/email/`) handles **all transactional email** (Resend-based): welcome emails, password resets, trip order confirmations, client care follow-ups, template-based sends, email logging, and domain filtering. The new `email-accounts` module **MUST NOT** modify, import from, or interfere with the existing EmailModule in any way. They are completely independent systems:

| Concern | Existing EmailModule | New EmailAccountsModule |
|---------|---------------------|------------------------|
| **Purpose** | Transactional / automated emails | Agent personal mailbox IMAP/SMTP |
| **Provider** | Resend API | Agent's cPanel IMAP/SMTP server |
| **Tables** | `email_logs`, `email_templates` | `email_accounts`, `synced_emails`, `email_attachments` |
| **Routes** | `/emails` (logs/templates) | `/email-accounts` (CRUD, sync, send) |
| **Queue** | Uses `client-care`, `notifications` queues | Uses own `email-sync` queue |
| **Domain filter** | `email-domain-filter.ts` (non-prod) | Independent non-prod filtering in SmtpSendService (not imported from EmailModule) |

**Rules:**
- Do NOT import from `apps/api/src/email/` in any email-accounts file
- Do NOT modify any file in `apps/api/src/email/`
- Do NOT modify existing BullMQ queues (`client-care`, `notifications`, `trip-automation`)
- The existing `/emails` admin page (currently placeholder for email logs) stays at `/emails` — the new inbox page goes at `/emails/inbox` (see Route section below)

## Important Notes

- **Existing `agency_settings` table** (`packages/database/src/schema/financials.schema.ts:252`) has Stripe, compliance, and branding fields. We add email columns to it via ALTER TABLE — no new table.
- **Existing `use-agency-settings.ts` hook** (`apps/admin/src/hooks/use-agency-settings.ts`) already provides `useAgencySettings()` and `useUpdateAgencySettings()`. We extend it — no new hook file.
- **`postal-mime` is ESM-only** — API compiles to CJS (`tsconfig.json` → `module: commonjs`). Use dynamic `import()`: `const { default: PostalMime } = await import('postal-mime')`. **Spike test required** — verify dynamic import works in NestJS CJS build before proceeding with full implementation. If it fails, fall back to `mailparser` (CJS-compatible) instead.
- **SMTP TLS**: `smtpTls: true` maps to Nodemailer `secure: true` (implicit TLS on port 465). cPanel may use port 587 + STARTTLS — in that case set `smtpTls: false` and Nodemailer auto-upgrades via STARTTLS.
- **Body fetch strategy**: Sync only metadata (envelope, flags, bodyStructure) during background sync. Fetch full body on-demand when user opens an email (lazy load). This keeps sync fast for large mailboxes.
- **`threadId`** is populated during sync by matching `In-Reply-To`/`References` headers against existing `messageId` values. If a match is found, reuse that email's `threadId`; otherwise generate a new UUID.
- **SMTP security**: In non-production environments, apply recipient domain filtering similar to `email-domain-filter.ts` — but implement it independently in `SmtpSendService` (do NOT import from EmailModule). Sanitize all inbound HTML before rendering in the frontend (DOMPurify). Never log decrypted credentials — redact in all error handlers.
- **Email signature**: Already exists in Profile > Preferences tab (`preferences-tab.tsx:210`). The Email tab will handle IMAP/SMTP account setup ONLY. Signature editing stays in Preferences — do NOT duplicate it.
- **Route structure**: The existing `/emails` page (`apps/admin/src/app/emails/page.tsx`) is a placeholder for email logs. The new agent inbox goes at `/emails/inbox` as a sub-route. The nav item at `/emails` in `top-nav.tsx` stays — it will become the parent route with inbox as default view.

## File Structure

### Database (packages/database/src/schema/)
- **Create:** `email-accounts.schema.ts` — `email_accounts` table (IMAP/SMTP credentials per agent, encrypted)
- **Create:** `synced-emails.schema.ts` — `synced_emails` table (cached email messages with headers, body, flags)
- **Create:** `email-attachments.schema.ts` — `email_attachments` table (attachment metadata, cached storage path)
- **Modify:** `financials.schema.ts` — add `emailAllowedDomains` and `emailComplianceFooter` to existing `agency_settings` table
- **Modify:** `index.ts` — export new schemas

### Migrations (packages/database/src/migrations/)
- **Create:** `20260314120000_create_email_accounts.sql` (journal idx 149)
- **Create:** `20260314120100_create_synced_emails.sql` (journal idx 150)
- **Create:** `20260314120200_create_email_attachments.sql` (journal idx 151)
- **Create:** `20260314120300_add_email_settings_to_agency.sql` (journal idx 152)
- **Create:** `20260314120400_add_contact_email_index.sql` (journal idx 153) — index for fast contact matching

### Shared Types (packages/shared-types/src/api/)
- **Create:** `email-accounts.types.ts` — DTOs for email account CRUD, synced emails, attachments
- **Modify:** `index.ts` — export new types

### API Module (apps/api/src/email-accounts/)
- **Create:** `email-accounts.module.ts` — NestJS module (registers its own `email-sync` BullMQ queue, following DocumentRenderModule pattern)
- **Create:** `email-accounts.controller.ts` — REST endpoints (CRUD accounts, list/read emails, send, test connection, sync trigger)
- **Create:** `email-accounts.service.ts` — Business logic (CRUD, contact matching)
- **Create:** `imap-sync.service.ts` — ImapFlow sync logic (connect, fetch new, delta sync via UIDVALIDITY+highestModSeq)
- **Create:** `smtp-send.service.ts` — Nodemailer sending (per-account SMTP transport, signature + footer injection)
- **Create:** `email-sync.processor.ts` — BullMQ processor for `email-sync` queue
- **Create:** `dto/create-email-account.dto.ts` — Validation DTO
- **Create:** `dto/update-email-account.dto.ts` — Validation DTO
- **Create:** `dto/send-email.dto.ts` — Compose/reply/forward DTO
- **Create:** `dto/email-filter.dto.ts` — List/search filter DTO

### Admin Frontend — Profile Email Tab (apps/admin/src/app/profile/_components/)
- **Create:** `email-tab.tsx` — Email account setup form (IMAP/SMTP config, test connection). Signature editing stays in existing Preferences tab — do NOT duplicate.

### Admin Frontend — Settings Email Page (apps/admin/src/app/settings/)
- **Create:** `email/page.tsx` — Admin settings for allowed domains + compliance footer

### Admin Frontend — Email Inbox (apps/admin/src/app/emails/inbox/)
- **Modify:** `apps/admin/src/app/emails/page.tsx` — Convert placeholder to layout with sub-navigation (Inbox, Logs)
- **Create:** `inbox/page.tsx` — Main email inbox page (folder list, email list, read pane)
- **Create:** `inbox/_components/email-list.tsx` — Email list with virtual scroll
- **Create:** `inbox/_components/email-reader.tsx` — Email detail view (HTML body sanitized with DOMPurify, attachments, contact match)
- **Create:** `inbox/_components/email-compose.tsx` — Compose/reply/forward dialog with Tiptap editor
- **Create:** `inbox/_components/folder-sidebar.tsx` — IMAP folder tree
- **Create:** `inbox/_components/contact-match-banner.tsx` — Shows matched contacts or "Create Contact" / "Link to Contact" actions

### Admin Frontend — Contact Email Tab (apps/admin/src/app/contacts/)
- **Modify:** `[id]/page.tsx` — Add "Emails" tab showing all emails matching this contact's email address

### Admin Frontend — Hooks (apps/admin/src/hooks/)
- **Create:** `use-email-accounts.ts` — TanStack Query hooks for email account CRUD + connection test
- **Create:** `use-emails.ts` — TanStack Query hooks for synced emails (list, read, send, sync trigger)
- **Modify:** `use-agency-settings.ts` — Add email-specific setting hooks to existing file

### Automation (apps/api/src/automation/)
- **Modify:** `automation.types.ts` — Add `EMAIL_SYNC` queue constant + `EMAIL_DISPATCH_SYNC` job type + `EmailSyncJobData` interface ONLY. Do NOT modify `automation.module.ts` — queue is registered in EmailAccountsModule.

---

## Phase 1: Foundation — Accounts, Sync, Read

### Task 1: Install Dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install npm packages**

```bash
cd /Users/alguertin/Development/tailfire-project/tailfire
pnpm --filter @tailfire/api add imapflow nodemailer postal-mime email-reply-parser
pnpm --filter @tailfire/api add -D @types/nodemailer
```

- [ ] **Step 2: Verify installation + postal-mime ESM spike test**

Verify packages are installed, then test that `postal-mime` dynamic import works in CJS context:
```bash
# Quick spike test — run from apps/api/:
node -e "async function test() { const { default: PostalMime } = await import('postal-mime'); console.log('postal-mime loaded:', typeof PostalMime); } test().catch(e => { console.error('FAILED:', e.message); process.exit(1); })"
```
Expected: `postal-mime loaded: function`
If this fails, replace `postal-mime` with `mailparser` (`pnpm --filter @tailfire/api add mailparser && pnpm --filter @tailfire/api add -D @types/mailparser`) which is CJS-compatible.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore: add imapflow, nodemailer, postal-mime, email-reply-parser"
```

---

### Task 2: Database Schema — email_accounts

**Files:**
- Create: `packages/database/src/schema/email-accounts.schema.ts`
- Create: `packages/database/src/migrations/20260314120000_create_email_accounts.sql`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create email_accounts schema**

```typescript
// packages/database/src/schema/email-accounts.schema.ts
import { pgTable, uuid, varchar, boolean, timestamp, jsonb, integer, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { userProfiles } from './user-profiles.schema'

export const emailAccounts = pgTable('email_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').notNull(),

  // Display
  emailAddress: varchar('email_address', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),

  // IMAP config (encrypted credentials stored in imapCredentials)
  imapHost: varchar('imap_host', { length: 255 }).notNull(),
  imapPort: integer('imap_port').notNull().default(993),
  imapTls: boolean('imap_tls').notNull().default(true),

  // SMTP config
  smtpHost: varchar('smtp_host', { length: 255 }).notNull(),
  smtpPort: integer('smtp_port').notNull().default(465),
  smtpTls: boolean('smtp_tls').notNull().default(true),

  // Encrypted credentials (AES-256-GCM via EncryptionService)
  // Stores: { username, password }
  credentials: jsonb('credentials').notNull(),

  // Sync state
  isActive: boolean('is_active').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  syncState: jsonb('sync_state').default({}), // { folders: { INBOX: { uidValidity, highestModSeq, lastUid } } }

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const emailAccountsRelations = relations(emailAccounts, ({ one }) => ({
  user: one(userProfiles, {
    fields: [emailAccounts.userId],
    references: [userProfiles.id],
  }),
}))

export type EmailAccount = typeof emailAccounts.$inferSelect
export type NewEmailAccount = typeof emailAccounts.$inferInsert
```

- [ ] **Step 2: Create migration SQL**

```sql
-- 20260314120000_create_email_accounts.sql
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  imap_host VARCHAR(255) NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_tls BOOLEAN NOT NULL DEFAULT true,
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 465,
  smtp_tls BOOLEAN NOT NULL DEFAULT true,
  credentials JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  sync_state JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX idx_email_accounts_agency_id ON email_accounts(agency_id);
CREATE UNIQUE INDEX idx_email_accounts_user_email ON email_accounts(user_id, email_address);

-- RLS
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own email accounts"
  ON email_accounts FOR ALL
  USING (user_id = auth.uid());
```

- [ ] **Step 3: Register in schema index and journal**

Add export to `packages/database/src/schema/index.ts`.
Add entry to `packages/database/src/migrations/meta/_journal.json` with idx 149.

- [ ] **Step 4: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`
Expected: Migration applied successfully

- [ ] **Step 5: Commit**

```bash
git add packages/database/
git commit -m "feat(db): create email_accounts table with encrypted credentials"
```

---

### Task 3: Database Schema — synced_emails + email_attachments

**Files:**
- Create: `packages/database/src/schema/synced-emails.schema.ts`
- Create: `packages/database/src/schema/email-attachments.schema.ts`
- Create: `packages/database/src/migrations/20260314120100_create_synced_emails.sql`
- Create: `packages/database/src/migrations/20260314120200_create_email_attachments.sql`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create synced_emails schema**

```typescript
// packages/database/src/schema/synced-emails.schema.ts
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { emailAccounts } from './email-accounts.schema'

export const syncedEmails = pgTable('synced_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailAccountId: uuid('email_account_id').notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').notNull(),

  // IMAP identifiers
  messageId: varchar('message_id', { length: 512 }), // RFC Message-ID header
  imapUid: integer('imap_uid').notNull(), // required for sync idempotency (unique index)
  folder: varchar('folder', { length: 255 }).notNull().default('INBOX'),

  // Threading
  inReplyTo: varchar('in_reply_to', { length: 512 }),
  references: text('references_header'), // space-separated Message-IDs
  threadId: uuid('thread_id'), // computed thread grouping

  // Headers
  fromAddress: varchar('from_address', { length: 255 }),
  fromName: varchar('from_name', { length: 255 }),
  toAddresses: jsonb('to_addresses').default([]), // [{ address, name }]
  ccAddresses: jsonb('cc_addresses').default([]), // [{ address, name }]
  bccAddresses: jsonb('bcc_addresses').default([]), // [{ address, name }]
  subject: varchar('subject', { length: 1000 }),
  date: timestamp('date', { withTimezone: true }),

  // Body
  bodyHtml: text('body_html'),
  bodyText: text('body_text'),
  snippet: varchar('snippet', { length: 500 }), // first ~200 chars of text for list view

  // Flags
  isSeen: boolean('is_seen').notNull().default(false),
  isFlagged: boolean('is_flagged').notNull().default(false),
  isAnswered: boolean('is_answered').notNull().default(false),
  isDraft: boolean('is_draft').notNull().default(false),

  // Direction
  isOutbound: boolean('is_outbound').notNull().default(false),

  // Contact matching (computed on sync)
  matchedContactIds: jsonb('matched_contact_ids').default([]), // uuid[]

  // Size
  sizeBytes: integer('size_bytes'),
  hasAttachments: boolean('has_attachments').notNull().default(false),

  // Raw storage (optional — for re-parsing)
  rawStoragePath: text('raw_storage_path'),

  // Audit
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE constraint for IMAP idempotency — prevents duplicate inserts on re-sync
  idxUniqueImapIdentity: uniqueIndex('idx_synced_emails_unique_imap').on(table.emailAccountId, table.folder, table.imapUid),
  idxAccountFolder: index('idx_synced_emails_account_folder').on(table.emailAccountId, table.folder),
  idxMessageId: index('idx_synced_emails_message_id').on(table.messageId),
  idxDate: index('idx_synced_emails_date').on(table.date),
  idxAgency: index('idx_synced_emails_agency_id').on(table.agencyId),
  idxThreadId: index('idx_synced_emails_thread_id').on(table.threadId),
  idxMatchedContacts: index('idx_synced_emails_matched_contacts').using('gin', table.matchedContactIds),
}))

export const syncedEmailsRelations = relations(syncedEmails, ({ one }) => ({
  emailAccount: one(emailAccounts, {
    fields: [syncedEmails.emailAccountId],
    references: [emailAccounts.id],
  }),
}))

export type SyncedEmail = typeof syncedEmails.$inferSelect
export type NewSyncedEmail = typeof syncedEmails.$inferInsert
```

- [ ] **Step 2: Create email_attachments schema**

```typescript
// packages/database/src/schema/email-attachments.schema.ts
import { pgTable, uuid, varchar, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { syncedEmails } from './synced-emails.schema'

export const emailAttachments = pgTable('email_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailId: uuid('email_id').notNull().references(() => syncedEmails.id, { onDelete: 'cascade' }),

  // Attachment info
  filename: varchar('filename', { length: 500 }),
  contentType: varchar('content_type', { length: 255 }),
  sizeBytes: integer('size_bytes'),
  contentId: varchar('content_id', { length: 255 }), // for inline images (CID)
  isInline: boolean('is_inline').notNull().default(false),

  // IMAP part reference (for on-demand fetch)
  imapPartId: varchar('imap_part_id', { length: 100 }),

  // Cached storage (populated on first access)
  storagePath: text('storage_path'),
  storageUrl: text('storage_url'),
  isCached: boolean('is_cached').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const emailAttachmentsRelations = relations(emailAttachments, ({ one }) => ({
  email: one(syncedEmails, {
    fields: [emailAttachments.emailId],
    references: [syncedEmails.id],
  }),
}))

export type EmailAttachment = typeof emailAttachments.$inferSelect
export type NewEmailAttachment = typeof emailAttachments.$inferInsert
```

- [ ] **Step 3: Create migration SQL files**

Migration for `synced_emails` includes:
- **UNIQUE constraint** on `(email_account_id, folder, imap_uid)` for IMAP sync idempotency (upsert on re-sync)
- GIN index on `matched_contact_ids` for fast contact lookups
Migration for `email_attachments` with FK cascade.
Both with RLS enabled.

- [ ] **Step 4: Register in schema index and journal**

- [ ] **Step 5: Run migration locally and commit**

```bash
cd apps/api && pnpm db:migrate
git add packages/database/
git commit -m "feat(db): create synced_emails and email_attachments tables"
```

---

### Task 4: Add Email Settings to Existing agency_settings Table

**Files:**
- Modify: `packages/database/src/schema/financials.schema.ts` — add email columns to `agencySettings`
- Create: `packages/database/src/migrations/20260314120300_add_email_settings_to_agency.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

**Note:** The `agency_settings` table already exists in `financials.schema.ts` (line 252) with Stripe, compliance, and branding fields. We add email-specific columns to it.

- [ ] **Step 1: Add email columns to agencySettings in Drizzle schema**

Add to the existing `agencySettings` table definition in `financials.schema.ts`:
```typescript
// Email Integration Settings
emailAllowedDomains: jsonb('email_allowed_domains').default('[]'), // string[] — empty = no restriction; configure per agency in settings
emailComplianceFooter: text('email_compliance_footer'), // HTML footer for all outbound emails
```

- [ ] **Step 2: Create ALTER TABLE migration**

```sql
-- 20260314120300_add_email_settings_to_agency.sql
ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS email_allowed_domains JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS email_compliance_footer TEXT;
```

- [ ] **Step 3: Create contact email index migration for fast matching**

```sql
-- 20260314120400_add_contact_email_index.sql
-- Index for fast email-to-contact matching (used during sync)
-- Normalized to lowercase for case-insensitive matching
CREATE INDEX IF NOT EXISTS idx_contacts_agency_email
  ON contacts(agency_id, lower(email))
  WHERE email IS NOT NULL;
```

This index is critical for sync performance — every synced email needs to match against contacts by email address. Without it, contact matching does a full table scan per sync.

- [ ] **Step 4: Register in journal (idx 152 for settings, idx 153 for contact index), run migration, commit**

```bash
cd apps/api && pnpm db:migrate
git commit -m "feat(db): add email settings columns and contact email index"
```

---

### Task 5: Shared Types — Email DTOs

**Files:**
- Create: `packages/shared-types/src/api/email-accounts.types.ts`
- Modify: `packages/shared-types/src/api/index.ts`

- [ ] **Step 1: Create email account and email message type definitions**

Key interfaces:
- `CreateEmailAccountDto` — emailAddress, displayName, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpTls, username, password
- `UpdateEmailAccountDto` — partial of above
- `EmailAccountResponseDto` — id, userId, emailAddress, displayName, imap/smtp config (NO credentials), isActive, lastSyncAt, lastSyncError
- `TestConnectionDto` — imapHost, imapPort, imapTls, username, password
- `TestConnectionResultDto` — { success: boolean, error?: string }
- `SyncedEmailResponseDto` — id, subject, fromAddress, fromName, toAddresses, ccAddresses, date, snippet, isSeen, isFlagged, isOutbound, hasAttachments, matchedContactIds, folder
- `SyncedEmailDetailDto` — extends SyncedEmailResponseDto + bodyHtml, bodyText, attachments[]
- `EmailAttachmentDto` — id, filename, contentType, sizeBytes, isInline, storageUrl
- `SendEmailDto` — to[], cc[], bcc[], subject, bodyHtml, inReplyToEmailId?, (for reply threading)
- `EmailAddressDto` — { address: string, name?: string }
- `EmailFolderDto` — { name: string, path: string, specialUse?: string, totalMessages: number, unseenMessages: number }
- `EmailListFilterDto` — folder, search?, contactId?, page, limit

- [ ] **Step 2: Export from index, commit**

```bash
git commit -m "feat(types): add email account and synced email DTOs"
```

---

### Task 6: Extend Existing Agency Settings for Email

**Files:**
- Modify: existing agencies service/controller (wherever `agency_settings` CRUD lives) — add email fields to DTOs
- Modify: `packages/shared-types/src/api/` — extend `AgencySettingsResponseDto` and `UpdateAgencySettingsDto` with email fields

**Note:** The `agency_settings` table already has an API (PATCH `/agencies/:id/settings`) and frontend hook (`useAgencySettings`, `useUpdateAgencySettings`). We just need to add the new email columns to the shared types and DTOs.

- [ ] **Step 1: Add email fields to shared types**

In the existing `AgencySettingsResponseDto`:
```typescript
emailAllowedDomains?: string[]
emailComplianceFooter?: string | null
```

In `UpdateAgencySettingsDto`:
```typescript
emailAllowedDomains?: string[]
emailComplianceFooter?: string | null
```

- [ ] **Step 2: Update API DTO validation** (if using class-validator)

Add `@IsOptional()`, `@IsArray()`, `@IsString({ each: true })` for `emailAllowedDomains`.
Add `@IsOptional()`, `@IsString()` for `emailComplianceFooter`.

- [ ] **Step 3: Verify existing API handles the new fields** (Drizzle spread pattern should auto-include them)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): add email settings fields to agency settings DTOs"
```

---

### Task 7: API — Email Accounts Module (CRUD + Test Connection)

**Files:**
- Create: `apps/api/src/email-accounts/email-accounts.module.ts`
- Create: `apps/api/src/email-accounts/email-accounts.service.ts`
- Create: `apps/api/src/email-accounts/email-accounts.controller.ts`
- Create: `apps/api/src/email-accounts/imap-sync.service.ts`
- Create: `apps/api/src/email-accounts/smtp-send.service.ts`
- Create: `apps/api/src/email-accounts/email-sync.processor.ts`
- Create: `apps/api/src/email-accounts/dto/create-email-account.dto.ts`
- Create: `apps/api/src/email-accounts/dto/update-email-account.dto.ts`
- Create: `apps/api/src/email-accounts/dto/send-email.dto.ts`
- Create: `apps/api/src/email-accounts/dto/email-filter.dto.ts`
- Modify: `apps/api/src/app.module.ts` — import EmailAccountsModule
- Modify: `apps/api/src/automation/automation.types.ts` — add EMAIL_SYNC queue constant ONLY (do NOT modify automation.module.ts)

- [ ] **Step 1: Create DTOs with class-validator**

`CreateEmailAccountDto`:
- emailAddress (IsEmail, required)
- displayName (IsString, optional)
- imapHost, imapPort, imapTls
- smtpHost, smtpPort, smtpTls
- username, password (plaintext — encrypted before storage)

`UpdateEmailAccountDto`: PartialType of create
`EmailFilterDto`: folder, search, contactId, page, limit

- [ ] **Step 2: Create EmailAccountsService**

Methods:
- `create(userId, agencyId, dto)` — validate domain against allowed_domains setting, encrypt credentials via EncryptionService, insert
- `findAllForUser(userId)` — return accounts (strip credentials)
- `findOne(id, userId)` — return single account (strip credentials)
- `update(id, userId, dto)` — update, re-encrypt if password changed
- `remove(id, userId)` — soft-delete (set isActive=false) + cancel sync jobs
- `testConnection(dto)` — connect via ImapFlow with 10s timeout, return success/error
- `getDecryptedCredentials(accountId)` — internal only, returns plaintext { username, password }

Domain validation (empty array = no restriction):
```typescript
const allowedDomains = await this.settingsService.getEmailAllowedDomains(agencyId)
if (allowedDomains.length > 0) {
  const domain = dto.emailAddress.split('@')[1]?.toLowerCase()
  if (!allowedDomains.includes(domain)) {
    throw new BadRequestException(`Only emails from allowed domains can be added: ${allowedDomains.join(', ')}`)
  }
}
```

- [ ] **Step 3: Create EmailAccountsController**

Endpoints:
- `POST /email-accounts` — create account
- `GET /email-accounts` — list my accounts
- `GET /email-accounts/:id` — single account
- `PUT /email-accounts/:id` — update account
- `DELETE /email-accounts/:id` — deactivate account
- `POST /email-accounts/test-connection` — test IMAP connection
- `POST /email-accounts/:id/sync` — trigger on-demand sync
- `GET /email-accounts/:id/folders` — list IMAP folders
- `GET /email-accounts/:id/emails` — list synced emails (filtered)
- `GET /email-accounts/:id/emails/:emailId` — full email detail
- `GET /email-accounts/:id/emails/:emailId/attachments/:attachmentId` — download attachment
- `POST /email-accounts/:id/send` — send email via SMTP

- [ ] **Step 4: Add EMAIL_SYNC to automation types**

```typescript
// In automation.types.ts — add to QUEUES:
EMAIL_SYNC: 'email-sync',

// Add job types:
EMAIL_SYNC: 'email.sync',
EMAIL_DISPATCH_SYNC: 'email.dispatch_sync',

// Add job data interface:
export interface EmailSyncJobData {
  type: 'email.sync' | 'email.dispatch_sync'
  emailAccountId?: string // required for 'email.sync'
}
```

- [ ] **Step 5: Register email-sync queue in EmailAccountsModule (NOT AutomationModule)**

Following the `DocumentRenderModule` pattern, register the queue in the email-accounts module itself:
```typescript
// In email-accounts.module.ts imports:
BullModule.registerQueue({
  name: QUEUES.EMAIL_SYNC,
  defaultJobOptions: {
    removeOnComplete: { age: 3600, count: 200 },
    removeOnFail: { age: 24 * 3600 },
  },
}),
```
Only add the `EMAIL_SYNC` constant to `automation.types.ts` — do NOT modify `automation.module.ts`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(api): add email accounts module with CRUD, test connection, and sync queue"
```

---

### Task 8: API — IMAP Sync Service

**Files:**
- Create/Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Implement ImapSyncService**

Methods:
- `syncAccount(accountId: string): Promise<{ newMessages: number, errors: string[] }>`
  1. Load account + decrypt credentials
  2. Connect via ImapFlow (`new ImapFlow({ host, port, secure, auth: { user, pass } })`)
  3. List mailboxes, sync each (INBOX, Sent, Drafts, Trash at minimum)
  4. For each folder:
     a. Open mailbox with `getMailboxLock()`
     b. Check UIDVALIDITY — if changed, purge and re-sync folder
     c. Use `client.fetch('lastUid+1:*', { envelope: true, bodyStructure: true, flags: true, uid: true })` for new messages (metadata only — NO body fetch)
     d. For each message: extract headers from envelope (from, to, cc, subject, date, messageId, inReplyTo, references)
     e. Extract attachment metadata from bodyStructure (filename, contentType, size, partId)
     f. Generate snippet from envelope subject (body snippet deferred to on-demand fetch)
     g. Match contacts: query `contacts` table WHERE `lower(email) IN (all addresses lowercased)` AND `agency_id` matches (uses `idx_contacts_agency_email` index)
     h. Compute threadId: look up existing emails by messageId matching inReplyTo/references; reuse threadId or generate new UUID
     i. **Upsert** into `synced_emails` using `ON CONFLICT (email_account_id, folder, imap_uid) DO UPDATE SET is_seen = EXCLUDED.is_seen, is_flagged = EXCLUDED.is_flagged, is_answered = EXCLUDED.is_answered, is_draft = EXCLUDED.is_draft, updated_at = NOW()` (idempotent — safe to re-run, updates flags on re-sync). Insert `email_attachments` metadata only.
     j. Update `sync_state` on the account with new highestModSeq/lastUid
  5. Close connection
  6. Update `lastSyncAt` on account

- `fetchEmailBody(accountId: string, emailId: string): Promise<{ bodyHtml, bodyText, snippet }>`
  1. Load email record (get folder, imapUid)
  2. Connect via ImapFlow, download full message via `client.download(uid, { uid: true })`
  3. Parse with `postal-mime` (dynamic import for ESM: `const { default: PostalMime } = await import('postal-mime')`)
  4. Update `synced_emails` row with bodyHtml, bodyText, snippet
  5. Return the body content

- `listFolders(accountId: string): Promise<EmailFolderDto[]>`
  1. Connect, list mailboxes, return folder info with counts

- `fetchAttachment(accountId: string, emailId: string, attachmentId: string): Promise<{ buffer: Buffer, contentType: string, filename: string }>`
  1. Load attachment metadata (imapPartId, folder, imapUid)
  2. Connect via ImapFlow, download specific part
  3. Cache in storage, update `email_attachments.storagePath`
  4. Return buffer

- [ ] **Step 2: Handle connection errors gracefully**

Wrap all ImapFlow operations in try/catch. On auth failure, update `lastSyncError` on account. Use 30s timeout for connections.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): implement IMAP sync service with ImapFlow delta sync"
```

---

### Task 9: API — Email Sync BullMQ Processor

**Files:**
- Create/Modify: `apps/api/src/email-accounts/email-sync.processor.ts`

- [ ] **Step 1: Create EmailSyncProcessor**

```typescript
@Processor(QUEUES.EMAIL_SYNC)
export class EmailSyncProcessor extends WorkerHost {
  async process(job: Job<EmailSyncJobData>): Promise<void> {
    if (job.data.type === 'email.sync') {
      // Single account sync (on-demand or from recurring dispatcher)
      await this.imapSyncService.syncAccount(job.data.emailAccountId)
    } else if (job.data.type === 'email.dispatch_sync') {
      // Recurring dispatcher: enqueue one job per active account with dedupe
      const accounts = await this.emailAccountsService.findAllActive()
      for (const account of accounts) {
        try {
          await this.emailSyncQueue.add(
            'email.sync',
            { type: 'email.sync', emailAccountId: account.id },
            {
              jobId: `sync-${account.id}`, // dedupe: skip if already queued/running
              removeOnComplete: { age: 3600, count: 200 },
              removeOnFail: { age: 24 * 3600 },
            }
          )
        } catch (err) {
          // Duplicate jobId conflict = account already has a pending/active sync — safe to skip
          if (!err.message?.includes('duplicate')) throw err
        }
      }
    }
  }
}
```

**Concurrency & dedupe**: The `jobId: sync-${account.id}` ensures only one sync job per account can exist in the queue at a time. If a previous sync is still running when the next 2-min cycle fires, the new job is silently skipped (no duplicate work). Set worker concurrency to control parallelism:
```typescript
// In EmailAccountsModule processor registration:
@Processor(QUEUES.EMAIL_SYNC, { concurrency: 5 }) // max 5 accounts syncing in parallel
```

- [ ] **Step 2: Schedule recurring dispatcher (every 2 minutes)**

Use `@InjectQueue(QUEUES.EMAIL_SYNC)` directly in a service within EmailAccountsModule (not AutomationService, which doesn't have access to this queue):
```typescript
// In a dedicated EmailSyncScheduler service within EmailAccountsModule:
@InjectQueue(QUEUES.EMAIL_SYNC) private readonly emailSyncQueue: Queue

async onModuleInit() {
  await this.emailSyncQueue.upsertJobScheduler(
    'email-sync-dispatcher',
    { pattern: '*/2 * * * *' },
    { name: 'email.dispatch_sync', data: { type: 'email.dispatch_sync' } }
  )
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): add email sync BullMQ processor with 2-min recurring job"
```

---

### Task 10: API — SMTP Send Service

**Files:**
- Create/Modify: `apps/api/src/email-accounts/smtp-send.service.ts`

- [ ] **Step 1: Implement SmtpSendService**

Methods:
- `send(accountId: string, dto: SendEmailDto, userId: string): Promise<SyncedEmailResponseDto>`
  1. Load account + decrypt credentials
  2. Load user profile for signature (`emailSignatureConfig.signatureHtml`)
  3. Load compliance footer from agency settings (`email.compliance_footer`)
  4. Build HTML body: `dto.bodyHtml` + `<br>` + signature + `<hr style="...">` + footer
  5. Create Nodemailer transport: `createTransport({ host, port, secure, auth: { user, pass } })`
  6. Set headers: `In-Reply-To`, `References` if this is a reply (lookup original email's messageId)
  7. Send via Nodemailer
  8. Save to `synced_emails` with `isOutbound: true`, `folder: 'Sent'`
  9. Match contacts on recipient addresses
  10. Return the saved email as response DTO

- [ ] **Step 2: Add non-production recipient filtering**

In `SmtpSendService`, implement independent recipient filtering for dev/preview environments (do NOT import from `apps/api/src/email/email-domain-filter.ts` — implement separately to avoid coupling):
```typescript
private isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production'
}

private filterRecipientsForNonProd(recipients: string[]): string[] {
  if (this.isProduction()) return recipients
  const allowedDomains = ['phoenixvoyages.ca'] // non-prod safety net
  return recipients.filter(r => allowedDomains.some(d => r.toLowerCase().endsWith(`@${d}`)))
}
```

- [ ] **Step 3: Support reply, reply-all, forward**

For reply: set `In-Reply-To` to original's `messageId`, prepend original's `references` to `References` header.
For forward: no threading headers, but prefix subject with "Fwd: ".

- [ ] **Step 4: Security hardening**

- Never log decrypted IMAP/SMTP credentials — redact in all error handlers and log statements
- On account deletion (`isActive = false`), clean up cached attachments from storage
- Validate all SMTP recipients are valid email addresses before sending

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(api): implement SMTP send service with signature, compliance footer, and security"
```

---

### Task 11: Frontend — Email Account Setup (Profile Tab)

**Files:**
- Create: `apps/admin/src/app/profile/_components/email-tab.tsx`
- Create: `apps/admin/src/hooks/use-email-accounts.ts`
- Modify: `apps/admin/src/app/profile/page.tsx` — add Email tab
- Modify: `apps/admin/src/app/profile/_components/profile-form-context.tsx` — add 'email' to VALID_TABS

- [ ] **Step 1: Create use-email-accounts hook**

```typescript
// hooks/use-email-accounts.ts
// Hooks: useEmailAccounts, useCreateEmailAccount, useUpdateEmailAccount, useDeleteEmailAccount, useTestEmailConnection
```

- [ ] **Step 2: Create EmailTab component**

Form fields:
- Email Address (read-only after creation, validated against allowed domains)
- Display Name
- IMAP Host, Port, TLS toggle
- SMTP Host, Port, TLS toggle
- Username, Password (password field, masked)
- "Test Connection" button (calls POST /email-accounts/test-connection, shows success/error toast)
- "Save" button → creates or updates account

Show existing accounts in a list if the user has multiple.
Show sync status (last sync time, any errors).

- [ ] **Step 3: Do NOT add signature editing to EmailTab**

Email signature already exists in Profile > Preferences tab (`preferences-tab.tsx:210-265`). The Email tab handles IMAP/SMTP account configuration ONLY. Add a note/link in the Email tab: "To edit your email signature, go to Preferences > Email Signature."

**Future optimization**: Upgrade the existing Preferences textarea to a Tiptap rich text editor in a separate task. Do not block Phase 1 on this.

- [ ] **Step 4: Wire into profile page**

Add `<TabsTrigger value="email">Email</TabsTrigger>` and `<TabsContent>` to profile page.
Add `'email'` to `SAVEABLE_TABS` and `VALID_TABS`.
Update grid-cols from 8 to 9.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(admin): add email account setup tab to user profile"
```

---

### Task 12: Frontend — Admin Email Settings (Allowed Domains + Footer)

**Files:**
- Create: `apps/admin/src/app/settings/email/page.tsx`
- Modify: `apps/admin/src/hooks/use-agency-settings.ts` — existing file, no new file needed
- Modify: `apps/admin/src/app/settings/_components/settings-tabs-layout.tsx` — add Email tab
- Modify: `apps/admin/src/app/settings/page.tsx` — add Email card

- [ ] **Step 1: Use existing use-agency-settings hook**

The existing `useAgencySettings(agencyId)` and `useUpdateAgencySettings(agencyId)` hooks already work with PATCH `/agencies/:id/settings`. Since we added `emailAllowedDomains` and `emailComplianceFooter` to the DTO in Task 6, no new hooks needed — just call `updateAgencySettings({ emailAllowedDomains: [...], emailComplianceFooter: '...' })`.

- [ ] **Step 2: Create Email Settings page**

Two sections:
1. **Allowed Domains** — tag-style input, each domain as a chip (e.g., "phoenixvoyages.ca"). Add/remove.
2. **Compliance Footer** — Rich text editor (Tiptap) for the HTML footer appended to all outbound emails. Preview pane.

Save button calls `useUpdateAgencySettings({ emailAllowedDomains: [...], emailComplianceFooter: '...' })` which uses the existing `PATCH /agencies/:agencyId/settings` endpoint. Do NOT create new settings endpoints.

- [ ] **Step 3: Add to settings navigation**

In `settings-tabs-layout.tsx`, add:
```typescript
{ id: 'email', label: 'Email', href: '/settings/email' },
```

In `settings/page.tsx`, add card:
```typescript
{ title: 'Email Integration', description: 'Manage allowed email domains and compliance footer', href: '/settings/email', icon: <Mail className="h-6 w-6" />, available: true }
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): add email settings page for allowed domains and compliance footer"
```

---

### Task 13: Frontend — Email Inbox Page

**Files:**
- Modify: `apps/admin/src/app/emails/page.tsx` — convert placeholder to layout with sub-navigation (Inbox, Logs)
- Create: `apps/admin/src/app/emails/inbox/page.tsx`
- Create: `apps/admin/src/app/emails/inbox/_components/email-list.tsx`
- Create: `apps/admin/src/app/emails/inbox/_components/email-reader.tsx`
- Create: `apps/admin/src/app/emails/inbox/_components/folder-sidebar.tsx`
- Create: `apps/admin/src/app/emails/inbox/_components/contact-match-banner.tsx`
- Create: `apps/admin/src/hooks/use-emails.ts`

**Route structure:**
- `/emails` — parent page with sub-nav tabs: "Inbox" (`/emails/inbox`) and "Logs" (`/emails/logs` — future, existing email_logs data)
- `/emails/inbox` — the new agent inbox (3-column layout)
- The existing nav item in `top-nav.tsx` already points to `/emails` — no change needed

- [ ] **Step 1: Create use-emails hook**

```typescript
// hooks/use-emails.ts
// useEmailFolders(accountId), useEmails(accountId, filters), useEmailDetail(accountId, emailId), useSendEmail(accountId), useSyncEmails(accountId)
```

- [ ] **Step 2: Convert emails/page.tsx to layout with sub-navigation**

Replace the "Coming Soon" placeholder with a layout that has tab navigation:
- "Inbox" tab → `/emails/inbox` (default)
- "Sent Logs" tab → future (keep as placeholder for now, linking to existing `email_logs` data)
Default redirect `/emails` → `/emails/inbox`.

- [ ] **Step 3: Create inbox/page.tsx — Email page layout**

Three-column layout:
1. **Folder Sidebar** (left, narrow) — IMAP folders with unread counts
2. **Email List** (center) — paginated list of emails in selected folder, with search
3. **Email Reader** (right, or overlay on mobile) — full email view

- [ ] **Step 4: Create FolderSidebar**

Lists folders from `GET /email-accounts/:id/folders`. Highlights active folder. Shows unread count badge.
If user has no email account configured, show "Set up your email in Profile > Email" CTA.

- [ ] **Step 5: Create EmailList**

Each row: from/to name, subject, snippet, date (relative), read/unread indicator, attachment icon, flagged star.
Click selects email → loads detail in reader pane.
Search input at top → filters by subject/from/to.
"Refresh" button → triggers `POST /email-accounts/:id/sync` and refetches.

- [ ] **Step 6: Create EmailReader**

Shows: from, to, cc, date, subject, HTML body (**sanitized with DOMPurify** before rendering — never use dangerouslySetInnerHTML on raw email HTML without sanitization).
Attachment list with download links.
Reply / Reply All / Forward buttons.

- [ ] **Step 7: Create ContactMatchBanner**

If email has `matchedContactIds`, show banner: "This email is linked to: [Contact Name 1], [Contact Name 2]" with links to contact pages.
If no match: show "No matching contact found" with:
- "Create Contact" button → opens contact creation dialog pre-filled with email address + name
- "Link to Contact" button → opens search dialog to find existing contact and link

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(admin): add email inbox page with folder sidebar, list, and reader"
```

---

### Task 14: Contact Email Tab

**Files:**
- Modify: `apps/admin/src/app/contacts/[id]/page.tsx` — add Emails tab

- [ ] **Step 1: Add Emails tab to contact detail page**

Query: `GET /email-accounts/:accountId/emails?contactId=<contactId>` — returns all emails where `matchedContactIds` includes this contact.
Display as a list similar to email inbox, with subject, date, snippet, from/to.
Click opens full email in a dialog or navigates to email page.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): add emails tab to contact detail page"
```

---

## Phase 2: Compose, Reply, Forward

### Task 15: Email Compose Dialog

**Files:**
- Create: `apps/admin/src/app/emails/inbox/_components/email-compose.tsx`

- [ ] **Step 1: Create EmailCompose component**

Dialog/sheet with:
- To, Cc, Bcc fields (email input with typeahead from contacts)
- Subject line
- Tiptap rich text editor for body
- Attachment upload
- "Send" button → calls `POST /email-accounts/:id/send`

For reply: pre-fill To (from original sender), Subject ("Re: ..."), quote original body.
For reply-all: pre-fill To + Cc from original.
For forward: pre-fill Subject ("Fwd: ..."), include original body + attachments.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(admin): add email compose dialog with reply/forward support"
```

---

## Phase 3: Folders, Search, Drafts, Bulk Actions

### Task 16: Folder Management
- List folders, navigate between them
- Create/rename/delete folders (IMAP operations)

### Task 17: Full-Text Search
- Server-side IMAP SEARCH via ImapFlow
- Local DB search on synced_emails (subject + body_text)

### Task 18: Draft Saving
- Save drafts locally + sync to IMAP Drafts folder
- Auto-save while composing

### Task 19: Bulk Actions
- Select multiple emails
- Mark read/unread, flag/unflag, move to folder, delete

### Task 20: Email Flags Sync
- Sync flag changes (read/unread, flagged) back to IMAP server
- Two-way flag sync on each sync cycle

---

## Verification Checklist

After each phase, verify:
- [ ] `pnpm --filter @tailfire/admin typecheck` passes
- [ ] `pnpm --filter @tailfire/api typecheck` passes
- [ ] `cd apps/api && pnpm db:migrate` runs cleanly
- [ ] Manual test: Profile > Email tab → add account → test connection → save
- [ ] Manual test: Email inbox → emails appear after sync → read email → contact match works
- [ ] Manual test: Settings > Email → allowed domains → compliance footer
- [ ] Manual test: Contact detail > Emails tab → shows matching emails
- [ ] Codex validation via `/validate-with-codex`
