/**
 * Activity Log Service
 *
 * Central service for logging all entity changes across the system.
 * Listens to domain events via @OnEvent and persists activity logs to the database.
 *
 * This service is designed to be reusable for any entity type (trips, contacts, users, etc.)
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { eq, desc, and, or, sql, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import {
  TripCreatedEvent,
  TripUpdatedEvent,
  TripDeletedEvent,
  TravelerCreatedEvent,
  TravelerUpdatedEvent,
  TravelerDeletedEvent,
  AuditEvent,
  AuditEntityType,
} from './events'
import { TripInProgressEvent } from '../trips/events/trip-in-progress.event'
import { TripCompletedEvent } from '../trips/events/trip-completed.event'
import { TripCancelledEvent } from '../trips/events/trip-cancelled.event'
import { buildAuditDescription } from './audit-sanitizer'

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Listen for trip created events
   */
  @OnEvent('trip.created')
  async handleTripCreated(event: TripCreatedEvent) {
    await this.db.client.insert(this.db.schema.activityLogs).values({
      entityType: 'trip',
      entityId: event.tripId,
      action: 'created',
      actorId: event.actorId,
      actorType: event.actorId ? 'user' : 'system',
      description: `Created trip "${event.tripName}"`,
      metadata: event.metadata || {},
      tripId: event.tripId,
    })
  }

  /**
   * Listen for trip updated events
   */
  @OnEvent('trip.updated')
  async handleTripUpdated(event: TripUpdatedEvent) {
    const description = this.buildTripUpdateDescription(event.tripName, event.changes)
    await this.db.client.insert(this.db.schema.activityLogs).values({
      entityType: 'trip',
      entityId: event.tripId,
      action: 'updated',
      actorId: event.actorId,
      actorType: event.actorId ? 'user' : 'system',
      description,
      metadata: event.changes || {},
      tripId: event.tripId,
    })
  }

  /**
   * Build a human-readable description for trip updates based on what changed.
   */
  private buildTripUpdateDescription(tripName: string, changes?: Record<string, any>): string {
    if (!changes || Object.keys(changes).length === 0) {
      return `Updated trip "${tripName}"`
    }

    const descriptions: string[] = []
    const keys = Object.keys(changes)

    // Status change
    if (changes.status) {
      descriptions.push(`Changed status to "${changes.status}"`)
    }

    // Name change
    if (changes.name) {
      descriptions.push(`Renamed to "${changes.name}"`)
    }

    // Trip type
    if (changes.tripType) {
      descriptions.push(`Changed type to "${changes.tripType}"`)
    }

    // Dates
    if (changes.startDate) {
      descriptions.push(`Updated start date`)
    }
    if (changes.endDate) {
      descriptions.push(`Updated end date`)
    }

    // Archived
    if ('isArchived' in changes) {
      descriptions.push(changes.isArchived ? 'Archived trip' : 'Unarchived trip')
    }

    // Description / notes
    if (changes.description !== undefined) {
      descriptions.push('Updated description')
    }
    if (changes.internalNotes !== undefined) {
      descriptions.push('Updated internal notes')
    }

    // Currency
    if (changes.currency) {
      descriptions.push(`Changed currency to ${changes.currency}`)
    }

    // Cover image
    if (changes.coverImageUrl !== undefined) {
      descriptions.push(changes.coverImageUrl ? 'Updated cover image' : 'Removed cover image')
    }

    // Fallback for unrecognized fields
    if (descriptions.length === 0) {
      const fieldNames = keys.filter(k => k !== 'tripGroupId').join(', ')
      return fieldNames
        ? `Updated ${fieldNames} on trip "${tripName}"`
        : `Updated trip "${tripName}"`
    }

    return descriptions.join('; ') + ` — "${tripName}"`
  }

  /**
   * Listen for trip deleted events
   */
  @OnEvent('trip.deleted')
  async handleTripDeleted(event: TripDeletedEvent) {
    await this.db.client.insert(this.db.schema.activityLogs).values({
      entityType: 'trip',
      entityId: event.tripId,
      action: 'deleted',
      actorId: event.actorId,
      actorType: event.actorId ? 'user' : 'system',
      description: `Deleted trip "${event.tripName}"`,
      metadata: {},
      tripId: event.tripId,
    })
  }

  /**
   * Listen for trip in_progress events (trip started)
   */
  @OnEvent('trip.in_progress')
  async handleTripInProgress(event: TripInProgressEvent) {
    const description = event.isAutoTransition
      ? `Trip "${event.tripName}" automatically started (scheduled)`
      : `Trip "${event.tripName}" started`

    await this.db.client.insert(this.db.schema.activityLogs).values({
      entityType: 'trip',
      entityId: event.tripId,
      action: 'status_changed',
      actorId: null, // System action for auto-transitions
      actorType: event.isAutoTransition ? 'system' : 'user',
      description,
      metadata: {
        newStatus: 'travelling',
        isAutoTransition: event.isAutoTransition,
        startDate: event.startDate,
      },
      tripId: event.tripId,
    })
  }

  /**
   * Listen for trip completed events (trip ended)
   */
  @OnEvent('trip.completed')
  async handleTripCompleted(event: TripCompletedEvent) {
    const description = event.isAutoTransition
      ? `Trip "${event.tripName}" automatically completed (scheduled)`
      : `Trip "${event.tripName}" completed`

    await this.db.client.insert(this.db.schema.activityLogs).values({
      entityType: 'trip',
      entityId: event.tripId,
      action: 'status_changed',
      actorId: null, // System action for auto-transitions
      actorType: event.isAutoTransition ? 'system' : 'user',
      description,
      metadata: {
        newStatus: 'travelled',
        isAutoTransition: event.isAutoTransition,
        endDate: event.endDate,
      },
      tripId: event.tripId,
    })
  }

  /**
   * Listen for trip cancelled events
   */
  @OnEvent('trip.cancelled')
  async handleTripCancelled(event: TripCancelledEvent) {
    const reasonPart = event.cancellationReason ? ` — "${event.cancellationReason}"` : ''
    const description = `Trip "${event.tripName}" cancelled${reasonPart}`

    await this.db.client.insert(this.db.schema.activityLogs).values({
      entityType: 'trip',
      entityId: event.tripId,
      action: 'status_changed',
      actorId: event.cancelledBy,
      actorType: event.cancelledBy ? 'user' : 'system',
      description,
      metadata: {
        newStatus: 'cancelled',
        previousStatus: event.previousStatus,
        cancellationReason: event.cancellationReason,
      },
      tripId: event.tripId,
    })
  }

  /**
   * Listen for traveler created events
   */
  @OnEvent('traveler.created')
  async handleTravelerCreated(event: TravelerCreatedEvent) {
    try {
      this.logger.log('[ActivityLogs] handleTravelerCreated - Event received:', {
        travelerId: event.travelerId,
        tripId: event.tripId,
        travelerName: event.travelerName,
        actorId: event.actorId,
        metadata: event.metadata,
      })

      await this.db.client.insert(this.db.schema.activityLogs).values({
        entityType: 'trip_traveler',
        entityId: event.travelerId,
        action: 'created',
        actorId: event.actorId,
        actorType: event.actorId ? 'user' : 'system',
        description: `Added traveler "${event.travelerName}" to trip`,
        metadata: event.metadata || {},
        tripId: event.tripId,
      })

      this.logger.log('[ActivityLogs] handleTravelerCreated - Success')
    } catch (error) {
      this.logger.error('[ActivityLogs] handleTravelerCreated - FAILED:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        event: {
          travelerId: event.travelerId,
          tripId: event.tripId,
          travelerName: event.travelerName,
        },
      })
      throw error // Re-throw to let NestJS handle it
    }
  }

  /**
   * Listen for traveler updated events
   */
  @OnEvent('traveler.updated')
  async handleTravelerUpdated(event: TravelerUpdatedEvent) {
    try {
      await this.db.client.insert(this.db.schema.activityLogs).values({
        entityType: 'trip_traveler',
        entityId: event.travelerId,
        action: 'updated',
        actorId: event.actorId,
        actorType: event.actorId ? 'user' : 'system',
        description: `Updated traveler "${event.travelerName}"`,
        metadata: event.changes || {},
        tripId: event.tripId,
      })
    } catch (error) {
      this.logger.error('[ActivityLogs] handleTravelerUpdated - FAILED:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Listen for traveler deleted events
   */
  @OnEvent('traveler.deleted')
  async handleTravelerDeleted(event: TravelerDeletedEvent) {
    try {
      await this.db.client.insert(this.db.schema.activityLogs).values({
        entityType: 'trip_traveler',
        entityId: event.travelerId,
        action: 'deleted',
        actorId: event.actorId,
        actorType: event.actorId ? 'user' : 'system',
        description: `Removed traveler "${event.travelerName}" from trip`,
        metadata: {},
        tripId: event.tripId,
      })
    } catch (error) {
      this.logger.error('[ActivityLogs] handleTravelerDeleted - FAILED:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  // =========================================================================
  // Generic Audit Event Handler (Phase 1: Activities, Bookings, etc.)
  // =========================================================================

  /**
   * Handle all generic audit events (audit.created, audit.updated, etc.)
   *
   * This single handler replaces the need for 35+ entity-specific handlers.
   * Wildcard pattern 'audit.*' catches: audit.created, audit.updated, audit.deleted, audit.status_changed
   */
  @OnEvent('audit.*')
  async handleAuditEvent(event: AuditEvent) {
    try {
      this.logger.log('[ActivityLogs] handleAuditEvent - Event received:', {
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        tripId: event.tripId,
        actorId: event.actorId,
        displayName: event.displayName,
      })

      await this.db.client.insert(this.db.schema.activityLogs).values({
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        actorId: event.actorId,
        actorType: event.actorId ? 'user' : 'system',
        description: buildAuditDescription(event.action, event.entityType, event.displayName),
        metadata: event.metadata || {},
        tripId: event.tripId,
      })

      this.logger.log('[ActivityLogs] handleAuditEvent - Success:', {
        entityType: event.entityType,
        action: event.action,
      })
    } catch (error) {
      this.logger.error('[ActivityLogs] handleAuditEvent - FAILED:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        event: {
          entityType: event.entityType,
          entityId: event.entityId,
          action: event.action,
          tripId: event.tripId,
        },
      })
      // Don't re-throw - audit logging failures shouldn't break the main operation
      // This is a deliberate design choice to ensure audit failures are non-blocking
    }
  }

  // =========================================================================
  // Query Methods
  // =========================================================================

  /**
   * Get activity logs for a specific trip
   */
  async getActivityForTrip(tripId: string, limit = 50, offset = 0) {
    const logs = await this.db.client
      .select({
        id: this.db.schema.activityLogs.id,
        entityType: this.db.schema.activityLogs.entityType,
        entityId: this.db.schema.activityLogs.entityId,
        action: this.db.schema.activityLogs.action,
        actorId: this.db.schema.activityLogs.actorId,
        actorType: this.db.schema.activityLogs.actorType,
        actorName: sql<string | null>`COALESCE(${this.db.schema.userProfiles.firstName} || ' ' || ${this.db.schema.userProfiles.lastName}, NULL)`.as('actor_name'),
        description: this.db.schema.activityLogs.description,
        metadata: this.db.schema.activityLogs.metadata,
        tripId: this.db.schema.activityLogs.tripId,
        createdAt: this.db.schema.activityLogs.createdAt,
      })
      .from(this.db.schema.activityLogs)
      .leftJoin(
        this.db.schema.userProfiles,
        eq(this.db.schema.activityLogs.actorId, this.db.schema.userProfiles.id)
      )
      .where(eq(this.db.schema.activityLogs.tripId, tripId))
      .orderBy(desc(this.db.schema.activityLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return logs
  }

  /**
   * Get activity logs for any entity
   */
  async getActivityForEntity(
    entityType: AuditEntityType,
    entityId: string,
    limit = 50,
    offset = 0
  ) {
    const logs = await this.db.client
      .select({
        id: this.db.schema.activityLogs.id,
        entityType: this.db.schema.activityLogs.entityType,
        entityId: this.db.schema.activityLogs.entityId,
        action: this.db.schema.activityLogs.action,
        actorId: this.db.schema.activityLogs.actorId,
        actorType: this.db.schema.activityLogs.actorType,
        actorName: sql<string | null>`COALESCE(${this.db.schema.userProfiles.firstName} || ' ' || ${this.db.schema.userProfiles.lastName}, NULL)`.as('actor_name'),
        description: this.db.schema.activityLogs.description,
        metadata: this.db.schema.activityLogs.metadata,
        tripId: this.db.schema.activityLogs.tripId,
        createdAt: this.db.schema.activityLogs.createdAt,
      })
      .from(this.db.schema.activityLogs)
      .leftJoin(
        this.db.schema.userProfiles,
        eq(this.db.schema.activityLogs.actorId, this.db.schema.userProfiles.id)
      )
      .where(
        and(
          eq(this.db.schema.activityLogs.entityType, entityType),
          eq(this.db.schema.activityLogs.entityId, entityId)
        )
      )
      .orderBy(desc(this.db.schema.activityLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return logs
  }

  /**
   * Get activity logs for a contact (combined timeline)
   * Returns both direct contact changes AND trip activity where the contact is involved,
   * filtered by the user's trip access permissions.
   */
  async getActivityForContact(
    contactId: string,
    agencyId: string,
    accessibleTripIds: string[] | 'all',
    limit = 50,
    offset = 0,
  ) {
    // Find trip IDs where contact is primary contact or a traveler
    const primaryContactTrips = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.primaryContactId, contactId),
          eq(this.db.schema.trips.agencyId, agencyId),
        )
      )

    const travelerTrips = await this.db.client
      .select({ tripId: this.db.schema.tripTravelers.tripId })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.contactId, contactId))

    const allContactTripIds = [
      ...new Set([
        ...primaryContactTrips.map((t) => t.id),
        ...travelerTrips.map((t) => t.tripId),
      ]),
    ]

    // Intersect with user's accessible trip IDs
    let filteredTripIds: string[]
    if (accessibleTripIds === 'all') {
      filteredTripIds = allContactTripIds
    } else {
      const accessibleSet = new Set(accessibleTripIds)
      filteredTripIds = allContactTripIds.filter((id) => accessibleSet.has(id))
    }

    // Build OR conditions: direct contact changes + accessible trip activity
    const conditions = []

    // Direct contact changes
    conditions.push(
      and(
        eq(this.db.schema.activityLogs.entityType, 'contact'),
        eq(this.db.schema.activityLogs.entityId, contactId),
      )
    )

    // Trip activity (only accessible trips)
    if (filteredTripIds.length > 0) {
      conditions.push(inArray(this.db.schema.activityLogs.tripId, filteredTripIds))
    }

    const logs = await this.db.client
      .select({
        id: this.db.schema.activityLogs.id,
        entityType: this.db.schema.activityLogs.entityType,
        entityId: this.db.schema.activityLogs.entityId,
        action: this.db.schema.activityLogs.action,
        actorId: this.db.schema.activityLogs.actorId,
        actorType: this.db.schema.activityLogs.actorType,
        actorName: sql<string | null>`COALESCE(${this.db.schema.userProfiles.firstName} || ' ' || ${this.db.schema.userProfiles.lastName}, NULL)`.as('actor_name'),
        description: this.db.schema.activityLogs.description,
        metadata: this.db.schema.activityLogs.metadata,
        tripId: this.db.schema.activityLogs.tripId,
        createdAt: this.db.schema.activityLogs.createdAt,
      })
      .from(this.db.schema.activityLogs)
      .leftJoin(
        this.db.schema.userProfiles,
        eq(this.db.schema.activityLogs.actorId, this.db.schema.userProfiles.id)
      )
      .where(or(...conditions))
      .orderBy(desc(this.db.schema.activityLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return logs
  }
}
