/**
 * Publish Trip DTO
 *
 * Validates the request body for publishing an itinerary template
 * to the OTA consumer portal.
 */

import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
  IsUrl,
} from 'class-validator'

export enum PublishType {
  HOSTED = 'hosted',
  FEATURED = 'featured',
  RECOMMENDED = 'recommended',
  CUSTOM = 'custom',
}

export class PublishTripDto {
  @IsUUID()
  templateId!: string

  @IsUUID()
  advisorProfileId!: string

  @IsString()
  @MaxLength(300)
  slug!: string

  @IsEnum(PublishType)
  publishType!: PublishType

  @IsOptional()
  @IsString()
  @MaxLength(500)
  headline?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  callToAction?: string

  @IsOptional()
  @IsUrl()
  heroImageUrl?: string
}

export class UpdatePublishedTripDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  headline?: string

  @IsOptional()
  @IsEnum(PublishType)
  publishType?: PublishType

  @IsOptional()
  @IsString()
  @MaxLength(200)
  callToAction?: string

  @IsOptional()
  @IsUrl()
  heroImageUrl?: string

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean
}
