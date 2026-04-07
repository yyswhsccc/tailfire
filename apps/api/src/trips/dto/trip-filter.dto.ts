/**
 * TripFilterDto with runtime validation for query parameters
 */

import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsInt,
  IsDateString,
  IsUUID,
  Min,
  Max,
  IsIn,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'

export class TripFilterDto {
  // Pagination
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  // Search
  @IsOptional()
  @IsString()
  search?: string

  // Filters
  @IsOptional()
  @IsIn(['inbound', 'planning', 'active', 'travelling', 'travelled', 'cancelled'])
  status?: 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'

  @IsOptional()
  @IsIn(['leisure', 'business', 'group', 'honeymoon', 'corporate', 'custom'])
  tripType?: 'leisure' | 'business' | 'group' | 'honeymoon' | 'corporate' | 'custom'

  @IsOptional()
  @IsUUID()
  ownerId?: string

  @IsOptional()
  @IsUUID()
  primaryContactId?: string

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isArchived?: boolean

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPublished?: boolean

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDeleted?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim())
    }
    return value
  })
  tags?: string[]

  @IsOptional()
  @IsUUID()
  tripGroupId?: string

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  ungrouped?: boolean

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean

  @IsOptional()
  @IsString()
  @IsIn(['yes', 'no'])
  hasBookings?: 'yes' | 'no'

  // Date filters
  @IsOptional()
  @IsDateString()
  startDateFrom?: string

  @IsOptional()
  @IsDateString()
  startDateTo?: string

  @IsOptional()
  @IsDateString()
  endDateFrom?: string

  @IsOptional()
  @IsDateString()
  endDateTo?: string

  @IsOptional()
  @IsString()
  createdAtFrom?: string

  @IsOptional()
  @IsString()
  createdAtTo?: string

  // Sorting
  @IsOptional()
  @IsIn(['name', 'startDate', 'endDate', 'status', 'createdAt', 'updatedAt'])
  sortBy?: 'name' | 'startDate' | 'endDate' | 'status' | 'createdAt' | 'updatedAt'

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'
}
