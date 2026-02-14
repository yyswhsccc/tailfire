import {
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsUUID,
  IsArray,
  IsString,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class TaskFilterDto {
  @IsOptional()
  @Type(() => Number)
  page?: number

  @IsOptional()
  @Type(() => Number)
  limit?: number

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  sortBy?: string

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'

  @IsOptional()
  @IsArray()
  @IsEnum(['pending', 'in_progress', 'completed', 'cancelled'], { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  status?: ('pending' | 'in_progress' | 'completed' | 'cancelled')[]

  @IsOptional()
  @IsArray()
  @IsEnum(['low', 'medium', 'high', 'urgent'], { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  priority?: ('low' | 'medium' | 'high' | 'urgent')[]

  @IsOptional()
  @IsArray()
  @IsEnum(['manual', 'automatic', 'reminder', 'milestone'], { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  taskType?: ('manual' | 'automatic' | 'reminder' | 'milestone')[]

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string

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
  parentTaskId?: string

  @IsOptional()
  @IsDateString()
  dueDateFrom?: string

  @IsOptional()
  @IsDateString()
  dueDateTo?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isOverdue?: boolean

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isVisibleInCalendar?: boolean

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  tagIds?: string[]

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeDeleted?: boolean

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeSubtasks?: boolean
}
