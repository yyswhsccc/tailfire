/**
 * Email Template DTOs
 * Request bodies for creating and updating email templates
 */

import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  MaxLength,
  MinLength,
  ValidateNested,
  Matches,
} from 'class-validator'
import { Type } from 'class-transformer'
import { EMAIL_CATEGORY_VALUES, type EmailCategory } from '@tailfire/shared-types'

class VariableDefinitionDto {
  @IsString()
  @IsNotEmpty()
  key!: string

  @IsString()
  @IsNotEmpty()
  description!: string

  @IsOptional()
  @IsString()
  defaultValue?: string

  @IsOptional()
  @IsString()
  category?: string
}

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens'
  })
  slug!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsString()
  @IsNotEmpty()
  subject!: string

  @IsString()
  @IsNotEmpty()
  bodyHtml!: string

  @IsOptional()
  @IsString()
  bodyText?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariableDefinitionDto)
  variables?: VariableDefinitionDto[]

  @IsOptional()
  @IsIn(EMAIL_CATEGORY_VALUES)
  category?: EmailCategory

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  subject?: string

  @IsOptional()
  @IsString()
  bodyHtml?: string

  @IsOptional()
  @IsString()
  bodyText?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariableDefinitionDto)
  variables?: VariableDefinitionDto[]

  @IsOptional()
  @IsIn(EMAIL_CATEGORY_VALUES)
  category?: EmailCategory

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
