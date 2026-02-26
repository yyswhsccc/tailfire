/**
 * CreateTagDto with runtime validation
 */

import {
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator'

export class CreateTagDto {
  // Required fields
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string

  // Optional fields
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid hex color (e.g., #8B5CF6)',
  })
  color?: string

  @IsOptional()
  @IsIn(['system', 'agent'])
  type?: 'system' | 'agent'
}
