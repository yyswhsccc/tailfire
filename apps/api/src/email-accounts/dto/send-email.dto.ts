import { IsArray, IsEmail, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { EmailAttachmentDto } from './email-attachment.dto'

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAttachmentDto)
  attachments?: EmailAttachmentDto[]
}
