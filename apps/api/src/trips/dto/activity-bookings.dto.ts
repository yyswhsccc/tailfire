/**
 * Activity Bookings DTOs
 *
 * DTOs for the /bookings/activities endpoints that manage activity booking status.
 *
 * Key Distinction:
 * - Activity = Core entity (tour, flight, dining, transportation, custom-cruise, package, etc.)
 * - Package = An activity type that holds sub-activities
 * - Booking = A status applied to an activity (bookingStatus field + bookingDate)
 */

import { IsOptional, IsUUID, IsIn, Matches, IsDefined } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * DTO for marking an activity as booked
 */
export class MarkActivityBookedDto {
  @ApiPropertyOptional({
    description: 'Date when the booking was confirmed (YYYY-MM-DD format, defaults to today)',
    example: '2024-12-18',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'bookingDate must be YYYY-MM-DD format',
  })
  bookingDate?: string
}

/**
 * DTO for filtering activity bookings list
 */
export class ActivityBookingsFilterDto {
  @ApiProperty({
    description: 'Trip ID - required for scoping',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsDefined({ message: 'tripId is required for scoping' })
  @IsUUID()
  tripId!: string

  @ApiPropertyOptional({
    description: 'Filter by specific itinerary',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  itineraryId?: string

  @ApiPropertyOptional({
    description: 'Filter by booking status (defaults to booked)',
    example: 'booked',
    enum: ['unbooked', 'booked', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['unbooked', 'booked', 'cancelled'])
  bookingStatus?: 'unbooked' | 'booked' | 'cancelled'
}
