/**
 * PublishItineraryBodyDto with runtime validation (Fix D)
 */

import { IsOptional, IsString, MaxLength } from 'class-validator'

export class PublishItineraryBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string
}
