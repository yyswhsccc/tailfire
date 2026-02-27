import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class ActivityNoteDto {
  @IsString()
  activityId!: string

  @IsString()
  activityName!: string

  @IsString()
  note!: string
}

export class SubmitFeedbackDto {
  @IsOptional()
  @IsString()
  message?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityNoteDto)
  activityNotes?: ActivityNoteDto[]
}
