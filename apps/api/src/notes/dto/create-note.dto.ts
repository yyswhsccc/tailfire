import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator'

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  content!: string

  @IsOptional()
  @IsUUID()
  @ValidateIf((o) => !o.contactId)
  tripId?: string

  @IsOptional()
  @IsUUID()
  @ValidateIf((o) => !o.tripId)
  contactId?: string

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean
}
