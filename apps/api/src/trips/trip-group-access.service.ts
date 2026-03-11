/**
 * Trip Group Access Service
 *
 * Core access control logic for trip groups.
 * Determines who can read/write group data based on ownership, sharing, and group type.
 *
 * Access Levels:
 * - Admin: Full read/write access to all groups in agency
 * - Folder type: Full read/write access (folders are agency-wide)
 * - Owner: Full read/write access to owned groups
 * - Write Share: Read/write access via explicit share (access_level = 'write')
 * - Read Share: Read-only access via explicit share (access_level = 'read')
 * - Default: No access
 */

import { Injectable, ForbiddenException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { AuthContext } from '../auth/auth.types'

export interface TripGroupAccessResult {
  canRead: boolean
  canWrite: boolean
  reason: string
}

@Injectable()
export class TripGroupAccessService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Check what level of access a user has to a trip group
   */
  async canAccessGroup(
    groupId: string,
    auth: AuthContext,
  ): Promise<TripGroupAccessResult> {
    // Admins have full access
    if (auth.role === 'admin') {
      return {
        canRead: true,
        canWrite: true,
        reason: 'Admin has full access',
      }
    }

    // Get the group
    const [group] = await this.db.client
      .select({
        ownerId: this.db.schema.tripGroups.ownerId,
        agencyId: this.db.schema.tripGroups.agencyId,
        type: this.db.schema.tripGroups.type,
      })
      .from(this.db.schema.tripGroups)
      .where(eq(this.db.schema.tripGroups.id, groupId))
      .limit(1)

    if (!group) {
      return {
        canRead: false,
        canWrite: false,
        reason: 'Group not found',
      }
    }

    // Check agency match
    if (group.agencyId !== auth.agencyId) {
      return {
        canRead: false,
        canWrite: false,
        reason: 'Group belongs to different agency',
      }
    }

    // Folders are agency-wide — all users can read/write
    if (group.type === 'folder') {
      return {
        canRead: true,
        canWrite: true,
        reason: 'Folders are accessible to all agency users',
      }
    }

    // Owner has full access
    if (group.ownerId === auth.userId) {
      return {
        canRead: true,
        canWrite: true,
        reason: 'User owns this group',
      }
    }

    // Check for explicit share
    const [share] = await this.db.client
      .select({ accessLevel: this.db.schema.tripGroupShares.accessLevel })
      .from(this.db.schema.tripGroupShares)
      .where(
        and(
          eq(this.db.schema.tripGroupShares.tripGroupId, groupId),
          eq(this.db.schema.tripGroupShares.sharedWithUserId, auth.userId),
        ),
      )
      .limit(1)

    if (share) {
      if (share.accessLevel === 'write') {
        return {
          canRead: true,
          canWrite: true,
          reason: 'Write share granted',
        }
      }
      return {
        canRead: true,
        canWrite: false,
        reason: 'Read-only share granted',
      }
    }

    // Default: No access
    return {
      canRead: false,
      canWrite: false,
      reason: 'No access to this group',
    }
  }

  /**
   * Quick check if user can read a group
   */
  async canRead(groupId: string, auth: AuthContext): Promise<boolean> {
    const access = await this.canAccessGroup(groupId, auth)
    return access.canRead
  }

  /**
   * Quick check if user can write to a group
   */
  async canWrite(groupId: string, auth: AuthContext): Promise<boolean> {
    const access = await this.canAccessGroup(groupId, auth)
    return access.canWrite
  }

  /**
   * Verify read access and throw ForbiddenException if not allowed
   */
  async verifyReadAccess(
    groupId: string,
    auth: AuthContext,
  ): Promise<TripGroupAccessResult> {
    const access = await this.canAccessGroup(groupId, auth)
    if (!access.canRead) {
      throw new ForbiddenException(access.reason)
    }
    return access
  }

  /**
   * Verify write access and throw ForbiddenException if not allowed
   */
  async verifyWriteAccess(
    groupId: string,
    auth: AuthContext,
  ): Promise<TripGroupAccessResult> {
    const access = await this.canAccessGroup(groupId, auth)
    if (!access.canWrite) {
      throw new ForbiddenException(
        access.canRead
          ? 'You have read-only access to this group'
          : access.reason,
      )
    }
    return access
  }

  /**
   * Get all group IDs a user can access (for filtering queries)
   * Returns 'all' for admins, or array of accessible group IDs
   */
  async getAccessibleGroupIds(auth: AuthContext): Promise<string[] | 'all'> {
    // Admins can access all groups in agency
    if (auth.role === 'admin') {
      return 'all'
    }

    // Get all folders (accessible to everyone)
    const folders = await this.db.client
      .select({ id: this.db.schema.tripGroups.id })
      .from(this.db.schema.tripGroups)
      .where(
        and(
          eq(this.db.schema.tripGroups.agencyId, auth.agencyId),
          eq(this.db.schema.tripGroups.type, 'folder'),
        ),
      )

    // Get owned groups
    const ownedGroups = await this.db.client
      .select({ id: this.db.schema.tripGroups.id })
      .from(this.db.schema.tripGroups)
      .where(
        and(
          eq(this.db.schema.tripGroups.ownerId, auth.userId),
          eq(this.db.schema.tripGroups.agencyId, auth.agencyId),
        ),
      )

    // Get shared groups
    const sharedGroups = await this.db.client
      .select({ tripGroupId: this.db.schema.tripGroupShares.tripGroupId })
      .from(this.db.schema.tripGroupShares)
      .where(eq(this.db.schema.tripGroupShares.sharedWithUserId, auth.userId))

    // Combine all accessible group IDs
    const groupIds = new Set<string>()
    for (const folder of folders) {
      groupIds.add(folder.id)
    }
    for (const group of ownedGroups) {
      groupIds.add(group.id)
    }
    for (const share of sharedGroups) {
      groupIds.add(share.tripGroupId)
    }

    return Array.from(groupIds)
  }
}
