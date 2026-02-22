/**
 * Update Portal Profile DTO
 *
 * Allowlisted subset of contact fields that portal users may edit.
 * Excludes admin-only fields (contactType, contactStatus, ownerId, agencyId, tags, trust balances, marketing consent, etc.).
 */

import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  MaxLength,
} from 'class-validator'

export class UpdatePortalProfileDto {
  // ============================================================================
  // Name Fields
  // ============================================================================

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
  preferredName?: string

  @IsOptional()
  @IsString()
  @MaxLength(10)
  prefix?: string

  @IsOptional()
  @IsString()
  @MaxLength(10)
  suffix?: string

  @IsOptional()
  @IsString()
  legalFirstName?: string

  @IsOptional()
  @IsString()
  legalLastName?: string

  @IsOptional()
  @IsString()
  middleName?: string

  // ============================================================================
  // Contact & Identity
  // ============================================================================

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  pronouns?: string

  // ============================================================================
  // Passport
  // ============================================================================

  @IsOptional()
  @IsString()
  @MaxLength(50)
  passportNumber?: string

  @IsOptional()
  @IsDateString()
  passportExpiry?: string

  @IsOptional()
  @IsString()
  @MaxLength(3)
  passportCountry?: string

  @IsOptional()
  @IsDateString()
  passportIssueDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(3)
  nationality?: string

  // ============================================================================
  // TSA Credentials
  // ============================================================================

  @IsOptional()
  @IsString()
  @MaxLength(20)
  redressNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  knownTravelerNumber?: string

  // ============================================================================
  // Address
  // ============================================================================

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
  @MaxLength(100)
  province?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(3)
  country?: string

  // ============================================================================
  // Requirements
  // ============================================================================

  @IsOptional()
  @IsString()
  dietaryRequirements?: string

  @IsOptional()
  @IsString()
  mobilityRequirements?: string

  // ============================================================================
  // Travel Preferences
  // ============================================================================

  @IsOptional()
  @IsIn(['aisle', 'window', 'middle', 'no_preference'])
  seatPreference?: string

  @IsOptional()
  @IsIn(['economy', 'premium_economy', 'business', 'first'])
  cabinPreference?: string

  @IsOptional()
  @IsIn(['high', 'low', 'no_preference'])
  floorPreference?: string
}
