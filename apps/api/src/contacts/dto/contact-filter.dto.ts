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
  @Max(500)
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

  // Scope: 'mine' = owned + full shares, 'all' = agency-wide
  @IsOptional()
  @IsString()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all'

  // Sorting
  @IsOptional()
  @IsIn([
    'firstName',
    'lastName',
    'email',
    'contactType',
    'contactStatus',
    'dateOfBirth',
    'createdAt',
    'updatedAt',
  ])
  sortBy?: 'firstName' | 'lastName' | 'email' | 'contactType' | 'contactStatus' | 'dateOfBirth' | 'createdAt' | 'updatedAt'

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'
}
