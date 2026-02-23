/**
 * Update Loyalty Program DTO with runtime validation
 */

import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator'

export class UpdateLoyaltyProgramDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  programName?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  membershipNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tierLevel?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  metadata?: Record<string, unknown>

  @IsOptional()
  @IsUUID()
  loyaltyProgramId?: string
}
