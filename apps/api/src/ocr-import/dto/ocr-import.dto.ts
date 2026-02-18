/**
 * OCR Import DTOs
 *
 * Validation DTOs for OCR import endpoints.
 */

import { IsOptional, IsString, IsUUID } from 'class-validator'

export class OcrPreviewDto {
  @IsOptional()
  @IsString()
  documentType?: string

  @IsOptional()
  @IsUUID()
  tripId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string
}

export class OcrConfirmDto {
  @IsUUID()
  jobId!: string

  @IsString()
  documentType!: string

  @IsOptional()
  @IsUUID()
  tripId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsString()
  tripName?: string

  @IsOptional()
  overrides?: Record<string, unknown>

  @IsOptional()
  contactOverrides?: Record<number, string | null>
}
