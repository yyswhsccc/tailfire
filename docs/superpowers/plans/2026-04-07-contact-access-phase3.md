# Contact Access — Phase 3: Admin Approval Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the share request cycle — admins/owners see pending requests on the contact page and can approve (share), reassign, or deny.

**Architecture:** Add a `PendingAccessRequests` component to the contact detail page that shows pending share requests for admin/owner. Wire to existing backend endpoints: `GET /contacts/share-requests/pending`, `PATCH /contacts/share-requests/:id`, `PATCH /contacts/:id/owner`.

**Tech Stack:** Next.js, React, TanStack Query, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-07-contact-access-ux-design.md` (Phase 3)
**Branch:** `feature/contact-access-ux`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `apps/admin/src/app/contacts/[id]/_components/pending-access-requests.tsx` | Banner showing pending share requests with approve/reassign/deny actions |
| `apps/admin/src/hooks/use-contact-share-requests.ts` | TanStack Query hooks for share request operations |

### Modified Files
| File | Change |
|------|--------|
| `apps/admin/src/app/contacts/[id]/page.tsx` | Mount PendingAccessRequests component for admin/owner |
| `apps/admin/src/components/notifications/notification-item.tsx` | Add `contact_share` category color |

---

## Task 1: Create Share Request Hooks

**Files:**
- Create: `apps/admin/src/hooks/use-contact-share-requests.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const shareRequestKeys = {
  all: ['contactShareRequests'] as const,
  pending: () => [...shareRequestKeys.all, 'pending'] as const,
}

interface PendingShareRequest {
  id: string
  contactId: string
  requesterId: string
  requesterName: string
  contactName: string
  status: string
  createdAt: string
}

/**
 * Fetch pending share requests for contacts owned by current user
 */
export function usePendingShareRequests() {
  return useQuery({
    queryKey: shareRequestKeys.pending(),
    queryFn: () => api.get<PendingShareRequest[]>('/contacts/share-requests/pending'),
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Resolve (approve/deny) a share request
 */
export function useResolveShareRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ requestId, status, reason }: {
      requestId: string
      status: 'approved' | 'denied'
      reason?: string
    }) => api.patch(`/contacts/share-requests/${requestId}`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shareRequestKeys.pending() })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}

/**
 * Reassign contact ownership
 */
export function useReassignContactOwner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contactId, ownerId }: { contactId: string; ownerId: string }) =>
      api.patch(`/contacts/${contactId}/owner`, { ownerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shareRequestKeys.pending() })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-contact-share-requests.ts
git commit -m "feat: add share request hooks (pending, resolve, reassign)"
```

---

## Task 2: Create Pending Access Requests Component

**Files:**
- Create: `apps/admin/src/app/contacts/[id]/_components/pending-access-requests.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { UserPlus, UserCheck, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  usePendingShareRequests,
  useResolveShareRequest,
  useReassignContactOwner,
} from '@/hooks/use-contact-share-requests'

interface PendingAccessRequestsProps {
  contactId: string
}

export function PendingAccessRequests({ contactId }: PendingAccessRequestsProps) {
  const { data: allPending = [] } = usePendingShareRequests()
  const resolveRequest = useResolveShareRequest()
  const reassignOwner = useReassignContactOwner()
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Filter to requests for this specific contact
  const pendingForContact = allPending.filter(r => r.contactId === contactId)

  if (pendingForContact.length === 0) return null

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      await resolveRequest.mutateAsync({ requestId, status: 'approved' })
      toast.success('Access granted — contact shared with full access')
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve request')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReassign = async (requestId: string, requesterId: string) => {
    setProcessingId(requestId)
    try {
      await reassignOwner.mutateAsync({ contactId, ownerId: requesterId })
      await resolveRequest.mutateAsync({ requestId, status: 'approved' })
      toast.success('Contact ownership reassigned')
    } catch (err: any) {
      toast.error(err.message || 'Failed to reassign contact')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeny = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      await resolveRequest.mutateAsync({ requestId, status: 'denied' })
      toast.success('Access request denied')
    } catch (err: any) {
      toast.error(err.message || 'Failed to deny request')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {pendingForContact.map((request) => (
        <Alert key={request.id} className="border-blue-200 bg-blue-50">
          <UserPlus className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900">Access Request</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-blue-800 text-sm">
              <strong>{request.requesterName}</strong> requested access to this contact
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="default"
                onClick={() => handleApprove(request.id)}
                disabled={processingId === request.id}
              >
                {processingId === request.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5 mr-1" />
                    Share
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleReassign(request.id, request.requesterId)}
                disabled={processingId === request.id}
              >
                Reassign
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeny(request.id)}
                disabled={processingId === request.id}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add 'apps/admin/src/app/contacts/[id]/_components/pending-access-requests.tsx'
git commit -m "feat: pending access requests banner with share/reassign/deny actions"
```

---

## Task 3: Mount Pending Requests on Contact Detail Page

**Files:**
- Modify: `apps/admin/src/app/contacts/[id]/page.tsx`

- [ ] **Step 1: Import and mount the component**

Import at the top:
```typescript
import { PendingAccessRequests } from './_components/pending-access-requests'
```

In the contact detail page, show the pending requests banner for admin/owner users. Place it BEFORE the existing owner banner (the amber "Limited Access" one), near the top of the contact info section.

Add it right after the contact header card and before any section cards:

```tsx
{/* Pending access requests (visible to admin and contact owner) */}
{(isAdmin || contact.ownerId === profile?.id) && (
  <PendingAccessRequests contactId={contactId} />
)}
```

This should go after the avatar/name/badges section but before the tags and other cards.

- [ ] **Step 2: Commit**

```bash
git add 'apps/admin/src/app/contacts/[id]/page.tsx'
git commit -m "feat: mount pending access requests banner on contact detail page"
```

---

## Task 4: Add Contact Share Category Color to Notifications

**Files:**
- Modify: `apps/admin/src/components/notifications/notification-item.tsx`

- [ ] **Step 1: Add contact_share to category color mapping**

Find the category color mapping (around lines 25-43) and add:

```typescript
contact_share: 'bg-blue-100 text-blue-700',
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/notifications/notification-item.tsx
git commit -m "feat: add blue category color for contact_share notifications"
```

---

## Task 5: Verify and Push

- [ ] **Step 1: Typecheck**

```bash
pnpm --filter @tailfire/admin exec tsc --noEmit
```

- [ ] **Step 2: Push**

```bash
git push origin feature/contact-access-ux
```
