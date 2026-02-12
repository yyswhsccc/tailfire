/**
 * Test Email DTO
 * Request body for sending a test email using a template with sample data
 */

import { IsEmail, IsOptional } from 'class-validator'

export class SendTestEmailDto {
  @IsOptional()
  @IsEmail()
  recipientEmail?: string
}
