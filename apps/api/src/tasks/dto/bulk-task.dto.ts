import {
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

class BulkTaskPayloadDto {
  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed', 'cancelled'])
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent'

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string
}

export class BulkTaskOperationDto {
  @IsArray()
  @IsUUID('4', { each: true })
  taskIds!: string[]

  @IsEnum(['complete', 'delete', 'update_status', 'update_priority', 'assign'])
  operation!: 'complete' | 'delete' | 'update_status' | 'update_priority' | 'assign'

  @IsOptional()
  @ValidateNested()
  @Type(() => BulkTaskPayloadDto)
  payload?: BulkTaskPayloadDto
}

export class CompleteTaskDto {
  @IsOptional()
  completedAt?: string

  @IsOptional()
  note?: string
}
