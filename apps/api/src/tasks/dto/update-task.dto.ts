import { PartialType } from '@nestjs/mapped-types'
import { IsOptional, IsDateString, IsUUID } from 'class-validator'
import { CreateTaskDto } from './create-task.dto'

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsOptional()
  @IsDateString()
  completedAt?: string

  @IsOptional()
  @IsUUID()
  completedBy?: string
}
