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
import { eq, sql } from 'drizzle-orm'
import type { ContactStatus } from '@tailfire/shared-types'
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
    const rows = await this.db.client.execute(sql`
      SELECT id, contact_status, contact_type, is_active, became_client_at,
             first_booking_date, last_trip_return_date
      FROM contacts WHERE id = ${contactId}
    `)
    const contact = (rows as any[])[0]

    if (!contact) return false

    // Skip inactive contacts (manual override respected)
    if (!contact.is_active || contact.contact_status === 'inactive') return false

    // 2. Get all non-cancelled trips for this contact
    const trips: TripSummary[] = (await this.db.client.execute(sql`
      SELECT DISTINCT t.status, t.start_date AS "startDate", t.end_date AS "endDate",
             t.status_auto_transitioned_at AS "statusAutoTransitionedAt"
      FROM trips t
      LEFT JOIN trip_travelers tt ON tt.trip_id = t.id
      WHERE (tt.contact_id = ${contactId} OR t.primary_contact_id = ${contactId})
        AND t.status != 'cancelled'
        AND t.deleted_at IS NULL
    `)) as any[]

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
    const firstBookingChanged = firstBookingDate !== (contact.first_booking_date ?? null)
    const lastReturnChanged = lastTripReturnDate !== (contact.last_trip_return_date ?? null)

    if (!statusChanged && !typeChanged && !firstBookingChanged && !lastReturnChanged) {
      return false // No changes needed
    }

    // 7. Build update payload using Drizzle's typed update (safe, parameterized)
    const updatePayload: Record<string, any> = { updatedAt: new Date() }

    if (statusChanged) {
      updatePayload.contactStatus = derivedStatus
    }

    if (shouldPromote) {
      updatePayload.contactType = 'client'
      if (!contact.became_client_at) {
        updatePayload.becameClientAt = new Date()
      }
    }

    if (firstBookingChanged && firstBookingDate) {
      updatePayload.firstBookingDate = firstBookingDate
    }

    if (lastReturnChanged) {
      updatePayload.lastTripReturnDate = lastTripReturnDate ?? null
    }

    await this.db.client
      .update(this.db.schema.contacts)
      .set(updatePayload)
      .where(eq(this.db.schema.contacts.id, contactId))

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
    const contacts = (await this.db.client.execute(sql`
      SELECT DISTINCT contact_id FROM (
        SELECT contact_id FROM trip_travelers WHERE trip_id = ${tripId}
        UNION
        SELECT primary_contact_id AS contact_id FROM trips
          WHERE id = ${tripId} AND primary_contact_id IS NOT NULL
      ) sub WHERE contact_id IS NOT NULL
    `)) as any[]

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
    const contactIds = (await this.db.client.execute(sql`
      SELECT DISTINCT contact_id FROM (
        SELECT DISTINCT tt.contact_id FROM trip_travelers tt
          JOIN contacts c ON c.id = tt.contact_id WHERE c.is_active = true
        UNION
        SELECT DISTINCT t.primary_contact_id AS contact_id FROM trips t
          JOIN contacts c ON c.id = t.primary_contact_id
          WHERE t.primary_contact_id IS NOT NULL AND c.is_active = true
      ) sub WHERE contact_id IS NOT NULL
    `)) as any[]

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
    const contacts = (await this.db.client.execute(sql`
      SELECT id FROM contacts
      WHERE contact_status = 'returned'
        AND is_active = true
        AND last_trip_return_date IS NOT NULL
        AND last_trip_return_date < (CURRENT_DATE - INTERVAL '30 days')
    `)) as any[]

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
