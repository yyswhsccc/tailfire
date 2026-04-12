# IMAP Write-Back + Remote Image Safety

**Date:** 2026-04-12
**Issues:** #187, #188
**Status:** Approved

## Overview

Make email flag changes (read, star, delete, move) sync back to the IMAP server, fix sync reliability, and block remote tracking images with a trusted sender allowlist.

## 1. IMAP Flag Write-Back (Fire-and-forget)

When user marks read/unread, stars, deletes, or moves an email:
1. Update DB immediately (existing behavior — fast response)
2. Return response to client
3. In background (`waitUntil` / fire-and-forget), open short-lived IMAP connection and write the flag/action back

### Flag Mapping

| Action | IMAP Operation |
|--------|---------------|
| Mark read | `messageFlagsAdd(uid, ['\\Seen'])` |
| Mark unread | `messageFlagsRemove(uid, ['\\Seen'])` |
| Star | `messageFlagsAdd(uid, ['\\Flagged'])` |
| Unstar | `messageFlagsRemove(uid, ['\\Flagged'])` |
| Delete | `messageMove(uid, 'Trash')` |
| Move to folder | `messageMove(uid, targetFolder)` → update `imap_uid` with new UID |

### Failure Handling

- If IMAP write fails, log warning + set `lastSyncError` on the account
- Next sync cycle reconciles (IMAP server state wins on conflict)
- No retry queue needed for V1 — sync reconciliation is the retry mechanism

### Implementation

Add methods to `imap-sync.service.ts`:

```typescript
async writeFlags(accountId: string, uid: number, folder: string, flags: { isSeen?: boolean; isFlagged?: boolean }): Promise<void>
async moveMessage(accountId: string, uid: number, fromFolder: string, toFolder: string): Promise<{ newUid: number }>
async deleteMessage(accountId: string, uid: number, folder: string): Promise<void>
```

In `email-accounts.service.ts`, after each DB update, call the appropriate write method in the background:

```typescript
// Example: updateFlags
const [updated] = await db.update(syncedEmails).set({ isSeen, isFlagged }).where(...)
// Fire-and-forget IMAP write
this.imapSyncService.writeFlags(accountId, email.imapUid, email.folder, { isSeen, isFlagged })
  .catch(err => this.logger.warn(`IMAP flag write failed: ${err.message}`))
```

## 2. Sync State Safety

### Fix: Only advance lastUid to highest successfully persisted UID

Current bug: sync advances `lastUid` to `uidNext - 1` even if individual message upserts fail, permanently skipping those messages.

Fix in `imap-sync.service.ts`:
- Track `highestPersistedUid` during the sync loop
- After each successful `upsertEmailFromImap`, update `highestPersistedUid = Math.max(highestPersistedUid, msg.uid)`
- At end of sync, set `syncState.folders.INBOX.lastUid = highestPersistedUid` (not `uidNext - 1`)
- Failed messages will be re-fetched on next sync since lastUid didn't advance past them

## 3. Thread Grouping Fix

Current bug: replies to a root message with `threadId = null` create separate threads.

Fix in `imap-sync.service.ts` when computing threadId:
1. If `inReplyTo` or `references` headers match an existing email's `messageId`, use that email's `threadId`
2. If the matched email has no `threadId` yet, generate a new UUID and backfill it on the matched email too
3. If no match found, generate a new `threadId` for this message

## 4. Remote Image Handling

### Default: Block remote images

In `sanitize-email-html.ts`, strip all remote `<img src="...">` URLs. Replace `src` with a data URI placeholder (transparent 1x1 or a "blocked image" icon).

### Trusted Sender Allowlist

Users can trust a sender's domain so future emails from that domain auto-load images.

**Storage:** `user_profiles.platformPreferences.trustedImageDomains: string[]`

**Sanitizer accepts** `trustedDomains?: string[]` parameter:
- If sender's domain is in the list → allow all `<img src>` as-is
- If not → replace with placeholder

### Email Reader UI

When images are blocked, show a banner at the top of the email reader:

```
[🖼] Images from this sender are hidden for privacy.
     [Load images]  [Always load from @domain.com]
```

- **"Load images"** — re-render email HTML with images allowed (one-time, in-memory)
- **"Always load from @domain.com"** — adds domain to `trustedImageDomains` via `useUpdateMyProfile`, then re-renders

### PlatformPreferencesDto Update

```typescript
export interface PlatformPreferencesDto {
  // ... existing fields
  trustedImageDomains?: string[]
}
```

## 5. Move UID Handling

When moving a message via IMAP `messageMove`:
- IMAP assigns a new UID in the destination mailbox
- ImapFlow's `messageMove` returns the new UID info
- Update `synced_emails.imap_uid` with the new UID and `folder` with the new folder
- This ensures future body/attachment fetches use the correct UID

## 6. Files to Modify

### Backend
- **Modify**: `apps/api/src/email-accounts/imap-sync.service.ts` — add `writeFlags()`, `moveMessage()`, `deleteMessage()` methods; fix `lastUid` advancement; fix thread grouping
- **Modify**: `apps/api/src/email-accounts/email-accounts.service.ts` — call IMAP write-back methods after DB updates (fire-and-forget)

### Frontend
- **Modify**: `apps/admin/src/lib/sanitize-email-html.ts` — accept `trustedDomains` param, strip remote images conditionally
- **Modify**: `apps/admin/src/app/emails/inbox/_components/email-reader.tsx` — add "Images blocked" banner with Load/Trust buttons
- **Modify**: `apps/admin/src/hooks/use-emails.ts` — pass sender domain context to reader

### Types
- **Modify**: `packages/shared-types/src/api/user-profiles.types.ts` — add `trustedImageDomains` to `PlatformPreferencesDto`

## 7. Not in Scope

- Image proxy (deferred — A approach first)
- Retry queue for failed IMAP writes (sync reconciliation is sufficient)
- Bidirectional conflict resolution (IMAP wins on next sync)
- Full folder sync (INBOX only for now)
