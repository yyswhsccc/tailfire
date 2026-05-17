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

import { IsOptional, IsUUID, IsIn, Matches, IsDefined, IsString, MaxLength, IsInt, Min } from 'class-validator'
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

/**
 * DTO for cancelling a booked activity (#452).
 *
 * Cancellation is the only valid path away from `booked` when payments or a
 * confirmation number exist. The plain unmark endpoint will 409 in that case
 * and route the caller here. All three required fields mirror the DB-level
 * CHECK constraint `chk_cancellation_requires_metadata`.
 */
export class CancelActivityBookingDto {
  @ApiProperty({
    description: 'Free-text reason for the cancellation (shown in audit log and notifications)',
    example: 'Client requested change of date; supplier accepted within 24h policy.',
  })
  @IsString()
  @MaxLength(2000)
  cancellationReason!: string

  @ApiProperty({
    description: 'How recorded payments should be treated post-cancellation',
    enum: ['full_refund_pending', 'partial_refund_pending', 'no_refund', 'supplier_retains'],
  })
  @IsIn(['full_refund_pending', 'partial_refund_pending', 'no_refund', 'supplier_retains'])
  refundDecision!:
    | 'full_refund_pending'
    | 'partial_refund_pending'
    | 'no_refund'
    | 'supplier_retains'

  @ApiPropertyOptional({
    description: 'Refund amount in cents (required when refundDecision = partial_refund_pending)',
    example: 50000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  refundAmountCents?: number

  @ApiPropertyOptional({
    description: 'Internal-only note (not shown to clients)',
    example: 'Supplier ref CXL-2026-117; refund expected in 5-7 business days.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationNotes?: string
}
