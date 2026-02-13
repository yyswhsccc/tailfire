/**
 * Send Booking Confirmation Email DTO
 * Request body for sending booking confirmation email to clients
 */

import {
  IsOptional,
  IsArray,
  IsEmail,
  IsBoolean,
  IsString,
} from 'class-validator'
import { Transform } from 'class-transformer'

export class SendBookingConfirmationDto {
  /**
   * Custom recipient email addresses
   */
  @IsOptional()
  @Transform(({ value }) => (value ? (Array.isArray(value) ? value : [value]) : undefined))
  @IsArray()
  @IsEmail({}, { each: true })
  to?: string[]

  /**
   * Include trip primary contact in recipients (default: true)
   */
  @IsOptional()
  @IsBoolean()
  includePrimaryContact?: boolean

  /**
   * Include trip passengers in recipients
   */
  @IsOptional()
  @IsBoolean()
  includePassengers?: boolean

  /**
   * CC the trip agent on the email
   */
  @IsOptional()
  @IsBoolean()
  includeAgent?: boolean

  /**
   * Additional CC recipients
   */
  @IsOptional()
  @Transform(({ value }) => (value ? (Array.isArray(value) ? value : [value]) : undefined))
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[]

  /**
   * Optional custom message to include in email body
   */
  @IsOptional()
  @IsString()
  message?: string
}
