/**
 * Contact Filter DTO with runtime validation for query parameters
 */

import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'

export class ContactFilterDto {
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
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasPassport?: boolean

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  passportExpiring?: boolean

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
  @IsIn(['lead', 'client'])
  contactType?: 'lead' | 'client'

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((s: string) => s.trim())
    }
    return value
  })
  contactStatus?: string[]

  // Sorting
  @IsOptional()
  @IsIn([
    'firstName',
    'lastName',
    'email',
    'createdAt',
    'updatedAt',
  ])
  sortBy?: 'firstName' | 'lastName' | 'email' | 'createdAt' | 'updatedAt'

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'
}
