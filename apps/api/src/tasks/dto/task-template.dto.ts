import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
  IsObject,
  IsNumber,
} from 'class-validator'
import { Type } from 'class-transformer'
import { TaskRecurringConfigDto, TaskNotificationConfigDto } from './create-task.dto'

export class TaskTemplateDefaultsDto {
  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent'

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed', 'cancelled'])
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'

  @IsOptional()
  @IsEnum(['manual', 'automatic', 'reminder', 'milestone'])
  taskType?: 'manual' | 'automatic' | 'reminder' | 'milestone'

  @IsOptional()
  @IsBoolean()
  isVisibleInCalendar?: boolean

  @IsOptional()
  @IsString()
  colorOverride?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskRecurringConfigDto)
  recurringConfig?: TaskRecurringConfigDto

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskNotificationConfigDto)
  notificationConfig?: TaskNotificationConfigDto
}

export class SubtaskTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent'

  @IsOptional()
  @IsNumber()
  dueDaysOffset?: number
}

export class CreateTaskTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsEnum(['trip', 'activity', 'contact', 'general'])
  templateType!: 'trip' | 'activity' | 'contact' | 'general'

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TaskTemplateDefaultsDto)
  defaultValues?: TaskTemplateDefaultsDto

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtaskTemplateDto)
  subtasks?: SubtaskTemplateDto[]
}

export class UpdateTaskTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(['trip', 'activity', 'contact', 'general'])
  templateType?: 'trip' | 'activity' | 'contact' | 'general'

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TaskTemplateDefaultsDto)
  defaultValues?: TaskTemplateDefaultsDto

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtaskTemplateDto)
  subtasks?: SubtaskTemplateDto[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class CreateFromTemplateDto {
  @IsUUID()
  templateId!: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string

  @IsOptional()
  @IsString()
  dueDate?: string

  @IsOptional()
  @IsUUID()
  tripId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsUUID()
  activityId?: string

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string

  @IsOptional()
  @IsBoolean()
  createSubtasks?: boolean
}
