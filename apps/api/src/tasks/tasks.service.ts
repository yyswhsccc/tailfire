/**
 * Tasks Service
 *
 * Business logic for Task CRUD operations.
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { eq, and, or, ilike, sql, desc, asc, inArray, gte, lte, isNull, lt } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TaskAccessService } from './task-access.service'
import type {
  CreateTaskDto,
  UpdateTaskDto,
  TaskFilterDto,
  BulkTaskOperationDto,
  CompleteTaskDto,
} from './dto'
import type {
  TaskResponseDto,
  PaginatedTasksResponseDto,
  BulkTaskResultDto,
} from '../../../../packages/shared-types/src/api'
import type { AuthContext } from '../auth/auth.types'

@Injectable()
export class TasksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly accessService: TaskAccessService
  ) {}

  /**
   * Create a new task
   */
  async create(
    dto: CreateTaskDto,
    agencyId: string,
    userId: string
  ): Promise<TaskResponseDto> {
    // Determine assignee type and resolve defaults
    const assigneeType = dto.assigneeType || 'user'
    let assigneeUserId = dto.assigneeUserId
    let assigneeContactId = dto.assigneeContactId
    let assigneeName = dto.assigneeName

    if (assigneeType === 'user') {
      if (!assigneeUserId) assigneeUserId = userId // Default to creating user
      assigneeContactId = undefined // Clear irrelevant contact ID
    } else if (assigneeType === 'contact') {
      assigneeUserId = undefined // Clear irrelevant user ID
    } else if (assigneeType === 'admin_pool') {
      assigneeUserId = undefined
      assigneeContactId = undefined
      assigneeName = undefined
    }
    // Resolve contact name for contact-type assignments
    if (assigneeType === 'contact' && assigneeContactId) {
      const contact = await this.getContact(assigneeContactId)
      if (contact) {
        assigneeName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || assigneeName
      }
    }

    const [task] = await this.db.client
      .insert(this.db.schema.tasks)
      .values({
        agencyId,
        title: dto.title,
        description: dto.description,
        status: dto.status || 'pending',
        priority: dto.priority || 'medium',
        taskType: dto.taskType || 'manual',
        phase: dto.phase,
        dueDate: dto.dueDate,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        startDate: dto.startDate,
        tripId: dto.tripId,
        contactId: dto.contactId,
        activityId: dto.activityId,
        assigneeType,
        assigneeUserId,
        assigneeContactId,
        assigneeName,
        parentTaskId: dto.parentTaskId,
        isVisibleInCalendar: dto.isVisibleInCalendar ?? true,
        colorOverride: dto.colorOverride,
        recurringConfig: dto.recurringConfig,
        notificationConfig: dto.notificationConfig,
        ownerId: dto.ownerId !== undefined ? dto.ownerId : userId,
        createdBy: userId,
      })
      .returning()

    if (!task) {
      throw new Error('Failed to create task')
    }

    // Handle tags if provided
    if (dto.tagIds?.length) {
      await this.db.client.insert(this.db.schema.taskTags).values(
        dto.tagIds.map((tagId) => ({
          taskId: task.id,
          tagId,
        }))
      )
    }

    // Insert notification pending row for contact assignments
    if (assigneeType === 'contact' && assigneeContactId) {
      await this.db.client
        .insert(this.db.schema.taskNotificationPending)
        .values({
          agencyId,
          taskId: task.id,
          contactId: assigneeContactId,
          eventType: 'assigned',
        })
        .onConflictDoNothing()
    }

    return this.findOne(task.id, agencyId)
  }

  /**
   * Find all tasks with filtering and pagination
   * Access control is applied at query level to ensure accurate pagination
   */
  async findAll(
    filters: TaskFilterDto,
    auth: AuthContext
  ): Promise<PaginatedTasksResponseDto> {
    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    // Build WHERE conditions with RBAC filtering
    const conditions = []

    // Apply access control conditions (includes agency filter + RBAC)
    const accessCondition = this.accessService.buildAccessConditions(auth)
    if (accessCondition) {
      conditions.push(accessCondition)
    }

    // Default to not showing deleted tasks
    if (!filters.includeDeleted) {
      conditions.push(eq(this.db.schema.tasks.isDeleted, false))
    }

    // Status filter
    if (filters.status?.length) {
      conditions.push(inArray(this.db.schema.tasks.status, filters.status))
    }

    // Priority filter
    if (filters.priority?.length) {
      conditions.push(inArray(this.db.schema.tasks.priority, filters.priority))
    }

    // Task type filter
    if (filters.taskType?.length) {
      conditions.push(inArray(this.db.schema.tasks.taskType, filters.taskType))
    }

    // Assignee type filter
    if (filters.assigneeType?.length) {
      conditions.push(inArray(this.db.schema.tasks.assigneeType, filters.assigneeType))
    }

    // Assignee filter
    if (filters.assigneeUserId) {
      conditions.push(eq(this.db.schema.tasks.assigneeUserId, filters.assigneeUserId))
    }

    // Trip filter
    if (filters.tripId) {
      conditions.push(eq(this.db.schema.tasks.tripId, filters.tripId))
    }

    // Contact filter
    if (filters.contactId) {
      conditions.push(eq(this.db.schema.tasks.contactId, filters.contactId))
    }

    // Activity filter
    if (filters.activityId) {
      conditions.push(eq(this.db.schema.tasks.activityId, filters.activityId))
    }

    // Parent task filter (for subtasks)
    if (filters.parentTaskId) {
      conditions.push(eq(this.db.schema.tasks.parentTaskId, filters.parentTaskId))
    } else if (!filters.includeSubtasks) {
      // By default, only show top-level tasks
      conditions.push(isNull(this.db.schema.tasks.parentTaskId))
    }

    // Due date range filter
    if (filters.dueDateFrom) {
      conditions.push(gte(this.db.schema.tasks.dueDate, filters.dueDateFrom))
    }
    if (filters.dueDateTo) {
      conditions.push(lte(this.db.schema.tasks.dueDate, filters.dueDateTo))
    }

    // Overdue filter
    if (filters.isOverdue) {
      const today = new Date().toISOString().split('T')[0]!
      conditions.push(lt(this.db.schema.tasks.dueDate, today))
      conditions.push(
        or(
          eq(this.db.schema.tasks.status, 'pending'),
          eq(this.db.schema.tasks.status, 'in_progress')
        )
      )
    }

    // Calendar visibility filter
    if (filters.isVisibleInCalendar !== undefined) {
      conditions.push(
        eq(this.db.schema.tasks.isVisibleInCalendar, filters.isVisibleInCalendar)
      )
    }

    // Search filter
    if (filters.search) {
      const searchCondition = or(
        ilike(this.db.schema.tasks.title, `%${filters.search}%`),
        ilike(this.db.schema.tasks.description, `%${filters.search}%`)
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    // Tags filter
    if (filters.tagIds?.length) {
      const taskIdsWithTags = this.db.client
        .select({ taskId: this.db.schema.taskTags.taskId })
        .from(this.db.schema.taskTags)
        .where(inArray(this.db.schema.taskTags.tagId, filters.tagIds))
      conditions.push(inArray(this.db.schema.tasks.id, taskIdsWithTags))
    }

    const whereCondition = and(...conditions)

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(this.db.schema.tasks)
      .where(whereCondition)
    const count = countResult[0]?.count ?? 0

    // Build sort
    const sortColumn = this.getSortColumn(filters.sortBy)
    const sortOrder = filters.sortOrder === 'asc' ? asc : desc

    // Get tasks
    const tasks = await this.db.client
      .select()
      .from(this.db.schema.tasks)
      .where(whereCondition)
      .orderBy(sortOrder(sortColumn))
      .limit(limit)
      .offset(offset)

    // Enrich tasks with related data
    const enrichedTasks = await Promise.all(
      tasks.map((task) => this.enrichTask(task))
    )

    return {
      data: enrichedTasks,
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    }
  }

  /**
   * Find a single task by ID
   */
  async findOne(id: string, agencyId: string): Promise<TaskResponseDto> {
    const [task] = await this.db.client
      .select()
      .from(this.db.schema.tasks)
      .where(
        and(
          eq(this.db.schema.tasks.id, id),
          eq(this.db.schema.tasks.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!task) {
      throw new NotFoundException('Task not found')
    }

    return this.enrichTask(task)
  }

  /**
   * Update a task
   */
  async update(
    id: string,
    dto: UpdateTaskDto,
    agencyId: string,
    userId: string
  ): Promise<TaskResponseDto> {
    // Fetch existing task to detect reassignment
    const [existingTask] = await this.db.client
      .select({
        assigneeType: this.db.schema.tasks.assigneeType,
        assigneeContactId: this.db.schema.tasks.assigneeContactId,
        dueDate: this.db.schema.tasks.dueDate,
        dueAt: this.db.schema.tasks.dueAt,
      })
      .from(this.db.schema.tasks)
      .where(
        and(
          eq(this.db.schema.tasks.id, id),
          eq(this.db.schema.tasks.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!existingTask) {
      throw new NotFoundException('Task not found')
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (dto.title !== undefined) updateData.title = dto.title
    if (dto.description !== undefined) updateData.description = dto.description
    if (dto.status !== undefined) updateData.status = dto.status
    if (dto.priority !== undefined) updateData.priority = dto.priority
    if (dto.taskType !== undefined) updateData.taskType = dto.taskType
    if (dto.phase !== undefined) updateData.phase = dto.phase
    if (dto.dueDate !== undefined) updateData.dueDate = dto.dueDate
    if (dto.dueAt !== undefined) updateData.dueAt = dto.dueAt ? new Date(dto.dueAt) : null
    if (dto.startDate !== undefined) updateData.startDate = dto.startDate
    if (dto.tripId !== undefined) updateData.tripId = dto.tripId
    if (dto.contactId !== undefined) updateData.contactId = dto.contactId
    if (dto.activityId !== undefined) updateData.activityId = dto.activityId
    if (dto.assigneeType !== undefined) updateData.assigneeType = dto.assigneeType
    if (dto.assigneeUserId !== undefined) updateData.assigneeUserId = dto.assigneeUserId
    if (dto.assigneeContactId !== undefined) updateData.assigneeContactId = dto.assigneeContactId
    if (dto.assigneeName !== undefined) updateData.assigneeName = dto.assigneeName
    if (dto.parentTaskId !== undefined) updateData.parentTaskId = dto.parentTaskId
    if (dto.isVisibleInCalendar !== undefined) updateData.isVisibleInCalendar = dto.isVisibleInCalendar
    if (dto.colorOverride !== undefined) updateData.colorOverride = dto.colorOverride
    if (dto.recurringConfig !== undefined) updateData.recurringConfig = dto.recurringConfig
    if (dto.notificationConfig !== undefined) updateData.notificationConfig = dto.notificationConfig
    if (dto.ownerId !== undefined) updateData.ownerId = dto.ownerId
    if (dto.completedAt !== undefined) updateData.completedAt = dto.completedAt ? new Date(dto.completedAt) : null
    if (dto.completedBy !== undefined) updateData.completedBy = dto.completedBy

    // Normalize assignee IDs based on assigneeType — clear irrelevant fields
    if (dto.assigneeType === 'user') {
      updateData.assigneeContactId = null
    } else if (dto.assigneeType === 'contact') {
      updateData.assigneeUserId = null
    } else if (dto.assigneeType === 'admin_pool') {
      updateData.assigneeUserId = null
      updateData.assigneeContactId = null
      updateData.assigneeName = null
    }

    // Resolve contact name for contact-type assignments
    const newAssigneeType = dto.assigneeType ?? existingTask.assigneeType
    const newContactId = dto.assigneeContactId ?? existingTask.assigneeContactId
    if (newAssigneeType === 'contact' && newContactId && dto.assigneeContactId !== undefined) {
      const contact = await this.getContact(newContactId)
      if (contact) {
        updateData.assigneeName = [contact.firstName, contact.lastName].filter(Boolean).join(' ')
      }
    }

    // Handle status change to completed
    if (dto.status === 'completed' && !dto.completedAt) {
      updateData.completedAt = new Date()
      updateData.completedBy = userId
    }

    const [updated] = await this.db.client
      .update(this.db.schema.tasks)
      .set(updateData)
      .where(
        and(
          eq(this.db.schema.tasks.id, id),
          eq(this.db.schema.tasks.agencyId, agencyId)
        )
      )
      .returning()

    if (!updated) {
      throw new NotFoundException('Task not found')
    }

    // Detect reassignment and insert notification pending rows
    const assigneeTypeChanged = dto.assigneeType !== undefined && dto.assigneeType !== existingTask.assigneeType
    const contactIdChanged = dto.assigneeContactId !== undefined && dto.assigneeContactId !== existingTask.assigneeContactId

    if (assigneeTypeChanged || contactIdChanged) {
      // Old contact was assigned — insert 'removed' notification
      if (existingTask.assigneeType === 'contact' && existingTask.assigneeContactId) {
        await this.db.client
          .insert(this.db.schema.taskNotificationPending)
          .values({
            agencyId,
            taskId: id,
            contactId: existingTask.assigneeContactId,
            eventType: 'removed',
          })
          .onConflictDoNothing()
      }
      // New contact assigned — insert 'assigned' notification
      if (newAssigneeType === 'contact' && newContactId) {
        await this.db.client
          .insert(this.db.schema.taskNotificationPending)
          .values({
            agencyId,
            taskId: id,
            contactId: newContactId,
            eventType: 'assigned',
          })
          .onConflictDoNothing()
      }
      // Clear due_reminder markers so the new assignee can receive a reminder
      await this.db.client
        .delete(this.db.schema.taskNotificationPending)
        .where(
          and(
            eq(this.db.schema.taskNotificationPending.taskId, id),
            eq(this.db.schema.taskNotificationPending.eventType, 'due_reminder'),
          )
        )
    }

    // Clear due_reminder markers if due date changed (so new reminder can be sent for the new date)
    const dueDateChanged = dto.dueDate !== undefined && dto.dueDate !== existingTask.dueDate
    const dueAtChanged = dto.dueAt !== undefined && dto.dueAt !== existingTask.dueAt?.toISOString()
    if (dueDateChanged || dueAtChanged) {
      await this.db.client
        .delete(this.db.schema.taskNotificationPending)
        .where(
          and(
            eq(this.db.schema.taskNotificationPending.taskId, id),
            eq(this.db.schema.taskNotificationPending.eventType, 'due_reminder'),
          )
        )
    }

    // Handle tags update if provided
    if (dto.tagIds !== undefined) {
      // Remove existing tags
      await this.db.client
        .delete(this.db.schema.taskTags)
        .where(eq(this.db.schema.taskTags.taskId, id))

      // Add new tags
      if (dto.tagIds.length > 0) {
        await this.db.client.insert(this.db.schema.taskTags).values(
          dto.tagIds.map((tagId) => ({
            taskId: id,
            tagId,
          }))
        )
      }
    }

    return this.findOne(id, agencyId)
  }

  /**
   * Soft delete a task
   */
  async remove(id: string, agencyId: string): Promise<void> {
    const [deleted] = await this.db.client
      .update(this.db.schema.tasks)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
      })
      .where(
        and(
          eq(this.db.schema.tasks.id, id),
          eq(this.db.schema.tasks.agencyId, agencyId)
        )
      )
      .returning()

    if (!deleted) {
      throw new NotFoundException('Task not found')
    }
  }

  /**
   * Complete a task
   */
  async complete(
    id: string,
    dto: CompleteTaskDto,
    agencyId: string,
    userId: string
  ): Promise<TaskResponseDto> {
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date()

    const [updated] = await this.db.client
      .update(this.db.schema.tasks)
      .set({
        status: 'completed',
        completedAt,
        completedBy: userId,
      })
      .where(
        and(
          eq(this.db.schema.tasks.id, id),
          eq(this.db.schema.tasks.agencyId, agencyId)
        )
      )
      .returning()

    if (!updated) {
      throw new NotFoundException('Task not found')
    }

    // Add completion note as comment if provided
    if (dto.note) {
      await this.db.client.insert(this.db.schema.taskComments).values({
        taskId: id,
        agencyId,
        userId,
        content: `Task completed: ${dto.note}`,
        isInternal: true,
      })
    }

    return this.findOne(id, agencyId)
  }

  /**
   * Bulk operations on tasks
   * Note: Access checks are performed per task to ensure RBAC compliance
   */
  async bulkOperation(
    dto: BulkTaskOperationDto,
    auth: AuthContext
  ): Promise<BulkTaskResultDto> {
    let success = 0
    let failed = 0
    const errors: Array<{ index: number; error: string }> = []

    for (let i = 0; i < dto.taskIds.length; i++) {
      const taskId = dto.taskIds[i]
      if (!taskId) {
        continue // Skip empty entries
      }
      try {
        // Check access for this specific task
        const access = await this.accessService.checkAccess(taskId, auth)

        // Determine required permission based on operation
        const needsEdit = ['complete', 'update_status', 'update_priority', 'assign'].includes(dto.operation)
        const needsDelete = dto.operation === 'delete'

        if (needsEdit && !access.canEdit) {
          throw new Error('You do not have permission to edit this task')
        }
        if (needsDelete && !access.canDelete) {
          throw new Error('You do not have permission to delete this task')
        }

        switch (dto.operation) {
          case 'complete':
            await this.complete(taskId, {}, auth.agencyId, auth.userId)
            break
          case 'delete':
            await this.remove(taskId, auth.agencyId)
            break
          case 'update_status':
            if (dto.payload?.status) {
              await this.update(taskId, { status: dto.payload.status }, auth.agencyId, auth.userId)
            }
            break
          case 'update_priority':
            if (dto.payload?.priority) {
              await this.update(taskId, { priority: dto.payload.priority }, auth.agencyId, auth.userId)
            }
            break
          case 'assign':
            if (dto.payload?.assigneeUserId) {
              await this.update(
                taskId,
                { assigneeUserId: dto.payload.assigneeUserId },
                auth.agencyId,
                auth.userId
              )
            }
            break
        }
        success++
      } catch (error) {
        failed++
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return {
      success,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Get subtasks for a parent task
   */
  async getSubtasks(parentTaskId: string, agencyId: string): Promise<TaskResponseDto[]> {
    const subtasks = await this.db.client
      .select()
      .from(this.db.schema.tasks)
      .where(
        and(
          eq(this.db.schema.tasks.parentTaskId, parentTaskId),
          eq(this.db.schema.tasks.agencyId, agencyId),
          eq(this.db.schema.tasks.isDeleted, false)
        )
      )
      .orderBy(asc(this.db.schema.tasks.createdAt))

    return Promise.all(subtasks.map((task) => this.enrichTask(task)))
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getSortColumn(sortBy?: string) {
    switch (sortBy) {
      case 'title':
        return this.db.schema.tasks.title
      case 'dueDate':
        return this.db.schema.tasks.dueDate
      case 'priority':
        return this.db.schema.tasks.priority
      case 'status':
        return this.db.schema.tasks.status
      case 'createdAt':
        return this.db.schema.tasks.createdAt
      case 'updatedAt':
        return this.db.schema.tasks.updatedAt
      default:
        return this.db.schema.tasks.createdAt
    }
  }

  private async enrichTask(task: typeof this.db.schema.tasks.$inferSelect): Promise<TaskResponseDto> {
    // Fetch related entities in parallel
    const [trip, contact, activity, tags, subtaskCount, assigneeUser, assigneeContact, owner, createdByUser] =
      await Promise.all([
        task.tripId ? this.getTrip(task.tripId) : null,
        task.contactId ? this.getContact(task.contactId) : null,
        task.activityId ? this.getActivity(task.activityId) : null,
        this.getTaskTags(task.id),
        this.getSubtaskCount(task.id),
        task.assigneeUserId ? this.getUser(task.assigneeUserId) : null,
        task.assigneeContactId ? this.getContact(task.assigneeContactId) : null,
        task.ownerId ? this.getUser(task.ownerId) : null,
        this.getUser(task.createdBy),
      ])

    return {
      id: task.id,
      agencyId: task.agencyId,
      title: task.title,
      description: task.description ?? undefined,
      status: task.status,
      priority: task.priority,
      taskType: task.taskType,
      phase: (task.phase as 'pre_booking' | 'pre_departure' | 'during_travel' | 'post_return' | null) ?? null,
      dueDate: task.dueDate ?? undefined,
      dueAt: task.dueAt?.toISOString() ?? undefined,
      startDate: task.startDate ?? undefined,
      completedAt: task.completedAt?.toISOString() ?? undefined,
      completedBy: task.completedBy ?? undefined,
      tripId: task.tripId ?? undefined,
      contactId: task.contactId ?? undefined,
      activityId: task.activityId ?? undefined,
      trip: trip
        ? { id: trip.id, name: trip.name, referenceNumber: trip.referenceNumber ?? undefined }
        : undefined,
      contact: contact
        ? {
            id: contact.id,
            firstName: contact.firstName ?? undefined,
            lastName: contact.lastName ?? undefined,
            email: contact.email ?? undefined,
          }
        : undefined,
      activity: activity
        ? { id: activity.id, title: activity.name, activityType: activity.activityType }
        : undefined,
      assigneeType: task.assigneeType,
      assignee: this.buildAssignee(task, assigneeUser, assigneeContact),
      assigneeUserId: task.assigneeUserId ?? undefined,
      assigneeContactId: task.assigneeContactId ?? undefined,
      assigneeName: task.assigneeName ?? undefined,
      parentTaskId: task.parentTaskId ?? undefined,
      subtaskCount,
      isVisibleInCalendar: task.isVisibleInCalendar ?? true,
      colorOverride: task.colorOverride ?? undefined,
      recurringConfig: task.recurringConfig ?? undefined,
      notificationConfig: task.notificationConfig ?? undefined,
      tags,
      ownerId: task.ownerId ?? undefined,
      owner: owner
        ? { id: owner.id, firstName: owner.firstName ?? undefined, lastName: owner.lastName ?? undefined }
        : undefined,
      createdBy: task.createdBy,
      createdByUser: createdByUser
        ? { id: createdByUser.id, firstName: createdByUser.firstName ?? undefined, lastName: createdByUser.lastName ?? undefined }
        : undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      isDeleted: task.isDeleted,
      deletedAt: task.deletedAt?.toISOString() ?? undefined,
    }
  }

  private buildAssignee(
    task: typeof this.db.schema.tasks.$inferSelect,
    user?: { id: string; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null } | null,
    assigneeContact?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null,
  ) {
    if (task.assigneeUserId && user) {
      return {
        userId: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unknown',
        avatarUrl: user.avatarUrl ?? undefined,
      }
    }
    if (task.assigneeContactId && assigneeContact) {
      return {
        contactId: assigneeContact.id,
        name: [assigneeContact.firstName, assigneeContact.lastName].filter(Boolean).join(' ') || task.assigneeName || 'Unknown',
      }
    }
    if (task.assigneeName) {
      return {
        name: task.assigneeName,
      }
    }
    return undefined
  }

  private async getTrip(tripId: string) {
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        referenceNumber: this.db.schema.trips.referenceNumber,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)
    return trip ?? null
  }

  private async getContact(contactId: string) {
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
        email: this.db.schema.contacts.email,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)
    return contact ?? null
  }

  private async getActivity(activityId: string) {
    const [activity] = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        name: this.db.schema.itineraryActivities.name,
        activityType: this.db.schema.itineraryActivities.activityType,
      })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)
    return activity ?? null
  }

  private async getUser(userId: string) {
    const [user] = await this.db.client
      .select({
        id: this.db.schema.userProfiles.id,
        firstName: this.db.schema.userProfiles.firstName,
        lastName: this.db.schema.userProfiles.lastName,
        avatarUrl: this.db.schema.userProfiles.avatarUrl,
      })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, userId))
      .limit(1)
    return user ?? null
  }

  private async getTaskTags(taskId: string) {
    const taskTags = await this.db.client
      .select({
        id: this.db.schema.tags.id,
        name: this.db.schema.tags.name,
        color: this.db.schema.tags.color,
      })
      .from(this.db.schema.taskTags)
      .innerJoin(
        this.db.schema.tags,
        eq(this.db.schema.taskTags.tagId, this.db.schema.tags.id)
      )
      .where(eq(this.db.schema.taskTags.taskId, taskId))

    return taskTags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? undefined,
    }))
  }

  private async getSubtaskCount(taskId: string): Promise<number> {
    const [result] = await this.db.client
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(this.db.schema.tasks)
      .where(
        and(
          eq(this.db.schema.tasks.parentTaskId, taskId),
          eq(this.db.schema.tasks.isDeleted, false)
        )
      )
    return result?.count ?? 0
  }
}
