import { IsString, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator'

export class UpdateEmailAccountDto {
  @IsOptional()
  @IsString()
  displayName?: string

  @IsOptional()
  @IsString()
  imapHost?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort?: number

  @IsOptional()
  @IsBoolean()
  imapTls?: boolean

  @IsOptional()
  @IsString()
  smtpHost?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number

  @IsOptional()
  @IsBoolean()
  smtpTls?: boolean

  @IsOptional()
  @IsString()
  username?: string

  @IsOptional()
  @IsString()
  password?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
