/**
 * Create Deal DTO
 *
 * Validates incoming deal data for creation (admin manual entry or scraper import).
 */

import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  IsObject,
  IsDateString,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator'

export enum ProductType {
  FLIGHT = 'flight',
  CRUISE = 'cruise',
  TOUR = 'tour',
  HOTEL = 'hotel',
  PACKAGE = 'package',
}

export class DealPricingDto {
  @IsOptional()
  fromPriceCents?: number

  @IsOptional()
  @IsString()
  currency?: string

  @IsOptional()
  @IsString()
  priceNote?: string

  @IsOptional()
  originalPriceCents?: number
}

export class CreateDealDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  slug!: string

  @IsEnum(ProductType)
  productType!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsUrl()
  heroImageUrl?: string

  @IsOptional()
  @IsObject()
  pricing?: DealPricingDto

  @IsOptional()
  @IsDateString()
  validFrom?: string

  @IsOptional()
  @IsDateString()
  validUntil?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  destinations?: string[]

  @IsOptional()
  @IsString()
  supplierName?: string

  @IsOptional()
  @IsString()
  externalSource?: string

  @IsOptional()
  @IsString()
  externalId?: string

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean

  @IsOptional()
  @IsObject()
  seoMeta?: Record<string, unknown>
}
