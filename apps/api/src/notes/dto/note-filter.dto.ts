import { IsOptional, IsUUID, IsString } from 'class-validator'
import { Type } from 'class-transformer'

export class NoteFilterDto {
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
  tripId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string
}
