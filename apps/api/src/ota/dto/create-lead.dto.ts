/**
 * Create Lead DTO
 *
 * Validates incoming lead capture data from the OTA consumer portal.
 * Supports multiple lead sources: AI concierge, contact forms, deal inquiries.
 */

import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator'

export enum LeadSource {
  AI_CONCIERGE = 'ai_concierge',
  CONTACT_FORM = 'contact_form',
  DEAL_INQUIRY = 'deal_inquiry',
  ADVISOR_INQUIRY = 'advisor_inquiry',
}

export class CreateLeadDto {
  @IsEmail()
  email!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  advisorSlug?: string

  @IsOptional()
  @IsString()
  referralSessionId?: string

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dealSlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string
}
