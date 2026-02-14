import {
  IsOptional,
  IsArray,
  IsEnum,
  IsUUID,
  IsDateString,
} from 'class-validator'
import { Transform } from 'class-transformer'

export class CalendarQueryDto {
  @IsDateString()
  start!: string

  @IsDateString()
  end!: string

  @IsOptional()
  @IsArray()
  @IsEnum(
    ['task', 'payment_deposit', 'payment_final', 'birthday', 'trip', 'scheduled_email'],
    { each: true }
  )
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  types?: (
    | 'task'
    | 'payment_deposit'
    | 'payment_final'
    | 'birthday'
    | 'trip'
    | 'scheduled_email'
  )[]

  @IsOptional()
  @IsUUID()
  userId?: string

  @IsOptional()
  @IsUUID()
  tripId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string
}

export class DateRangeQueryDto {
  @IsDateString()
  start!: string

  @IsDateString()
  end!: string
}
