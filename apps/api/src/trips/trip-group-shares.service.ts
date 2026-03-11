/**
 * Trip Group Shares Service
 *
 * Business logic for managing trip group shares.
 * Allows group owners to share groups with other users in the agency.
 */

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { UserValidationService } from '../common/user-validation.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  TripGroupShareResponseDto,
  CreateTripGroupShareDto,
  UpdateTripGroupShareDto,
} from '@tailfire/shared-types'

@Injectable()
export class TripGroupSharesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userValidationService: UserValidationService,
  ) {}

  /**
   * Share a group with another user
   * Only the group owner or admin can share
   */
  async create(
    groupId: string,
    dto: CreateTripGroupShareDto,
    auth: AuthContext,
  ): Promise<TripGroupShareResponseDto> {
    // Validate group exists and check ownership
    const [group] = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        ownerId: this.db.schema.tripGroups.ownerId,
        agencyId: this.db.schema.tripGroups.agencyId,
        type: this.db.schema.tripGroups.type,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.id, groupId))
      .limit(1)

    if (!group) {
      throw new NotFoundException('Trip group not found')
    }

    if (group.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Group belongs to different agency')
    }

    // Only owner or admin can share
    if (auth.role !== 'admin' && group.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the group owner can share this group')
    }

    // Cannot share with yourself
    if (dto.sharedWithUserId === auth.userId) {
      throw new ForbiddenException('Cannot share a group with yourself')
    }

    // Validate target user exists and belongs to same agency
    await this.userValidationService.validateUserInAgency(
      dto.sharedWithUserId,
      auth.agencyId,
      'Target user',
    )

    // Check if share already exists
    const [existingShare] = await this.db.client
      .select({ id: this.db.schema.tripGroupShares.id })
      .from(this.db.schema.tripGroupShares)
      .where(
        and(
          eq(this.db.schema.tripGroupShares.tripGroupId, groupId),
          eq(this.db.schema.tripGroupShares.sharedWithUserId, dto.sharedWithUserId),
        ),
      )
      .limit(1)

    if (existingShare) {
      throw new ConflictException('Group is already shared with this user')
    }

    // Create the share
    const [share] = await this.db.client
      .insert(this.db.schema.tripGroupShares)
      .values({
        tripGroupId: groupId,
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
   * List all shares for a group
   */
  async findAll(groupId: string, auth: AuthContext): Promise<TripGroupShareResponseDto[]> {
    // Validate group exists and check access
    const [group] = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        ownerId: this.db.schema.tripGroups.ownerId,
        agencyId: this.db.schema.tripGroups.agencyId,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.id, groupId))
      .limit(1)

    if (!group) {
      throw new NotFoundException('Trip group not found')
    }

    if (group.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Group belongs to different agency')
    }

    // Only owner or admin can see all shares
    if (auth.role !== 'admin' && group.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the group owner can view shares')
    }

    const shares = await this.db.client
      .select()
      .from(this.db.schema.tripGroupShares)
      .where(eq(this.db.schema.tripGroupShares.tripGroupId, groupId))

    return shares.map((share) => this.mapToResponseDto(share))
  }

  /**
   * Update a share's access level
   */
  async update(
    groupId: string,
    sharedWithUserId: string,
    dto: UpdateTripGroupShareDto,
    auth: AuthContext,
  ): Promise<TripGroupShareResponseDto> {
    // Validate group exists and check ownership
    const [group] = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        ownerId: this.db.schema.tripGroups.ownerId,
        agencyId: this.db.schema.tripGroups.agencyId,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.id, groupId))
      .limit(1)

    if (!group) {
      throw new NotFoundException('Trip group not found')
    }

    if (group.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Group belongs to different agency')
    }

    if (auth.role !== 'admin' && group.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the group owner can update shares')
    }

    const [share] = await this.db.client
      .update(this.db.schema.tripGroupShares)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(this.db.schema.tripGroupShares.tripGroupId, groupId),
          eq(this.db.schema.tripGroupShares.sharedWithUserId, sharedWithUserId),
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
    groupId: string,
    sharedWithUserId: string,
    auth: AuthContext,
  ): Promise<void> {
    // Validate group exists and check ownership
    const [group] = await this.db.client
      .select({
        id: this.db.schema.tripGroups.id,
        ownerId: this.db.schema.tripGroups.ownerId,
        agencyId: this.db.schema.tripGroups.agencyId,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.id, groupId))
      .limit(1)

    if (!group) {
      throw new NotFoundException('Trip group not found')
    }

    if (group.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Group belongs to different agency')
    }

    if (auth.role !== 'admin' && group.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the group owner can revoke shares')
    }

    const [deleted] = await this.db.client
      .delete(this.db.schema.tripGroupShares)
      .where(
        and(
          eq(this.db.schema.tripGroupShares.tripGroupId, groupId),
          eq(this.db.schema.tripGroupShares.sharedWithUserId, sharedWithUserId),
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
  private mapToResponseDto(share: any): TripGroupShareResponseDto {
    return {
      id: share.id,
      tripGroupId: share.tripGroupId,
      sharedWithUserId: share.sharedWithUserId,
      accessLevel: share.accessLevel,
      sharedBy: share.sharedBy,
      sharedAt: share.sharedAt.toISOString(),
      notes: share.notes,
      source: share.source,
      createdAt: share.createdAt.toISOString(),
      updatedAt: share.updatedAt.toISOString(),
    }
  }
}
