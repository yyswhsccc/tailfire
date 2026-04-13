import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator'

export class EmailAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string

  @IsString()
  storagePath!: string // R2 storage path — NOT a URL (prevents SSRF)

  @IsOptional()
  @IsString()
  contentType?: string

  @IsOptional()
  @IsNumber()
  size?: number
}
