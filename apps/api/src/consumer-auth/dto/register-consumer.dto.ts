/**
 * Register Consumer DTO
 *
 * Validates incoming data for consumer portal registration.
 * Email is required; all other fields are optional for progressive identity.
 */

import { IsEmail, IsOptional, IsString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterConsumerDto {
  @ApiProperty({ description: 'Consumer email address', example: 'jane@example.com' })
  @IsEmail()
  email!: string

  @ApiPropertyOptional({ description: 'First name', example: 'Jane' })
  @IsOptional()
  @IsString()
  firstName?: string

  @ApiPropertyOptional({ description: 'Last name', example: 'Smith' })
  @IsOptional()
  @IsString()
  lastName?: string

  @ApiPropertyOptional({ description: 'Anonymous session ID from progressive identity', example: 'sess_abc123' })
  @IsOptional()
  @IsString()
  sessionId?: string

  @ApiPropertyOptional({ description: 'Advisor slug for attribution', example: 'jane-doe' })
  @IsOptional()
  @IsString()
  advisorSlug?: string

  @ApiPropertyOptional({ description: 'URL to redirect after magic link verification', example: 'https://ota.phoenixvoyages.ca/dashboard' })
  @IsOptional()
  @IsString()
  redirectTo?: string
}
