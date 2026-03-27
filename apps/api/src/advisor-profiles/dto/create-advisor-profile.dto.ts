/**
 * Create Advisor Profile DTO
 *
 * Validates incoming data for advisor profile creation (admin).
 */

import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsUrl,
  MinLength,
  MaxLength,
} from 'class-validator'

export class CreateAdvisorProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  slug!: string

  @IsOptional()
  @IsUrl()
  tlnProfileUrl?: string

  @IsOptional()
  @IsString()
  displayName?: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  bio?: string

  @IsOptional()
  @IsUrl()
  photoUrl?: string

  @IsOptional()
  @IsString()
  bioSupplement?: string

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, unknown>

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean
}
