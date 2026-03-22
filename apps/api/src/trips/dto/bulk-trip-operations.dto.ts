/**
 * Bulk Trip Operations DTOs
 *
 * DTOs for bulk operations on trips with per-item success/failure tracking.
 * All bulk operations are scoped by ownership and enforce business rules.
 */

import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator'
import type { TripStatus } from '@tailfire/shared-types'

/**
 * Result of a bulk operation with per-item tracking
 */
export interface BulkTripOperationResult {
  /** IDs of trips that were successfully processed */
  success: string[]
  /** IDs of trips that failed with their failure reasons */
  failed: Array<{
    id: string
    reason: string
  }>
}

/**
 * DTO for bulk delete operation
 *
 * @example
 * POST /api/trips/bulk-delete
 * { "tripIds": ["uuid-1", "uuid-2", "uuid-3"] }
 */
export class BulkDeleteTripsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one trip ID is required' })
  @ArrayMaxSize(100, { message: 'Cannot delete more than 100 trips at once' })
  @IsUUID('4', { each: true, message: 'Each trip ID must be a valid UUID' })
  tripIds!: string[]
}

/**
 * DTO for bulk archive/unarchive operation
 *
 * @example
 * POST /api/trips/bulk-archive
 * { "tripIds": ["uuid-1", "uuid-2"], "archive": true }
 */
export class BulkArchiveTripsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one trip ID is required' })
  @ArrayMaxSize(100, { message: 'Cannot archive more than 100 trips at once' })
  @IsUUID('4', { each: true, message: 'Each trip ID must be a valid UUID' })
  tripIds!: string[]

  @IsBoolean()
  @IsNotEmpty({ message: 'archive flag is required (true to archive, false to unarchive)' })
  archive!: boolean
}

/**
 * Valid trip statuses for bulk status change (includes inbound for incoming leads)
 */
const VALID_TRIP_STATUSES = ['inbound', 'planning', 'active', 'travelling', 'travelled', 'cancelled'] as const

/**
 * DTO for bulk status change operation
 *
 * @example
 * POST /api/trips/bulk-status
 * { "tripIds": ["uuid-1", "uuid-2"], "status": "quoted" }
 */
export class BulkChangeStatusDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one trip ID is required' })
  @ArrayMaxSize(100, { message: 'Cannot update more than 100 trips at once' })
  @IsUUID('4', { each: true, message: 'Each trip ID must be a valid UUID' })
  tripIds!: string[]

  @IsString()
  @IsNotEmpty({ message: 'status is required' })
  @IsEnum(VALID_TRIP_STATUSES, {
    message: 'status must be one of: inbound, planning, active, travelling, travelled, cancelled',
  })
  status!: TripStatus
}

/**
 * Response DTO for filter options endpoint
 *
 * @example
 * GET /api/trips/filter-options
 */
export interface TripFilterOptionsResponseDto {
  /** All valid trip statuses */
  statuses: TripStatus[]
  /** All valid trip types */
  tripTypes: string[]
  /** Distinct tags from user's trips */
  tags: string[]
}
