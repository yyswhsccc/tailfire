/**
 * User Profiles Service
 *
 * Business logic for user profile management.
 * All data access uses service-role key (bypasses RLS).
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { StorageService } from '../trips/storage.service'
import type {
  UserProfileResponseDto,
  PublicUserProfileDto,
  SocialMediaLinksDto,
  EmailSignatureConfigDto,
  PlatformPreferencesDto,
  LicensingInfoDto,
  CommissionSettingsDto,
} from '@tailfire/shared-types'
import type { UpdateUserProfileDto } from './dto'

@Injectable()
export class UserProfilesService {
  private readonly logger = new Logger(UserProfilesService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Normalize profile for response - exclude server-only fields, normalize JSONB nulls
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeProfile(profile: any): UserProfileResponseDto {
     
    const { avatarStoragePath, ...rest } = profile
    return {
      ...rest,
      // Normalize nullable JSONB fields with defaults to empty object
      socialMediaLinks: (profile.socialMediaLinks as SocialMediaLinksDto) ?? {},
      emailSignatureConfig: (profile.emailSignatureConfig as EmailSignatureConfigDto) ?? {},
      platformPreferences: (profile.platformPreferences as PlatformPreferencesDto) ?? {},
      licensingInfo: (profile.licensingInfo as LicensingInfoDto) ?? {},
      commissionSettings: (profile.commissionSettings as CommissionSettingsDto) ?? {},
      // Format timestamps
      lastLoginAt: profile.lastLoginAt?.toISOString() ?? null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    }
  }

  /**
   * Get current user's full profile
   */
  async getMyProfile(userId: string): Promise<UserProfileResponseDto> {
    const { userProfiles } = this.db.schema

    const profile = await this.db.client.query.userProfiles.findFirst({
      where: eq(userProfiles.id, userId),
    })

    if (!profile) {
      throw new NotFoundException('Profile not found')
    }

    return this.normalizeProfile(profile)
  }

  /**
   * Update current user's profile
   */
  async updateMyProfile(
    userId: string,
    dto: UpdateUserProfileDto,
    role: 'admin' | 'user' = 'user',
  ): Promise<UserProfileResponseDto> {
    const { userProfiles } = this.db.schema

    // Build update object, only including provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    }

    if (dto.firstName !== undefined) updateData.firstName = dto.firstName
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName
    if (dto.bio !== undefined) updateData.bio = dto.bio
    if (dto.publicPhone !== undefined) updateData.publicPhone = dto.publicPhone
    if (dto.officeAddress !== undefined) updateData.officeAddress = dto.officeAddress
    if (dto.socialMediaLinks !== undefined) updateData.socialMediaLinks = dto.socialMediaLinks
    if (dto.emergencyContactName !== undefined) updateData.emergencyContactName = dto.emergencyContactName
    if (dto.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = dto.emergencyContactPhone
    if (dto.emailSignatureConfig !== undefined) updateData.emailSignatureConfig = dto.emailSignatureConfig
    if (dto.platformPreferences !== undefined) updateData.platformPreferences = dto.platformPreferences
    if (dto.licensingInfo !== undefined) updateData.licensingInfo = dto.licensingInfo
    if (dto.commissionSettings !== undefined) {
      if (role !== 'admin') {
        this.logger.warn(`Non-admin user ${userId} attempted to update commission settings — ignoring`)
      } else {
        // Service-level guard: percentage splitValue must be <= 100
        const cs = dto.commissionSettings
        if (cs.splitType === 'percentage' && cs.splitValue !== undefined && cs.splitValue > 100) {
          throw new BadRequestException('Commission split percentage cannot exceed 100%')
        }
        updateData.commissionSettings = dto.commissionSettings
      }
    }
    if (dto.isPublicProfile !== undefined) updateData.isPublicProfile = dto.isPublicProfile

    const [updated] = await this.db.client
      .update(userProfiles)
      .set(updateData)
      .where(eq(userProfiles.id, userId))
      .returning()

    if (!updated) {
      throw new NotFoundException('Profile not found')
    }

    return this.normalizeProfile(updated)
  }

  /**
   * Upload avatar image
   */
  async uploadAvatar(
    userId: string,
    file: Buffer,
    fileName: string,
    contentType: string,
  ): Promise<{ avatarUrl: string }> {
    const { userProfiles } = this.db.schema

    // Get current profile to check for existing avatar
    const profile = await this.db.client.query.userProfiles.findFirst({
      where: eq(userProfiles.id, userId),
      columns: { avatarStoragePath: true },
    })

    if (!profile) {
      throw new NotFoundException('Profile not found')
    }

    // Delete existing avatar if present
    if (profile.avatarStoragePath) {
      try {
        await this.storageService.deleteMedia(profile.avatarStoragePath)
        this.logger.log(`Deleted previous avatar: ${profile.avatarStoragePath}`)
      } catch (error) {
        this.logger.warn(`Failed to delete previous avatar: ${error}`)
      }
    }

    // Upload new avatar
    const folder = `avatars/${userId}`
    const { path, url } = await this.storageService.uploadMediaFile(
      file,
      folder,
      fileName,
      contentType,
    )

    // Update profile with new avatar
    await this.db.client
      .update(userProfiles)
      .set({
        avatarUrl: url,
        avatarStoragePath: path,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.id, userId))

    this.logger.log(`Uploaded avatar for user ${userId}: ${path}`)

    return { avatarUrl: url }
  }

  /**
   * Delete avatar image
   */
  async deleteAvatar(userId: string): Promise<void> {
    const { userProfiles } = this.db.schema

    const profile = await this.db.client.query.userProfiles.findFirst({
      where: eq(userProfiles.id, userId),
      columns: { avatarStoragePath: true },
    })

    if (!profile) {
      throw new NotFoundException('Profile not found')
    }

    if (profile.avatarStoragePath) {
      try {
        await this.storageService.deleteMedia(profile.avatarStoragePath)
        this.logger.log(`Deleted avatar: ${profile.avatarStoragePath}`)
      } catch (error) {
        this.logger.warn(`Failed to delete avatar from storage: ${error}`)
      }
    }

    // Clear avatar fields
    await this.db.client
      .update(userProfiles)
      .set({
        avatarUrl: null,
        avatarStoragePath: null,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.id, userId))
  }

  /**
   * Activate pending user account (called after first login)
   * Returns true if activated, false if already active
   */
  async activateMyAccount(userId: string): Promise<{ activated: boolean }> {
    const { userProfiles } = this.db.schema

    const result = await this.db.client
      .update(userProfiles)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userProfiles.id, userId),
          eq(userProfiles.status, 'pending'),
        ),
      )
      .returning({ id: userProfiles.id })

    if (result.length > 0) {
      this.logger.log(`Activated pending user ${userId}`)
      return { activated: true }
    }

    return { activated: false }
  }

  /**
   * Get public profile (only if isPublicProfile = true)
   */
  async getPublicProfile(profileId: string): Promise<PublicUserProfileDto> {
    const { userProfiles } = this.db.schema

    const profile = await this.db.client.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.id, profileId),
        eq(userProfiles.isActive, true),
        eq(userProfiles.isPublicProfile, true),
      ),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        bio: true,
        publicPhone: true,
        officeAddress: true,
        socialMediaLinks: true,
        // EXCLUDED: role, email, agencyId, emergency contact, preferences, avatarStoragePath
      },
    })

    if (!profile) {
      throw new NotFoundException('Profile not found or not public')
    }

    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      publicPhone: profile.publicPhone,
      officeAddress: profile.officeAddress as PublicUserProfileDto['officeAddress'],
      socialMediaLinks: (profile.socialMediaLinks as SocialMediaLinksDto) ?? {},
    }
  }
}
