import { IsOptional, IsString, IsUUID, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class EmailFilterDto {
  @IsOptional()
  @IsString()
  folder?: string

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
