# SMTP Send Priority + Resend Fallback

## Problem

System/transactional emails (trip confirmations, payment reminders, invites) currently send via Resend from `noreply@phoenixvoyages.ca`. This causes three issues:

1. **No sync** — System emails don't appear in the agent's Sent folder on Outlook/Gmail/etc. The agent has no visibility into what the system sent on their behalf.
2. **Deliverability** — Emails from `noreply@` are more likely to land in spam than emails from a real mailbox with established reputation.
3. **Impersonal** — Clients receive system emails from a faceless address instead of their assigned agent.

## Solution

Route transactional emails through the assigned agent's SMTP account first. Fall back to Resend if no SMTP account exists or the send fails pre-delivery. Unify the footer/signature system so both paths produce consistent emails.

## Agent Resolution

When `EmailService.sendEmail()` is called, resolve the agent via a waterfall:

```
1. contactId → contacts.ownerId
2. tripId → trips.ownerId
3. createdBy (the user who triggered the email)
```

Stop at the first non-null value. Then look up `email_accounts` for an active account owned by that user (scoped to the same `agencyId`).

### Account selection

A user may have multiple active email accounts. Use deterministic selection: pick the **first active account ordered by `createdAt` ASC** (oldest = primary). This avoids needing a new `isPrimary` column and gives consistent results. If we later want explicit primary selection, we can add it without breaking existing behavior.

### Resolution rules

- If agent found with active `email_account` → SMTP path
- If agent found but no `email_account` → Resend, `from` = verified sender (`noreply@`), `replyTo` = agent's profile email
- If no agent resolved → Resend, `from` = `noreply@` (current behavior)

## Send Flow

```
EmailService.sendEmail(options: SendEmailOptions)
│
├─ 1. Resolve agent (contactId → tripId → createdBy)
├─ 2. Load agent's email signature (userProfiles.emailSignatureConfig)
├─ 3. Load agency compliance footer (agencySettings.emailComplianceFooter)
├─ 4. Build final HTML: buildEmailBody(options.html, { signature, footer })
├─ 5. Apply domain filter (dev/preview safety)
├─ 6. Insert email_logs record (status: pending)
│
├─ 7a. IF agent has active email_account:
│      ├─ Call SmtpSendService.sendRaw() with pre-built HTML
│      │     ├─ Get decrypted SMTP credentials
│      │     ├─ Create nodemailer transport
│      │     ├─ transport.sendMail(mailOptions)
│      │     ├─ Return { messageId } (before DB writes)
│      ├─ Save to synced_emails (isOutbound: true) → appears in agent's Sent folder
│      ├─ Match recipients to contacts (matchedContactIds)
│      ├─ Update email_logs: status=sent, provider='smtp'
│      └─ Return success
│
├─ 7b. IF SMTP fails PRE-DELIVERY (connection error, auth failure, rejection):
│      ├─ Log SMTP error (warn level)
│      ├─ Fall through to Resend path
│      └─ Update email_logs.errorMessage with SMTP error for debugging
│
├─ 7c. IF SMTP accepted but POST-SEND persistence fails:
│      ├─ Email already sent — DO NOT fall back to Resend
│      ├─ Log error for synced_emails/email_logs write failure
│      ├─ Update email_logs: status=sent, provider='smtp' (best-effort)
│      └─ Return success (email was delivered)
│
└─ 7d. Resend fallback:
       ├─ Send via Resend API
       ├─ from = verified sender (noreply@phoenixvoyages.ca) — always verified domain
       ├─ replyTo = agent's email address (if agent resolved)
       ├─ Update email_logs: status=sent/failed, provider='resend'
       └─ Return result
```

### Double-send prevention

The key distinction is **pre-delivery vs post-delivery failures**:

- **Pre-delivery** (SMTP connection timeout, auth failure, server rejection before accepting message) → safe to fall back to Resend
- **Post-delivery** (SMTP `sendMail` returned a `messageId` but subsequent DB writes fail) → email was already sent, do NOT resend via Resend

`sendRaw()` returns the `messageId` immediately after SMTP acceptance. The caller (EmailService) handles all DB writes. If those fail, it catches the error, logs it, and returns success since the email was delivered.

## Unified Footer/Signature

### Current state (three different approaches)

| Path | Signature | Footer |
|------|-----------|--------|
| Hardcoded templates (welcome, invite, reset) | None | Inline "Phoenix Voyages" text in template HTML |
| DB templates (trip order, payment) | None | None (relies on template author) |
| SmtpSendService.send() (agent-composed) | From userProfiles.emailSignatureConfig | From agencySettings.emailComplianceFooter |

### Target state (one shared utility)

```typescript
// apps/api/src/common/email/build-email-body.ts

interface BuildEmailBodyOptions {
  signatureHtml?: string | null  // Agent's signature (null = skip)
  complianceFooter?: string | null  // Agency footer (null = skip)
}

function buildEmailBody(contentHtml: string, options: BuildEmailBodyOptions): string
```

**Location:** `apps/api/src/common/email/build-email-body.ts` — a neutral path importable by both EmailModule and EmailAccountsModule without violating module boundary rules. The existing comment in `email-accounts.module.ts` says "Do NOT import from apps/api/src/email/" — so shared utilities must live outside that path.

**Output structure:**
```html
{contentHtml}
<!-- signature (if provided) -->
<br>
<div class="email-signature">{signatureHtml}</div>
<!-- compliance footer (if provided) -->
<hr style="border:none;border-top:1px solid #ccc;margin:20px 0">
<div class="email-footer" style="font-size:11px;color:#666">{complianceFooter}</div>
```

### Migration

| Item | Change |
|------|--------|
| `buildEmailBody()` | New shared utility function at `apps/api/src/common/email/` |
| `EmailService.sendEmail()` | Calls `buildEmailBody()` before sending |
| `SmtpSendService.send()` | Replace inline footer/signature logic with `buildEmailBody()` |
| Hardcoded templates | Remove inline footer text ("Phoenix Voyages") from template HTML |
| DB templates | No change — they pass through `EmailService` which appends footer |

## New Method: SmtpSendService.sendRaw()

A lightweight SMTP send that takes pre-built mail content. Unlike `send()`, it does not load signature/footer or filter recipients (that's already done by `EmailService`).

```typescript
async sendRaw(options: {
  accountId: string
  from: string           // Agent's formatted address: "Name <email>"
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string           // Already includes signature + footer
  text?: string
  replyTo?: string
}): Promise<{ messageId: string }>
```

**Responsibilities:**
1. Get decrypted SMTP credentials for `accountId`
2. Create nodemailer transport
3. `transport.sendMail(mailOptions)`
4. Return the SMTP messageId

**Does NOT:**
- Build email body (caller's responsibility)
- Apply domain filter (caller's responsibility)
- Load signature/footer (caller's responsibility)
- Create email_logs record (caller's responsibility)
- Save to synced_emails (caller's responsibility — enables double-send prevention)

**Why no synced_emails in sendRaw:** Moving DB persistence to the caller (EmailService) enables the double-send prevention logic. If sendRaw returns a messageId, we know SMTP accepted. The caller then writes synced_emails. If that write fails, we know the email was already sent and must NOT fall back to Resend.

## EmailModule Changes

### Circular dependency resolution

The current module graph creates a cycle if EmailModule imports EmailAccountsModule directly:

```
EmailAccountsModule → NotificationModule → EmailModule
                                              ↑
                                  (new import would close the cycle)
```

**Solution:** Use `forwardRef()` on both sides, following the established pattern (ContactsModule ↔ TripsModule):

```typescript
// email.module.ts
@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => DocumentTemplatesModule),
    forwardRef(() => EmailAccountsModule),  // forwardRef to break cycle
  ],
  ...
})
```

`EmailAccountsModule` already exports `EmailAccountsService`. Add `SmtpSendService` to exports:

```typescript
// email-accounts.module.ts
exports: [EmailAccountsService, ImapSyncService, SmtpSendService],
```

### EmailService constructor

```typescript
constructor(
  private readonly db: DatabaseService,
  @Optional() @Inject(forwardRef(() => SmtpSendService))
  private readonly smtpSendService?: SmtpSendService,
  @Optional() @Inject(forwardRef(() => EmailAccountsService))
  private readonly emailAccountsService?: EmailAccountsService,
)
```

Using `@Optional()` + `@Inject(forwardRef(...))` so EmailService still works if EmailAccountsModule is not available (e.g., in tests or isolated usage). When SMTP services aren't injected, it falls straight to Resend.

### Agent resolution method

```typescript
private async resolveAgent(
  agencyId: string,
  options: { contactId?: string; tripId?: string; createdBy?: string }
): Promise<{ userId: string; emailAccount: EmailAccount | null } | null>
```

Returns the agent's userId and their first active email account (ordered by createdAt ASC), or null if no account. Returns null entirely if no agent can be resolved.

## email_logs Changes

The `provider` column already exists (default: `'resend'`). SMTP-sent emails will be logged with `provider: 'smtp'`. No schema change needed.

When SMTP fails pre-delivery and Resend takes over, the log records the SMTP error in `errorMessage` and the final provider as `'resend'`. If both fail, status is `'failed'` with the Resend error.

## synced_emails Entry

When a transactional email is sent via SMTP, `EmailService` (not `sendRaw`) creates a `synced_emails` row with:

- `emailAccountId` = agent's account
- `isOutbound` = true
- `folder` = 'Sent' (or the account's sent folder path)
- `fromAddress` = agent's email
- `toAddresses`, `ccAddresses` = recipients as `{address: string, name?: string}[]` (matching existing JSONB format)
- `subject`, `bodyHtml` = the rendered content (with signature + footer)
- `date` = now
- `messageId` = SMTP messageId from sendRaw response
- `isSeen` = true
- `matchedContactIds` = resolved from recipient email addresses
- `imapUid` = null (outbound emails don't have IMAP UIDs)

### IMAP sync deduplication

When IMAP sync later finds the same message in the Sent folder, it will try to insert a new row with the real `imapUid`. Since the unique partial index is `(emailAccountId, folder, imapUid) WHERE imapUid IS NOT NULL`, and the provisional row has `imapUid = null`, there's no conflict — but we get duplicates.

**Fix:** During IMAP sync, before inserting a new outbound message, check if a `synced_emails` row already exists with matching `messageId` and `emailAccountId`. If found, update that row's `imapUid` instead of inserting a new one (merge strategy).

## Resend From-Address

**Critical:** Resend requires the `from` address to be from a verified domain. You cannot send from an arbitrary agent email address (e.g., `agent@gmail.com`) via Resend — it will fail sender verification.

**Strategy:**
- **SMTP path:** `from` = agent's actual email address (no domain restriction since it's their own mailbox)
- **Resend path:** `from` = verified sender (`noreply@phoenixvoyages.ca` or configured `EMAIL_FROM_ADDRESS`), `replyTo` = agent's email address (so replies go to the agent)

This means Resend fallback emails still come from `noreply@` but replies reach the agent. This is a pragmatic trade-off — the SMTP path provides the full "from agent" experience.

## Transactional Wrapper Updates

Several legacy wrapper methods currently don't pass enough context for agent resolution:

| Method | Current | Change |
|--------|---------|--------|
| `sendPasswordResetEmail` | No `createdBy` | Accept optional `createdBy` param, pass to `sendEmail()` |
| `sendWelcomeEmail` | No `createdBy` | Accept optional `createdBy` param, pass to `sendEmail()` |
| `sendInviteEmail` | No `createdBy` | Accept optional `createdBy` param, pass to `sendEmail()` |
| `sendClientPortalInviteEmail` | Has `contactId` | Already works — agent resolves via `contacts.ownerId` |

**Scope note:** Welcome, invite, and password-reset emails are system-level and typically don't have a meaningful agent context. For v1, these will continue to go through Resend with `noreply@`. Adding `createdBy` propagation is a follow-up improvement — it requires changes at all call sites (UsersService, AuthService, etc.) and is not required for the core SMTP priority feature.

**v1 SMTP routing scope:** Trip confirmations, payment reminders, and other contact-bound transactional emails (which already have `contactId`/`tripId`/`createdBy` in their `sendEmail` calls via `NotificationService` and `TripsService`).

## Attachments

Current `sendEmail` supports attachments via Resend. The `sendRaw` SMTP path will also support attachments by passing them through to nodemailer's `attachments` option (same format: `{ filename, content, contentType }`). No special handling needed — nodemailer supports the same attachment format.

## Files to Create

| File | Purpose |
|------|---------|
| `apps/api/src/common/email/build-email-body.ts` | Shared `buildEmailBody()` utility |

## Files to Modify

| File | Change |
|------|---------|
| `apps/api/src/email/email.service.ts` | Agent resolution, SMTP-first routing, Resend fallback, call `buildEmailBody()`, synced_emails write, double-send prevention |
| `apps/api/src/email/email.module.ts` | Import EmailAccountsModule with `forwardRef()` |
| `apps/api/src/email-accounts/smtp-send.service.ts` | Add `sendRaw()` method, refactor `send()` to use `buildEmailBody()` |
| `apps/api/src/email-accounts/email-accounts.module.ts` | Export `SmtpSendService`, update module comment |
| `apps/api/src/email-accounts/email-accounts.service.ts` | Add `findActiveAccountForUser(userId, agencyId)` method |
| `apps/api/src/email-accounts/imap-sync.service.ts` | Add messageId-based dedup for outbound synced_emails |
| `apps/api/src/email/templates/welcome.template.ts` | Remove inline footer |
| `apps/api/src/email/templates/invite.template.ts` | Remove inline footer |
| `apps/api/src/email/templates/password-reset.template.ts` | Remove inline footer |
| `apps/api/src/email/templates/client-portal-invite.template.ts` | Remove inline footer |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| SMTP connection timeout | Log warning, fall back to Resend |
| SMTP auth failure | Log warning, fall back to Resend |
| SMTP send rejected (pre-delivery) | Log warning, fall back to Resend |
| SMTP accepted but DB write fails | DO NOT resend — log error, return success |
| Resend API error | Return failed result (same as today) |
| No agent resolved | Skip SMTP, use Resend with noreply@ |
| Agent has no email_account | Skip SMTP, use Resend with noreply@ + replyTo agent email |
| emailAccountsService not injected | Skip SMTP, use Resend (graceful degradation) |

## Circular Dependency Prevention

The cycle path is: `EmailAccountsModule → NotificationModule → EmailModule`.

Adding `EmailModule → EmailAccountsModule` closes the cycle. This is resolved using `forwardRef()` on the EmailModule side, following the established pattern (ContactsModule ↔ TripsModule already use `forwardRef` for their circular dependency).

The `@Optional()` decorator on EmailService's constructor ensures the service still initializes if the dependency graph changes or in test isolation.

## Testing Checklist

1. Send a transactional email for a contact with an assigned agent who has an active email account → goes through SMTP, appears in synced_emails
2. Same but agent has no email account → falls back to Resend with `replyTo` = agent email
3. Same but SMTP server is down → falls back to Resend, email_logs shows SMTP error
4. Send with no contactId/tripId/createdBy → Resend with noreply@
5. Agent signature appears in transactional emails when sending via SMTP
6. Compliance footer appears in all emails (transactional + agent-composed)
7. Hardcoded templates no longer show duplicate footer
8. Domain filter still works (dev/preview emails filtered before SMTP/Resend)
9. email_logs.provider correctly reflects 'smtp' or 'resend'
10. IMAP sync doesn't create duplicate synced_emails for SMTP-sent messages
11. Resend fallback always uses verified domain for `from`, agent email for `replyTo`
12. SMTP post-delivery DB failure does NOT trigger Resend fallback
13. Multiple active accounts → first by createdAt is selected
14. `pnpm typecheck` passes
