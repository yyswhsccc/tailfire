/**
 * UpdateTripDto with runtime validation
 */

import { PartialType } from '@nestjs/mapped-types'
import { CreateTripDto } from './create-trip.dto'
import { IsOptional, IsBoolean, IsUUID, ValidateIf } from 'class-validator'

export class UpdateTripDto extends PartialType(CreateTripDto) {
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  tripGroupId?: string | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ownerId?: string | null
}
