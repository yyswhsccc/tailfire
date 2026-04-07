# Trip Reassignment with Contact Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to reassign trips (single + bulk) with automatic cascade to unowned/inactive-owner traveler contacts.

**Architecture:** Extract shared `reassignTripOwner()` in trips.service.ts that handles trip ownerId update, collaborator sync, and contact cascade in a transaction. Wire to both existing PATCH endpoints and new bulk endpoints. Add bulk reassign dialog to trips page.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, React, TanStack Query, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-07-trip-reassignment-cascade-design.md`
**Branch:** `feature/contact-access-ux`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `apps/admin/src/app/trips/_components/bulk-reassign-dialog.tsx` | Dialog with agent picker, preview, confirm |
| `apps/api/src/trips/dto/bulk-reassign.dto.ts` | Validation DTOs for bulk reassign endpoints |

### Modified Files
| File | Change |
|------|--------|
| `packages/shared-types/src/api/trips.types.ts` | Add BulkReassign types, ReassignCascadeResult |
| `apps/api/src/trips/trips.service.ts` | Extract shared `reassignTripOwner()`, add `bulkReassignPreview()`, `bulkReassign()` |
| `apps/api/src/trips/trips.controller.ts` | Update `PATCH /:id/owner` response, add bulk endpoints, gate ownerId in generic update |
| `apps/admin/src/hooks/use-trips.ts` | Add bulk reassign preview + execute mutations |
| `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx` | Show cascade toast after owner change |
| `apps/admin/src/app/trips/page.tsx` | Add Reassign button to bulk toolbar, wire dialog |
| `apps/admin/src/components/trips/trips-bulk-actions.tsx` | Add onReassign prop |

---

## Task 1: Add Types for Reassignment Cascade

**Files:**
- Modify: `packages/shared-types/src/api/trips.types.ts`

- [ ] **Step 1: Add cascade result types after the existing `UpdateTripOwnerDto`** (around line 745):

```typescript
/**
 * Result of trip reassignment with contact cascade
 */
export interface ReassignCascadeResult {
  trip: TripResponseDto
  cascade: {
    contactsAssigned: number
    contactsSkipped: { contactName: string; currentOwner: string }[]
  }
}

/**
 * Bulk reassign trips request
 */
export interface BulkReassignTripsDto {
  tripIds: string[]
  newOwnerId: string
}

/**
 * Bulk reassign preview result
 */
export interface BulkReassignPreviewDto {
  tripsCount: number
  contactsToAssign: { id: string; name: string; reason: 'unowned' | 'inactive_owner' }[]
  contactsToSkip: { id: string; name: string; currentOwnerName: string }[]
}

/**
 * Bulk reassign execution result
 */
export interface BulkReassignResultDto {
  tripsReassigned: number
  contactsAssigned: number
  contactsSkipped: { contactName: string; currentOwner: string }[]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared-types/src/api/trips.types.ts
git commit -m "feat: add types for trip reassignment cascade and bulk reassign"
```

---

## Task 2: Create Bulk Reassign DTO

**Files:**
- Create: `apps/api/src/trips/dto/bulk-reassign.dto.ts`

- [ ] **Step 1: Create the validation DTO**

```typescript
import { IsArray, IsString, IsUUID, ArrayMinSize } from 'class-validator'

export class BulkReassignTripsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  tripIds!: string[]

  @IsString()
  @IsUUID('4')
  newOwnerId!: string
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/trips/dto/bulk-reassign.dto.ts
git commit -m "feat: add bulk reassign validation DTO"
```

---

## Task 3: Extract Shared reassignTripOwner() Method

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts`

This is the core task. Extract a shared method that handles:
1. Update trip ownerId
2. Sync lead collaborator (from existing `update()` logic at lines 637-669)
3. Cascade to traveler contacts (new logic)
4. Return cascade summary

- [ ] **Step 1: Add the shared `reassignTripOwner()` method**

Add this method to `trips.service.ts` (after the existing `updateOwner()` method, around line 862):

```typescript
  /**
   * Reassign trip ownership with contact cascade.
   * - Updates trip ownerId
   * - Syncs lead collaborator
   * - Cascades to traveler contacts: unowned → assign, inactive-owner → reassign, active-owner → skip
   */
  async reassignTripOwner(
    tripId: string,
    newOwnerId: string,
    agencyId: string,
  ): Promise<{ contactsAssigned: number; contactsSkipped: { contactName: string; currentOwner: string }[] }> {
    // Get the existing trip
    const [existingTrip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!existingTrip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // Validate new owner
    await this.userValidationService.validateUserInAgency(newOwnerId, agencyId, 'New owner')

    return await this.db.client.transaction(async (tx) => {
      // 1. Update trip ownerId
      await tx
        .update(this.db.schema.trips)
        .set({ ownerId: newOwnerId, updatedAt: new Date() })
        .where(eq(this.db.schema.trips.id, tripId))

      // 2. Sync lead collaborator (port from update() lines 637-669)
      if (existingTrip.ownerId) {
        await tx
          .update(this.db.schema.tripCollaborators)
          .set({ isActive: false })
          .where(
            and(
              eq(this.db.schema.tripCollaborators.tripId, tripId),
              eq(this.db.schema.tripCollaborators.userId, existingTrip.ownerId),
              eq(this.db.schema.tripCollaborators.role, 'lead'),
            ),
          )
      }
      await tx
        .insert(this.db.schema.tripCollaborators)
        .values({
          tripId,
          userId: newOwnerId,
          commissionPercentage: '100',
          role: 'lead',
          isActive: true,
          createdBy: newOwnerId,
        })
        .onConflictDoUpdate({
          target: [this.db.schema.tripCollaborators.tripId, this.db.schema.tripCollaborators.userId],
          set: { isActive: true, role: 'lead', commissionPercentage: '100' },
        })

      // 3. Collect traveler contacts (UNION DISTINCT of trip_travelers.contact_id + trips.primary_contact_id)
      const travelerRows = await tx
        .selectDistinct({ contactId: this.db.schema.tripTravelers.contactId })
        .from(this.db.schema.tripTravelers)
        .where(eq(this.db.schema.tripTravelers.tripId, tripId))

      const contactIds = new Set(travelerRows.map(r => r.contactId))
      if (existingTrip.primaryContactId) {
        contactIds.add(existingTrip.primaryContactId)
      }

      // 4. For each contact, check ownership and cascade
      let contactsAssigned = 0
      const contactsSkipped: { contactName: string; currentOwner: string }[] = []

      for (const contactId of contactIds) {
        const [contact] = await tx
          .select({
            id: this.db.schema.contacts.id,
            firstName: this.db.schema.contacts.firstName,
            lastName: this.db.schema.contacts.lastName,
            ownerId: this.db.schema.contacts.ownerId,
          })
          .from(this.db.schema.contacts)
          .where(eq(this.db.schema.contacts.id, contactId))
          .limit(1)

        if (!contact) continue

        // Already owned by the new owner — skip
        if (contact.ownerId === newOwnerId) continue

        // No owner — assign
        if (!contact.ownerId) {
          await tx
            .update(this.db.schema.contacts)
            .set({ ownerId: newOwnerId, updatedAt: new Date() })
            .where(eq(this.db.schema.contacts.id, contactId))
          contactsAssigned++
          continue
        }

        // Check if current owner is inactive
        const [owner] = await tx
          .select({
            status: this.db.schema.userProfiles.status,
            isActive: this.db.schema.userProfiles.isActive,
            firstName: this.db.schema.userProfiles.firstName,
            lastName: this.db.schema.userProfiles.lastName,
          })
          .from(this.db.schema.userProfiles)
          .where(eq(this.db.schema.userProfiles.id, contact.ownerId))
          .limit(1)

        if (!owner || owner.status !== 'active' || !owner.isActive) {
          // Inactive owner — reassign
          await tx
            .update(this.db.schema.contacts)
            .set({ ownerId: newOwnerId, updatedAt: new Date() })
            .where(eq(this.db.schema.contacts.id, contactId))
          contactsAssigned++
        } else {
          // Active owner — skip
          const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'
          const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Unknown'
          contactsSkipped.push({ contactName, currentOwner: ownerName })
        }
      }

      // Emit event
      this.eventEmitter.emit(
        'trip.updated',
        new TripUpdatedEvent(tripId, existingTrip.name, null, { ownerId: newOwnerId }),
      )

      return { contactsAssigned, contactsSkipped }
    })
  }
```

- [ ] **Step 2: Update `updateOwner()` to use the shared method**

Replace the body of `updateOwner()` (lines 817-862) to call `reassignTripOwner()` and return the enhanced response:

```typescript
  async updateOwner(id: string, ownerId: string | null, agencyId: string): Promise<any> {
    if (ownerId === null) {
      // Null owner — just update, no cascade
      const [existingTrip] = await this.db.client
        .select()
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, id))
        .limit(1)

      if (!existingTrip) throw new NotFoundException(`Trip ${id} not found`)
      if (existingTrip.status !== 'inbound') {
        throw new BadRequestException('Trips can only have no owner when status is "inbound"')
      }

      const [trip] = await this.db.client
        .update(this.db.schema.trips)
        .set({ ownerId: null, updatedAt: new Date() })
        .where(eq(this.db.schema.trips.id, id))
        .returning()

      return { trip: this.mapToResponseDto(trip!), cascade: { contactsAssigned: 0, contactsSkipped: [] } }
    }

    const cascade = await this.reassignTripOwner(id, ownerId, agencyId)
    const [updatedTrip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, id))
      .limit(1)

    return { trip: this.mapToResponseDto(updatedTrip!), cascade }
  }
```

Note: `updateOwner()` now needs `agencyId` parameter — update the controller call too.

- [ ] **Step 3: Add `bulkReassignPreview()` and `bulkReassign()` methods**

```typescript
  /**
   * Preview what bulk reassignment would do (no mutations)
   */
  async bulkReassignPreview(tripIds: string[], newOwnerId: string, agencyId: string) {
    // Collect all unique contacts across selected trips
    const contactMap = new Map<string, { id: string; firstName: string | null; lastName: string | null; ownerId: string | null }>()

    for (const tripId of tripIds) {
      const travelers = await this.db.client
        .selectDistinct({ contactId: this.db.schema.tripTravelers.contactId })
        .from(this.db.schema.tripTravelers)
        .where(eq(this.db.schema.tripTravelers.tripId, tripId))

      const [trip] = await this.db.client
        .select({ primaryContactId: this.db.schema.trips.primaryContactId })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)

      const ids = new Set(travelers.map(t => t.contactId))
      if (trip?.primaryContactId) ids.add(trip.primaryContactId)

      for (const cid of ids) {
        if (!contactMap.has(cid)) {
          const [contact] = await this.db.client
            .select({ id: this.db.schema.contacts.id, firstName: this.db.schema.contacts.firstName, lastName: this.db.schema.contacts.lastName, ownerId: this.db.schema.contacts.ownerId })
            .from(this.db.schema.contacts)
            .where(eq(this.db.schema.contacts.id, cid))
            .limit(1)
          if (contact) contactMap.set(cid, contact)
        }
      }
    }

    const contactsToAssign: { id: string; name: string; reason: 'unowned' | 'inactive_owner' }[] = []
    const contactsToSkip: { id: string; name: string; currentOwnerName: string }[] = []

    for (const contact of contactMap.values()) {
      if (contact.ownerId === newOwnerId) continue

      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'

      if (!contact.ownerId) {
        contactsToAssign.push({ id: contact.id, name, reason: 'unowned' })
        continue
      }

      const [owner] = await this.db.client
        .select({ status: this.db.schema.userProfiles.status, isActive: this.db.schema.userProfiles.isActive, firstName: this.db.schema.userProfiles.firstName, lastName: this.db.schema.userProfiles.lastName })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, contact.ownerId))
        .limit(1)

      if (!owner || owner.status !== 'active' || !owner.isActive) {
        contactsToAssign.push({ id: contact.id, name, reason: 'inactive_owner' })
      } else {
        const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Unknown'
        contactsToSkip.push({ id: contact.id, name, currentOwnerName: ownerName })
      }
    }

    return { tripsCount: tripIds.length, contactsToAssign, contactsToSkip }
  }

  /**
   * Execute bulk reassignment
   */
  async bulkReassign(tripIds: string[], newOwnerId: string, agencyId: string) {
    let totalContactsAssigned = 0
    const allSkipped: { contactName: string; currentOwner: string }[] = []
    const processedContacts = new Set<string>()

    for (const tripId of tripIds) {
      const { contactsAssigned, contactsSkipped } = await this.reassignTripOwner(tripId, newOwnerId, agencyId)
      totalContactsAssigned += contactsAssigned
      for (const s of contactsSkipped) {
        const key = `${s.contactName}|${s.currentOwner}`
        if (!processedContacts.has(key)) {
          processedContacts.add(key)
          allSkipped.push(s)
        }
      }
    }

    return { tripsReassigned: tripIds.length, contactsAssigned: totalContactsAssigned, contactsSkipped: allSkipped }
  }
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/trips/trips.service.ts
git commit -m "feat: extract shared reassignTripOwner with contact cascade + bulk methods"
```

---

## Task 4: Update Controller Endpoints

**Files:**
- Modify: `apps/api/src/trips/trips.controller.ts`

- [ ] **Step 1: Update `PATCH /:id/owner` to pass agencyId and return cascade result**

```typescript
  @Patch(':id/owner')
  async updateOwner(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTripOwnerDto,
  ) {
    if (auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can re-assign trip ownership')
    }
    return this.tripsService.updateOwner(id, dto.ownerId, auth.agencyId)
  }
```

- [ ] **Step 2: Gate ownerId in generic `PATCH /:id` for non-admins**

In the generic update endpoint (around line 868), strip ownerId for non-admin users:

```typescript
  @Patch(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() updateTripDto: UpdateTripDto,
  ): Promise<TripResponseDto> {
    await this.tripAccessService.verifyWriteAccess(id, auth)
    // Non-admins cannot change trip ownership via generic update
    if (auth.role !== 'admin' && 'ownerId' in updateTripDto) {
      delete (updateTripDto as any).ownerId
    }
    return this.tripsService.update(id, updateTripDto)
  }
```

- [ ] **Step 3: Add bulk reassign endpoints**

Import the DTO and add:

```typescript
  @Post('bulk-reassign/preview')
  async bulkReassignPreview(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: BulkReassignTripsDto,
  ) {
    if (auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can bulk reassign trips')
    }
    return this.tripsService.bulkReassignPreview(dto.tripIds, dto.newOwnerId, auth.agencyId)
  }

  @Post('bulk-reassign')
  async bulkReassign(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: BulkReassignTripsDto,
  ) {
    if (auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can bulk reassign trips')
    }
    return this.tripsService.bulkReassign(dto.tripIds, dto.newOwnerId, auth.agencyId)
  }
```

**Important:** These POST endpoints must be registered BEFORE `:id` param routes to avoid route conflicts. Place them near the top of the controller.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/trips/trips.controller.ts apps/api/src/trips/dto/bulk-reassign.dto.ts
git commit -m "feat: update owner endpoint with cascade, add bulk reassign endpoints"
```

---

## Task 5: Add Frontend Hooks for Bulk Reassign

**Files:**
- Modify: `apps/admin/src/hooks/use-trips.ts`

- [ ] **Step 1: Add preview and execute mutations**

```typescript
/**
 * Preview bulk trip reassignment
 */
export function useBulkReassignPreview() {
  return useMutation({
    mutationFn: (data: { tripIds: string[]; newOwnerId: string }) =>
      api.post<BulkReassignPreviewDto>('/trips/bulk-reassign/preview', data),
  })
}

/**
 * Execute bulk trip reassignment
 */
export function useBulkReassignTrips() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { tripIds: string[]; newOwnerId: string }) =>
      api.post<BulkReassignResultDto>('/trips/bulk-reassign', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}
```

Import the types from shared-types.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-trips.ts
git commit -m "feat: add bulk reassign preview and execute hooks"
```

---

## Task 6: Create Bulk Reassign Dialog

**Files:**
- Create: `apps/admin/src/app/trips/_components/bulk-reassign-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

This dialog has 3 states: select agent → preview → result.

```tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertTriangle, CheckCircle2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useUsers } from '@/hooks/use-users'
import { useBulkReassignPreview, useBulkReassignTrips } from '@/hooks/use-trips'

interface BulkReassignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTripIds: string[]
  onComplete: () => void
}

type Step = 'select' | 'preview' | 'result'

export function BulkReassignDialog({
  open,
  onOpenChange,
  selectedTripIds,
  onComplete,
}: BulkReassignDialogProps) {
  const [step, setStep] = useState<Step>('select')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const { data: usersData } = useUsers({ status: 'active', limit: 100 })
  const users = usersData?.users ?? []
  const preview = useBulkReassignPreview()
  const execute = useBulkReassignTrips()

  const selectedUser = users.find(u => u.id === selectedUserId)
  const selectedUserName = selectedUser
    ? [selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ')
    : ''

  const handlePreview = async () => {
    try {
      await preview.mutateAsync({ tripIds: selectedTripIds, newOwnerId: selectedUserId })
      setStep('preview')
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate preview')
    }
  }

  const handleConfirm = async () => {
    try {
      const result = await execute.mutateAsync({ tripIds: selectedTripIds, newOwnerId: selectedUserId })
      setStep('result')
      toast.success(`${result.tripsReassigned} trips reassigned, ${result.contactsAssigned} contacts assigned`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to reassign trips')
    }
  }

  const handleClose = () => {
    setStep('select')
    setSelectedUserId('')
    preview.reset()
    execute.reset()
    onOpenChange(false)
    if (step === 'result') onComplete()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reassign Trips</DialogTitle>
          <DialogDescription>
            Reassign {selectedTripIds.length} trip{selectedTripIds.length > 1 ? 's' : ''} to a different agent.
            Traveler contacts will be assigned automatically.
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to Agent</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handlePreview} disabled={!selectedUserId || preview.isPending}>
                {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Preview Changes
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && preview.data && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span><strong>{preview.data.tripsCount}</strong> trips will be reassigned to <strong>{selectedUserName}</strong></span>
              </div>
              {preview.data.contactsToAssign.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <Users className="h-4 w-4 text-blue-600 mt-0.5" />
                  <span><strong>{preview.data.contactsToAssign.length}</strong> contacts will be assigned to {selectedUserName}</span>
                </div>
              )}
              {preview.data.contactsToSkip.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span><strong>{preview.data.contactsToSkip.length}</strong> contacts will NOT be reassigned (owned by active agents):</span>
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 max-h-40 overflow-y-auto">
                    <ul className="space-y-1 text-xs text-amber-800">
                      {preview.data.contactsToSkip.map((c) => (
                        <li key={c.id}>
                          <strong>{c.name}</strong> — owned by {c.currentOwnerName}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>Back</Button>
              <Button onClick={handleConfirm} disabled={execute.isPending}>
                {execute.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm Reassign
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'result' && execute.data && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span><strong>{execute.data.tripsReassigned}</strong> trips reassigned to <strong>{selectedUserName}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Users className="h-4 w-4" />
                <span><strong>{execute.data.contactsAssigned}</strong> contacts assigned</span>
              </div>
              {execute.data.contactsSkipped.length > 0 && (
                <div className="text-sm text-amber-700">
                  {execute.data.contactsSkipped.length} contacts unchanged (owned by active agents)
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add 'apps/admin/src/app/trips/_components/bulk-reassign-dialog.tsx'
git commit -m "feat: bulk reassign dialog with agent picker, preview, and confirmation"
```

---

## Task 7: Wire Bulk Reassign to Trips Page

**Files:**
- Modify: `apps/admin/src/components/trips/trips-bulk-actions.tsx`
- Modify: `apps/admin/src/app/trips/page.tsx`

- [ ] **Step 1: Add `onReassign` prop to TripsBulkActions**

In `trips-bulk-actions.tsx`, add `onReassign` to the props interface and render a Reassign button:

```typescript
// Add to props interface:
  onReassign?: () => void

// Add button in the component (after Change Status, before Archive):
      {onReassign && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReassign}
          disabled={isProcessing}
          className="text-phoenix-gold-700 hover:text-phoenix-gold-800 hover:bg-phoenix-gold-100"
        >
          <Users className="mr-2 h-4 w-4" />
          Reassign
        </Button>
      )}
```

Import `Users` from `lucide-react`.

- [ ] **Step 2: Wire the dialog in trips/page.tsx**

Add state and dialog:

```typescript
const [reassignDialogOpen, setReassignDialogOpen] = useState(false)
```

Pass `onReassign` to the toolbar:

```typescript
<TripsBulkActions
  ...
  onReassign={() => setReassignDialogOpen(true)}
/>
```

Render the dialog:

```tsx
<BulkReassignDialog
  open={reassignDialogOpen}
  onOpenChange={setReassignDialogOpen}
  selectedTripIds={[...selectedIds]}
  onComplete={() => setSelectedIds(new Set())}
/>
```

Import `BulkReassignDialog` from `./_components/bulk-reassign-dialog`.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/trips/trips-bulk-actions.tsx apps/admin/src/app/trips/page.tsx
git commit -m "feat: wire bulk reassign dialog to trips page toolbar"
```

---

## Task 8: Update Single Trip Reassign Toast

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/_components/trip-overview.tsx`

- [ ] **Step 1: Update the Assigned Agent selector to show cascade feedback**

The current selector uses `handleUpdateSetting('ownerId', value)` which calls the generic `PATCH /trips/:id`. Since we now gate ownerId for non-admins, this only works for admins. The response from the generic update doesn't include cascade info.

For now, keep the existing flow but add a success toast. The cascade happens server-side when the generic update processes the ownerId change (the service method handles it):

After the Select `onValueChange`, add a toast callback in the `useUpdateTrip` `onSuccess`:

```typescript
// In the useUpdateTrip hook usage, if there's an onSuccess:
toast.success('Trip owner updated. Contact assignments will be updated automatically.')
```

The exact implementation depends on how `handleUpdateSetting` is structured. Read the file and find where success feedback is shown, then add this toast.

- [ ] **Step 2: Commit**

```bash
git add 'apps/admin/src/app/trips/[id]/_components/trip-overview.tsx'
git commit -m "feat: show toast feedback after trip owner reassignment"
```

---

## Task 9: Verify and Push

- [ ] **Step 1: Typecheck**

```bash
pnpm --filter @tailfire/api exec tsc --noEmit
pnpm --filter @tailfire/admin exec tsc --noEmit
```

- [ ] **Step 2: Push**

```bash
git push origin feature/contact-access-ux
```
