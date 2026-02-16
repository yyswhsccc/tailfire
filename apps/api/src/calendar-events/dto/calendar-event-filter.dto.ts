import { IsOptional, IsUUID, IsString, IsBoolean } from 'class-validator'
import { Type, Transform } from 'class-transformer'

export class CalendarEventFilterDto {
  @IsOptional()
  @Type(() => Number)
  page?: number

  @IsOptional()
  @Type(() => Number)
  limit?: number

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsUUID()
  tripId?: string

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  upcoming?: boolean
}
