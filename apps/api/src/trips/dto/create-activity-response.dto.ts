/**
 * CreateActivityResponseDto with runtime validation
 */

import { IsString, IsOptional, IsUUID, IsIn, MaxLength } from 'class-validator'

export class CreateActivityResponseDto {
  @IsUUID()
  activityId!: string

  @IsIn(['confirmed', 'declined'])
  response!: 'confirmed' | 'declined'

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string
}
