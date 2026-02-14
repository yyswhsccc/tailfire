/**
 * Task Templates Service
 *
 * Business logic for managing task templates.
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { eq, and, or, ilike, sql, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TasksService } from './tasks.service'
import type {
  CreateTaskTemplateDto,
  UpdateTaskTemplateDto,
  CreateFromTemplateDto,
} from './dto'
import type {
  TaskTemplateResponseDto,
  TaskResponseDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class TaskTemplatesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tasksService: TasksService
  ) {}

  /**
   * Create a new task template
   */
  async create(
    dto: CreateTaskTemplateDto,
    agencyId: string
  ): Promise<TaskTemplateResponseDto> {
    const [template] = await this.db.client
      .insert(this.db.schema.taskTemplates)
      .values({
        agencyId,
        name: dto.name,
        description: dto.description,
        templateType: dto.templateType,
        category: dto.category,
        defaultValues: dto.defaultValues || {},
        subtasks: dto.subtasks,
      })
      .returning()

    if (!template) {
      throw new Error('Failed to create task template')
    }

    return this.mapToResponseDto(template)
  }

  /**
   * Find all templates for an agency
   */
  async findAll(
    agencyId: string,
    templateType?: string,
    search?: string
  ): Promise<TaskTemplateResponseDto[]> {
    const conditions = []

    // Include agency templates and system templates
    conditions.push(
      or(
        eq(this.db.schema.taskTemplates.agencyId, agencyId),
        eq(this.db.schema.taskTemplates.isSystem, true)
      )
    )

    // Only show active templates
    conditions.push(eq(this.db.schema.taskTemplates.isActive, true))

    // Filter by type
    if (templateType) {
      conditions.push(eq(this.db.schema.taskTemplates.templateType, templateType))
    }

    // Search
    if (search) {
      conditions.push(
        or(
          ilike(this.db.schema.taskTemplates.name, `%${search}%`),
          ilike(this.db.schema.taskTemplates.description, `%${search}%`)
        )
      )
    }

    const templates = await this.db.client
      .select()
      .from(this.db.schema.taskTemplates)
      .where(and(...conditions))
      .orderBy(asc(this.db.schema.taskTemplates.name))

    return templates.map(this.mapToResponseDto)
  }

  /**
   * Find a single template by ID
   */
  async findOne(id: string, agencyId: string): Promise<TaskTemplateResponseDto> {
    const [template] = await this.db.client
      .select()
      .from(this.db.schema.taskTemplates)
      .where(
        and(
          eq(this.db.schema.taskTemplates.id, id),
          or(
            eq(this.db.schema.taskTemplates.agencyId, agencyId),
            eq(this.db.schema.taskTemplates.isSystem, true)
          )
        )
      )
      .limit(1)

    if (!template) {
      throw new NotFoundException('Task template not found')
    }

    return this.mapToResponseDto(template)
  }

  /**
   * Update a template
   */
  async update(
    id: string,
    dto: UpdateTaskTemplateDto,
    agencyId: string
  ): Promise<TaskTemplateResponseDto> {
    // Verify template exists and belongs to agency (not system template)
    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.taskTemplates)
      .where(
        and(
          eq(this.db.schema.taskTemplates.id, id),
          eq(this.db.schema.taskTemplates.agencyId, agencyId),
          eq(this.db.schema.taskTemplates.isSystem, false)
        )
      )
      .limit(1)

    if (!existing) {
      throw new NotFoundException('Task template not found or cannot be edited')
    }

    const updateData: Record<string, unknown> = {}
    if (dto.name !== undefined) updateData.name = dto.name
    if (dto.description !== undefined) updateData.description = dto.description
    if (dto.templateType !== undefined) updateData.templateType = dto.templateType
    if (dto.category !== undefined) updateData.category = dto.category
    if (dto.defaultValues !== undefined) updateData.defaultValues = dto.defaultValues
    if (dto.subtasks !== undefined) updateData.subtasks = dto.subtasks
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive

    const [updated] = await this.db.client
      .update(this.db.schema.taskTemplates)
      .set(updateData)
      .where(eq(this.db.schema.taskTemplates.id, id))
      .returning()

    if (!updated) {
      throw new NotFoundException('Template not found')
    }

    return this.mapToResponseDto(updated)
  }

  /**
   * Delete a template
   */
  async remove(id: string, agencyId: string): Promise<void> {
    const [deleted] = await this.db.client
      .delete(this.db.schema.taskTemplates)
      .where(
        and(
          eq(this.db.schema.taskTemplates.id, id),
          eq(this.db.schema.taskTemplates.agencyId, agencyId),
          eq(this.db.schema.taskTemplates.isSystem, false)
        )
      )
      .returning()

    if (!deleted) {
      throw new NotFoundException('Task template not found or cannot be deleted')
    }
  }

  /**
   * Create a task from a template
   */
  async createFromTemplate(
    dto: CreateFromTemplateDto,
    agencyId: string,
    userId: string
  ): Promise<TaskResponseDto> {
    const template = await this.findOne(dto.templateId, agencyId)

    // Increment usage count
    await this.db.client
      .update(this.db.schema.taskTemplates)
      .set({
        usageCount: sql`${this.db.schema.taskTemplates.usageCount} + 1`,
      })
      .where(eq(this.db.schema.taskTemplates.id, dto.templateId))

    // Create the main task
    const mainTask = await this.tasksService.create(
      {
        title: dto.title || template.name,
        description: template.description,
        dueDate: dto.dueDate,
        tripId: dto.tripId,
        contactId: dto.contactId,
        activityId: dto.activityId,
        assigneeUserId: dto.assigneeUserId,
        ...template.defaultValues,
      },
      agencyId,
      userId
    )

    // Create subtasks if requested and template has them
    if (dto.createSubtasks !== false && template.subtasks?.length) {
      const baseDueDate = dto.dueDate ? new Date(dto.dueDate) : null

      for (const subtaskTemplate of template.subtasks) {
        let subtaskDueDate: string | undefined
        if (baseDueDate && subtaskTemplate.dueDaysOffset) {
          const dueDate = new Date(baseDueDate)
          dueDate.setDate(dueDate.getDate() + subtaskTemplate.dueDaysOffset)
          subtaskDueDate = dueDate.toISOString().split('T')[0]
        }

        await this.tasksService.create(
          {
            title: subtaskTemplate.title,
            description: subtaskTemplate.description,
            priority: subtaskTemplate.priority || template.defaultValues?.priority,
            dueDate: subtaskDueDate,
            tripId: dto.tripId,
            contactId: dto.contactId,
            activityId: dto.activityId,
            assigneeUserId: dto.assigneeUserId,
            parentTaskId: mainTask.id,
          },
          agencyId,
          userId
        )
      }
    }

    // Return the main task with updated subtask count
    return this.tasksService.findOne(mainTask.id, agencyId)
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapToResponseDto(
    template: typeof this.db.schema.taskTemplates.$inferSelect
  ): TaskTemplateResponseDto {
    return {
      id: template.id,
      agencyId: template.agencyId,
      name: template.name,
      description: template.description ?? undefined,
      templateType: template.templateType,
      category: template.category ?? undefined,
      defaultValues: template.defaultValues as TaskTemplateResponseDto['defaultValues'],
      subtasks: template.subtasks as TaskTemplateResponseDto['subtasks'],
      isActive: template.isActive,
      isSystem: template.isSystem,
      usageCount: template.usageCount,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    }
  }
}
