# IMAP Write-Back + Remote Image Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync email flag changes back to IMAP (read, star, delete, move), fix sync reliability, and block remote tracking images with a trusted sender allowlist.

**Architecture:** Two independent subsystems: (A) IMAP write-back via BullMQ queue for flags + synchronous IMAP-first for move/delete, using a new `ImapWriteService` to avoid circular DI. (B) Remote image blocking in the HTML sanitizer with a "Load images" / "Always trust domain" UI in the email reader.

**Tech Stack:** NestJS, BullMQ, ImapFlow, DOMPurify, React

---

## Part A: IMAP Write-Back + Sync Fixes

### Task 1: Add EMAIL_WRITEBACK queue constant + ImapWriteService

**Files:**
- Modify: `apps/api/src/automation/automation.types.ts`
- Create: `apps/api/src/email-accounts/imap-write.service.ts`

- [ ] **Step 1: Add queue constant**

In `apps/api/src/automation/automation.types.ts`, add to the `QUEUES` object:
```typescript
EMAIL_WRITEBACK: 'email-writeback',
```

Add to `JOB_TYPES`:
```typescript
EMAIL_WRITEBACK_FLAGS: 'email.writeback.flags',
```

- [ ] **Step 2: Create ImapWriteService**

This is a standalone service for IMAP write operations. It does NOT depend on `EmailAccountsService` (avoiding circular DI). It only depends on `DatabaseService` and `EncryptionService` to get account credentials.

```typescript
import { Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { ImapFlow } from 'imapflow'
import { DatabaseService } from '../db/database.service'
import { EncryptionService } from '../common/encryption/encryption.service'

@Injectable()
export class ImapWriteService {
  private readonly logger = new Logger(ImapWriteService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Write flag changes to IMAP server
   */
  async writeFlags(
    accountId: string,
    uid: number,
    folder: string,
    flags: { isSeen?: boolean; isFlagged?: boolean },
  ): Promise<void> {
    const client = await this.connectToAccount(accountId)
    try {
      const lock = await client.getMailboxLock(folder)
      try {
        if (flags.isSeen === true) {
          await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true })
        } else if (flags.isSeen === false) {
          await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true })
        }
        if (flags.isFlagged === true) {
          await client.messageFlagsAdd({ uid }, ['\\Flagged'], { uid: true })
        } else if (flags.isFlagged === false) {
          await client.messageFlagsRemove({ uid }, ['\\Flagged'], { uid: true })
        }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }
  }

  /**
   * Move message to another folder on IMAP and return new UID
   */
  async moveMessage(
    accountId: string,
    uid: number,
    fromFolder: string,
    toFolder: string,
  ): Promise<{ newUid: number | null }> {
    const client = await this.connectToAccount(accountId)
    try {
      const lock = await client.getMailboxLock(fromFolder)
      try {
        const result = await client.messageMove({ uid }, toFolder, { uid: true })
        const newUid = result?.destination?.uidMap?.get(uid) ?? null
        return { newUid }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }
  }

  /**
   * Delete message by moving to Trash
   */
  async deleteMessage(
    accountId: string,
    uid: number,
    folder: string,
  ): Promise<void> {
    await this.moveMessage(accountId, uid, folder, 'Trash')
  }

  private async connectToAccount(accountId: string): Promise<ImapFlow> {
    const [account] = await this.db.client
      .select({
        imapHost: this.db.schema.emailAccounts.imapHost,
        imapPort: this.db.schema.emailAccounts.imapPort,
        imapTls: this.db.schema.emailAccounts.imapTls,
        credentials: this.db.schema.emailAccounts.credentials,
      })
      .from(this.db.schema.emailAccounts)
      .where(eq(this.db.schema.emailAccounts.id, accountId))
      .limit(1)

    if (!account) throw new Error(`Email account ${accountId} not found`)

    const creds = this.encryptionService.decryptObject(account.credentials as string)

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      auth: { user: creds.username, pass: creds.password },
      logger: false,
    })

    await client.connect()
    return client
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/automation/automation.types.ts apps/api/src/email-accounts/imap-write.service.ts
git commit -m "feat: add ImapWriteService for IMAP flag/move/delete operations"
```

---

### Task 2: Email writeback BullMQ processor

**Files:**
- Create: `apps/api/src/email-accounts/email-writeback.processor.ts`

- [ ] **Step 1: Create the processor**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { QUEUES } from '../automation/automation.types'
import { ImapWriteService } from './imap-write.service'

interface WritebackFlagsPayload {
  type: 'flags'
  accountId: string
  uid: number
  folder: string
  flags: { isSeen?: boolean; isFlagged?: boolean }
}

type WritebackPayload = WritebackFlagsPayload

@Processor(QUEUES.EMAIL_WRITEBACK)
export class EmailWritebackProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailWritebackProcessor.name)

  constructor(private readonly imapWriteService: ImapWriteService) {
    super()
  }

  async process(job: Job<WritebackPayload>): Promise<void> {
    const { data } = job

    switch (data.type) {
      case 'flags':
        this.logger.debug(`Writing flags for UID ${data.uid} in ${data.folder}`)
        await this.imapWriteService.writeFlags(data.accountId, data.uid, data.folder, data.flags)
        this.logger.log(`IMAP flags written for UID ${data.uid}`)
        break
      default:
        this.logger.warn(`Unknown writeback job type: ${(data as any).type}`)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/email-accounts/email-writeback.processor.ts
git commit -m "feat: add EmailWritebackProcessor for queued IMAP flag writes"
```

---

### Task 3: Register queue + services in module

**Files:**
- Modify: `apps/api/src/email-accounts/email-accounts.module.ts`

- [ ] **Step 1: Register the writeback queue, processor, and ImapWriteService**

Read the file first. Add imports and register:

```typescript
import { ImapWriteService } from './imap-write.service'
import { EmailWritebackProcessor } from './email-writeback.processor'
```

Add to `imports`:
```typescript
BullModule.registerQueue({
  name: QUEUES.EMAIL_WRITEBACK,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 200 },
    removeOnFail: { age: 24 * 3600, count: 100 },
  },
}),
```

Add to `providers`:
```typescript
ImapWriteService,
EmailWritebackProcessor,
```

Add to `exports`:
```typescript
ImapWriteService,
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/email-accounts/email-accounts.module.ts
git commit -m "feat: register email-writeback queue and ImapWriteService"
```

---

### Task 4: Wire write-back into EmailAccountsService

**Files:**
- Modify: `apps/api/src/email-accounts/email-accounts.service.ts`

- [ ] **Step 1: Inject queue and ImapWriteService**

Read the file. Add to constructor:
```typescript
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QUEUES } from '../automation/automation.types'
import { ImapWriteService } from './imap-write.service'

constructor(
  private readonly db: DatabaseService,
  private readonly encryptionService: EncryptionService,
  @InjectQueue(QUEUES.EMAIL_WRITEBACK) private readonly writebackQueue: Queue,
  private readonly imapWriteService: ImapWriteService,
) {}
```

- [ ] **Step 2: Add queued flag write-back to updateFlags**

In the `updateFlags` method (or equivalent that updates isSeen/isFlagged), after the DB update, enqueue a writeback job:

```typescript
// After DB update succeeds, queue IMAP write-back
if (email.imapUid && !email.isOutbound) {
  this.writebackQueue.add('email.writeback.flags', {
    type: 'flags',
    accountId,
    uid: email.imapUid,
    folder: email.folder,
    flags,
  }).catch(err => this.logger.warn(`Failed to queue flag writeback: ${err.message}`))
}
```

- [ ] **Step 3: Make move IMAP-first**

Find the move method. Change it to:
1. Call `this.imapWriteService.moveMessage(accountId, email.imapUid, email.folder, targetFolder)` first
2. On success: update DB with `{ folder: targetFolder, imapUid: result.newUid ?? email.imapUid }`
3. On IMAP failure: throw error (don't update DB)

- [ ] **Step 4: Make delete IMAP-first**

Find the delete method. Change it to:
1. Call `this.imapWriteService.deleteMessage(accountId, email.imapUid, email.folder)` first
2. On success: soft-delete from DB (existing behavior)
3. On IMAP failure: throw error (don't delete from DB)

For outbound-only emails (no imapUid), skip IMAP and just delete from DB.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/email-accounts/email-accounts.service.ts
git commit -m "feat: IMAP write-back — queued flags, IMAP-first move/delete"
```

---

### Task 5: Fix sync state safety (lastUid advancement)

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Track highestPersistedUid**

Read the sync method. Find where `lastUid` is advanced (currently set to `uidNext - 1` or similar).

Add a tracking variable before the sync loop:
```typescript
let highestPersistedUid = lastUid
```

Inside the message processing loop, after a successful `upsertEmailFromImap`:
```typescript
highestPersistedUid = Math.max(highestPersistedUid, Number(msg.uid))
```

At end of sync, when updating syncState:
```typescript
syncState.folders.INBOX.lastUid = highestPersistedUid
```

Remove any line that sets lastUid to `uidNext - 1`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "fix: only advance lastUid to highest successfully persisted UID"
```

---

### Task 6: Fix thread grouping

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Fix threadId assignment**

Find the thread computation logic (around the `upsertEmailFromImap` method or wherever threadId is calculated).

Update to:
1. If `inReplyTo` or `references` match an existing `messageId` in `synced_emails`, get that email's `threadId`
2. If matched email has `threadId = null`, generate a UUID and UPDATE the matched email's threadId too (backfill)
3. If no match, generate a new `threadId`

Also find the sent-message dedup path (where IMAP sync merges an incoming message with an existing SMTP-created row). Ensure `threadId` is preserved/backfilled during that merge.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "fix: thread grouping — backfill null threadId on match, handle sent-message dedup"
```

---

## Part B: Remote Image Safety

### Task 7: Update sanitizer to block remote images

**Files:**
- Modify: `apps/admin/src/lib/sanitize-email-html.ts`

- [ ] **Step 1: Add image blocking to sanitizer**

Replace the current sanitizer with a version that conditionally blocks remote images:

```typescript
import DOMPurify from 'dompurify'

const REMOTE_URL_PATTERN = /^https?:\/\//i

interface SanitizeOptions {
  /** Domains to allow remote images from */
  trustedDomains?: string[]
  /** Force allow all images (user clicked "Load images") */
  allowAllImages?: boolean
}

export function sanitizeEmailHtml(html: string, options?: SanitizeOptions): { html: string; hasBlockedImages: boolean } {
  let hasBlockedImages = false

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'u', 'em', 'strong', 'p', 'br', 'div', 'span',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'blockquote',
      'pre', 'code', 'hr', 'dl', 'dt', 'dd', 'sup', 'sub', 'font',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height',
      'border', 'cellpadding', 'cellspacing', 'align', 'valign', 'bgcolor',
      'color', 'size', 'face', 'target', 'rel',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  })

  if (options?.allowAllImages) {
    return { html: clean, hasBlockedImages: false }
  }

  // Parse and strip remote images
  const parser = new DOMParser()
  const doc = parser.parseFromString(clean, 'text/html')

  // Block remote img[src]
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (REMOTE_URL_PATTERN.test(src) && !isAllowedDomain(src, options?.trustedDomains)) {
      img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
      img.setAttribute('alt', '[Image blocked]')
      img.setAttribute('style', 'opacity:0.3;max-width:20px;max-height:20px;')
      hasBlockedImages = true
    }
    // cid: and data: URLs are preserved
  })

  // Block remote background-image in inline styles
  doc.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style') || ''
    if (/url\s*\(\s*['"]?https?:\/\//i.test(style)) {
      const cleaned = style.replace(/background(-image)?\s*:\s*[^;]*url\s*\([^)]*\)[^;]*/gi, '')
      el.setAttribute('style', cleaned)
      hasBlockedImages = true
    }
  })

  return { html: doc.body.innerHTML, hasBlockedImages }
}

function isAllowedDomain(url: string, trustedDomains?: string[]): boolean {
  if (!trustedDomains?.length) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return trustedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/lib/sanitize-email-html.ts
git commit -m "feat: block remote images in email sanitizer, preserve cid: and data: URIs"
```

---

### Task 8: Add trustedImageDomains to PlatformPreferencesDto

**Files:**
- Modify: `packages/shared-types/src/api/user-profiles.types.ts`

- [ ] **Step 1: Add field**

Add to `PlatformPreferencesDto`:
```typescript
trustedImageDomains?: string[]
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared-types/src/api/user-profiles.types.ts
git commit -m "feat: add trustedImageDomains to PlatformPreferencesDto"
```

---

### Task 9: Email reader — "Images blocked" banner

**Files:**
- Modify: `apps/admin/src/app/emails/inbox/_components/email-reader.tsx`

- [ ] **Step 1: Add image blocking UI**

Read the file. Find where `sanitizeEmailHtml` is called and the body is rendered.

Changes:
1. Import `useMyProfile, useUpdateMyProfile` for trusted domains
2. Add state: `const [forceShowImages, setForceShowImages] = useState(false)`
3. Reset `forceShowImages` when email changes
4. Get trusted domains: `const trustedDomains = (profile?.platformPreferences as any)?.trustedImageDomains ?? []`
5. Get sender domain: `const senderDomain = email?.fromAddress?.split('@')[1]?.toLowerCase()`
6. Call sanitizer with options:
```typescript
const { html: sanitizedBody, hasBlockedImages } = useMemo(() => {
  if (!detail?.bodyHtml) return { html: '', hasBlockedImages: false }
  return sanitizeEmailHtml(detail.bodyHtml, {
    trustedDomains,
    allowAllImages: forceShowImages,
  })
}, [detail?.bodyHtml, trustedDomains, forceShowImages])
```

7. Render banner above email body when `hasBlockedImages && !forceShowImages`:
```tsx
{hasBlockedImages && !forceShowImages && (
  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 mb-3">
    <span>Images from this sender are hidden for privacy.</span>
    <Button variant="link" size="sm" className="h-auto p-0 text-amber-700 underline" onClick={() => setForceShowImages(true)}>
      Load images
    </Button>
    {senderDomain && (
      <Button variant="link" size="sm" className="h-auto p-0 text-amber-700 underline" onClick={() => handleTrustDomain(senderDomain)}>
        Always load from @{senderDomain}
      </Button>
    )}
  </div>
)}
```

8. Add trust domain handler:
```typescript
const updateProfile = useUpdateMyProfile()
function handleTrustDomain(domain: string) {
  const current = (profile?.platformPreferences as any)?.trustedImageDomains ?? []
  if (!current.includes(domain)) {
    updateProfile.mutate({
      platformPreferences: {
        ...(profile?.platformPreferences as object),
        trustedImageDomains: [...current, domain],
      },
    })
  }
  setForceShowImages(true)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/emails/inbox/_components/email-reader.tsx
git commit -m "feat: images blocked banner with Load/Trust domain controls"
```

---

### Task 10: Type-check + push to preview

- [ ] **Step 1: Type-check**

```bash
npx tsc --noEmit -p apps/admin/tsconfig.json
```

- [ ] **Step 2: Push and merge to preview**

```bash
git push -u origin feature/imap-writeback-image-safety
git checkout preview && git merge feature/imap-writeback-image-safety --no-edit && git push
git checkout feature/imap-writeback-image-safety
```

- [ ] **Step 3: Test**

1. Mark email as read → check webmail (should also be read)
2. Star email → check webmail (should also be starred)
3. Delete email → should move to Trash on IMAP
4. Move email to folder → should move on IMAP with correct UID
5. Open email with remote images → images blocked, banner shown
6. Click "Load images" → images appear
7. Click "Always load from @domain.com" → future emails from that domain auto-load

- [ ] **Step 4: Create PR**

```bash
gh pr create --base main --head feature/imap-writeback-image-safety \
  --title "feat: IMAP write-back + remote image safety (#187, #188)" \
  --body "..."
```
