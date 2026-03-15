import { IsArray, IsEmail, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class EmailAddressInput {
  @IsEmail()
  address!: string

  @IsOptional()
  @IsString()
  name?: string
}

export class SendEmailDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAddressInput)
  to!: EmailAddressInput[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAddressInput)
  cc?: EmailAddressInput[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAddressInput)
  bcc?: EmailAddressInput[]

  @IsString()
  subject!: string

  @IsString()
  bodyHtml!: string

  @IsOptional()
  @IsUUID()
  inReplyToEmailId?: string
}
