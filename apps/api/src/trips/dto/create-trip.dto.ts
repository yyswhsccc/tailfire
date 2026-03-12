/**
 * CreateTripDto with runtime validation
 */

import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  IsUUID,
  IsNumber,
  IsArray,
  IsObject,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator'
import { Type } from 'class-transformer'
import { IsTimezone } from '../../common/validators/is-timezone.validator'

export class CreateTripDto {
  // Required fields
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string

  // Optional basic info
  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsIn(['leisure', 'business', 'group', 'honeymoon', 'corporate', 'custom'])
  tripType?: 'leisure' | 'business' | 'group' | 'honeymoon' | 'corporate' | 'custom'

  // Optional dates
  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsDateString()
  bookingDate?: string

  // Optional status (includes 'inbound' for incoming leads without assigned owner)
  @IsOptional()
  @IsIn(['draft', 'quoted', 'booked', 'in_progress', 'completed', 'cancelled', 'inbound'])
  status?: 'draft' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled' | 'inbound'

  // Optional associations
  @IsOptional()
  @IsUUID()
  primaryContactId?: string

  // Optional references
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalReference?: string

  // Optional financial
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedTotalCost?: number

  // Optional metadata
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  tags?: string[]

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>

  // Phase 3.5: Date/Time Management
  @IsOptional()
  @IsTimezone()
  timezone?: string

  // Commission fee rate override (null = use agency default)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  commissionFeeRateOverride?: number | null

  // Calendar display mode
  @IsOptional()
  @IsIn(['trip', 'activities'])
  calendarDisplayMode?: 'trip' | 'activities'

  // Optional group association
  @IsOptional()
  @IsUUID()
  tripGroupId?: string
}
