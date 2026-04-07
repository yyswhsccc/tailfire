# Contact Access UX — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make contact access limitations visible in the UI — limited view banner, hidden sections, My/All toggle, lock icons, and edit restrictions.

**Architecture:** Conditionally render/hide sections on the contact detail page based on `_accessLevel`. Add scope toggle to contacts list with server-side filtering. Use `_ownerName` and `_shareRequestStatus` from Phase 1 backend for banner and button state.

**Tech Stack:** Next.js App Router, React, TanStack Query, shadcn/ui, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-07-contact-access-ux-design.md` (Phase 2)
**Branch:** `feature/contact-access-ux`
**Depends on:** Phase 1 backend changes (already implemented on this branch)

---

## File Map

### Modified Files
| File | Change |
|------|--------|
| `apps/admin/src/hooks/use-contacts.ts` | Add `scope` parameter to API query |
| `apps/admin/src/app/contacts/page.tsx` | Add My/All scope toggle, empty state, force table in All mode |
| `apps/admin/src/app/contacts/_components/contacts-table.tsx` | Add lock icon + owner column for basic-access rows |
| `apps/admin/src/app/contacts/[id]/page.tsx` | Hide sections for basic access, show owner banner, disable edits |
| `apps/admin/src/app/contacts/[id]/_components/contact-share-request-button.tsx` | Use `_shareRequestStatus` from API instead of local state |

---

## Task 1: Wire Scope Parameter to Contact List API

**Files:**
- Modify: `apps/admin/src/hooks/use-contacts.ts`

- [ ] **Step 1: Add `scope` to the query params**

In the `useContacts()` hook, after the existing param serialization (around line 52), add:

```typescript
      if (filters.scope) params.append('scope', filters.scope)
```

This sends `?scope=mine` or `?scope=all` to the backend, which Phase 1 already handles.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-contacts.ts
git commit -m "feat: wire scope parameter to contacts list API query"
```

---

## Task 2: Add My/All Scope Toggle to Contacts List

**Files:**
- Modify: `apps/admin/src/app/contacts/page.tsx`

- [ ] **Step 1: Add scope state**

Near the existing state declarations (around line 49), add:

```typescript
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
```

For admin users, default to `'all'`:
```typescript
  const { data: profile } = useMyProfile()
  const isAdmin = profile?.role === 'admin'
  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine')
```

Import `useMyProfile` from `@/hooks/use-user-profile` if not already imported.

- [ ] **Step 2: Pass scope to filters**

In the `effectiveFilters` computation (around line 168), include scope:

```typescript
  const effectiveFilters = {
    ...filters,
    scope,
    limit: view === 'kanban' ? 500 : filters.limit,
  }
```

- [ ] **Step 3: Add scope toggle UI**

In the header area (around line 193), before or alongside the existing view toggle, add a segmented control:

```tsx
<div className="flex items-center gap-1 rounded-lg border border-ash-200 bg-ash-50 p-0.5">
  <button
    onClick={() => setScope('mine')}
    className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
      scope === 'mine' ? 'bg-white text-ash-900 shadow-sm' : 'text-ash-500 hover:text-ash-700'
    }`}
  >
    My Contacts
  </button>
  <button
    onClick={() => setScope('all')}
    className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
      scope === 'all' ? 'bg-white text-ash-900 shadow-sm' : 'text-ash-500 hover:text-ash-700'
    }`}
  >
    All Contacts
  </button>
</div>
```

- [ ] **Step 4: Force table view when scope is 'all'**

When `scope === 'all'`, disable kanban and force table view. In the view toggle area, disable the kanban option:

```tsx
// When rendering the view toggle, disable kanban if scope is 'all'
// Add this effect:
useEffect(() => {
  if (scope === 'all' && view === 'kanban') {
    setView('table')
  }
}, [scope])
```

And in the toggle group, disable kanban when scope is 'all':

```tsx
<ToggleGroupItem value="kanban" disabled={scope === 'all'} ... />
```

- [ ] **Step 5: Add empty state for My Contacts**

When `scope === 'mine'` and no contacts returned, show:

```tsx
{contacts.length === 0 && scope === 'mine' && !filters.search && (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Users className="h-12 w-12 text-ash-300 mb-4" />
    <h3 className="text-lg font-medium text-ash-900 mb-1">No contacts yet</h3>
    <p className="text-sm text-ash-500 mb-6">Create a new contact or import from CSV to get started.</p>
    <div className="flex gap-3">
      <Button onClick={() => setShowCreateDialog(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create New Contact
      </Button>
      <Button variant="outline" onClick={() => router.push('/contacts/import')}>
        Import from CSV
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/contacts/page.tsx
git commit -m "feat: add My Contacts / All Contacts scope toggle with empty state"
```

---

## Task 3: Add Lock Icon and Owner Column to Contacts Table

**Files:**
- Modify: `apps/admin/src/app/contacts/_components/contacts-table.tsx`

- [ ] **Step 1: Add owner column header**

In the table header row (around line 207), add an "Owner" column after the existing columns (before Tags or at the end):

```tsx
<TableHead className="w-[130px] px-4 py-2">Owner</TableHead>
```

- [ ] **Step 2: Add lock icon + owner cell in row rendering**

In each table row (around line 285), add the owner cell. For basic-access contacts, show a lock icon. For full-access, show nothing or a checkmark:

```tsx
<TableCell className="w-[130px] px-4 py-2">
  {contact._accessLevel === 'basic' ? (
    <div className="flex items-center gap-1.5 text-ash-400">
      <Lock className="h-3.5 w-3.5" />
      <span className="text-xs truncate">{contact._ownerName || 'Unassigned'}</span>
    </div>
  ) : contact._ownerName ? (
    <span className="text-xs text-ash-500 truncate">{contact._ownerName}</span>
  ) : (
    <span className="text-xs text-ash-400">—</span>
  )}
</TableCell>
```

Import `Lock` from `lucide-react`.

- [ ] **Step 3: Add null safety to contactStatus rendering**

At line 322 (the crash point), add null safety:

```tsx
<TableCell className="w-[120px] px-4 py-2">
  {contact.contactStatus ? (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[contact.contactStatus] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {formatStatusLabel(contact.contactStatus)}
    </span>
  ) : (
    <span className="text-xs text-ash-400">—</span>
  )}
</TableCell>
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/contacts/_components/contacts-table.tsx
git commit -m "feat: add lock icon, owner column, and null-safe status to contacts table"
```

---

## Task 4: Contact Detail Page — Limited View with Owner Banner

**Files:**
- Modify: `apps/admin/src/app/contacts/[id]/page.tsx`

This is the largest change. The contact detail page is ~1600 lines. We need to:
1. Replace the small "Limited View" badge with a prominent banner showing the owner name
2. Hide all sections except basic contact info for basic-access users
3. Disable edit buttons for basic-access users

- [ ] **Step 1: Replace the Limited View badge with an owner banner**

At lines 575-581, replace the existing badge + request button with a full-width alert banner:

```tsx
{contact._accessLevel === 'basic' && !isAdmin && (
  <Alert className="border-amber-200 bg-amber-50">
    <Lock className="h-4 w-4 text-amber-600" />
    <AlertTitle className="text-amber-900">
      Limited Access
    </AlertTitle>
    <AlertDescription className="flex items-center justify-between">
      <span className="text-amber-800">
        This contact belongs to <strong>{contact._ownerName || 'another agent'}</strong>. You can only see basic information.
      </span>
      <ContactShareRequestButton
        contactId={contact.id}
        initialStatus={contact._shareRequestStatus}
      />
    </AlertDescription>
  </Alert>
)}
```

Import `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui/alert` and `Lock` from `lucide-react`.

- [ ] **Step 2: Create an `isBasicAccess` flag**

Near the top of the component (after contact data is loaded), add:

```typescript
const isBasicAccess = contact._accessLevel === 'basic' && !isAdmin
```

- [ ] **Step 3: Hide left column sections for basic access**

Wrap the sections that should be hidden (Identity Card, Professional Card, Personal Card, Address Card, Lifecycle Card, Relationships & Groups, Recent Emails) in a conditional:

```tsx
{!isBasicAccess && (
  <>
    {/* Identity Card (lines ~614-757) */}
    {/* Professional Card (lines ~842-932) */}
    {/* Personal Card (lines ~934-1043) */}
    {/* Address Card (lines ~1045-1186) */}
    {/* Lifecycle Card (lines ~1188-1287) */}
    {/* Relationships & Groups (lines ~1289-1295) */}
    {/* Recent Emails (lines ~1297-1301) */}
  </>
)}
```

Keep visible: the Contact Info Card (name, email, phone — lines 514-593) and the new banner.

- [ ] **Step 4: Hide right column tabbed content for basic access**

Wrap the entire right column (lines ~1305-1602) in a conditional:

```tsx
{!isBasicAccess && (
  <div className="lg:col-span-2 space-y-6">
    {/* All tabbed content: Timeline, Tasks, Relationships, Notes, Emails, etc. */}
  </div>
)}
```

For basic access, show a simple message instead:

```tsx
{isBasicAccess && (
  <div className="lg:col-span-2 flex items-center justify-center py-16">
    <div className="text-center text-ash-400">
      <Lock className="h-8 w-8 mx-auto mb-3" />
      <p className="text-sm">Request access to view trips, notes, and more.</p>
    </div>
  </div>
)}
```

- [ ] **Step 5: Disable edit buttons on the Contact Info Card for basic access**

The Contact Card (email, phone — lines 759-840) has edit buttons. Pass `isBasicAccess` to disable them:

In the card section where edit pencil icons appear, add:

```tsx
{!isBasicAccess && (
  <Button variant="ghost" size="icon" onClick={...}>
    <Pencil className="h-3.5 w-3.5" />
  </Button>
)}
```

Or simply hide the edit trigger by wrapping it in `{!isBasicAccess && (...)}`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/contacts/[id]/page.tsx
git commit -m "feat: limited view with owner banner, hidden sections, disabled edits"
```

---

## Task 5: Update Share Request Button to Use API State

**Files:**
- Modify: `apps/admin/src/app/contacts/[id]/_components/contact-share-request-button.tsx`

- [ ] **Step 1: Accept `initialStatus` prop and remove local state tracking**

Update the component to use the `_shareRequestStatus` from the API response:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useState } from 'react'
import { toast } from 'sonner'

interface ContactShareRequestButtonProps {
  contactId: string
  initialStatus?: 'none' | 'pending' | 'approved' | 'denied' | null
}

export function ContactShareRequestButton({
  contactId,
  initialStatus,
}: ContactShareRequestButtonProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(initialStatus || 'none')

  async function handleRequest() {
    setLoading(true)
    try {
      await api.post(`/contacts/${contactId}/share-requests`)
      setStatus('pending')
      toast.success('Access request sent to contact owner')
    } catch (err: any) {
      toast.error(err.message || 'Failed to request access')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'pending') {
    return (
      <Button variant="outline" size="sm" disabled className="text-amber-600 border-amber-300">
        Access Requested
      </Button>
    )
  }

  if (status === 'approved') {
    return null // Access granted — button not needed
  }

  if (status === 'denied') {
    return (
      <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
        {loading ? 'Requesting...' : 'Request Again'}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRequest} disabled={loading}>
      {loading ? 'Requesting...' : 'Request Access'}
    </Button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/contacts/[id]/_components/contact-share-request-button.tsx
git commit -m "feat: share request button uses API status, persists across reload"
```

---

## Task 6: Verify and Test

- [ ] **Step 1: Run admin typecheck**

```bash
pnpm --filter @tailfire/admin exec tsc --noEmit
```

Expected: No new type errors from our changes.

- [ ] **Step 2: Test locally**

1. Log in as admin — contacts list shows "All Contacts" by default, all columns visible
2. Log in as agent — contacts list shows "My Contacts" by default (likely empty for pilot agents)
3. Switch to "All Contacts" — lock icon + owner column visible, kanban disabled
4. Click a contact you don't own — see the owner banner, hidden sections, "Request Access" button
5. Click "Request Access" — button changes to "Access Requested", persists on page reload

- [ ] **Step 3: Commit and push**

```bash
git push origin feature/contact-access-ux
```
