# Trip Filters Enhancement + Reassignment Email Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose 7 missing trip filters in the frontend and fix the JSON email bug for trip reassignment notifications.

**Architecture:** Part 1 adds 3 new backend filter fields (unassigned, hasBookings, createdAt range) and wires 7 filters total to the frontend filter panel. Part 2 fixes the JSON email by creating proper HTML templates and suppressing per-trip emails during bulk reassignment.

**Tech Stack:** NestJS, Drizzle ORM, React, TanStack Query, shadcn/ui, Resend email

**Spec:** `docs/superpowers/specs/2026-04-07-trip-filters-and-email-fix-design.md`
**Branch:** `feature/contact-access-ux`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `apps/api/src/email/templates/trip-reassignment.template.ts` | HTML template for single trip reassignment email |
| `apps/api/src/email/templates/trip-bulk-reassignment.template.ts` | HTML template for bulk reassignment summary email |

### Modified Files
| File | Change |
|------|--------|
| `packages/shared-types/src/api/trips.types.ts` | Add `unassigned`, `hasBookings`, `createdAtFrom`, `createdAtTo` to TripFilterDto |
| `apps/api/src/trips/dto/trip-filter.dto.ts` | Add validation for new filter fields |
| `apps/api/src/trips/trips.service.ts` | Add SQL conditions for new filters; thread actorId through reassign; add suppressAssignmentNotification flag |
| `apps/admin/src/hooks/use-trips.ts` | Serialize all filter params including existing unserialized ones (ownerId, primaryContactId, isArchived) |
| `apps/admin/src/components/trips/trips-filter-panel.tsx` | Add 7 new filter UI controls |
| `apps/api/src/email/templates/index.ts` | Export new templates |
| `apps/api/src/email/email.service.ts` | Add sendTripReassignmentEmail and sendBulkReassignmentEmail methods |
| `apps/api/src/notifications/listeners/notification-events.listener.ts` | Use proper email template for assignment notifications |

---

## Part 1: Trip Filters

### Task 1: Add New Filter Fields to Types and DTO

**Files:**
- Modify: `packages/shared-types/src/api/trips.types.ts`
- Modify: `apps/api/src/trips/dto/trip-filter.dto.ts`

- [ ] **Step 1: Add fields to shared TripFilterDto interface**

Find the `TripFilterDto` interface in shared-types. Add:

```typescript
  unassigned?: boolean
  hasBookings?: 'yes' | 'no'
  createdAtFrom?: string
  createdAtTo?: string
```

- [ ] **Step 2: Add validation to runtime DTO**

In `trip-filter.dto.ts`, add these fields following existing patterns:

```typescript
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  unassigned?: boolean

  @IsOptional()
  @IsString()
  @IsIn(['yes', 'no'])
  hasBookings?: 'yes' | 'no'

  @IsOptional()
  @IsString()
  createdAtFrom?: string

  @IsOptional()
  @IsString()
  createdAtTo?: string
```

Import `IsIn` from `class-validator` if not already imported.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/api/trips.types.ts apps/api/src/trips/dto/trip-filter.dto.ts
git commit -m "feat: add unassigned, hasBookings, createdAt range to trip filter DTO"
```

---

### Task 2: Add SQL Filter Conditions to findAll()

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts`

- [ ] **Step 1: Add unassigned filter**

In `findAll()`, after the existing `ownerId` filter (around line 293-295), add:

```typescript
    // Unassigned trips (no owner)
    if (filters.unassigned) {
      conditions.push(isNull(this.db.schema.trips.ownerId))
    }
```

Import `isNull` from `drizzle-orm` if not already imported.

- [ ] **Step 2: Add hasBookings filter**

After the unassigned filter, add:

```typescript
    // Has bookings filter (trips with at least one booked activity)
    if (filters.hasBookings === 'yes') {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM itinerary_activities ia
          JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
          JOIN itineraries itin ON itin.id = iday.itinerary_id
          WHERE itin.trip_id = trips.id
          AND ia.booking_status = 'booked'
          AND ia.activity_type NOT IN ('port_info', 'tour_day')
        )`,
      )
    } else if (filters.hasBookings === 'no') {
      conditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM itinerary_activities ia
          JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
          JOIN itineraries itin ON itin.id = iday.itinerary_id
          WHERE itin.trip_id = trips.id
          AND ia.booking_status = 'booked'
          AND ia.activity_type NOT IN ('port_info', 'tour_day')
        )`,
      )
    }
```

- [ ] **Step 3: Add createdAt range filter**

After hasBookings, add:

```typescript
    // Created date range (timestamptz — use inclusive end-of-day)
    if (filters.createdAtFrom) {
      conditions.push(
        sql`${this.db.schema.trips.createdAt} >= ${filters.createdAtFrom}`,
      )
    }
    if (filters.createdAtTo) {
      conditions.push(
        sql`${this.db.schema.trips.createdAt} <= ${filters.createdAtTo + 'T23:59:59Z'}`,
      )
    }
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/trips/trips.service.ts
git commit -m "feat: add unassigned, hasBookings, createdAt filter conditions to trips findAll"
```

---

### Task 3: Serialize All Filter Params in Frontend Hook

**Files:**
- Modify: `apps/admin/src/hooks/use-trips.ts`

- [ ] **Step 1: Add serialization for new + existing unserialized filters**

In `useTrips()`, after the existing param serialization, add the missing ones:

```typescript
      // Existing but previously unserialized
      if (filters.ownerId) params.append('ownerId', filters.ownerId)
      if (filters.primaryContactId) params.append('primaryContactId', filters.primaryContactId)
      if (filters.isArchived !== undefined) params.append('isArchived', String(filters.isArchived))

      // New filters
      if (filters.unassigned) params.append('unassigned', 'true')
      if (filters.hasBookings) params.append('hasBookings', filters.hasBookings)
      if (filters.createdAtFrom) params.append('createdAtFrom', filters.createdAtFrom)
      if (filters.createdAtTo) params.append('createdAtTo', filters.createdAtTo)
      if (filters.startDateFrom) params.append('startDateFrom', filters.startDateFrom)
      if (filters.startDateTo) params.append('startDateTo', filters.startDateTo)
      if (filters.endDateFrom) params.append('endDateFrom', filters.endDateFrom)
      if (filters.endDateTo) params.append('endDateTo', filters.endDateTo)
```

Check which ones are already serialized and only add the missing ones.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-trips.ts
git commit -m "feat: serialize all trip filter params including new ones"
```

---

### Task 4: Add Filter UI Controls to Filter Panel

**Files:**
- Modify: `apps/admin/src/components/trips/trips-filter-panel.tsx`

This is the largest frontend task. Add 7 new filter controls to the existing panel.

- [ ] **Step 1: Add Assigned Agent filter**

Add a user dropdown popover (following existing Status filter pattern):

```tsx
{/* Assigned Agent */}
<Popover open={agentOpen} onOpenChange={setAgentOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className={filters.ownerId ? 'border-blue-500' : ''}>
      <UserCircle className="mr-2 h-4 w-4" />
      {filters.ownerId ? users.find(u => u.id === filters.ownerId)?.firstName || 'Agent' : 'Agent'}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[200px] p-2" align="start">
    <Command>
      <CommandInput placeholder="Search agents..." />
      <CommandList>
        <CommandEmpty>No agents found</CommandEmpty>
        <CommandGroup>
          {users.map((user) => (
            <CommandItem
              key={user.id}
              onSelect={() => {
                onFiltersChange({ ...filters, ownerId: filters.ownerId === user.id ? undefined : user.id, page: 1 })
                setAgentOpen(false)
              }}
            >
              {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

Also add an "Unassigned" checkbox:
```tsx
<label className="flex items-center gap-2 text-sm">
  <Checkbox
    checked={!!filters.unassigned}
    onCheckedChange={(checked) =>
      onFiltersChange({ ...filters, unassigned: checked ? true : undefined, page: 1 })
    }
  />
  Unassigned only
</label>
```

Import `useUsers` from `@/hooks/use-users`. Add `agentOpen` state.

- [ ] **Step 2: Add date range filters (start, end, created)**

Use shadcn DatePicker or simple date inputs. For each range:

```tsx
{/* Start Date Range */}
<div className="flex items-center gap-2">
  <span className="text-xs text-ash-500 w-12">Start:</span>
  <input
    type="date"
    className="h-8 rounded-md border border-ash-200 px-2 text-sm"
    value={filters.startDateFrom || ''}
    onChange={(e) => onFiltersChange({ ...filters, startDateFrom: e.target.value || undefined, page: 1 })}
  />
  <span className="text-xs text-ash-400">to</span>
  <input
    type="date"
    className="h-8 rounded-md border border-ash-200 px-2 text-sm"
    value={filters.startDateTo || ''}
    onChange={(e) => onFiltersChange({ ...filters, startDateTo: e.target.value || undefined, page: 1 })}
  />
</div>
```

Repeat the same pattern for End Date (endDateFrom/To) and Created Date (createdAtFrom/To).

- [ ] **Step 3: Add Has Bookings filter**

```tsx
{/* Has Bookings */}
<Select
  value={filters.hasBookings || 'any'}
  onValueChange={(value) =>
    onFiltersChange({ ...filters, hasBookings: value === 'any' ? undefined : value as 'yes' | 'no', page: 1 })
  }
>
  <SelectTrigger className="h-8 w-[140px]">
    <SelectValue placeholder="Bookings" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="any">Any</SelectItem>
    <SelectItem value="yes">Has Bookings</SelectItem>
    <SelectItem value="no">No Bookings</SelectItem>
  </SelectContent>
</Select>
```

- [ ] **Step 4: Add Archived toggle**

```tsx
{/* Show Archived */}
<label className="flex items-center gap-2 text-sm">
  <Checkbox
    checked={filters.isArchived === true}
    onCheckedChange={(checked) =>
      onFiltersChange({ ...filters, isArchived: checked ? true : undefined, page: 1 })
    }
  />
  Archived
</label>
```

- [ ] **Step 5: Update the clear filters handler to reset new filters**

In `handleClearFilters()`, add the new fields to the reset:

```typescript
onFiltersChange({
  ...filters,
  status: undefined,
  tripType: undefined,
  tags: undefined,
  tripGroupId: undefined,
  // New filters to clear
  ownerId: undefined,
  unassigned: undefined,
  hasBookings: undefined,
  startDateFrom: undefined,
  startDateTo: undefined,
  endDateFrom: undefined,
  endDateTo: undefined,
  createdAtFrom: undefined,
  createdAtTo: undefined,
  isArchived: undefined,
  primaryContactId: undefined,
  page: 1,
})
```

Also update the `hasActiveFilters` check in `page.tsx` to include the new filter fields.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/trips/trips-filter-panel.tsx apps/admin/src/app/trips/page.tsx
git commit -m "feat: add 7 new trip filter UI controls (agent, dates, bookings, archived)"
```

---

## Part 2: Reassignment Email Fix

### Task 5: Create Trip Reassignment Email Templates

**Files:**
- Create: `apps/api/src/email/templates/trip-reassignment.template.ts`
- Create: `apps/api/src/email/templates/trip-bulk-reassignment.template.ts`
- Modify: `apps/api/src/email/templates/index.ts`

- [ ] **Step 1: Create single reassignment template**

Follow the exact pattern of existing templates (e.g., `invite.template.ts`):

```typescript
export interface TripReassignmentTemplateParams {
  tripName: string
  adminName: string
  contactsAssigned: number
  tripUrl: string
}

export function getTripReassignmentTemplate({
  tripName,
  adminName,
  contactsAssigned,
  tripUrl,
}: TripReassignmentTemplateParams): string {
  const contactLine = contactsAssigned > 0
    ? `<p style="margin: 0 0 24px; color: #3f3f46; font-size: 14px;">${contactsAssigned} traveler contact${contactsAssigned > 1 ? 's were' : ' was'} also assigned to you.</p>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">Trip Assigned to You</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        ${adminName} has assigned the trip <strong>"${tripName}"</strong> to you.
      </p>
      ${contactLine}
      <div style="text-align: center; margin: 32px 0;">
        <a href="${tripUrl}"
           style="display: inline-block; padding: 14px 32px; background: #0d9488; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          View Trip
        </a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()
}
```

- [ ] **Step 2: Create bulk reassignment template**

```typescript
export interface TripBulkReassignmentTemplateParams {
  adminName: string
  tripCount: number
  tripNames: string[]
  contactsAssigned: number
  contactsSkipped: number
  tripsUrl: string
}

export function getTripBulkReassignmentTemplate({
  adminName,
  tripCount,
  tripNames,
  contactsAssigned,
  contactsSkipped,
  tripsUrl,
}: TripBulkReassignmentTemplateParams): string {
  const tripList = tripNames.slice(0, 10).map(n => `<li style="margin: 4px 0; color: #3f3f46;">${n}</li>`).join('')
  const moreTrips = tripCount > 10 ? `<li style="margin: 4px 0; color: #71717a;">...and ${tripCount - 10} more</li>` : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px;">${tripCount} Trips Assigned to You</h2>
      <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px; line-height: 1.5;">
        ${adminName} has assigned ${tripCount} trips to you.
      </p>
      <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px;">
        ${tripList}
        ${moreTrips}
      </ul>
      <p style="margin: 0 0 8px; color: #3f3f46; font-size: 14px;">
        <strong>${contactsAssigned}</strong> traveler contacts were assigned to you.
      </p>
      ${contactsSkipped > 0 ? `<p style="margin: 0 0 16px; color: #71717a; font-size: 13px;">${contactsSkipped} contacts were unchanged (owned by other active agents).</p>` : ''}
      <div style="text-align: center; margin: 32px 0;">
        <a href="${tripsUrl}"
           style="display: inline-block; padding: 14px 32px; background: #0d9488; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          View Your Trips
        </a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()
}
```

- [ ] **Step 3: Export from index.ts**

Add to `apps/api/src/email/templates/index.ts`:

```typescript
export { getTripReassignmentTemplate } from './trip-reassignment.template'
export type { TripReassignmentTemplateParams } from './trip-reassignment.template'
export { getTripBulkReassignmentTemplate } from './trip-bulk-reassignment.template'
export type { TripBulkReassignmentTemplateParams } from './trip-bulk-reassignment.template'
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/email/templates/trip-reassignment.template.ts apps/api/src/email/templates/trip-bulk-reassignment.template.ts apps/api/src/email/templates/index.ts
git commit -m "feat: add HTML email templates for trip reassignment (single + bulk)"
```

---

### Task 6: Add Email Send Methods to Email Service

**Files:**
- Modify: `apps/api/src/email/email.service.ts`

- [ ] **Step 1: Add sendTripReassignmentEmail method**

```typescript
  async sendTripReassignmentEmail(
    email: string,
    tripName: string,
    adminName: string,
    contactsAssigned: number,
    tripUrl: string,
    agencyId: string,
  ): Promise<void> {
    const html = getTripReassignmentTemplate({ tripName, adminName, contactsAssigned, tripUrl })
    await this.sendEmail({
      to: [email],
      subject: `Trip Assigned to You — ${tripName}`,
      html,
      agencyId,
      templateSlug: 'trip-reassignment',
    })
  }

  async sendBulkReassignmentEmail(
    email: string,
    adminName: string,
    tripCount: number,
    tripNames: string[],
    contactsAssigned: number,
    contactsSkipped: number,
    tripsUrl: string,
    agencyId: string,
  ): Promise<void> {
    const html = getTripBulkReassignmentTemplate({ adminName, tripCount, tripNames, contactsAssigned, contactsSkipped, tripsUrl })
    await this.sendEmail({
      to: [email],
      subject: `${tripCount} Trips Assigned to You`,
      html,
      agencyId,
      templateSlug: 'trip-bulk-reassignment',
    })
  }
```

Import the template functions at the top.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/email/email.service.ts
git commit -m "feat: add email service methods for trip reassignment notifications"
```

---

### Task 7: Thread Actor Context + Suppress Flag Through Reassignment

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts`
- Modify: `apps/api/src/trips/trips.controller.ts`

- [ ] **Step 1: Add `actorId` and `suppressAssignmentNotification` to `reassignTripOwner()`**

Update the method signature:

```typescript
  async reassignTripOwner(
    tripId: string,
    newOwnerId: string,
    agencyId: string,
    options?: { actorId?: string; suppressAssignmentNotification?: boolean },
  )
```

Update the event emit at the end to include actorId:

```typescript
      this.eventEmitter.emit(
        'trip.updated',
        new TripUpdatedEvent(tripId, existingTrip.name, options?.actorId || null, {
          ownerId: newOwnerId,
          suppressAssignmentNotification: options?.suppressAssignmentNotification,
        }),
      )
```

- [ ] **Step 2: Update `bulkReassign()` to suppress per-trip notifications and send summary**

Add `actorId` parameter. Pass `suppressAssignmentNotification: true` for each trip. After all trips, emit a bulk event:

```typescript
  async bulkReassign(tripIds: string[], newOwnerId: string, agencyId: string, actorId: string) {
    // ... existing loop with suppressAssignmentNotification: true ...

    // After loop, emit bulk reassignment event for summary email
    this.eventEmitter.emit('trips.bulk_reassigned', {
      tripIds,
      newOwnerId,
      actorId,
      agencyId,
      tripsReassigned: tripIds.length,
      contactsAssigned: totalContactsAssigned,
      contactsSkipped: allSkipped,
      tripNames, // collect trip names during the loop
    })

    return { tripsReassigned: tripIds.length, contactsAssigned: totalContactsAssigned, contactsSkipped: allSkipped }
  }
```

- [ ] **Step 3: Update controller to pass auth.userId**

In the `bulkReassign` controller endpoint, pass `auth.userId`:

```typescript
    return this.tripsService.bulkReassign(dto.tripIds, dto.newOwnerId, auth.agencyId, auth.userId)
```

Also update `updateOwner` to pass actorId:

```typescript
    return this.tripsService.updateOwner(id, dto.ownerId, auth.agencyId, auth.userId)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/trips/trips.service.ts apps/api/src/trips/trips.controller.ts
git commit -m "feat: thread actorId through reassignment, add suppressAssignmentNotification flag"
```

---

### Task 8: Update Notification Listener to Use Email Templates

**Files:**
- Modify: `apps/api/src/notifications/listeners/notification-events.listener.ts`

- [ ] **Step 1: Update `handleTripUpdated()` for assignment notifications**

In the `trip.updated` handler (around line 113), check for `suppressAssignmentNotification` and use the proper email template:

```typescript
  @OnEvent('trip.updated')
  async handleTripUpdated(event: TripUpdatedEvent) {
    const { tripId, tripName, actorId, changes } = event

    if (!changes?.ownerId) return

    // Skip assignment notification if suppressed (bulk reassignment sends summary instead)
    if (changes.suppressAssignmentNotification) return

    const newOwnerId = changes.ownerId
    if (actorId === newOwnerId) return // Don't notify if agent assigned to themselves

    // ... existing notification code for in-app ...
    // But instead of generic notification email, use the proper template:

    // Send formatted email via EmailService
    try {
      const adminUrl = this.configService.get<string>('ADMIN_URL') || ''
      const [actor] = actorId ? await this.db.client.select(...).from(userProfiles).where(eq(id, actorId)).limit(1) : [null]
      const adminName = actor ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') : 'An admin'

      await this.emailService.sendTripReassignmentEmail(
        newOwnerEmail,
        tripName,
        adminName,
        0, // contactsAssigned not available in event payload — can enhance later
        `${adminUrl}/trips/${tripId}`,
        trip.agencyId,
      )
    } catch (e) {
      this.logger.warn('Failed to send trip reassignment email', e)
    }
  }
```

- [ ] **Step 2: Add `trips.bulk_reassigned` handler**

```typescript
  @OnEvent('trips.bulk_reassigned')
  async handleBulkReassigned(event: {
    tripIds: string[]
    newOwnerId: string
    actorId: string
    agencyId: string
    tripsReassigned: number
    contactsAssigned: number
    contactsSkipped: { contactName: string; currentOwner: string }[]
    tripNames: string[]
  }) {
    try {
      const adminUrl = this.configService.get<string>('ADMIN_URL') || ''

      // Get new owner email
      const [newOwner] = await this.db.client
        .select({ email: userProfiles.email, firstName: userProfiles.firstName, lastName: userProfiles.lastName })
        .from(userProfiles)
        .where(eq(userProfiles.id, event.newOwnerId))
        .limit(1)

      if (!newOwner?.email) return

      // Get actor name
      const [actor] = await this.db.client
        .select({ firstName: userProfiles.firstName, lastName: userProfiles.lastName })
        .from(userProfiles)
        .where(eq(userProfiles.id, event.actorId))
        .limit(1)
      const adminName = actor ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') : 'An admin'

      await this.emailService.sendBulkReassignmentEmail(
        newOwner.email,
        adminName,
        event.tripsReassigned,
        event.tripNames,
        event.contactsAssigned,
        event.contactsSkipped.length,
        `${adminUrl}/trips?ownerId=${event.newOwnerId}`,
        event.agencyId,
      )
    } catch (e) {
      this.logger.warn('Failed to send bulk reassignment email', e)
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/listeners/notification-events.listener.ts
git commit -m "feat: use proper email templates for reassignment, add bulk summary handler"
```

---

### Task 9: Verify and Push

- [ ] **Step 1: Typecheck**

```bash
pnpm --filter @tailfire/api exec tsc --noEmit
pnpm --filter @tailfire/admin exec tsc --noEmit
```

- [ ] **Step 2: Push**

```bash
git push origin feature/contact-access-ux
```
