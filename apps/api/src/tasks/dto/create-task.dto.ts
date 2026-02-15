import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsUUID,
  IsArray,
  MaxLength,
  MinLength,
  ValidateNested,
  IsObject,
  Matches,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator'
import { Type } from 'class-transformer'

export class TaskRecurringConfigDto {
  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'])
  frequency!: 'daily' | 'weekly' | 'monthly' | 'yearly'

  @IsOptional()
  @Type(() => Number)
  interval?: number

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  daysOfWeek?: number[]

  @IsOptional()
  @Type(() => Number)
  dayOfMonth?: number

  @IsOptional()
  @Type(() => Number)
  monthOfYear?: number

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @Type(() => Number)
  count?: number
}

export class TaskReminderDto {
  @Type(() => Number)
  value!: number

  @IsEnum(['minute', 'hour', 'day', 'week'])
  unit!: 'minute' | 'hour' | 'day' | 'week'
}

export class TaskNotificationConfigDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskReminderDto)
  reminders?: TaskReminderDto[]

  @IsOptional()
  @IsBoolean()
  notifyAssignee?: boolean

  @IsOptional()
  @IsBoolean()
  notifyOwner?: boolean
}

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed', 'cancelled'])
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent'

  @IsOptional()
  @IsEnum(['manual', 'automatic', 'reminder', 'milestone'])
  taskType?: 'manual' | 'automatic' | 'reminder' | 'milestone'

  // Dates
  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  // Relationships
  @IsOptional()
  @IsUUID()
  tripId?: string

  @IsOptional()
  @IsUUID()
  contactId?: string

  @IsOptional()
  @IsUUID()
  activityId?: string

  // Assignment
  @IsOptional()
  @IsEnum(['user', 'contact', 'admin_pool'])
  assigneeType?: 'user' | 'contact' | 'admin_pool'

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string

  @ValidateIf((o) => o.assigneeType === 'contact')
  @IsNotEmpty({ message: 'assigneeContactId is required when assigneeType is contact' })
  @IsUUID()
  assigneeContactId?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  assigneeName?: string

  // Hierarchy
  @IsOptional()
  @IsUUID()
  parentTaskId?: string

  // Calendar display
  @IsOptional()
  @IsBoolean()
  isVisibleInCalendar?: boolean

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'colorOverride must be a valid hex color (e.g., #3b82f6)' })
  colorOverride?: string

  // Recurring
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TaskRecurringConfigDto)
  recurringConfig?: TaskRecurringConfigDto

  // Notifications
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TaskNotificationConfigDto)
  notificationConfig?: TaskNotificationConfigDto

  // Tags
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[]

  // Ownership
  @IsOptional()
  @IsUUID()
  ownerId?: string
}
