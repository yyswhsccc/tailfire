/**
 * Trip Access Service
 *
 * Core access control logic for trips.
 * Determines who can read/write trip data based on ownership, sharing,
 * and group membership (for group_booking groups).
 *
 * Access Levels:
 * - Admin: Full read/write access to all trips in agency
 * - Owner: Full read/write access to owned trips
 * - Write Share: Read/write access via explicit share (access_level = 'write')
 * - Read Share: Read-only access via explicit share (access_level = 'read')
 * - Agency (no share): No access to other users' trips
 *
 * Group Gate (group_booking only):
 * - If a trip is in a group_booking, user must also have group access
 * - Folders do not gate access
 *
 * NOTE: Unlike contacts (which have basic agency-wide visibility),
 * trips are private by default and require explicit sharing for access.
 */

import { Injectable } from '@nestjs/common'
import { eq, and, inArray, notInArray, sql, isNull } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripGroupAccessService } from './trip-group-access.service'
import type { AuthContext } from '../auth/auth.types'

export interface TripAccessResult {
  canRead: boolean
  canWrite: boolean
  reason: string
}

@Injectable()
export class TripAccessService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tripGroupAccessService: TripGroupAccessService,
  ) {}

  /**
   * Check what level of access a user has to a trip
   */
  async canAccessTrip(
    tripId: string,
    auth: AuthContext,
  ): Promise<TripAccessResult> {
    // Admins have full access
    if (auth.role === 'admin') {
      return {
        canRead: true,
        canWrite: true,
        reason: 'Admin has full access',
      }
    }

    // Get the trip to check ownership and group membership
    const [trip] = await this.db.client
      .select({
        ownerId: this.db.schema.trips.ownerId,
        agencyId: this.db.schema.trips.agencyId,
        tripGroupId: this.db.schema.trips.tripGroupId,
      })
      .from(this.db.schema.trips)
      .where(and(eq(this.db.schema.trips.id, tripId), isNull(this.db.schema.trips.deletedAt)))
      .limit(1)

    if (!trip) {
      return {
        canRead: false,
        canWrite: false,
        reason: 'Trip not found',
      }
    }

    // Check agency match
    if (trip.agencyId !== auth.agencyId) {
      return {
        canRead: false,
        canWrite: false,
        reason: 'Trip belongs to different agency',
      }
    }

    // Determine base access from ownership/sharing
    let access: TripAccessResult

    if (trip.ownerId === auth.userId) {
      access = { canRead: true, canWrite: true, reason: 'User owns this trip' }
    } else {
      // Check for explicit share
      const [share] = await this.db.client
        .select({ accessLevel: this.db.schema.tripShares.accessLevel })
        .from(this.db.schema.tripShares)
        .where(
          and(
            eq(this.db.schema.tripShares.tripId, tripId),
            eq(this.db.schema.tripShares.sharedWithUserId, auth.userId),
          ),
        )
        .limit(1)

      if (share) {
        access = share.accessLevel === 'write'
          ? { canRead: true, canWrite: true, reason: 'Write share granted' }
          : { canRead: true, canWrite: false, reason: 'Read-only share granted' }
      } else if (trip.ownerId === null) {
        // Inbound trips (no owner) - agency users can view but not edit
        access = { canRead: true, canWrite: false, reason: 'Inbound trip (no owner) - read-only access' }
      } else {
        access = { canRead: false, canWrite: false, reason: 'No access to this trip' }
      }
    }

    // If no base read access, no point checking group gate
    if (!access.canRead) {
      return access
    }

    // Group gate: if trip is in a group_booking, user must also have group access
    if (trip.tripGroupId) {
      const [group] = await this.db.client
        .select({ type: this.db.schema.tripGroups.type })
        .from(this.db.schema.tripGroups)
        .where(eq(this.db.schema.tripGroups.id, trip.tripGroupId))
        .limit(1)

      if (group?.type === 'group_booking') {
        const groupAccess = await this.tripGroupAccessService.canAccessGroup(trip.tripGroupId, auth)
        if (!groupAccess.canRead) {
          return { canRead: false, canWrite: false, reason: 'No access to trip group' }
        }
        if (!groupAccess.canWrite && access.canWrite) {
          return { canRead: true, canWrite: false, reason: 'Read-only group access' }
        }
      }
    }

    return access
  }

  /**
   * Quick check if user can read a trip
   * Use this for simple read permission checks
   */
  async canRead(tripId: string, auth: AuthContext): Promise<boolean> {
    const access = await this.canAccessTrip(tripId, auth)
    return access.canRead
  }

  /**
   * Quick check if user can write to a trip
   * Use this for simple write permission checks
   */
  async canWrite(tripId: string, auth: AuthContext): Promise<boolean> {
    const access = await this.canAccessTrip(tripId, auth)
    return access.canWrite
  }

  /**
   * Verify read access and throw ForbiddenException if not allowed
   * Returns the access result for additional context
   */
  async verifyReadAccess(
    tripId: string,
    auth: AuthContext,
  ): Promise<TripAccessResult> {
    const access = await this.canAccessTrip(tripId, auth)
    if (!access.canRead) {
      const { ForbiddenException } = await import('@nestjs/common')
      throw new ForbiddenException(access.reason)
    }
    return access
  }

  /**
   * Verify write access and throw ForbiddenException if not allowed
   * Returns the access result for additional context
   */
  async verifyWriteAccess(
    tripId: string,
    auth: AuthContext,
  ): Promise<TripAccessResult> {
    const access = await this.canAccessTrip(tripId, auth)
    if (!access.canWrite) {
      const { ForbiddenException } = await import('@nestjs/common')
      throw new ForbiddenException(
        access.canRead
          ? 'You have read-only access to this trip'
          : access.reason,
      )
    }
    return access
  }

  /**
   * Get all trips a user can access (for filtering queries)
   * Returns trip IDs the user can read, excluding trips in inaccessible group_bookings
   */
  async getAccessibleTripIds(auth: AuthContext): Promise<string[] | 'all'> {
    // Admins can access all trips in agency
    if (auth.role === 'admin') {
      return 'all'
    }

    // Get owned trips (exclude soft-deleted)
    const ownedTrips = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.ownerId, auth.userId),
          eq(this.db.schema.trips.agencyId, auth.agencyId),
          isNull(this.db.schema.trips.deletedAt),
        ),
      )

    // Get shared trips
    const sharedTrips = await this.db.client
      .select({ tripId: this.db.schema.tripShares.tripId })
      .from(this.db.schema.tripShares)
      .where(eq(this.db.schema.tripShares.sharedWithUserId, auth.userId))

    // Get inbound trips (no owner - visible to all agency users)
    const inboundTrips = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.agencyId, auth.agencyId),
          eq(this.db.schema.trips.status, 'inbound'),
        ),
      )

    // Combine all accessible trip IDs
    const tripIds = new Set<string>()
    for (const trip of ownedTrips) {
      tripIds.add(trip.id)
    }
    for (const share of sharedTrips) {
      tripIds.add(share.tripId)
    }
    for (const trip of inboundTrips) {
      tripIds.add(trip.id)
    }

    const accessibleTripIds = Array.from(tripIds)

    // Group gate: exclude trips in group_bookings the user can't access
    if (accessibleTripIds.length > 0) {
      const accessibleGroupIds = await this.tripGroupAccessService.getAccessibleGroupIds(auth)
      if (accessibleGroupIds !== 'all') {
        // Find trips in inaccessible group_bookings
        const groupedTripsToExclude = await this.db.client
          .select({ id: this.db.schema.trips.id })
          .from(this.db.schema.trips)
          .innerJoin(
            this.db.schema.tripGroups,
            eq(this.db.schema.trips.tripGroupId, this.db.schema.tripGroups.id),
          )
          .where(
            and(
              inArray(this.db.schema.trips.id, accessibleTripIds),
              eq(this.db.schema.tripGroups.type, 'group_booking'),
              accessibleGroupIds.length > 0
                ? notInArray(this.db.schema.tripGroups.id, accessibleGroupIds)
                : sql`true`,
            ),
          )

        const excludeIds = new Set(groupedTripsToExclude.map(t => t.id))
        return accessibleTripIds.filter(id => !excludeIds.has(id))
      }
    }

    return accessibleTripIds
  }
}
