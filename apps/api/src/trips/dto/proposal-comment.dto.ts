/**
 * Proposal Comment DTO with runtime validation
 */

import { IsString, IsOptional, IsUUID, MaxLength, MinLength } from 'class-validator'

export class CreateProposalCommentDto {
  @IsOptional()
  @IsUUID()
  itineraryId?: string

  @IsOptional()
  @IsUUID()
  activityId?: string

  @IsOptional()
  @IsUUID()
  dayId?: string

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string
}
