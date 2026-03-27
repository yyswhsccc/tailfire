/**
 * Create Referral DTO
 *
 * Validates incoming referral session data from the OTA consumer portal.
 * Logged when middleware detects an advisor slug in the URL.
 */

import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator'

export enum ReferralSource {
  MICROSITE = 'microsite',
  DIRECT_LINK = 'direct_link',
  DEAL_SHARE = 'deal_share',
}

export class CreateReferralDto {
  @IsString()
  sessionId!: string

  @IsString()
  @MaxLength(200)
  advisorSlug!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  landingUrl?: string

  @IsEnum(ReferralSource)
  referralSource!: ReferralSource
}
