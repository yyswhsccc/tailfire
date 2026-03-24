import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator'

export enum BugReportType {
  BUG = 'bug',
  FEATURE = 'feature',
  QUESTION = 'question',
}

export class CreateBugReportDto {
  @IsString()
  @MaxLength(200)
  title!: string

  @IsString()
  @MaxLength(5000)
  description!: string

  @IsEnum(BugReportType)
  type!: BugReportType

  @IsString()
  @MaxLength(2000)
  pageUrl!: string

  @IsString()
  @MaxLength(500)
  userAgent!: string

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  consoleLogs?: string
}
