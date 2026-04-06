/**
 * Update User Profile DTO
 *
 * Validation for user profile update requests.
 */

import {
  IsString,
  IsOptional,
  MaxLength,
  IsObject,
  ValidateNested,
  IsBoolean,
  IsUrl,
  IsNumber,
  IsIn,
  Min,
  Max,
} from 'class-validator'
import { Type } from 'class-transformer'

export class AddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  province?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  country?: string
}

export class SocialMediaLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedin?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagram?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  facebook?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  twitter?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string
}

export class EmailSignatureConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  signatureHtml?: string

  @IsOptional()
  @IsBoolean()
  includeInReplies?: boolean
}

export class PlatformPreferencesDto {
  @IsOptional()
  @IsString()
  theme?: 'light' | 'dark' | 'system'

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string

  @IsOptional()
  @IsString()
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'

  @IsOptional()
  @IsString()
  onboardingCompletedAt?: string | null
}

export class LicensingInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ticoNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  hstNumber?: string

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  tlnAgentProfileUrl?: string
}

export class CommissionSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  defaultRate?: number

  @IsOptional()
  @IsIn(['fixed', 'percentage', 'system_controlled'])
  splitType?: 'fixed' | 'percentage' | 'system_controlled'

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  splitValue?: number  // No @Max - fixed amounts can exceed 100, percentage enforced in service
}

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  publicPhone?: string

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  officeAddress?: AddressDto | null

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SocialMediaLinksDto)
  socialMediaLinks?: SocialMediaLinksDto

  @IsOptional()
  @IsString()
  @MaxLength(255)
  emergencyContactName?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactPhone?: string

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EmailSignatureConfigDto)
  emailSignatureConfig?: EmailSignatureConfigDto

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PlatformPreferencesDto)
  platformPreferences?: PlatformPreferencesDto

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LicensingInfoDto)
  licensingInfo?: LicensingInfoDto

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CommissionSettingsDto)
  commissionSettings?: CommissionSettingsDto

  @IsOptional()
  @IsBoolean()
  isPublicProfile?: boolean
}
