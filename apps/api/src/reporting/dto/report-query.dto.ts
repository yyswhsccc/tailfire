import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator'
import { Type } from 'class-transformer'

export class ReportQueryDto {
  @IsDateString()
  startDate!: string

  @IsDateString()
  endDate!: string

  @IsOptional()
  @IsEnum(['my', 'agency'])
  viewScope?: 'my' | 'agency' = 'agency'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number = 50

  @IsOptional()
  @IsString()
  sortBy?: string

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc'

  @IsOptional()
  @IsString()
  agentId?: string

  @IsOptional()
  @IsString()
  supplierName?: string

  @IsOptional()
  @IsString()
  tripType?: string

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  daysThreshold?: number
}

export class ExportReportDto extends ReportQueryDto {
  @IsEnum(['pdf', 'csv'])
  format!: 'pdf' | 'csv'
}
