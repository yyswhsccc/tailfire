# IMAP Write-Back + Remote Image Safety

**Date:** 2026-04-12
**Issues:** #187, #188
**Status:** Approved (revised after Codex review)

## Overview

Make email flag changes (read, star, delete, move) sync back to the IMAP server, fix sync reliability, and block remote tracking images with a trusted sender allowlist.

## 1. IMAP Write-Back via BullMQ Queue

**Split policy by action type:**

### Flags (read/star) — DB-optimistic + queued write-back

1. Update DB immediately → return response (fast, optimistic)
2. Enqueue `email.writeback` BullMQ job with `{ accountId, emailId, uid, folder, flags }`
3. Queue processor opens short-lived IMAP connection and writes flags
4. On failure: retry (3 attempts with backoff). On permanent failure: log warning, set `syncState.writeback.lastError`

### Move/Delete — IMAP-first

Move and delete are **not** DB-optimistic because the IMAP operation changes the UID:

1. API call executes IMAP operation first (messageMove / move-to-Trash)
2. On IMAP success: update DB with new folder + new UID (for move) or soft-delete row (for delete)
3. On IMAP failure: return error to client, DB unchanged

This prevents stale folder/UID in the DB that would break body and attachment fetches.

### Flag Mapping

| Action | Strategy | IMAP Operation |
|--------|----------|---------------|
| Mark read | DB-optimistic + queued | `messageFlagsAdd(uid, ['\\Seen'])` |
| Mark unread | DB-optimistic + queued | `messageFlagsRemove(uid, ['\\Seen'])` |
| Star | DB-optimistic + queued | `messageFlagsAdd(uid, ['\\Flagged'])` |
| Unstar | DB-optimistic + queued | `messageFlagsRemove(uid, ['\\Flagged'])` |
| Delete | IMAP-first | `messageMove(uid, 'Trash')` → delete/update DB row |
| Move to folder | IMAP-first | `messageMove(uid, target)` → update DB folder + imap_uid |

### Architecture — No Circular DI

`ImapSyncService` already depends on `EmailAccountsService`. To avoid a cycle:

- **New `EmailWritebackProcessor`** — a BullMQ processor in the email-accounts module
- `EmailAccountsService` enqueues jobs (only depends on BullMQ, not ImapSync)
- `EmailWritebackProcessor` depends on `ImapSyncService` for IMAP connections
- For IMAP-first operations (move/delete): add new methods to a standalone `ImapWriteService` that `EmailAccountsService` can call directly (no cycle because ImapWriteService is new and doesn't depend on EmailAccountsService)

### Queue Configuration

```typescript
// Reuse existing BullMQ + Redis setup from automation module
{
  name: 'email-writeback',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 100,
  }
}
```

Jobs serialized per accountId to avoid concurrent IMAP connections to the same mailbox.

### Error Tracking

- Do NOT use `lastSyncError` for write-back failures (reserved for auth/sync health)
- Use `syncState.writeback.lastError` and `syncState.writeback.lastErrorAt` for write-back status

## 2. Sync State Safety

### Fix: Only advance lastUid to highest successfully persisted UID

Current bug: sync advances `lastUid` to `uidNext - 1` even if individual message upserts fail.

Fix in `imap-sync.service.ts`:
- Track `highestPersistedUid` during the sync loop
- After each successful `upsertEmailFromImap`: `highestPersistedUid = Math.max(highestPersistedUid, msg.uid)`
- At end of sync: `syncState.folders.INBOX.lastUid = highestPersistedUid` (not `uidNext - 1`)
- Failed messages re-fetched on next sync since lastUid didn't advance past them

## 3. Thread Grouping Fix

Current bug: replies to a root message with `threadId = null` create separate threads.

Fix in `imap-sync.service.ts` when computing threadId:
1. If `inReplyTo` or `references` headers match an existing email's `messageId`, use that email's `threadId`
2. If the matched email has no `threadId` yet, generate a new UUID and backfill it on the matched email too
3. If no match found, generate a new `threadId` for this message

**Additional case:** When IMAP sync merges a sent message into an existing provisional SMTP row (the dedup path), also backfill `threadId` — not just `imapUid` and flags.

## 4. Remote Image Handling

### Default: Block remote images

In `sanitize-email-html.ts`:
- Strip remote `http://` and `https://` URLs from both `<img src="...">` AND `background-image: url(...)` in inline styles
- **Preserve** `cid:` URLs (inline/embedded images from attachments) and data URIs
- Replace blocked `src` with a data URI placeholder

### Trusted Sender Allowlist

Users can trust a sender's domain so future emails auto-load images.

**Storage:** `user_profiles.platformPreferences.trustedImageDomains: string[]`

**Sanitizer accepts** `trustedDomains?: string[]` parameter:
- If sender's domain is in the list → allow all remote URLs
- If not → strip remote URLs, show placeholder

### Email Reader UI

When images are blocked, show a banner at the top of the email reader:

```
[🖼] Images from this sender are hidden for privacy.
     [Load images]  [Always load from @domain.com]
```

- **"Load images"** — re-render email HTML with images allowed (one-time, in-memory state)
- **"Always load from @domain.com"** — adds domain to `trustedImageDomains` via `useUpdateMyProfile`, then re-renders

### PlatformPreferencesDto Update

```typescript
export interface PlatformPreferencesDto {
  // ... existing fields
  trustedImageDomains?: string[]
}
```

## 5. Files to Modify/Create

### Backend
- **Create**: `apps/api/src/email-accounts/email-writeback.processor.ts` — BullMQ processor for flag write-back jobs
- **Create**: `apps/api/src/email-accounts/imap-write.service.ts` — standalone IMAP write methods (writeFlags, moveMessage, deleteMessage) — no dependency on EmailAccountsService
- **Modify**: `apps/api/src/email-accounts/email-accounts.service.ts` — enqueue flag write-back jobs; call ImapWriteService directly for move/delete (IMAP-first)
- **Modify**: `apps/api/src/email-accounts/email-accounts.module.ts` — register queue, processor, ImapWriteService
- **Modify**: `apps/api/src/email-accounts/imap-sync.service.ts` — fix lastUid advancement, fix thread grouping + sent-message dedup backfill

### Frontend
- **Modify**: `apps/admin/src/lib/sanitize-email-html.ts` — block remote URLs in img[src] AND inline styles, preserve cid: and data: URIs
- **Modify**: `apps/admin/src/app/emails/inbox/_components/email-reader.tsx` — "Images blocked" banner with Load/Trust buttons
- **Modify**: `packages/shared-types/src/api/user-profiles.types.ts` — add `trustedImageDomains` to `PlatformPreferencesDto`

## 6. Not in Scope

- Image proxy (deferred)
- Full folder sync beyond INBOX
- Bidirectional conflict resolution
- Offline queue persistence (BullMQ + Redis handles this)
