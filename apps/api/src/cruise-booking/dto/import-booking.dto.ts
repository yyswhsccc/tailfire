/**
 * Import Booking DTOs
 *
 * Request DTOs for importing existing cruise bookings from cruise line systems
 * via Traveltek's cruiseimportbooking.pl endpoint.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsOptional,
  IsInt,
  IsString,
  IsNotEmpty,
  IsUUID,
  ValidateIf,
} from 'class-validator'
import { Type } from 'class-transformer'

export class ImportBookingPreviewDto {
  @ApiPropertyOptional({ description: 'Catalog cruise line UUID — resolves to Traveltek lineid' })
  @IsOptional()
  @IsUUID()
  cruiseLineId?: string

  @ApiPropertyOptional({ description: 'Raw Traveltek lineid (fallback when cruiseLineId not available)' })
  @ValidateIf((o) => !o.cruiseLineId)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lineid?: number

  @ApiProperty({ description: 'Booking reference number from the cruise line' })
  @IsString()
  @IsNotEmpty()
  bookingReference!: string

  @ApiPropertyOptional({ description: 'Currency code', default: 'CAD' })
  @IsOptional()
  @IsString()
  currency?: string
}

export class ImportBookingConfirmDto extends ImportBookingPreviewDto {
  @ApiPropertyOptional({ description: 'Custom trip name (defaults to cruise name)' })
  @IsOptional()
  @IsString()
  tripName?: string

  @ApiPropertyOptional({ description: 'Add to existing trip instead of creating new' })
  @IsOptional()
  @IsUUID()
  existingTripId?: string

  @ApiPropertyOptional({
    description: 'Map paxno → contactId (UUID to link, null to create new). Omitted paxno falls back to auto-match.',
  })
  @IsOptional()
  contactOverrides?: Record<number, string | null>
}
