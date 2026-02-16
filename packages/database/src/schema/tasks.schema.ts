/**
 * Task System Schema
 *
 * Defines the database schema for task management and calendar integration.
 * Tasks can be linked to trips, contacts, and activities with full RBAC support.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  boolean,
  timestamp,
  pgEnum,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'
import { trips } from './trips.schema'
import { contacts } from './contacts.schema'
import { itineraryActivities } from './activities.schema'
import { tags } from './tags.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
])

export const taskPriorityEnum = pgEnum('task_priority', [
  'low',
  'medium',
  'high',
  'urgent',
])

export const taskTypeEnum = pgEnum('task_type', [
  'manual',
  'automatic',
  'reminder',
  'milestone',
])

export const taskAssigneeTypeEnum = pgEnum('task_assignee_type', [
  'user',
  'contact',
  'admin_pool',
])

// ============================================================================
// TYPES
// ============================================================================

export type TaskStatus = (typeof taskStatusEnum.enumValues)[number]
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number]
export type TaskType = (typeof taskTypeEnum.enumValues)[number]
export type TaskAssigneeType = (typeof taskAssigneeTypeEnum.enumValues)[number]

/**
 * Recurring configuration for tasks
 * Compatible with RRULE format for calendar integration
 */
export interface TaskRecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  daysOfWeek?: number[] // 0=Sunday, 1=Monday, etc.
  dayOfMonth?: number
  monthOfYear?: number
  endDate?: string // ISO date
  count?: number // Max occurrences
}

/**
 * Notification configuration for task reminders
 */
export interface TaskNotificationConfig {
  reminders?: Array<{
    value: number
    unit: 'minute' | 'hour' | 'day' | 'week'
  }>
  notifyAssignee?: boolean
  notifyOwner?: boolean
}

// ============================================================================
// TABLE: tasks
// ============================================================================

export const tasks = pgTable('tasks', {
  // Primary key
  id: uuid('id').primaryKey().defaultRandom(),

  // Agency (multi-tenancy)
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'cascade' }),

  // Core fields
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('pending'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  taskType: taskTypeEnum('task_type').notNull().default('manual'),

  // Dates
  dueDate: date('due_date'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  startDate: date('start_date'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by').references(() => userProfiles.id, {
    onDelete: 'set null',
  }),

  // Relationships
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
  contactId: uuid('contact_id').references(() => contacts.id, {
    onDelete: 'set null',
  }),
  activityId: uuid('activity_id').references(() => itineraryActivities.id, {
    onDelete: 'set null',
  }),

  // Assignment (explicit FKs)
  assigneeType: taskAssigneeTypeEnum('assignee_type').notNull().default('user'),
  assigneeUserId: uuid('assignee_user_id').references(() => userProfiles.id, {
    onDelete: 'set null',
  }),
  assigneeContactId: uuid('assignee_contact_id').references(() => contacts.id, {
    onDelete: 'set null',
  }),
  assigneeName: varchar('assignee_name', { length: 255 }),

  // Hierarchy (self-referential FK for subtasks)
  parentTaskId: uuid('parent_task_id').references((): any => tasks.id, {
    onDelete: 'cascade',
  }),

  // Calendar display
  isVisibleInCalendar: boolean('is_visible_in_calendar').default(true),
  colorOverride: varchar('color_override', { length: 7 }),

  // Recurring config (JSONB)
  recurringConfig: jsonb('recurring_config').$type<TaskRecurringConfig>(),

  // Notification config (JSONB)
  notificationConfig: jsonb('notification_config').$type<TaskNotificationConfig>(),

  // Ownership (for RBAC)
  ownerId: uuid('owner_id').references(() => userProfiles.id, {
    onDelete: 'set null',
  }),

  // Audit fields
  createdBy: uuid('created_by')
    .notNull()
    .references(() => userProfiles.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ============================================================================
// TABLE: task_tags
// ============================================================================

export const taskTags = pgTable('task_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ============================================================================
// TABLE: task_comments
// ============================================================================

export const taskComments = pgTable('task_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => userProfiles.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false).notNull(),
  mentions: uuid('mentions').array(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ============================================================================
// TABLE: task_templates
// ============================================================================

/**
 * Default values for task templates
 */
export interface TaskTemplateDefaults {
  priority?: TaskPriority
  status?: TaskStatus
  taskType?: TaskType
  isVisibleInCalendar?: boolean
  colorOverride?: string
  recurringConfig?: TaskRecurringConfig
  notificationConfig?: TaskNotificationConfig
}

/**
 * Subtask template definition
 */
export interface SubtaskTemplate {
  title: string
  description?: string
  priority?: TaskPriority
  dueDaysOffset?: number // Days after parent task due date
}

export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  templateType: varchar('template_type', { length: 50 }).notNull(), // 'trip', 'activity', 'contact', 'general'
  category: varchar('category', { length: 100 }),
  defaultValues: jsonb('default_values')
    .$type<TaskTemplateDefaults>()
    .notNull()
    .default({}),
  subtasks: jsonb('subtasks').$type<SubtaskTemplate[]>(),
  isActive: boolean('is_active').default(true).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ============================================================================
// TABLE: task_notification_pending
// ============================================================================

export const taskNotificationPending = pgTable('task_notification_pending', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'assigned' | 'removed'
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// ============================================================================
// RELATIONS
// ============================================================================

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  agency: one(agencies, {
    fields: [tasks.agencyId],
    references: [agencies.id],
  }),
  trip: one(trips, {
    fields: [tasks.tripId],
    references: [trips.id],
  }),
  contact: one(contacts, {
    fields: [tasks.contactId],
    references: [contacts.id],
  }),
  activity: one(itineraryActivities, {
    fields: [tasks.activityId],
    references: [itineraryActivities.id],
  }),
  assigneeUser: one(userProfiles, {
    fields: [tasks.assigneeUserId],
    references: [userProfiles.id],
    relationName: 'assigneeUser',
  }),
  assigneeContact: one(contacts, {
    fields: [tasks.assigneeContactId],
    references: [contacts.id],
    relationName: 'assigneeContact',
  }),
  owner: one(userProfiles, {
    fields: [tasks.ownerId],
    references: [userProfiles.id],
    relationName: 'taskOwner',
  }),
  createdByUser: one(userProfiles, {
    fields: [tasks.createdBy],
    references: [userProfiles.id],
    relationName: 'taskCreator',
  }),
  completedByUser: one(userProfiles, {
    fields: [tasks.completedBy],
    references: [userProfiles.id],
    relationName: 'taskCompleter',
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'subtasks',
  }),
  subtasks: many(tasks, {
    relationName: 'subtasks',
  }),
  tags: many(taskTags),
  comments: many(taskComments),
}))

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, {
    fields: [taskTags.taskId],
    references: [tasks.id],
  }),
  tag: one(tags, {
    fields: [taskTags.tagId],
    references: [tags.id],
  }),
}))

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
  user: one(userProfiles, {
    fields: [taskComments.userId],
    references: [userProfiles.id],
  }),
}))

export const taskTemplatesRelations = relations(taskTemplates, ({ one }) => ({
  agency: one(agencies, {
    fields: [taskTemplates.agencyId],
    references: [agencies.id],
  }),
}))

export const taskNotificationPendingRelations = relations(taskNotificationPending, ({ one }) => ({
  agency: one(agencies, {
    fields: [taskNotificationPending.agencyId],
    references: [agencies.id],
  }),
  task: one(tasks, {
    fields: [taskNotificationPending.taskId],
    references: [tasks.id],
  }),
  contact: one(contacts, {
    fields: [taskNotificationPending.contactId],
    references: [contacts.id],
  }),
}))
