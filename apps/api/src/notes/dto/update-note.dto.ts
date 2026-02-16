import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator'

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean
}
