/**
 * Contact Share DTOs
 *
 * Validation DTOs for contact share endpoints.
 * Uses class-validator for runtime validation to return 400 errors instead of 500s.
 */

import { IsUUID, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * DTO for creating a contact share
 */
export class CreateContactShareDto {
  @IsUUID()
  sharedWithUserId!: string

  @IsOptional()
  @IsIn(['basic', 'full'])
  accessLevel?: 'basic' | 'full'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}

/**
 * DTO for updating a contact share
 */
export class UpdateContactShareDto {
  @IsOptional()
  @IsIn(['basic', 'full'])
  accessLevel?: 'basic' | 'full'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}
