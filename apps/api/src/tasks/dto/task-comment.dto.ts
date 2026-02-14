import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  MinLength,
} from 'class-validator'

export class CreateTaskCommentDto {
  @IsString()
  @MinLength(1)
  content!: string

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentions?: string[]
}

export class UpdateTaskCommentDto {
  @IsString()
  @MinLength(1)
  content!: string
}
