/**
 * Deal Search DTO
 *
 * Query params for public deal listing with pagination.
 */

import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class DealSearchDto {
  @IsOptional()
  @IsString()
  productType?: string

  @IsOptional()
  @IsString()
  destination?: string

  @IsOptional()
  @IsString()
  supplier?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20
}
