/**
 * CreateActivityResponseDto with runtime validation
 */

import { IsString, IsOptional, IsUUID, IsIn, MaxLength } from 'class-validator'

export class CreateActivityResponseDto {
  @IsOptional()
  @IsUUID()
  itineraryId?: string

  @IsUUID()
  activityId!: string

  @IsIn(['confirmed', 'declined'])
  response!: 'confirmed' | 'declined'

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string
}
