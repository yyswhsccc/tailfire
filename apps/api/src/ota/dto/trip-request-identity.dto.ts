/**
 * Trip Request Identity DTO
 *
 * Used when a consumer links their email/identity to a previously
 * anonymous trip request draft.
 */

import { IsEmail, IsOptional, IsString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class LinkIdentityDto {
  @ApiProperty({ description: 'Consumer email address' })
  @IsEmail()
  email!: string

  @ApiPropertyOptional({ description: 'Consumer full name' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Consumer phone number' })
  @IsOptional()
  @IsString()
  phone?: string
}
