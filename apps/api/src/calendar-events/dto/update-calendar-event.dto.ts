import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  MinLength,
  IsISO8601,
} from 'class-validator'

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsISO8601()
  startAt?: string

  @IsOptional()
  @IsISO8601()
  endAt?: string

  @IsOptional()
  @IsBoolean()
  allDay?: boolean

  @IsOptional()
  @IsString()
  @IsIn(['meeting', 'call', 'follow_up', 'appointment', 'other'])
  eventType?: string
}
