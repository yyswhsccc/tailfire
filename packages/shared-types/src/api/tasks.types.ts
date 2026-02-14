/**
 * Task System API Types
 *
 * Types for task management including CRUD operations,
 * filtering, and task templates.
 */

import type { BaseFilterDto, BulkOperationResult } from './common.types.js'

// ============================================================================
// ENUMS
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TaskType = 'manual' | 'automatic' | 'reminder' | 'milestone'

// ============================================================================
// RECURRING CONFIG
// ============================================================================

export interface TaskRecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  daysOfWeek?: number[] // 0=Sunday, 1=Monday, etc.
  dayOfMonth?: number
  monthOfYear?: number
  endDate?: string // ISO date
  count?: number // Max occurrences
}

// ============================================================================
// NOTIFICATION CONFIG
// ============================================================================

export interface TaskNotificationConfig {
  reminders?: Array<{
    value: number
    unit: 'minute' | 'hour' | 'day' | 'week'
  }>
  notifyAssignee?: boolean
  notifyOwner?: boolean
}

// ============================================================================
// CREATE/UPDATE DTOs
// ============================================================================

export interface CreateTaskDto {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  taskType?: TaskType

  // Dates
  dueDate?: string // ISO date (YYYY-MM-DD)
  dueAt?: string // ISO datetime with timezone
  startDate?: string // ISO date

  // Relationships
  tripId?: string
  contactId?: string
  activityId?: string

  // Assignment
  assigneeUserId?: string
  assigneeContactId?: string
  assigneeName?: string

  // Hierarchy
  parentTaskId?: string

  // Calendar display
  isVisibleInCalendar?: boolean
  colorOverride?: string

  // Recurring
  recurringConfig?: TaskRecurringConfig

  // Notifications
  notificationConfig?: TaskNotificationConfig

  // Tags
  tagIds?: string[]

  // Ownership
  ownerId?: string
}

export interface UpdateTaskDto extends Partial<CreateTaskDto> {
  // Completion
  completedAt?: string
  completedBy?: string
}

// ============================================================================
// FILTER DTOs
// ============================================================================

export interface TaskFilterDto extends BaseFilterDto {
  status?: TaskStatus | TaskStatus[]
  priority?: TaskPriority | TaskPriority[]
  taskType?: TaskType | TaskType[]
  assigneeUserId?: string
  tripId?: string
  contactId?: string
  activityId?: string
  parentTaskId?: string
  dueDateFrom?: string // ISO date
  dueDateTo?: string // ISO date
  isOverdue?: boolean
  isVisibleInCalendar?: boolean
  tagIds?: string[]
  includeDeleted?: boolean
  includeSubtasks?: boolean
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export interface TaskAssigneeDto {
  userId?: string
  contactId?: string
  name: string
  avatarUrl?: string
}

export interface TaskTagDto {
  id: string
  name: string
  color?: string
}

export interface TaskCommentDto {
  id: string
  content: string
  isInternal: boolean
  mentions?: string[]
  user: {
    id: string
    firstName?: string
    lastName?: string
    avatarUrl?: string
  }
  createdAt: string
  updatedAt: string
}

export interface TaskResponseDto {
  id: string
  agencyId: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  taskType: TaskType

  // Dates
  dueDate?: string
  dueAt?: string
  startDate?: string
  completedAt?: string
  completedBy?: string

  // Relationships
  tripId?: string
  contactId?: string
  activityId?: string

  // Related entities (expanded)
  trip?: {
    id: string
    name: string
    referenceNumber?: string
  }
  contact?: {
    id: string
    firstName?: string
    lastName?: string
    email?: string
  }
  activity?: {
    id: string
    title: string
    activityType: string
  }

  // Assignment
  assignee?: TaskAssigneeDto
  assigneeUserId?: string
  assigneeContactId?: string
  assigneeName?: string

  // Hierarchy
  parentTaskId?: string
  subtaskCount?: number

  // Calendar display
  isVisibleInCalendar: boolean
  colorOverride?: string

  // Configs
  recurringConfig?: TaskRecurringConfig
  notificationConfig?: TaskNotificationConfig

  // Tags
  tags?: TaskTagDto[]

  // Ownership
  ownerId?: string
  owner?: {
    id: string
    firstName?: string
    lastName?: string
  }

  // Audit
  createdBy: string
  createdByUser?: {
    id: string
    firstName?: string
    lastName?: string
  }
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  deletedAt?: string
}

export interface PaginatedTasksResponseDto {
  data: TaskResponseDto[]
  count: number
  page: number
  limit: number
  totalPages: number
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export interface BulkTaskOperationDto {
  taskIds: string[]
  operation: 'complete' | 'delete' | 'update_status' | 'update_priority' | 'assign'
  payload?: {
    status?: TaskStatus
    priority?: TaskPriority
    assigneeUserId?: string
  }
}

export interface BulkTaskResultDto extends BulkOperationResult {
  tasks?: TaskResponseDto[]
}

// ============================================================================
// COMPLETE TASK
// ============================================================================

export interface CompleteTaskDto {
  completedAt?: string // Defaults to now
  note?: string // Optional completion note
}

// ============================================================================
// TASK TEMPLATES
// ============================================================================

export interface TaskTemplateDefaultsDto {
  priority?: TaskPriority
  status?: TaskStatus
  taskType?: TaskType
  isVisibleInCalendar?: boolean
  colorOverride?: string
  recurringConfig?: TaskRecurringConfig
  notificationConfig?: TaskNotificationConfig
}

export interface SubtaskTemplateDto {
  title: string
  description?: string
  priority?: TaskPriority
  dueDaysOffset?: number
}

export interface CreateTaskTemplateDto {
  name: string
  description?: string
  templateType: 'trip' | 'activity' | 'contact' | 'general'
  category?: string
  defaultValues?: TaskTemplateDefaultsDto
  subtasks?: SubtaskTemplateDto[]
}

export interface UpdateTaskTemplateDto extends Partial<CreateTaskTemplateDto> {
  isActive?: boolean
}

export interface TaskTemplateResponseDto {
  id: string
  agencyId: string
  name: string
  description?: string
  templateType: string
  category?: string
  defaultValues: TaskTemplateDefaultsDto
  subtasks?: SubtaskTemplateDto[]
  isActive: boolean
  isSystem: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateFromTemplateDto {
  templateId: string
  title?: string // Override template title
  dueDate?: string
  tripId?: string
  contactId?: string
  activityId?: string
  assigneeUserId?: string
  createSubtasks?: boolean // Default true
}

// ============================================================================
// TASK COMMENTS
// ============================================================================

export interface CreateTaskCommentDto {
  content: string
  isInternal?: boolean
  mentions?: string[]
}

export interface UpdateTaskCommentDto {
  content: string
}
