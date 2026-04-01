/**
 * Trip Shares Service
 *
 * Business logic for managing trip shares.
 * Allows trip owners to share trips with other users in the agency.
 *
 * NOTE: This is SEPARATE from trip_collaborators which is for commission splits.
 * This table is specifically for access control sharing.
 */

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { UserValidationService } from '../common/user-validation.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  TripShareResponseDto,
  CreateTripShareDto,
  UpdateTripShareDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class TripSharesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userValidationService: UserValidationService,
  ) {}

  /**
   * Share a trip with another user
   * Only the trip owner or admin can share
   */
  async create(
    tripId: string,
    dto: CreateTripShareDto,
    auth: AuthContext,
  ): Promise<TripShareResponseDto> {
    // Validate trip exists and check ownership
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        ownerId: this.db.schema.trips.ownerId,
        agencyId: this.db.schema.trips.agencyId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    // Check agency match
    if (trip.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Trip belongs to different agency')
    }

    // Only owner or admin can share
    if (auth.role !== 'admin' && trip.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the trip owner can share this trip')
    }

    // Cannot share with yourself
    if (dto.sharedWithUserId === auth.userId) {
      throw new ForbiddenException('Cannot share a trip with yourself')
    }

    // Validate target user exists and belongs to same agency
    await this.userValidationService.validateUserInAgency(
      dto.sharedWithUserId,
      auth.agencyId,
      'Target user',
    )

    // Check if share already exists
    const [existingShare] = await this.db.client
      .select({ id: this.db.schema.tripShares.id })
      .from(this.db.schema.tripShares)
      .where(
        and(
          eq(this.db.schema.tripShares.tripId, tripId),
          eq(this.db.schema.tripShares.sharedWithUserId, dto.sharedWithUserId),
        ),
      )
      .limit(1)

    if (existingShare) {
      throw new ConflictException('Trip is already shared with this user')
    }

    // Create the share
    const [share] = await this.db.client
      .insert(this.db.schema.tripShares)
      .values({
        tripId,
        sharedWithUserId: dto.sharedWithUserId,
        agencyId: auth.agencyId,
        accessLevel: dto.accessLevel || 'read',
        sharedBy: auth.userId,
        notes: dto.notes,
      })
      .returning()

    return this.mapToResponseDto(share)
  }

  /**
   * List all shares for a trip
   */
  async findAll(tripId: string, auth: AuthContext): Promise<TripShareResponseDto[]> {
    // Validate trip exists and check access
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        ownerId: this.db.schema.trips.ownerId,
        agencyId: this.db.schema.trips.agencyId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    // Check agency match
    if (trip.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Trip belongs to different agency')
    }

    // Only owner or admin can see all shares
    if (auth.role !== 'admin' && trip.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the trip owner can view shares')
    }

    const shares = await this.db.client
      .select()
      .from(this.db.schema.tripShares)
      .where(eq(this.db.schema.tripShares.tripId, tripId))

    return shares.map((share) => this.mapToResponseDto(share))
  }

  /**
   * Update a share's access level
   */
  async update(
    tripId: string,
    sharedWithUserId: string,
    dto: UpdateTripShareDto,
    auth: AuthContext,
  ): Promise<TripShareResponseDto> {
    // Validate trip exists and check ownership
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        ownerId: this.db.schema.trips.ownerId,
        agencyId: this.db.schema.trips.agencyId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    // Check agency match
    if (trip.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Trip belongs to different agency')
    }

    // Only owner or admin can update shares
    if (auth.role !== 'admin' && trip.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the trip owner can update shares')
    }

    const [share] = await this.db.client
      .update(this.db.schema.tripShares)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(this.db.schema.tripShares.tripId, tripId),
          eq(this.db.schema.tripShares.sharedWithUserId, sharedWithUserId),
        ),
      )
      .returning()

    if (!share) {
      throw new NotFoundException('Share not found')
    }

    return this.mapToResponseDto(share)
  }

  /**
   * Revoke a share
   */
  async remove(
    tripId: string,
    sharedWithUserId: string,
    auth: AuthContext,
  ): Promise<void> {
    // Validate trip exists and check ownership
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        ownerId: this.db.schema.trips.ownerId,
        agencyId: this.db.schema.trips.agencyId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    // Check agency match
    if (trip.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Trip belongs to different agency')
    }

    // Only owner or admin can revoke shares
    if (auth.role !== 'admin' && trip.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the trip owner can revoke shares')
    }

    const [deleted] = await this.db.client
      .delete(this.db.schema.tripShares)
      .where(
        and(
          eq(this.db.schema.tripShares.tripId, tripId),
          eq(this.db.schema.tripShares.sharedWithUserId, sharedWithUserId),
        ),
      )
      .returning()

    if (!deleted) {
      throw new NotFoundException('Share not found')
    }
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(share: any): TripShareResponseDto {
    return {
      id: share.id,
      tripId: share.tripId,
      sharedWithUserId: share.sharedWithUserId,
      accessLevel: share.accessLevel,
      sharedBy: share.sharedBy,
      sharedAt: share.sharedAt.toISOString(),
      notes: share.notes,
      reason: share.reason ?? null,
      scopedContactId: share.scopedContactId ?? null,
      grantedBy: share.grantedBy ?? null,
      expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
      createdAt: share.createdAt.toISOString(),
      updatedAt: share.updatedAt.toISOString(),
    }
  }
}
