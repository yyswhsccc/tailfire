/**
 * User Profile Types
 *
 * API contracts for user profile management.
 * Used by both NestJS backend and React frontend.
 */

import type { AddressDto } from './common.types.js'

// ============================================================================
// JSONB Structure Types
// ============================================================================

export interface SocialMediaLinksDto {
  linkedin?: string
  instagram?: string
  facebook?: string
  twitter?: string
  website?: string
}

export interface EmailSignatureConfigDto {
  enabled?: boolean
  signatureHtml?: string
  includeInReplies?: boolean
}

export interface PlatformPreferencesDto {
  theme?: 'light' | 'dark' | 'system'
  timezone?: string
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  onboardingCompletedAt?: string | null
}

export interface LicensingInfoDto {
  ticoNumber?: string
  hstNumber?: string
  tlnAgentProfileUrl?: string
}

export interface CommissionSettingsDto {
  defaultRate?: number
  splitType?: 'fixed' | 'percentage' | 'system_controlled'
  splitValue?: number
}

// ============================================================================
// Response DTOs
// ============================================================================

/**
 * Full profile response for authenticated user
 * Used by: GET /user-profiles/me
 */
export interface UserProfileResponseDto {
  id: string
  agencyId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  role: 'admin' | 'user'
  isActive: boolean
  isPublicProfile: boolean
  avatarUrl: string | null
  bio: string | null
  publicPhone: string | null
  officeAddress: AddressDto | null
  socialMediaLinks: SocialMediaLinksDto
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emailSignatureConfig: EmailSignatureConfigDto
  platformPreferences: PlatformPreferencesDto
  licensingInfo: LicensingInfoDto
  commissionSettings: CommissionSettingsDto
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Public profile response for B2C (only if isPublicProfile = true)
 * Used by: GET /user-profiles/public/:id
 * EXCLUDES: role, email, agencyId, emergency contact, preferences
 */
export interface PublicUserProfileDto {
  id: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  bio: string | null
  publicPhone: string | null
  officeAddress: AddressDto | null
  socialMediaLinks: SocialMediaLinksDto
}

// ============================================================================
// Request DTOs
// ============================================================================

/**
 * Update profile request
 * Used by: PUT /user-profiles/me
 * Note: avatarStoragePath is server-only, never in DTOs
 */
export interface UpdateUserProfileDto {
  firstName?: string
  lastName?: string
  bio?: string
  publicPhone?: string
  officeAddress?: AddressDto | null
  socialMediaLinks?: SocialMediaLinksDto
  emergencyContactName?: string
  emergencyContactPhone?: string
  emailSignatureConfig?: EmailSignatureConfigDto
  platformPreferences?: PlatformPreferencesDto
  licensingInfo?: LicensingInfoDto
  commissionSettings?: CommissionSettingsDto
  isPublicProfile?: boolean
}

/**
 * Avatar upload response
 * Used by: POST /user-profiles/me/avatar
 */
export interface AvatarUploadResponseDto {
  avatarUrl: string
}
