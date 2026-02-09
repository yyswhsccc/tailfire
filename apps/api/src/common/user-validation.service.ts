/**
 * User Validation Service
 *
 * Provides methods to validate user existence and agency membership.
 * Used by ownership and sharing features to ensure users can only
 * share/assign to valid users within their agency.
 */

import { Injectable, BadRequestException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

export interface UserValidationResult {
  exists: boolean
  belongsToAgency: boolean
  isActive: boolean
  userId?: string
  agencyId?: string
}

@Injectable()
export class UserValidationService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Check if a user exists and belongs to a specific agency
   * Returns detailed validation result
   */
  async validateUser(userId: string, agencyId: string): Promise<UserValidationResult> {
    const [user] = await this.db.client
      .select({
        id: this.db.schema.userProfiles.id,
        agencyId: this.db.schema.userProfiles.agencyId,
        isActive: this.db.schema.userProfiles.isActive,
        status: this.db.schema.userProfiles.status,
      })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, userId))
      .limit(1)

    if (!user) {
      return {
        exists: false,
        belongsToAgency: false,
        isActive: false,
      }
    }

    return {
      exists: true,
      belongsToAgency: user.agencyId === agencyId,
      isActive: user.isActive && user.status === 'active',
      userId: user.id,
      agencyId: user.agencyId,
    }
  }

  /**
   * Validate user exists in agency and throw if not
   * Use this for operations that require a valid user in the same agency
   */
  async validateUserInAgency(
    userId: string,
    agencyId: string,
    context: string = 'User',
  ): Promise<void> {
    const result = await this.validateUser(userId, agencyId)

    if (!result.exists) {
      throw new BadRequestException(`${context} not found`)
    }

    if (!result.belongsToAgency) {
      throw new BadRequestException(`${context} does not belong to this agency`)
    }
  }

  /**
   * Validate user exists, is in agency, and is active
   * Use this for operations that should only target active users
   */
  async validateActiveUserInAgency(
    userId: string,
    agencyId: string,
    context: string = 'User',
  ): Promise<void> {
    const result = await this.validateUser(userId, agencyId)

    if (!result.exists) {
      throw new BadRequestException(`${context} not found`)
    }

    if (!result.belongsToAgency) {
      throw new BadRequestException(`${context} does not belong to this agency`)
    }

    if (!result.isActive) {
      throw new BadRequestException(`${context} is not active`)
    }
  }

  /**
   * Check if a user exists in an agency (simple boolean check)
   */
  async userExistsInAgency(userId: string, agencyId: string): Promise<boolean> {
    const [user] = await this.db.client
      .select({ id: this.db.schema.userProfiles.id })
      .from(this.db.schema.userProfiles)
      .where(
        and(
          eq(this.db.schema.userProfiles.id, userId),
          eq(this.db.schema.userProfiles.agencyId, agencyId),
        ),
      )
      .limit(1)

    return !!user
  }
}
