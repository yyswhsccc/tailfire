# Email Lazy Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "sync everything at once" with lazy per-folder sync: background INBOX freshness every 2 min + on-demand folder hydration with bounded UID batches.

**Architecture:** `syncFolder` refactored to accept `mode` (incremental / hydrate_recent / hydrate_older) + `batchSize`. Background job syncs INBOX only. New folder-scoped sync endpoint for on-demand use. Frontend triggers sync on folder click (if stale) and hydrate_older on scroll exhaustion. CRM contact matching preserved in all paths via existing `matchContacts()` in `upsertEmailFromImap`.

**Tech Stack:** NestJS, ImapFlow, BullMQ, React (TanStack Query)

---

### Task 1: Refactor syncFolder to support three modes

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Update syncFolder signature and add mode logic**

Read the file. The existing `syncFolder` method (around line 533) currently only does incremental (`lastUid+1:*`). Refactor to accept mode and batchSize:

```typescript
private async syncFolder(
  client: any,
  accountId: string,
  agencyId: string,
  syncState: any,
  folderPath: string,
  options?: {
    mode?: 'incremental' | 'hydrate_recent' | 'hydrate_older'
    batchSize?: number
  }
): Promise<{ newMessages: number; newSenders: string[]; errors: string[]; historyExhausted?: boolean }>
```

Inside the method, after getting the mailbox lock and reading `uidNext`:

```typescript
const mode = options?.mode ?? 'incremental'
const batchSize = Math.min(options?.batchSize ?? 50, 100)
const folderState = syncState?.folders?.[folderPath] ?? {}
const lastUid = folderState.lastUid ?? 0
const oldestSyncedUid = folderState.oldestSyncedUid ?? 0
let historyExhausted = folderState.historyExhausted ?? false
let highestPersistedUid = lastUid
let lowestPersistedUid = oldestSyncedUid || Infinity

let fetchRange: string
switch (mode) {
  case 'incremental':
    if (uidNext && uidNext <= lastUid + 1) {
      // No new messages
      return { newMessages: 0, newSenders: [], errors: [] }
    }
    fetchRange = lastUid > 0 ? `${lastUid + 1}:*` : `${Math.max(1, (uidNext ?? 1) - batchSize)}:*`
    break

  case 'hydrate_recent':
    // First visit — fetch newest batch from tail of mailbox
    fetchRange = `${Math.max(1, (uidNext ?? 1) - batchSize)}:*`
    break

  case 'hydrate_older':
    if (historyExhausted || oldestSyncedUid <= 1) {
      return { newMessages: 0, newSenders: [], errors: [], historyExhausted: true }
    }
    const rangeEnd = oldestSyncedUid - 1
    const rangeStart = Math.max(1, rangeEnd - batchSize + 1)
    if (rangeEnd < 1) {
      return { newMessages: 0, newSenders: [], errors: [], historyExhausted: true }
    }
    fetchRange = `${rangeStart}:${rangeEnd}`
    break
}
```

The rest of the method stays the same — the `for await (const msg of client.fetch(fetchRange, ...))` loop, `upsertEmailFromImap` (which already does contact matching via `matchContacts`), and message counting.

After the fetch loop, update the tracking variables:

```typescript
// Update per-folder sync state
const updatedFolderState = {
  ...folderState,
  lastUid: Math.max(lastUid, highestPersistedUid),
  lastSyncAt: new Date().toISOString(),
  uidValidity: client.mailbox?.uidValidity ?? folderState.uidValidity,
}

if (mode === 'hydrate_recent' || mode === 'hydrate_older') {
  updatedFolderState.oldestSyncedUid = lowestPersistedUid === Infinity
    ? oldestSyncedUid
    : Math.min(oldestSyncedUid || Infinity, lowestPersistedUid)
  if (lowestPersistedUid <= 1 || newMessages < batchSize) {
    updatedFolderState.historyExhausted = true
    historyExhausted = true
  }
}

// Persist sync state
syncState.folders = syncState.folders ?? {}
syncState.folders[folderPath] = updatedFolderState
```

Inside the message processing loop, track `lowestPersistedUid`:

```typescript
highestPersistedUid = Math.max(highestPersistedUid, Number(msg.uid))
lowestPersistedUid = Math.min(lowestPersistedUid, Number(msg.uid))
```

IMPORTANT: `upsertEmailFromImap` already calls `matchContacts()` for CRM integration — do NOT remove or change this. All sync modes go through the same upsert path.

- [ ] **Step 2: Add UIDVALIDITY check**

At the top of `syncFolder`, after getting the lock, check if `uidValidity` changed:

```typescript
const serverUidValidity = client.mailbox?.uidValidity
if (folderState.uidValidity && serverUidValidity && serverUidValidity !== folderState.uidValidity) {
  this.logger.warn(`UIDVALIDITY changed for ${folderPath} (${folderState.uidValidity} → ${serverUidValidity}). Resetting cursors.`)
  // Delete all synced emails for this folder and reset state
  await this.db.client
    .delete(this.db.schema.syncedEmails)
    .where(and(
      eq(this.db.schema.syncedEmails.emailAccountId, accountId),
      eq(this.db.schema.syncedEmails.folder, folderPath),
    ))
  folderState.lastUid = 0
  folderState.oldestSyncedUid = 0
  folderState.historyExhausted = false
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "feat: refactor syncFolder to support incremental/hydrate_recent/hydrate_older modes"
```

---

### Task 2: Add folder-scoped sync endpoint

**Files:**
- Modify: `apps/api/src/email-accounts/email-accounts.controller.ts`
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Add public syncFolder method to ImapSyncService**

Add a public method that wraps the private `syncFolder` with connection management:

```typescript
async syncFolderOnDemand(
  accountId: string,
  folder: string,
  mode: 'incremental' | 'hydrate_recent' | 'hydrate_older',
  batchSize?: number,
): Promise<{ fetched: number; folder: string; historyExhausted?: boolean }> {
  const account = await this.emailAccountsService.getAccountById(accountId)
  const credentials = await this.emailAccountsService.getDecryptedCredentials(accountId)
  const syncState = (account.syncState as any) ?? {}

  const client = await this.createImapClient({
    host: account.imapHost, port: account.imapPort, secure: account.imapTls,
    user: credentials.username, pass: credentials.password,
  })

  await client.connect()
  try {
    const result = await this.syncFolder(client, accountId, account.agencyId, syncState, folder, { mode, batchSize })
    await this.emailAccountsService.updateSyncState(accountId, syncState)
    return { fetched: result.newMessages, folder, historyExhausted: result.historyExhausted }
  } finally {
    await client.logout()
  }
}
```

- [ ] **Step 2: Update controller sync endpoint**

Find the existing `POST /:id/sync` endpoint. Update it to accept folder + mode:

```typescript
@Post(':id/sync')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 3, ttl: 60000 } })
async triggerSync(
  @GetAuthContext() auth: AuthContext,
  @Param('id') id: string,
  @Body() dto?: { folder?: string; mode?: 'incremental' | 'hydrate_recent' | 'hydrate_older'; batchSize?: number },
): Promise<{ fetched: number; folder: string; historyExhausted?: boolean }> {
  await this.emailAccountsService.findOne(id, auth.userId)
  return this.imapSyncService.syncFolderOnDemand(
    id,
    dto?.folder ?? 'INBOX',
    dto?.mode ?? 'incremental',
    dto?.batchSize,
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts apps/api/src/email-accounts/email-accounts.controller.ts
git commit -m "feat: add folder-scoped sync endpoint with mode support"
```

---

### Task 3: Background sync — INBOX only, bounded

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`
- Modify: `apps/api/src/email-accounts/email-sync.processor.ts`

- [ ] **Step 1: Update syncAccount to only sync INBOX**

Find the `syncAccount` method. Currently it syncs INBOX + Sent. Change to INBOX only with `mode: 'incremental'` and `batchSize: 100`:

```typescript
async syncAccount(accountId: string): Promise<SyncResultDto> {
  // ... existing connection setup ...

  const result = await this.syncFolder(client, accountId, agencyId, syncState, 'INBOX', {
    mode: 'incremental',
    batchSize: 100,
  })

  // Save sync state + update lastSyncAt
  await this.emailAccountsService.updateSyncState(accountId, syncState)

  return {
    accountId,
    newMessages: result.newMessages,
    newSenders: result.newSenders,
    errors: result.errors,
  }
}
```

Remove the Sent folder sync from background. Sent will only sync on-demand when user clicks Sent folder.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts apps/api/src/email-accounts/email-sync.processor.ts
git commit -m "feat: background sync INBOX only, bounded to 100 messages"
```

---

### Task 4: Frontend — sync on folder click

**Files:**
- Modify: `apps/admin/src/hooks/use-emails.ts`
- Modify: `apps/admin/src/app/emails/inbox/page.tsx`

- [ ] **Step 1: Add useSyncFolder mutation hook**

In `use-emails.ts`, add a new mutation hook:

```typescript
export function useSyncFolder(accountId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { folder?: string; mode?: 'incremental' | 'hydrate_recent' | 'hydrate_older'; batchSize?: number }) => {
      if (!accountId) throw new Error('No account selected')
      return api.post<{ fetched: number; folder: string; historyExhausted?: boolean }>(
        `/email-accounts/${accountId}/sync`,
        params,
      )
    },
    onSuccess: (result) => {
      // Invalidate email list for the synced folder
      queryClient.invalidateQueries({ queryKey: ['emails-infinite'] })
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
    },
  })
}
```

- [ ] **Step 2: Trigger sync on folder click in inbox page**

In `page.tsx`, when `activeFolder` changes:

```typescript
const syncFolder = useSyncFolder(accountId)
const [folderSyncState, setFolderSyncState] = useState<Record<string, { lastSyncAt?: number; historyExhausted?: boolean }>>({})

// Sync folder on click (if stale)
useEffect(() => {
  if (!accountId || !activeFolder) return
  const state = folderSyncState[activeFolder]
  const isStale = !state?.lastSyncAt || Date.now() - state.lastSyncAt > 60000
  if (!isStale) return

  const mode = state?.lastSyncAt ? 'incremental' : 'hydrate_recent'
  syncFolder.mutate({ folder: activeFolder, mode, batchSize: 50 }, {
    onSuccess: (result) => {
      setFolderSyncState(prev => ({
        ...prev,
        [activeFolder]: {
          lastSyncAt: Date.now(),
          historyExhausted: result.historyExhausted ?? prev[activeFolder]?.historyExhausted,
        },
      }))
    },
  })
}, [activeFolder, accountId]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/hooks/use-emails.ts apps/admin/src/app/emails/inbox/page.tsx
git commit -m "feat: sync folder on click if stale, with useSyncFolder hook"
```

---

### Task 5: Frontend — hydrate older on scroll exhaustion

**Files:**
- Modify: `apps/admin/src/app/emails/inbox/page.tsx`

- [ ] **Step 1: Detect scroll exhaustion and trigger hydrate_older**

When `useInfiniteEmails` has no more pages (`!hasNextPage`) AND the folder is not fully hydrated:

```typescript
const folderExhausted = folderSyncState[activeFolder]?.historyExhausted ?? false

// When infinite scroll reaches end AND folder has more history on IMAP
useEffect(() => {
  if (hasNextPage || folderExhausted || !accountId || syncFolder.isPending) return
  // DB is exhausted but IMAP has more — hydrate older batch
  syncFolder.mutate({ folder: activeFolder, mode: 'hydrate_older', batchSize: 50 }, {
    onSuccess: (result) => {
      setFolderSyncState(prev => ({
        ...prev,
        [activeFolder]: {
          ...prev[activeFolder],
          historyExhausted: result.historyExhausted ?? false,
        },
      }))
    },
  })
}, [hasNextPage, folderExhausted, activeFolder]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Show "Loading older emails..." indicator**

In the EmailList sentinel area, show a different message when hydrating from IMAP:

```tsx
{!hasNextPage && !folderExhausted && syncFolder.isPending && (
  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin mr-2" />
    Loading older emails from server...
  </div>
)}
{!hasNextPage && folderExhausted && (
  <div className="text-center py-4 text-xs text-muted-foreground">
    All emails loaded
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/emails/inbox/page.tsx
git commit -m "feat: hydrate older emails from IMAP when scroll exhausts DB"
```

---

### Task 6: Manual refresh — folder-scoped

**Files:**
- Modify: `apps/admin/src/app/emails/inbox/page.tsx`

- [ ] **Step 1: Update refresh button to use folder-scoped sync**

Find the existing sync/refresh button (currently calls `useSyncEmails`). Replace with:

```typescript
function handleRefresh() {
  syncFolder.mutate({ folder: activeFolder, mode: 'incremental' }, {
    onSuccess: (result) => {
      setFolderSyncState(prev => ({
        ...prev,
        [activeFolder]: { ...prev[activeFolder], lastSyncAt: Date.now() },
      }))
    },
  })
}
```

Remove the old `useSyncEmails` import if no longer used.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/emails/inbox/page.tsx
git commit -m "feat: manual refresh button uses folder-scoped sync"
```

---

### Task 7: Folder rename — migrate sync state

**Files:**
- Modify: `apps/api/src/email-accounts/imap-sync.service.ts`

- [ ] **Step 1: Migrate sync state on folder rename**

Find the `renameFolder` method. After the IMAP `mailboxRename`, also migrate the sync state:

```typescript
// Migrate sync state for renamed folder
const account = await this.emailAccountsService.getAccountById(accountId)
const syncState = (account.syncState as any) ?? {}
if (syncState.folders?.[oldPath]) {
  syncState.folders[newPath] = syncState.folders[oldPath]
  delete syncState.folders[oldPath]
  await this.emailAccountsService.updateSyncState(accountId, syncState)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/email-accounts/imap-sync.service.ts
git commit -m "fix: migrate sync state when folder is renamed"
```

---

### Task 8: Type-check + push to preview

- [ ] **Step 1: Type-check**

```bash
npx tsc --noEmit -p apps/admin/tsconfig.json
```

- [ ] **Step 2: Push and merge to preview**

```bash
git push -u origin feature/email-lazy-sync
git checkout preview && git merge feature/email-lazy-sync --no-edit && git push
git checkout feature/email-lazy-sync
```

- [ ] **Step 3: Test**

1. Open inbox — emails load (from initial INBOX sync)
2. Click Sent folder — triggers `hydrate_recent`, emails appear
3. Scroll to bottom of INBOX — older emails load from IMAP (`hydrate_older`)
4. Wait 2 min — new emails arrive via background sync (INBOX only)
5. Click refresh — `incremental` sync for active folder
6. Verify CRM contact matching still works (check `matchedContactIds` on synced emails)
7. Verify date/time separators work with real `envelope.date` data

- [ ] **Step 4: Create PR**

```bash
gh pr create --base main --head feature/email-lazy-sync \
  --title "feat: lazy per-folder email sync with bounded batches" \
  --body "..."
```
