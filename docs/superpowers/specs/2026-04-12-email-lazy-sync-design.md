# Email Lazy Sync Architecture

**Date:** 2026-04-12
**Status:** Approved (Codex validated)

## Overview

Replace the current "sync everything at once" model with a two-pipeline architecture: background INBOX freshness + on-demand per-folder hydration. Never fetch all emails at once.

## 1. Two Pipelines

### Pipeline A: INBOX Incremental Freshness
- **Trigger:** Scheduled background job, every 2 minutes
- **Scope:** INBOX only (not Sent, Drafts, Trash, etc.)
- **Logic:** Fetch `lastUid+1:*` (only new messages since last sync)
- **Cap:** Max 100 messages per cycle
- **Purpose:** Keep unread badge current, trigger new email notifications
- Sent folder NOT synced in background (SMTP send already creates local rows)

### Pipeline B: Per-Folder Historical Hydration
- **Trigger:** User clicks a folder OR scrolls past loaded emails
- **Scope:** Any folder the user visits
- **Modes:**
  - `hydrate_recent` — first visit to a folder: fetch newest batch from tail of mailbox
  - `incremental` — folder already visited: fetch `lastUid+1:*` if stale (>60s)
  - `hydrate_older` — user scrolled past all DB rows: fetch older batch backward

## 2. Per-Folder Sync State

```typescript
syncState.folders[folderPath] = {
  lastUid: number              // incremental cursor (newest synced UID)
  oldestSyncedUid: number      // hydration cursor (oldest synced UID)
  historyExhausted: boolean    // true when we've reached UID 1 or empty window
  lastSyncAt: string           // ISO timestamp of last sync for this folder
  uidValidity: number          // IMAP UIDVALIDITY — reset cursors if this changes
}
```

When `uidValidity` changes on the server, reset all cursors for that folder and re-fetch.

## 3. Fetching Strategy (No SORT Required)

### Initial folder visit (`hydrate_recent`)
1. Lock mailbox, read `uidNext` from server
2. Fetch bounded tail window: `max(1, uidNext - batchSize):*`
3. Store results, set `lastUid = uidNext - 1`, `oldestSyncedUid = lowest UID fetched`
4. If fewer results than batchSize → `historyExhausted = true`

### Incremental (`lastUid+1:*`)
1. Existing pattern — fetch only new messages
2. Cap at 100 per batch
3. Update `lastUid` to highest persisted UID

### Older history (`hydrate_older`)
1. Compute window: `max(1, oldestSyncedUid - batchSize):oldestSyncedUid - 1`
2. Fetch, store, update `oldestSyncedUid = lowest UID fetched`
3. If `oldestSyncedUid <= 1` or empty result → `historyExhausted = true`

### Batch size
- Default: 50 messages per batch
- Background INBOX: cap at 100
- Never fetch `1:*`

## 4. API Endpoint

Folder-scoped sync endpoint (replaces account-wide sync):

```
POST /email-accounts/:id/sync
Body: {
  folder?: string           // default 'INBOX'
  mode: 'incremental' | 'hydrate_recent' | 'hydrate_older'
  batchSize?: number        // default 50, max 100
}
Response: {
  fetched: number
  folder: string
  historyExhausted?: boolean
}
```

The existing account-wide sync endpoint is kept for background jobs but internally calls the folder-scoped logic for INBOX only.

## 5. Frontend Integration

### Folder click
When user clicks a folder in the sidebar:
1. Check `syncState.folders[path].lastSyncAt` — if >60s stale or never synced
2. Call `POST /email-accounts/:id/sync` with `mode: 'hydrate_recent'` (first visit) or `mode: 'incremental'` (return visit)
3. On response, invalidate `useInfiniteEmails` query for that folder

### Infinite scroll — "DB runs out"
When `useInfiniteEmails` returns fewer emails than expected (total < page * limit):
1. Check `historyExhausted` for this folder
2. If not exhausted: call sync endpoint with `mode: 'hydrate_older'`
3. On response: refetch the current infinite query page

### Manual refresh
Refresh button calls `mode: 'incremental'` for the active folder (bypasses staleness check).

## 6. Folder Rename State Migration

When a folder is renamed (`mailboxRename`), also migrate sync state:
```typescript
const folderState = syncState.folders[oldPath]
delete syncState.folders[oldPath]
syncState.folders[newPath] = folderState
```

## 7. Files to Modify

### Backend
- **Modify**: `apps/api/src/email-accounts/imap-sync.service.ts` — refactor `syncFolder` to accept mode + batchSize, add `hydrate_recent` and `hydrate_older` modes, track `oldestSyncedUid` + `historyExhausted` + `uidValidity`
- **Modify**: `apps/api/src/email-accounts/email-accounts.controller.ts` — update sync endpoint to accept folder + mode + batchSize
- **Modify**: `apps/api/src/email-accounts/email-sync.processor.ts` — background job calls INBOX-only incremental
- **Modify**: `apps/api/src/email-accounts/email-sync-scheduler.service.ts` — keep 2-min interval, INBOX only

### Frontend
- **Modify**: `apps/admin/src/hooks/use-emails.ts` — add `useSyncFolder` mutation with mode param
- **Modify**: `apps/admin/src/app/emails/inbox/page.tsx` — trigger folder sync on folder click, handle "DB runs out" for older hydration
- **Modify**: `apps/admin/src/app/emails/inbox/_components/folder-sidebar.tsx` — show sync indicator per folder

## 8. Not in Scope
- IMAP SORT extension (bounded UID windows are sufficient)
- IMAP IDLE push notifications (polling is fine for 5 agents)
- Full bidirectional sync reconciliation
- Concurrent folder sync (one folder at a time per account)
