# Contact Lifecycle Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically derive and maintain contactStatus, contactType, and booking dates from trip state so contacts move through the CRM pipeline as their trips progress.

**Architecture:** A new `ContactLifecycleService` listens to 8 existing domain events (4 trip lifecycle + 1 trip update + 3 traveler membership) and recomputes contact fields from current DB state. A backfill endpoint and daily cron handle initial data fix and the 30-day returned→awaiting_next transition.

**Tech Stack:** NestJS, Drizzle ORM, EventEmitter2, BullMQ (existing scheduler)

**Spec:** `docs/superpowers/specs/2026-04-03-contact-lifecycle-service-design.md`

---

### Task 1: Create ContactLifecycleService — core recompute logic

The heart of the feature. One method derives all lifecycle fields from DB state.

**Files:**
- Create: `apps/api/src/contacts/contact-lifecycle.service.ts`

- [ ] **Step 1: Create the service with recomputeForContact()**

```typescript
/**
 * Contact Lifecycle Service
 *
 * Derives contactStatus, contactType, becameClientAt, firstBookingDate,
 * and lastTripReturnDate from the current state of a contact's trips.
 *
 * Event-triggered but DB-derived: events are triggers, not data sources.
 * Idempotent — safe to rerun for any contact at any time.
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripActiveEvent } from '../trips/events/trip-active.event'
import { TripTravellingEvent } from '../trips/events/trip-travelling.event'
import { TripTravelledEvent } from '../trips/events/trip-travelled.event'
import { TripCancelledEvent } from '../trips/events/trip-cancelled.event'
import { TripUpdatedEvent } from '../activity-logs/events/trip-updated.event'
import { TravelerCreatedEvent } from '../activity-logs/events/traveler-created.event'
import { TravelerUpdatedEvent } from '../activity-logs/events/traveler-updated.event'
import { TravelerDeletedEvent } from '../activity-logs/events/traveler-deleted.event'
import { EventEmitter2 } from '@nestjs/event-emitter'

type ContactStatus = 'prospecting' | 'quoted' | 'booked' | 'traveling' | 'returned' | 'awaiting_next' | 'inactive'

interface TripSummary {
  status: string
  startDate: string | null
  endDate: string | null
  statusAutoTransitionedAt: string | null
}

@Injectable()
export class ContactLifecycleService {
  private readonly logger = new Logger(ContactLifecycleService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ===========================================================================
  // CORE: Recompute lifecycle for a single contact
  // ===========================================================================

  async recomputeForContact(contactId: string): Promise<boolean> {
    // 1. Load current contact state
    const [contact] = await this.db.client.execute(sql`
      SELECT id, contact_status, contact_type, is_active, became_client_at,
             first_booking_date, last_trip_return_date
      FROM contacts WHERE id = ${contactId}
    `)

    if (!contact) return false

    // Skip inactive contacts (manual override respected)
    if (!contact.is_active || contact.contact_status === 'inactive') return false

    // 2. Get all non-cancelled trips for this contact
    const trips: TripSummary[] = await this.db.client.execute(sql`
      SELECT DISTINCT t.status, t.start_date, t.end_date, t.status_auto_transitioned_at
      FROM trips t
      LEFT JOIN trip_travelers tt ON tt.trip_id = t.id
      WHERE (tt.contact_id = ${contactId} OR t.primary_contact_id = ${contactId})
        AND t.status != 'cancelled'
        AND t.deleted_at IS NULL
    `) as any

    // 3. Derive status from trip states (precedence: traveling > booked > returned > awaiting_next > prospecting)
    const derivedStatus = this.deriveStatus(trips, contact.contact_status as ContactStatus)

    // 4. Derive dates
    const firstBookingDate = this.deriveFirstBookingDate(trips, contact.first_booking_date as string | null)
    const lastTripReturnDate = this.deriveLastTripReturnDate(trips)

    // 5. Determine if we should promote lead → client
    const shouldPromote = contact.contact_type === 'lead' &&
      ['booked', 'traveling', 'returned', 'awaiting_next'].includes(derivedStatus)

    // 6. Check if anything changed
    const statusChanged = derivedStatus !== contact.contact_status
    const typeChanged = shouldPromote
    const firstBookingChanged = firstBookingDate !== contact.first_booking_date
    const lastReturnChanged = lastTripReturnDate !== (contact.last_trip_return_date ?? null)

    if (!statusChanged && !typeChanged && !firstBookingChanged && !lastReturnChanged) {
      return false // No changes needed
    }

    // 7. Build update payload
    const now = new Date()
    const setClauses: string[] = [`updated_at = '${now.toISOString()}'`]

    if (statusChanged) {
      setClauses.push(`contact_status = '${derivedStatus}'`)
    }

    if (shouldPromote) {
      setClauses.push(`contact_type = 'client'`)
      if (!contact.became_client_at) {
        setClauses.push(`became_client_at = '${now.toISOString()}'`)
      }
    }

    if (firstBookingChanged && firstBookingDate) {
      setClauses.push(`first_booking_date = '${firstBookingDate}'`)
    }

    if (lastReturnChanged) {
      if (lastTripReturnDate) {
        setClauses.push(`last_trip_return_date = '${lastTripReturnDate}'`)
      } else {
        setClauses.push(`last_trip_return_date = NULL`)
      }
    }

    await this.db.client.execute(
      sql.raw(`UPDATE contacts SET ${setClauses.join(', ')} WHERE id = '${contactId}'`)
    )

    // 8. Emit audit event if status or type changed
    if (statusChanged || typeChanged) {
      this.eventEmitter.emit('audit.status_changed', {
        entityType: 'contact',
        entityId: contactId,
        before: {
          contactStatus: contact.contact_status,
          contactType: contact.contact_type,
        },
        after: {
          contactStatus: derivedStatus,
          contactType: shouldPromote ? 'client' : contact.contact_type,
        },
        source: 'lifecycle_sync',
      })
    }

    this.logger.debug(
      `Contact ${contactId}: ${contact.contact_status} → ${derivedStatus}` +
      (shouldPromote ? ' (promoted to client)' : ''),
    )

    return true
  }

  // ===========================================================================
  // TRIGGER: Recompute all contacts on a trip
  // ===========================================================================

  async recomputeForTrip(tripId: string): Promise<void> {
    // Get all unique contact IDs associated with this trip
    const contacts = await this.db.client.execute(sql`
      SELECT DISTINCT contact_id FROM (
        SELECT contact_id FROM trip_travelers WHERE trip_id = ${tripId}
        UNION
        SELECT primary_contact_id AS contact_id FROM trips
          WHERE id = ${tripId} AND primary_contact_id IS NOT NULL
      ) sub WHERE contact_id IS NOT NULL
    `) as any[]

    for (const row of contacts) {
      try {
        await this.recomputeForContact(row.contact_id)
      } catch (err) {
        this.logger.error(`Failed to recompute lifecycle for contact ${row.contact_id}: ${err}`)
      }
    }
  }

  // ===========================================================================
  // BACKFILL: Recompute all contacts with trips
  // ===========================================================================

  async backfillAll(): Promise<{ evaluated: number; updated: number; skipped: number; errors: number }> {
    const results = { evaluated: 0, updated: 0, skipped: 0, errors: 0 }

    // Find all active contacts that have at least one trip association
    const contactIds = await this.db.client.execute(sql`
      SELECT DISTINCT contact_id FROM (
        SELECT DISTINCT tt.contact_id FROM trip_travelers tt
          JOIN contacts c ON c.id = tt.contact_id WHERE c.is_active = true
        UNION
        SELECT DISTINCT t.primary_contact_id AS contact_id FROM trips t
          JOIN contacts c ON c.id = t.primary_contact_id
          WHERE t.primary_contact_id IS NOT NULL AND c.is_active = true
      ) sub WHERE contact_id IS NOT NULL
    `) as any[]

    this.logger.log(`Backfilling contact lifecycle for ${contactIds.length} contacts`)

    for (const row of contactIds) {
      results.evaluated++
      try {
        const changed = await this.recomputeForContact(row.contact_id)
        if (changed) results.updated++
        else results.skipped++
      } catch (err) {
        results.errors++
        this.logger.error(`Backfill error for contact ${row.contact_id}: ${err}`)
      }

      if (results.evaluated % 100 === 0) {
        this.logger.log(`Backfill progress: ${results.evaluated}/${contactIds.length}`)
      }
    }

    this.logger.log(
      `Backfill complete: ${results.evaluated} evaluated, ${results.updated} updated, ` +
      `${results.skipped} skipped, ${results.errors} errors`,
    )

    return results
  }

  // ===========================================================================
  // DAILY: Transition returned → awaiting_next after 30 days
  // ===========================================================================

  async transitionReturnedToAwaitingNext(): Promise<number> {
    // Find contacts in 'returned' status where lastTripReturnDate > 30 days ago
    const contacts = await this.db.client.execute(sql`
      SELECT id FROM contacts
      WHERE contact_status = 'returned'
        AND is_active = true
        AND last_trip_return_date IS NOT NULL
        AND last_trip_return_date < (CURRENT_DATE - INTERVAL '30 days')
    `) as any[]

    let updated = 0
    for (const row of contacts) {
      try {
        const changed = await this.recomputeForContact(row.id)
        if (changed) updated++
      } catch (err) {
        this.logger.error(`Daily transition error for contact ${row.id}: ${err}`)
      }
    }

    if (updated > 0) {
      this.logger.log(`Daily transition: ${updated} contacts moved returned → awaiting_next`)
    }

    return updated
  }

  // ===========================================================================
  // EVENT LISTENERS
  // ===========================================================================

  @OnEvent('trip.active')
  async handleTripActive(event: TripActiveEvent): Promise<void> {
    await this.recomputeForTrip(event.tripId)
  }

  @OnEvent('trip.travelling')
  async handleTripTravelling(event: TripTravellingEvent): Promise<void> {
    await this.recomputeForTrip(event.tripId)
  }

  @OnEvent('trip.travelled')
  async handleTripTravelled(event: TripTravelledEvent): Promise<void> {
    await this.recomputeForTrip(event.tripId)
  }

  @OnEvent('trip.cancelled')
  async handleTripCancelled(event: TripCancelledEvent): Promise<void> {
    await this.recomputeForTrip(event.tripId)
  }

  @OnEvent('trip.updated')
  async handleTripUpdated(event: TripUpdatedEvent): Promise<void> {
    // Only recompute if trip status changed (avoid noise from name/date edits)
    if (event.changes && 'status' in event.changes) {
      await this.recomputeForTrip(event.tripId)
    }
  }

  @OnEvent('traveler.created')
  async handleTravelerCreated(event: TravelerCreatedEvent): Promise<void> {
    await this.recomputeForTrip(event.tripId)
  }

  @OnEvent('traveler.updated')
  async handleTravelerUpdated(event: TravelerUpdatedEvent): Promise<void> {
    await this.recomputeForTrip(event.tripId)
  }

  @OnEvent('traveler.deleted')
  async handleTravelerDeleted(event: TravelerDeletedEvent): Promise<void> {
    await this.recomputeForTrip(event.tripId)
  }

  // ===========================================================================
  // PRIVATE: Derivation logic
  // ===========================================================================

  private deriveStatus(trips: TripSummary[], currentStatus: ContactStatus): ContactStatus {
    if (trips.length === 0) return 'prospecting'

    // Check precedence (highest first)
    const hasState = (state: string) => trips.some(t => t.status === state)

    if (hasState('travelling')) return 'traveling'
    if (hasState('active')) return 'booked'

    // All remaining non-cancelled trips are either planning, travelled, or inbound
    const travelledTrips = trips.filter(t => t.status === 'travelled')
    if (travelledTrips.length > 0) {
      // Check if most recent return is within 30 days
      const mostRecentReturn = this.getMostRecentEndDate(travelledTrips)
      if (mostRecentReturn) {
        const daysSinceReturn = this.daysBetween(new Date(mostRecentReturn), new Date())
        return daysSinceReturn <= 30 ? 'returned' : 'awaiting_next'
      }
      return 'returned' // endDate null — treat as recently returned
    }

    // Only planning/inbound trips — preserve 'quoted' if manually set, otherwise 'prospecting'
    if (currentStatus === 'quoted') return 'quoted'
    return 'prospecting'
  }

  private deriveFirstBookingDate(
    trips: TripSummary[],
    existingDate: string | null,
  ): string | null {
    // Never clear an existing firstBookingDate
    if (existingDate) return existingDate

    // Find earliest booking date from trips that reached active or beyond
    const bookedTrips = trips.filter(t =>
      ['active', 'travelling', 'travelled'].includes(t.status),
    )
    if (bookedTrips.length === 0) return null

    const dates = bookedTrips
      .map(t => t.statusAutoTransitionedAt || t.startDate)
      .filter(Boolean)
      .sort()

    return dates[0] ? dates[0].split('T')[0] : null
  }

  private deriveLastTripReturnDate(trips: TripSummary[]): string | null {
    const travelledTrips = trips.filter(t => t.status === 'travelled' && t.endDate)
    if (travelledTrips.length === 0) return null

    const dates = travelledTrips
      .map(t => t.endDate!)
      .sort()
      .reverse()

    return dates[0] ? dates[0].split('T')[0] : null
  }

  private getMostRecentEndDate(trips: TripSummary[]): string | null {
    const endDates = trips.map(t => t.endDate).filter(Boolean).sort().reverse()
    return endDates[0] ?? null
  }

  private daysBetween(a: Date, b: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24
    return Math.floor(Math.abs(b.getTime() - a.getTime()) / msPerDay)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): create ContactLifecycleService with event-driven recompute"
```

---

### Task 2: Create ContactLifecycleController — backfill endpoint

**Files:**
- Create: `apps/api/src/contacts/contact-lifecycle.controller.ts`

- [ ] **Step 1: Create the controller**

```typescript
/**
 * Contact Lifecycle Controller
 *
 * Admin endpoint for backfilling contact lifecycle state from trip data.
 * Must be registered BEFORE ContactsController in contacts.module.ts.
 */

import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AdminGuard } from '../auth/guards/admin.guard'
import { ContactLifecycleService } from './contact-lifecycle.service'

@ApiTags('Contacts')
@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactLifecycleController {
  constructor(private readonly lifecycleService: ContactLifecycleService) {}

  @Post('backfill-lifecycle')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Backfill contact lifecycle status from trip data (admin only)' })
  async backfillLifecycle() {
    return this.lifecycleService.backfillAll()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): add contact lifecycle backfill endpoint"
```

---

### Task 3: Register in contacts.module.ts

**Files:**
- Modify: `apps/api/src/contacts/contacts.module.ts`

- [ ] **Step 1: Add imports and register**

Add these imports at the top:
```typescript
import { ContactLifecycleService } from './contact-lifecycle.service'
import { ContactLifecycleController } from './contact-lifecycle.controller'
```

Add `ContactLifecycleController` to the controllers array BEFORE `ContactsController`:
```typescript
controllers: [
  ContactLifecycleController, // BEFORE ContactsController so /contacts/backfill-lifecycle matches before /contacts/:id
  ContactImportController,
  ContactsController,
  // ... rest unchanged
],
```

Add `ContactLifecycleService` to the providers array:
```typescript
providers: [
  ContactLifecycleService,
  ContactsService,
  // ... rest unchanged
],
```

Add `ContactLifecycleService` to the exports array:
```typescript
exports: [
  ContactLifecycleService,
  ContactsService,
  // ... rest unchanged
],
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(api): register ContactLifecycleService in contacts module"
```

---

### Task 4: Remove old handleTripActive from ContactsService

The new ContactLifecycleService now handles firstBookingDate derivation, so the old handler is redundant.

**Files:**
- Modify: `apps/api/src/contacts/contacts.service.ts`

- [ ] **Step 1: Remove the handleTripActive method and its import**

Remove the `TripActiveEvent` import:
```typescript
// DELETE: import { TripActiveEvent } from '../trips/events/trip-active.event'
```

Remove the entire `handleTripActive` method (lines ~661-687):
```typescript
// DELETE: @OnEvent('trip.active')
// DELETE: async handleTripActive(event: TripActiveEvent): Promise<void> { ... }
```

Keep `setFirstBookingDate()` — it may be used elsewhere as a utility. But check: if it's only called from the deleted handler, it can be removed too.

- [ ] **Step 2: Verify no other callers of setFirstBookingDate**

Search for `setFirstBookingDate` in the file. If only called from the deleted handler, remove it too. If called elsewhere, keep it.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(api): remove old handleTripActive handler (replaced by ContactLifecycleService)"
```

---

### Task 5: Add daily returned→awaiting_next to automation scheduler

Piggyback on the existing BullMQ daily schedule to transition contacts that have been in `returned` status for 30+ days.

**Files:**
- Modify: `apps/api/src/automation/automation.service.ts`

- [ ] **Step 1: Add the daily contact lifecycle check**

Find where the existing daily recurring jobs are scheduled (around line 51-86 in `onModuleInit`). Add a new recurring job after the existing ones:

```typescript
// Contact lifecycle: returned → awaiting_next after 30 days
await this.scheduleRecurring(
  'client-care',
  'contact-lifecycle-daily',
  {},
  '0 7 * * *', // 7 AM daily (before birthday/payment checks)
)
```

- [ ] **Step 2: Handle the job in client-care processor**

In `apps/api/src/automation/processors/client-care.processor.ts`, add handling for the new job type. Find where job types are dispatched (the `process()` method) and add:

```typescript
case 'contact-lifecycle-daily':
  await this.handleContactLifecycleDaily()
  break
```

Add the handler method:

```typescript
private async handleContactLifecycleDaily(): Promise<void> {
  const count = await this.contactLifecycleService.transitionReturnedToAwaitingNext()
  this.logger.log(`Contact lifecycle daily: ${count} contacts transitioned`)
}
```

Inject `ContactLifecycleService` in the processor constructor. Add the import and update the module if needed.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): add daily contact lifecycle check to automation scheduler"
```

---

### Task 6: Build, test backfill, and verify

- [ ] **Step 1: Build the API**

```bash
pnpm --filter @tailfire/api build
```

Fix any TypeScript errors.

- [ ] **Step 2: Test locally**

Start the dev server (`turbo dev` in tmux pane 2), then:

1. Call the backfill endpoint:
```bash
curl -X POST http://localhost:3101/api/v1/contacts/backfill-lifecycle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

Expected: `{ "evaluated": N, "updated": N, "skipped": N, "errors": 0 }`

2. Verify contacts now have correct statuses:
```bash
curl "http://localhost:3101/api/v1/contacts?limit=10&sortBy=contactStatus" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: Contacts should have mixed statuses (booked, traveling, returned, etc.) not all prospecting.

3. Check the kanban view in browser — contacts should now appear in different columns.

- [ ] **Step 3: Commit any fixes**

```bash
git commit -m "fix(api): address build/runtime issues in contact lifecycle service"
```

---

### Task 7: Push, deploy, run backfill on preview

- [ ] **Step 1: Push to feature branch and preview**

```bash
git push -u origin feature/contact-lifecycle
git checkout preview && git merge feature/contact-lifecycle --no-edit && git push
git checkout feature/contact-lifecycle
```

- [ ] **Step 2: Run backfill on preview**

After deployment completes, call the backfill endpoint on the preview API:
```bash
curl -X POST https://api-dev.tailfire.ca/api/v1/contacts/backfill-lifecycle \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 3: Verify in browser**

Navigate to tf-demo.phoenixvoyages.ca/contacts and switch to kanban view. Contacts should now appear in their correct lifecycle columns.

- [ ] **Step 4: Create PR**

```bash
gh pr create --base main --title "feat: Contact Lifecycle Service — auto-sync contact status from trips"
```
