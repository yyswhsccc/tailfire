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
  @ValidateIf((o) => !o.tripId && !o.tripGroupId)
  contactId?: string

  @IsOptional()
  @IsUUID()
  @ValidateIf((o) => !o.tripId && !o.contactId)
  tripGroupId?: string

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean
}
