import { IsString, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator'
import { IsValidEmailHost } from '../../common/validators/is-valid-email-host.validator'

export class UpdateEmailAccountDto {
  @IsOptional()
  @IsString()
  displayName?: string

  @IsOptional()
  @IsString()
  @IsValidEmailHost()
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
  @IsValidEmailHost()
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
