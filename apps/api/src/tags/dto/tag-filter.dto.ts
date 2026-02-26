/**
 * TagFilterDto with runtime validation
 */

import { IsString, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class TagFilterDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsIn(['system', 'agent'])
  type?: 'system' | 'agent'

  @IsOptional()
  @IsIn(['name', 'usageCount', 'createdAt'])
  sortBy?: 'name' | 'usageCount' | 'createdAt'

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number
}
