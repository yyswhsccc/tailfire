import { IsEmail, IsString, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator'

export class CreateEmailAccountDto {
  @IsEmail()
  emailAddress!: string

  @IsOptional()
  @IsString()
  displayName?: string

  @IsString()
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
