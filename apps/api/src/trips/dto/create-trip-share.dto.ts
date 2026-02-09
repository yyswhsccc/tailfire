/**
 * Trip Share DTOs
 *
 * Validation DTOs for trip share endpoints.
 * Uses class-validator for runtime validation to return 400 errors instead of 500s.
 */

import { IsUUID, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * DTO for creating a trip share
 */
export class CreateTripShareDto {
  @IsUUID()
  sharedWithUserId!: string

  @IsOptional()
  @IsIn(['read', 'write'])
  accessLevel?: 'read' | 'write'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}

/**
 * DTO for updating a trip share
 */
export class UpdateTripShareDto {
  @IsOptional()
  @IsIn(['read', 'write'])
  accessLevel?: 'read' | 'write'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}
