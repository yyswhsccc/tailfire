import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsIn,
  MinLength,
  IsISO8601,
} from 'class-validator'

export class CreateCalendarEventDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsISO8601()
  startAt!: string

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

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsUUID()
  tripId?: string
}
