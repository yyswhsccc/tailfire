# Email Reliability Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch full email body during IMAP sync so emails are complete when stored — eliminates lazy loading failures and "Loading..." state.

**Architecture:** Add `source: true` to the existing `client.fetch()` call in `syncFolder()`, parse the raw RFC822 source with postal-mime in `upsertEmailFromImap()`, store bodyHtml/bodyText/snippet in DB. Reduce batch size to 25. Keep `fetchEmailBody()` as fallback for legacy null-body emails.

**Tech Stack:** ImapFlow (IMAP), postal-mime (RFC822 parsing), Drizzle (DB)

---

## File Structure

### Modify
| File | Change |
|------|--------|
| `apps/api/src/email-accounts/imap-sync.service.ts` | Add `source: true, size: true` to fetch query, add `parseMessageSource()` helper, call in `upsertEmailFromImap()`, reduce batch sizes |
| `apps/admin/src/app/emails/inbox/_components/email-reader.tsx` | Change "Loading..." fallback text |

---

### Task 1: Add parseMessageSource Helper

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Add the helper method**

Add this private method to `ImapSyncService`, right before the existing `upsertEmailFromImap()` method (before line 766):

```typescript
/**
 * Parse a raw RFC822 message source into HTML, text, and snippet.
 * Shared by both sync (eager) and fetchEmailBody (lazy fallback).
 */
private async parseMessageSource(source: Buffer | Uint8Array): Promise<{
  bodyHtml: string | null
  bodyText: string | null
  snippet: string | null
}> {
  try {
    const { default: PostalMime } = await import('postal-mime')
    const parser = new PostalMime()
    const parsed = await parser.parse(source)
    const bodyHtml = parsed.html || null
    const bodyText = parsed.text || null
    const snippet = bodyText
      ? bodyText.substring(0, 200).replace(/\s+/g, ' ').trim()
      : null
    return { bodyHtml, bodyText, snippet }
  } catch (err: any) {
    this.logger.warn(`Failed to parse message source: ${err.message}`)
    return { bodyHtml: null, bodyText: null, snippet: null }
  }
}
```

- [ ] **Step 2: Refactor fetchEmailBody to use the helper**

In the existing `fetchEmailBody()` method (around line 186-210), replace the inline postal-mime parsing with a call to the new helper. Find this block:

```typescript
const downloadResult = await client.download(String(email.imapUid), undefined, { uid: true })
if (!downloadResult?.content) {
  this.logger.warn(`No content returned for UID ${email.imapUid} in ${email.folder}`)
  return { bodyHtml: null, bodyText: null, snippet: null }
}
const chunks: Buffer[] = []
for await (const chunk of downloadResult.content) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
}
const rawMessage = Buffer.concat(chunks)

// Parse with postal-mime
const { default: PostalMime } = await import('postal-mime')
const parser = new PostalMime()
const parsed = await parser.parse(rawMessage)

const bodyHtml = parsed.html || null
const bodyText = parsed.text || null
const snippet = bodyText ? bodyText.substring(0, 200).replace(/\s+/g, ' ').trim() : null
```

Replace with:

```typescript
const downloadResult = await client.download(String(email.imapUid), undefined, { uid: true })
if (!downloadResult?.content) {
  this.logger.warn(`No content returned for UID ${email.imapUid} in ${email.folder}`)
  return { bodyHtml: null, bodyText: null, snippet: null }
}
const chunks: Buffer[] = []
for await (const chunk of downloadResult.content) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
}
const rawMessage = Buffer.concat(chunks)

const { bodyHtml, bodyText, snippet } = await this.parseMessageSource(rawMessage)
```

- [ ] **Step 3: Verify compile**

Run: `pnpm --filter @tailfire/admin exec tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "refactor: extract parseMessageSource helper for reuse between sync and lazy fetch"
```

---

### Task 2: Add source: true to Fetch Query and Parse in upsertEmailFromImap

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Add source and size to the fetch query**

Find the fetch call in `syncFolder()` (around line 685):

```typescript
for await (const msg of client.fetch(fetchRange, {
  envelope: true,
  bodyStructure: true,
  flags: true,
  uid: true,
  internalDate: true,
}, { uid: true })) {
```

Replace with:

```typescript
for await (const msg of client.fetch(fetchRange, {
  envelope: true,
  bodyStructure: true,
  flags: true,
  uid: true,
  internalDate: true,
  source: true,
  size: true,
}, { uid: true })) {
```

- [ ] **Step 2: Parse body in upsertEmailFromImap**

In `upsertEmailFromImap()`, after the attachment extraction (after line 786 `const attachments = this.extractAttachmentMetadata(msg.bodyStructure)`) and before the contact matching, add body parsing:

```typescript
// Extract attachment metadata from bodyStructure
const attachments = this.extractAttachmentMetadata(msg.bodyStructure)

// Parse body from source (if available and under 1MB threshold)
let bodyHtml: string | null = null
let bodyText: string | null = null
let snippet: string | null = null
const MAX_SOURCE_SIZE = 1024 * 1024 // 1MB
if (msg.source && (!msg.size || Number(msg.size) < MAX_SOURCE_SIZE)) {
  const parsed = await this.parseMessageSource(msg.source)
  bodyHtml = parsed.bodyHtml
  bodyText = parsed.bodyText
  snippet = parsed.snippet
}
```

- [ ] **Step 3: Add body fields to the dedup update block**

Find the dedup update block (around line 830) that starts with `await this.db.client.update(this.db.schema.syncedEmails).set({`. Add the body fields:

```typescript
await this.db.client
  .update(this.db.schema.syncedEmails)
  .set({
    imapUid: Number(msg.uid),
    folder,
    date: emailDate,
    bodyHtml: bodyHtml ?? undefined, // Don't overwrite existing body with null
    bodyText: bodyText ?? undefined,
    snippet: snippet ?? undefined,
    isSeen: flags.has('\\Seen'),
    isFlagged: flags.has('\\Flagged'),
    isAnswered: flags.has('\\Answered'),
    isDraft: flags.has('\\Draft'),
    hasAttachments: attachments.length > 0,
    sizeBytes: msg.size != null ? Number(msg.size) : null,
    threadId: resolvedThreadId,
    updatedAt: new Date(),
  })
  .where(eq(this.db.schema.syncedEmails.id, existing.id))
```

Note: Use `?? undefined` so Drizzle skips the field if null (doesn't overwrite an existing body with null).

- [ ] **Step 4: Add body fields to the main insert block**

Find the main insert (around line 870) `.values({`. Add bodyHtml, bodyText, snippet to the values object:

```typescript
.values({
  emailAccountId: accountId,
  agencyId,
  messageId: envelope?.messageId,
  imapUid: Number(msg.uid),
  folder,
  inReplyTo: envelope?.inReplyTo,
  referencesHeader: Array.isArray(envelope?.references)
    ? envelope.references.join(' ')
    : envelope?.references,
  threadId,
  fromAddress: from?.address,
  fromName: from?.name,
  toAddresses,
  ccAddresses,
  subject: envelope?.subject,
  date: emailDate,
  bodyHtml,
  bodyText,
  snippet,
  isSeen: flags.has('\\Seen'),
  isFlagged: flags.has('\\Flagged'),
  isAnswered: flags.has('\\Answered'),
  isDraft: flags.has('\\Draft'),
  isOutbound,
  matchedContactIds,
  hasAttachments: attachments.length > 0,
  sizeBytes: msg.size != null ? Number(msg.size) : null,
})
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "feat: fetch email body during sync — add source:true, parse with postal-mime, store in DB"
```

---

### Task 3: Reduce Batch Sizes

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Reduce default batch size in syncFolder**

Find the batch size setup at the top of `syncFolder()` (around line 605):

```typescript
const batchSize = Math.min(options?.batchSize ?? 50, 100)
```

Change to:

```typescript
const batchSize = Math.min(options?.batchSize ?? 25, 50)
```

This changes the default from 50 to 25, and the cap from 100 to 50.

- [ ] **Step 2: Reduce background sync batch size**

Find the background sync call in `syncAccount()` (around line 80):

```typescript
const result = await this.syncFolder(client, accountId, account.agencyId, currentSyncState, 'INBOX', {
  mode: 'incremental',
  batchSize: 100,
})
```

Change `batchSize` to 25:

```typescript
const result = await this.syncFolder(client, accountId, account.agencyId, currentSyncState, 'INBOX', {
  mode: 'incremental',
  batchSize: 25,
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "perf: reduce sync batch size to 25 (body download adds latency per message)"
```

---

### Task 4: Fix Frontend "Loading..." Text

**Files:**
- Modify: `apps/admin/src/app/emails/inbox/_components/email-reader.tsx`

- [ ] **Step 1: Update the fallback text**

Find the "Loading..." fallback (around line 309-312):

```tsx
) : (
  <p className="text-sm text-muted-foreground italic">
    Email body not yet loaded. Loading...
  </p>
)}
```

Replace with:

```tsx
) : (
  <p className="text-sm text-muted-foreground italic">
    Email body unavailable.
  </p>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/emails/inbox/_components/email-reader.tsx
git commit -m "fix: show 'Email body unavailable' instead of infinite 'Loading...' for null bodies"
```

---

### Task 5: Deploy and Verify

- [ ] **Step 1: Type check**

```bash
pnpm --filter @tailfire/admin exec tsc --noEmit
```

- [ ] **Step 2: Push and deploy to preview**

```bash
git push origin feature/email-composer-overhaul
git checkout preview && git merge feature/email-composer-overhaul --no-edit && git push
git checkout feature/email-composer-overhaul
```

- [ ] **Step 3: Verify on preview**

After deploy (~5 min):
1. Navigate to `/emails/inbox`
2. Click refresh to trigger sync
3. Check Railway logs: should see body parsing happening during sync
4. Click on a newly synced email — body should appear instantly (no "Loading..." delay)
5. Check an old email that had null body — should either show body (if lazy fetch works) or "Email body unavailable"
