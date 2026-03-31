/**
 * OTA Trip Request DTOs
 *
 * Validates incoming trip request data from the OTA consumer portal.
 * Consumers build multi-component trip requests (flights, cruises, hotels, tours)
 * which are promoted into full Tailfire trips upon submission.
 */

import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsInt,
  IsUUID,
  IsDateString,
  IsEnum,
  IsObject,
  Min,
  Max,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// ============================================================================
// Component types
// ============================================================================

export enum TripComponentType {
  FLIGHT = 'flight',
  HOTEL = 'hotel',
  CRUISE = 'cruise',
  TOUR = 'tour',
  PACKAGE = 'package',
  CUSTOM = 'custom',
}

// ============================================================================
// Nested DTO: TripRequestComponentDto
// ============================================================================

export class TripRequestComponentDto {
  @ApiProperty({ description: 'Unique component identifier' })
  @IsString()
  id!: string

  @ApiProperty({ enum: TripComponentType, description: 'Component type' })
  @IsEnum(TripComponentType)
  type!: string

  @ApiProperty({ description: 'Structured component data (provider-specific)' })
  @IsObject()
  data!: Record<string, any>

  @ApiPropertyOptional({ description: 'Display metadata for the consumer UI' })
  @IsOptional()
  @IsObject()
  display?: Record<string, any>
}

// ============================================================================
// CreateTripRequestDto
// ============================================================================

export class CreateTripRequestDto {
  @ApiProperty({ description: 'Consumer email address' })
  @IsEmail()
  email!: string

  @ApiPropertyOptional({ description: 'Consumer full name' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Consumer phone number' })
  @IsOptional()
  @IsString()
  phone?: string

  @ApiPropertyOptional({ description: 'Referring advisor slug for attribution' })
  @IsOptional()
  @IsString()
  advisorSlug?: string

  @ApiPropertyOptional({ description: 'Referral session ID for attribution tracking' })
  @IsOptional()
  @IsString()
  referralSessionId?: string

  @ApiPropertyOptional({ description: 'Lead source (e.g., ota, ai_concierge)' })
  @IsOptional()
  @IsString()
  source?: string

  @ApiPropertyOptional({ description: 'Trip group ID for grouping related requests' })
  @IsOptional()
  @IsUUID()
  tripGroupId?: string

  @ApiPropertyOptional({ description: 'Trip title' })
  @IsOptional()
  @IsString()
  title?: string

  @ApiPropertyOptional({ description: 'Trip start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional({ description: 'Trip end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string

  @ApiPropertyOptional({ description: 'Number of travelers', minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  travelers?: number

  @ApiPropertyOptional({ description: 'Special requests or notes from the consumer' })
  @IsOptional()
  @IsString()
  specialRequests?: string

  @ApiProperty({ type: [TripRequestComponentDto], description: 'Trip components (flights, hotels, cruises, etc.)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripRequestComponentDto)
  components!: TripRequestComponentDto[]
}

// ============================================================================
// UpdateComponentsDto
// ============================================================================

export class UpdateComponentsDto {
  @ApiProperty({ type: [TripRequestComponentDto], description: 'Updated trip components' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripRequestComponentDto)
  components!: TripRequestComponentDto[]
}
