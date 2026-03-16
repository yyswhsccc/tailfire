import { IsEmail, IsString, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator'
import { IsValidEmailHost } from '../../common/validators/is-valid-email-host.validator'

export class CreateEmailAccountDto {
  @IsEmail()
  emailAddress!: string

  @IsOptional()
  @IsString()
  displayName?: string

  @IsString()
  @IsValidEmailHost()
  imapHost!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort?: number

  @IsOptional()
  @IsBoolean()
  imapTls?: boolean

  @IsString()
  @IsValidEmailHost()
  smtpHost!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number

  @IsOptional()
  @IsBoolean()
  smtpTls?: boolean

  @IsString()
  username!: string

  @IsString()
  password!: string
}
