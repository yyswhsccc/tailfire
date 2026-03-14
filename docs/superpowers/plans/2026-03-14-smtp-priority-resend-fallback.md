# SMTP Send Priority + Resend Fallback Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route transactional emails through the assigned agent's SMTP account first, falling back to Resend on pre-delivery failure, with unified footer/signature via a shared `buildEmailBody()` utility.

**Architecture:** EmailService gains agent resolution (contactId → tripId → createdBy waterfall) and SMTP-first routing via `SmtpSendService.sendRaw()`. A shared `buildEmailBody()` utility in `apps/api/src/common/email/` replaces three different footer/signature implementations. EmailModule imports EmailAccountsModule via `forwardRef()` to break the circular dependency chain (EmailAccountsModule → NotificationModule → EmailModule). Resend fallback always uses verified domain for `from` with agent email as `replyTo`.

**Tech Stack:** NestJS, Drizzle ORM, nodemailer, Resend API, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-14-smtp-priority-resend-fallback-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/common/email/build-email-body.ts` | **Create** | Shared `buildEmailBody()` — appends signature + compliance footer to HTML content |
| `apps/api/src/email-accounts/email-accounts.service.ts` | **Modify** | Add `findActiveAccountForUser(userId, agencyId)` method |
| `apps/api/src/email-accounts/smtp-send.service.ts` | **Modify** | Add `sendRaw()` method; refactor `send()` to use `buildEmailBody()` |
| `apps/api/src/email-accounts/email-accounts.module.ts` | **Modify** | Export `SmtpSendService`; update module comment |
| `apps/api/src/email/email.module.ts` | **Modify** | Import `EmailAccountsModule` with `forwardRef()` |
| `apps/api/src/email/email.service.ts` | **Modify** | Agent resolution, SMTP-first routing, Resend fallback, `buildEmailBody()`, synced_emails write, double-send prevention |
| `apps/api/src/email/templates/welcome.template.ts` | **Modify** | Remove inline "Phoenix Voyages" footer |
| `apps/api/src/email/templates/invite.template.ts` | **Modify** | Remove inline "Phoenix Voyages" footer |
| `apps/api/src/email/templates/password-reset.template.ts` | **Modify** | Remove inline "Phoenix Voyages" footer |
| `apps/api/src/email/templates/client-portal-invite.template.ts` | **Modify** | Remove inline "Phoenix Voyages" footer |
| `apps/api/src/email-accounts/imap-sync.service.ts` | **Modify** | Add messageId-based dedup for outbound SMTP-sent emails |

---

## Chunk 1: Foundation

### Task 1: Create `buildEmailBody()` utility

**Files:**
- Create: `apps/api/src/common/email/build-email-body.ts`

This is a pure function. Location is `apps/api/src/common/email/` — a neutral path importable by both EmailModule and EmailAccountsModule without violating the "do NOT import from apps/api/src/email/" boundary rule in `email-accounts.module.ts:17`.

- [ ] **Step 1: Create the utility file**

```typescript
// apps/api/src/common/email/build-email-body.ts

export interface BuildEmailBodyOptions {
  signatureHtml?: string | null
  complianceFooter?: string | null
}

/**
 * Appends agent signature and compliance footer to email HTML content.
 * Used by both EmailService (transactional) and SmtpSendService (agent-composed).
 */
export function buildEmailBody(
  contentHtml: string,
  options: BuildEmailBodyOptions,
): string {
  let html = contentHtml

  if (options.signatureHtml) {
    html += '<br><div class="email-signature">' + options.signatureHtml + '</div>'
  }

  if (options.complianceFooter) {
    html +=
      '<hr style="border:none;border-top:1px solid #ccc;margin:20px 0">'
    html +=
      '<div class="email-footer" style="font-size:11px;color:#666">' +
      options.complianceFooter +
      '</div>'
  }

  return html
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && npx tsc --noEmit apps/api/src/common/email/build-email-body.ts 2>&1 || echo "Using pnpm typecheck instead" && pnpm --filter api exec tsc --noEmit --pretty false 2>&1 | grep build-email-body || echo "No errors in new file"`

Expected: No errors referencing `build-email-body.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/email/build-email-body.ts
git commit -m "feat(email): add shared buildEmailBody utility for unified footer/signature"
```

---

### Task 2: Add `findActiveAccountForUser()` to EmailAccountsService

**Files:**
- Modify: `apps/api/src/email-accounts/email-accounts.service.ts:173` (after `getAccountById`)

- [ ] **Step 1: Add the new method**

Add after `getAccountById()` (line ~171), before `findAllActive()` (line ~173):

```typescript
  /**
   * Find the primary active email account for a user within an agency.
   * Returns the oldest active account (deterministic selection by createdAt ASC).
   * Returns null if no active account exists.
   */
  async findActiveAccountForUser(
    userId: string,
    agencyId: string,
  ) {
    const [account] = await this.db.client
      .select()
      .from(this.db.schema.emailAccounts)
      .where(
        and(
          eq(this.db.schema.emailAccounts.userId, userId),
          eq(this.db.schema.emailAccounts.agencyId, agencyId),
          eq(this.db.schema.emailAccounts.isActive, true),
        ),
      )
      .orderBy(asc(this.db.schema.emailAccounts.createdAt))
      .limit(1)

    return account || null
  }
```

Returns the raw DB row (same as `getAccountById()`), not a formatted DTO. The return type is inferred as the raw `emailAccounts` select type or `null`.

Add `asc` to the drizzle-orm imports at line 2. Current imports:

```typescript
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm'
```

Change to:

```typescript
import { eq, and, sql, desc, asc, ilike, or } from 'drizzle-orm'
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck 2>&1 | grep -E "email-accounts.service|error" | head -10`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/email-accounts/email-accounts.service.ts
git commit -m "feat(email-accounts): add findActiveAccountForUser method for agent resolution"
```

---

### Task 3: Add `sendRaw()` to SmtpSendService

**Files:**
- Modify: `apps/api/src/email-accounts/smtp-send.service.ts:164` (after `send()` method, before private helpers)

`sendRaw()` is a lightweight SMTP send. It does NOT: build email body, apply domain filter, load signature/footer, create email_logs, or save to synced_emails. The caller (EmailService) handles all of that to enable double-send prevention.

- [ ] **Step 1: Add the `sendRaw()` method**

Insert after the `send()` method's closing brace (line ~164), before the private helpers comment (line ~166):

```typescript
  /**
   * Lightweight SMTP send with pre-built content.
   * Does NOT: build body, filter domains, load signature/footer, log, or save to synced_emails.
   * All of that is the caller's responsibility (enables double-send prevention).
   */
  async sendRaw(options: {
    accountId: string
    from: string
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    html: string
    text?: string
    replyTo?: string
    attachments?: { filename: string; content: Buffer | string; contentType?: string }[]
  }): Promise<{ messageId: string }> {
    const account = await this.emailAccountsService.getAccountById(options.accountId)
    const credentials = await this.emailAccountsService.getDecryptedCredentials(options.accountId)

    const transport = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpTls,
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    })

    try {
      const info = await transport.sendMail({
        from: options.from,
        to: options.to,
        cc: options.cc?.length ? options.cc : undefined,
        bcc: options.bcc?.length ? options.bcc : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      })

      return { messageId: info.messageId }
    } finally {
      transport.close()
    }
  }
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck 2>&1 | grep -E "smtp-send.service|error" | head -10`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/email-accounts/smtp-send.service.ts
git commit -m "feat(email-accounts): add sendRaw method for lightweight SMTP send"
```

---

## Chunk 2: Module Wiring + Core Integration

### Task 4: Module wiring — export SmtpSendService + import with forwardRef

**Files:**
- Modify: `apps/api/src/email-accounts/email-accounts.module.ts:44` (exports array)
- Modify: `apps/api/src/email/email.module.ts:11` (imports array)

**Why forwardRef:** The dependency graph creates a cycle:
`EmailAccountsModule → NotificationModule → EmailModule → (new) EmailAccountsModule`.
Using `forwardRef()` on the EmailModule side breaks this cycle, following the established pattern (ContactsModule ↔ TripsModule).

- [ ] **Step 1: Export SmtpSendService from EmailAccountsModule**

In `apps/api/src/email-accounts/email-accounts.module.ts`, change line 44 from:

```typescript
  exports: [EmailAccountsService, ImapSyncService],
```

to:

```typescript
  exports: [EmailAccountsService, ImapSyncService, SmtpSendService],
```

- [ ] **Step 2: Update the module comment**

In `apps/api/src/email-accounts/email-accounts.module.ts`, replace lines 14-18:

```typescript
/**
 * EmailAccountsModule — Agent personal email (IMAP/SMTP)
 *
 * IMPORTANT: This module is completely separate from EmailModule (Resend transactional emails).
 * Do NOT import from apps/api/src/email/ in any file here.
 *
 * Self-registers its own BullMQ queue (email-sync) following DocumentRenderModule pattern.
 * Do NOT modify AutomationModule to register this queue.
 */
```

with:

```typescript
/**
 * EmailAccountsModule — Agent personal email (IMAP/SMTP)
 *
 * IMPORTANT: EmailModule now imports this module (via forwardRef) for SMTP-first sending.
 * However, this module must NOT import from apps/api/src/email/ to avoid circular dependencies.
 * Shared utilities live in apps/api/src/common/email/ instead.
 *
 * Self-registers its own BullMQ queue (email-sync) following DocumentRenderModule pattern.
 * Do NOT modify AutomationModule to register this queue.
 */
```

- [ ] **Step 3: Import EmailAccountsModule in EmailModule**

In `apps/api/src/email/email.module.ts`, change line 1 imports from:

```typescript
import { Module, forwardRef } from '@nestjs/common'
```

Verify `forwardRef` is already imported (it is — used for DocumentTemplatesModule).

Add import for EmailAccountsModule at top:

```typescript
import { EmailAccountsModule } from '../email-accounts/email-accounts.module'
```

Change the `imports` array (line 11) from:

```typescript
  imports: [DatabaseModule, forwardRef(() => DocumentTemplatesModule)],
```

to:

```typescript
  imports: [
    DatabaseModule,
    forwardRef(() => DocumentTemplatesModule),
    forwardRef(() => EmailAccountsModule),
  ],
```

- [ ] **Step 4: Verify no circular dependency errors**

Run: `pnpm typecheck 2>&1 | grep -E "email.module|email-accounts.module|circular|error" | head -10`

Also test the app starts (no NestJS DI circular error):

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && timeout 15 pnpm --filter api exec nest start --watch 2>&1 | head -30 || true`

Expected: No circular dependency errors from NestJS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/email-accounts/email-accounts.module.ts apps/api/src/email/email.module.ts
git commit -m "feat(email): wire EmailModule to import EmailAccountsModule via forwardRef"
```

---

### Task 5: Implement agent resolution + SMTP-first routing in EmailService

**Files:**
- Modify: `apps/api/src/email/email.service.ts` (major changes to constructor, sendEmail, + new private methods)

This is the core change. EmailService gains:
1. `@Optional()` injection of `SmtpSendService` and `EmailAccountsService`
2. `resolveAgent()` private method — waterfall lookup
3. `loadSignatureAndFooter()` private method
4. Modified `sendEmail()` — buildEmailBody → SMTP-first → Resend fallback
5. `matchRecipientContacts()` private helper (same logic as SmtpSendService)

- [ ] **Step 1: Add new imports**

At top of `apps/api/src/email/email.service.ts`, add/modify imports:

```typescript
import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common'
import { eq, and, desc, asc, ilike, or, gte, lte, sql, isNull } from 'drizzle-orm'
```

Add new imports after existing ones:

```typescript
import { SmtpSendService } from '../email-accounts/smtp-send.service'
import { EmailAccountsService } from '../email-accounts/email-accounts.service'
import { buildEmailBody } from '../common/email/build-email-body'
```

- [ ] **Step 2: Modify the constructor**

Replace the constructor (lines 55-58):

```typescript
  constructor(private readonly db: DatabaseService) {
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@phoenixvoyages.ca'
    this.fromName = process.env.EMAIL_FROM_NAME || 'Phoenix Voyages'
  }
```

with:

```typescript
  constructor(
    private readonly db: DatabaseService,
    @Optional()
    @Inject(forwardRef(() => SmtpSendService))
    private readonly smtpSendService?: SmtpSendService,
    @Optional()
    @Inject(forwardRef(() => EmailAccountsService))
    private readonly emailAccountsService?: EmailAccountsService,
  ) {
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@phoenixvoyages.ca'
    this.fromName = process.env.EMAIL_FROM_NAME || 'Phoenix Voyages'

    if (!this.smtpSendService) {
      this.logger.warn('SmtpSendService not injected — SMTP routing disabled, Resend-only mode')
    }
  }
```

- [ ] **Step 3: Add private helper methods**

Add these before the legacy wrapper methods section (before line ~483, the `// Legacy methods` comment):

```typescript
  // ==========================================================================
  // SMTP routing helpers
  // ==========================================================================

  /**
   * Resolve the agent for SMTP routing via waterfall:
   * 1. contactId → contacts.ownerId
   * 2. tripId → trips.ownerId
   * 3. createdBy
   *
   * Then look up their active email account.
   */
  private async resolveAgent(
    agencyId: string,
    options: { contactId?: string; tripId?: string; createdBy?: string },
  ): Promise<{
    userId: string
    emailAccountId: string | null
    emailAddress: string | null
    displayName: string | null
  } | null> {
    if (!this.emailAccountsService) return null

    let agentUserId: string | null = null

    if (options.contactId) {
      const [contact] = await this.db.client
        .select({ ownerId: this.db.schema.contacts.ownerId })
        .from(this.db.schema.contacts)
        .where(eq(this.db.schema.contacts.id, options.contactId))
        .limit(1)
      agentUserId = contact?.ownerId ?? null
    }

    if (!agentUserId && options.tripId) {
      const [trip] = await this.db.client
        .select({ ownerId: this.db.schema.trips.ownerId })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, options.tripId))
        .limit(1)
      agentUserId = trip?.ownerId ?? null
    }

    if (!agentUserId && options.createdBy) {
      agentUserId = options.createdBy
    }

    if (!agentUserId) return null

    // Look up agent's profile email (for replyTo when no SMTP account)
    const [profile] = await this.db.client
      .select({ email: this.db.schema.userProfiles.email })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, agentUserId))
      .limit(1)

    const account = await this.emailAccountsService.findActiveAccountForUser(
      agentUserId,
      agencyId,
    )

    return {
      userId: agentUserId,
      emailAccountId: account?.id ?? null,
      emailAddress: account?.emailAddress ?? profile?.email ?? null,
      displayName: account?.displayName ?? null,
    }
  }

  /**
   * Load agent signature and agency compliance footer for buildEmailBody.
   */
  private async loadSignatureAndFooter(
    agencyId: string,
    agentUserId?: string,
  ): Promise<{ signatureHtml: string | null; complianceFooter: string | null }> {
    let signatureHtml: string | null = null

    if (agentUserId) {
      const [userProfile] = await this.db.client
        .select({
          emailSignatureConfig: this.db.schema.userProfiles.emailSignatureConfig,
        })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, agentUserId))
        .limit(1)

      const sigConfig = userProfile?.emailSignatureConfig as any
      signatureHtml =
        sigConfig?.enabled && sigConfig?.signatureHtml
          ? sigConfig.signatureHtml
          : null
    }

    const [settings] = await this.db.client
      .select({
        emailComplianceFooter:
          this.db.schema.agencySettings.emailComplianceFooter,
      })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    return {
      signatureHtml,
      complianceFooter: settings?.emailComplianceFooter || null,
    }
  }

  /**
   * Match recipient email addresses to contacts in the agency.
   */
  private async matchRecipientContacts(
    agencyId: string,
    addresses: string[],
  ): Promise<string[]> {
    if (addresses.length === 0) return []

    const lowered = addresses.map((a) => a.toLowerCase())
    const results = await this.db.client
      .select({ id: this.db.schema.contacts.id })
      .from(this.db.schema.contacts)
      .where(
        sql`${this.db.schema.contacts.agencyId} = ${agencyId} AND lower(${this.db.schema.contacts.email}) IN (${sql.join(
          lowered.map((a) => sql`${a}`),
          sql`, `,
        )})`,
      )

    return results.map((r) => r.id)
  }
```

- [ ] **Step 4: Rewrite `sendEmail()` method**

Replace the entire `sendEmail()` method (lines 63-204) with:

```typescript
  /**
   * Core email sending method with SMTP-first routing and Resend fallback.
   *
   * Flow:
   * 1. Resolve agent (contactId → tripId → createdBy waterfall)
   * 2. Build email body with signature + footer
   * 3. Apply domain filter
   * 4. Log as pending
   * 5. Try SMTP if agent has email account
   * 6. Fall back to Resend on pre-delivery SMTP failure
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    const { emailLogs } = this.db.schema

    // 1. Resolve agent for SMTP routing
    const agent = await this.resolveAgent(options.agencyId, {
      contactId: options.contactId,
      tripId: options.tripId,
      createdBy: options.createdBy,
    })

    // 2. Load signature + footer, build final HTML
    const { signatureHtml, complianceFooter } =
      await this.loadSignatureAndFooter(
        options.agencyId,
        agent?.userId,
      )
    let html = buildEmailBody(options.html, { signatureHtml, complianceFooter })

    // 3. Apply domain filter (dev/preview only)
    const filterResult = this.domainFilter.filterRecipients(
      options.to,
      options.cc,
      options.bcc,
    )
    const subject = this.domainFilter.modifySubject(options.subject)

    if (filterResult.isFiltered) {
      html = this.domainFilter.generateFilterWarningHtml() + html
    }

    // 4. Determine from address (agent email for SMTP path, noreply for Resend)
    const fromEmail = agent?.emailAccountId && agent.emailAddress
      ? agent.emailAddress
      : this.fromAddress

    // 5. Log email as pending
    const insertResult = await this.db.client
      .insert(emailLogs)
      .values({
        agencyId: options.agencyId,
        toEmail: filterResult.to,
        ccEmail: filterResult.cc,
        bccEmail: filterResult.bcc,
        fromEmail,
        replyTo: options.replyTo,
        subject,
        bodyHtml: html,
        bodyText: options.text,
        templateSlug: options.templateSlug,
        variables: options.variables,
        status: 'pending',
        tripId: options.tripId,
        contactId: options.contactId,
        activityId: options.activityId,
        createdBy: options.createdBy,
      })
      .returning()

    const emailLog = insertResult[0]!

    // Check if we have valid recipients after filtering
    if (!filterResult.hasValidRecipients) {
      this.logger.warn(
        `No valid recipients after domain filtering for email ${emailLog.id}`,
      )

      await this.db.client
        .update(emailLogs)
        .set({
          status: 'filtered',
          errorMessage: 'All recipients filtered out by domain restrictions',
        })
        .where(eq(emailLogs.id, emailLog.id))

      return {
        success: false,
        emailLogId: emailLog.id,
        filtered: true,
        filteredRecipients: filterResult.filtered,
        error: 'All recipients filtered out by domain restrictions',
      }
    }

    // 6. Try SMTP if agent has email account
    if (agent?.emailAccountId && this.smtpSendService) {
      try {
        const smtpResult = await this.smtpSendService.sendRaw({
          accountId: agent.emailAccountId!,
          from: agent.displayName
            ? `"${agent.displayName}" <${agent.emailAddress}>`
            : agent.emailAddress!,
          to: filterResult.to,
          cc: filterResult.cc,
          bcc: filterResult.bcc,
          subject,
          html,
          text: options.text,
          replyTo: options.replyTo,
          attachments: options.attachments?.map((att) => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType,
          })),
        })

        // SMTP accepted — persist to DB (double-send prevention: if this fails, do NOT resend)
        try {
          const allRecipients = [
            ...filterResult.to,
            ...(filterResult.cc || []),
            ...(filterResult.bcc || []),
          ]
          const matchedContactIds = await this.matchRecipientContacts(
            options.agencyId,
            allRecipients,
          )

          await this.db.client
            .insert(this.db.schema.syncedEmails)
            .values({
              emailAccountId: agent.emailAccountId!,
              agencyId: options.agencyId,
              messageId: smtpResult.messageId,
              imapUid: null,
              folder: 'Sent',
              fromAddress: agent.emailAddress,
              fromName: agent.displayName,
              toAddresses: filterResult.to.map((addr) => ({ address: addr })),
              ccAddresses: (filterResult.cc || []).map((addr) => ({
                address: addr,
              })),
              bccAddresses: (filterResult.bcc || []).map((addr) => ({
                address: addr,
              })),
              subject,
              date: new Date(),
              bodyHtml: html,
              bodyText: options.text,
              snippet: options.html
                .replace(/<[^>]+>/g, '')
                .substring(0, 200)
                .trim(),
              isSeen: true,
              isOutbound: true,
              matchedContactIds,
            })

          await this.db.client
            .update(emailLogs)
            .set({
              status: 'sent',
              provider: 'smtp',
              providerMessageId: smtpResult.messageId,
              sentAt: new Date(),
            })
            .where(eq(emailLogs.id, emailLog.id))
        } catch (dbError: any) {
          // SMTP accepted but DB write failed — email was sent, do NOT resend
          this.logger.error(
            `Post-SMTP DB write failed for ${emailLog.id}: ${dbError.message}`,
          )
          try {
            await this.db.client
              .update(emailLogs)
              .set({ status: 'sent', provider: 'smtp', sentAt: new Date() })
              .where(eq(emailLogs.id, emailLog.id))
          } catch {
            /* best-effort */
          }
        }

        this.logger.log(
          `Email sent via SMTP: ${emailLog.id}, messageId: ${smtpResult.messageId}`,
        )
        return {
          success: true,
          emailLogId: emailLog.id,
          filtered: filterResult.isFiltered,
          filteredRecipients: filterResult.isFiltered ? filterResult.filtered : undefined,
        }
      } catch (smtpError: any) {
        // SMTP pre-delivery failure — fall through to Resend
        this.logger.warn(
          `SMTP send failed for ${emailLog.id}, falling back to Resend: ${smtpError.message}`,
        )
        await this.db.client
          .update(emailLogs)
          .set({
            errorMessage: `SMTP failed: ${smtpError.message}`,
            fromEmail: this.fromAddress,
            replyTo: agent?.emailAddress || options.replyTo || null,
          })
          .where(eq(emailLogs.id, emailLog.id))
      }
    }

    // 7. Resend fallback
    try {
      const resend = getResendClient()
      const result = await resend.emails.send({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: filterResult.to,
        cc: filterResult.cc,
        bcc: filterResult.bcc,
        replyTo: agent ? agent.emailAddress : options.replyTo,
        subject,
        html,
        text: options.text,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      })

      if (result.error) {
        this.logger.error(
          `Failed to send email ${emailLog.id}: ${result.error.message}`,
        )

        await this.db.client
          .update(emailLogs)
          .set({
            status: 'failed',
            provider: 'resend',
            errorMessage: result.error.message,
          })
          .where(eq(emailLogs.id, emailLog.id))

        return {
          success: false,
          emailLogId: emailLog.id,
          error: result.error.message,
        }
      }

      const resendReplyTo = agent?.emailAddress || options.replyTo || null
      await this.db.client
        .update(emailLogs)
        .set({
          status: 'sent',
          provider: 'resend',
          providerMessageId: result.data?.id,
          sentAt: new Date(),
          fromEmail: this.fromAddress,
          replyTo: resendReplyTo,
        })
        .where(eq(emailLogs.id, emailLog.id))

      this.logger.log(
        `Email sent via Resend: ${emailLog.id}, provider_id: ${result.data?.id}`,
      )

      return {
        success: true,
        emailLogId: emailLog.id,
        filtered: filterResult.isFiltered,
        filteredRecipients: filterResult.isFiltered ? filterResult.filtered : undefined,
      }
    } catch (error: any) {
      this.logger.error(
        `Resend send failed for email ${emailLog.id}: ${error.message}`,
      )

      await this.db.client
        .update(emailLogs)
        .set({
          status: 'failed',
          provider: 'resend',
          errorMessage: error.message,
        })
        .where(eq(emailLogs.id, emailLog.id))

      return {
        success: false,
        emailLogId: emailLog.id,
        error: error.message,
      }
    }
  }
```

**Important:** The old `sendEmail` code after the filtered-recipients check (lines ~129-204) — the Resend send block, success/failure updates, and return — is replaced entirely by the new SMTP-first + Resend fallback logic above. Make sure to remove the old code cleanly.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck 2>&1 | grep -E "email.service.ts|error TS" | head -20`

Expected: No new errors in email.service.ts. Pre-existing errors in other files are OK.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/email/email.service.ts apps/api/src/email/email.module.ts
git commit -m "feat(email): implement SMTP-first routing with Resend fallback and agent resolution"
```

---

## Chunk 3: Cleanup + Dedup + Verification

### Task 6: Refactor SmtpSendService.send() to use buildEmailBody()

**Files:**
- Modify: `apps/api/src/email-accounts/smtp-send.service.ts:28-58`

Replace the inline signature/footer building in `send()` with the shared `buildEmailBody()` utility.

- [ ] **Step 1: Add buildEmailBody import**

At top of `smtp-send.service.ts`, add:

```typescript
import { buildEmailBody } from '../common/email/build-email-body'
```

- [ ] **Step 2: Replace inline body building**

Replace lines 28-58 (from `// Load user signature` through `fullBodyHtml += ... footer ...`) with:

```typescript
    // Load user signature
    const [userProfile] = await this.db.client
      .select()
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, userId))
      .limit(1)

    const signatureConfig = userProfile?.emailSignatureConfig as any
    const signatureHtml =
      signatureConfig?.enabled && signatureConfig?.signatureHtml
        ? signatureConfig.signatureHtml
        : null

    // Load compliance footer from agency settings
    const [settings] = await this.db.client
      .select({ emailComplianceFooter: this.db.schema.agencySettings.emailComplianceFooter })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, account.agencyId))
      .limit(1)

    const complianceFooter = settings?.emailComplianceFooter || null

    // Build HTML body: user content + signature + footer
    const fullBodyHtml = buildEmailBody(dto.bodyHtml, { signatureHtml, complianceFooter })
```

Note: the variable changes from `let fullBodyHtml` to `const fullBodyHtml` since it's now a single assignment.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck 2>&1 | grep -E "smtp-send.service|error TS" | head -10`

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/email-accounts/smtp-send.service.ts
git commit -m "refactor(smtp-send): use shared buildEmailBody utility"
```

---

### Task 7: Remove inline footers from hardcoded templates

**Files:**
- Modify: `apps/api/src/email/templates/welcome.template.ts:32-34`
- Modify: `apps/api/src/email/templates/invite.template.ts:39-41`
- Modify: `apps/api/src/email/templates/password-reset.template.ts:30-32`
- Modify: `apps/api/src/email/templates/client-portal-invite.template.ts:39-41`

All 4 templates have identical footer pattern:
```html
    <p style="margin: 24px 0 0; color: #a1a1aa; font-size: 12px; text-align: center;">
      Phoenix Voyages
    </p>
```

This is now handled by `buildEmailBody()` via the agency compliance footer. Remove the inline footer from each template.

- [ ] **Step 1: Remove footer from all 4 templates**

In each template file, remove the 3 lines containing the `<p>Phoenix Voyages</p>` tag. The `</div>` that precedes it (closing the white card) should remain.

**welcome.template.ts** — remove lines 32-34:
```html
    <p style="margin: 24px 0 0; color: #a1a1aa; font-size: 12px; text-align: center;">
      Phoenix Voyages
    </p>
```

**invite.template.ts** — remove lines 39-41 (same content).

**password-reset.template.ts** — remove lines 30-32 (same content).

**client-portal-invite.template.ts** — remove lines 39-41 (same content).

- [ ] **Step 2: Verify templates still produce valid HTML**

Run: `pnpm typecheck 2>&1 | grep -E "template|error TS" | head -10`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/email/templates/
git commit -m "refactor(email-templates): remove inline footers, now handled by buildEmailBody"
```

---

### Task 8: Add messageId-based dedup in IMAP sync

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts:564-607`

When IMAP sync finds a message in the Sent folder that was already saved by `sendRaw()` (has matching `messageId` + `emailAccountId` but `imapUid = null`), update the existing row's `imapUid` instead of inserting a duplicate.

- [ ] **Step 1: Add dedup check before upsert**

In `imap-sync.service.ts`, before the existing upsert block at line ~565, add:

```typescript
    // Dedup: Check if this outbound message was already saved by sendRaw (imapUid=null)
    if (envelope?.messageId) {
      const [existing] = await this.db.client
        .select({ id: this.db.schema.syncedEmails.id })
        .from(this.db.schema.syncedEmails)
        .where(
          and(
            eq(this.db.schema.syncedEmails.emailAccountId, accountId),
            eq(this.db.schema.syncedEmails.messageId, envelope.messageId),
            isNull(this.db.schema.syncedEmails.imapUid),
          ),
        )
        .limit(1)

      if (existing) {
        // Update the provisional row with the real IMAP UID and flags
        await this.db.client
          .update(this.db.schema.syncedEmails)
          .set({
            imapUid: Number(msg.uid),
            folder,
            isSeen: flags.has('\\Seen'),
            isFlagged: flags.has('\\Flagged'),
            isAnswered: flags.has('\\Answered'),
            isDraft: flags.has('\\Draft'),
            hasAttachments: attachments.length > 0,
            sizeBytes: msg.size != null ? Number(msg.size) : null,
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.syncedEmails.id, existing.id))

        // Still insert attachments if any
        if (attachments.length > 0) {
          await this.db.client
            .insert(this.db.schema.emailAttachments)
            .values(
              attachments.map((att: any) => ({
                syncedEmailId: existing.id,
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
                contentId: att.contentId,
              })),
            )
            .onConflictDoNothing()
        }

        return // Early exit — deduped with existing row
      }
    }
```

Also add `isNull` to the drizzle-orm imports at line 2 of the file. Current imports:

```typescript
import { eq, and, sql, count } from 'drizzle-orm'
```

Change to:

```typescript
import { eq, and, sql, count, isNull } from 'drizzle-orm'
```

- [ ] **Step 2: Update the method return type**

The `upsertEmailFromImap` method currently returns `upserted.id` at the end. The early return above returns `existing.id`. Make sure the method signature allows returning a string. Check it currently returns `string` from the `returning({ id: ... })` call — this is consistent.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck 2>&1 | grep -E "imap-sync.service|error TS" | head -10`

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "fix(imap-sync): add messageId-based dedup for SMTP-sent outbound emails"
```

---

### Task 9: Final typecheck + manual verification

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm typecheck 2>&1`

Expected: No NEW errors. Pre-existing errors in `api-credentials`, `portal-jwt.strategy`, `trips.service.ts` are OK.

- [ ] **Step 2: Verify the dev server starts**

Check that `turbo dev` starts without NestJS dependency injection errors. Look for:
- No "Nest can't resolve dependencies" errors
- No circular dependency warnings
- EmailService initializes with SmtpSendService and EmailAccountsService injected

- [ ] **Step 3: Manual smoke test (if dev server running)**

1. Navigate to a contact with an assigned agent who has an active email account
2. Trigger a transactional email (e.g., via trip action)
3. Check:
   - `email_logs` row has `provider: 'smtp'` and `status: 'sent'`
   - `synced_emails` row exists with `isOutbound: true`
   - Email arrives from agent's email address
4. Test fallback: disable the agent's email account, trigger another email
   - Should fall back to Resend, `provider: 'resend'`, `replyTo` = agent email

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add apps/api/src/email/ apps/api/src/email-accounts/ apps/api/src/common/email/
git commit -m "fix(email): address typecheck issues from SMTP priority implementation"
```
