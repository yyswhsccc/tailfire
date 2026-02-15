/**
 * Task Access Service
 *
 * Handles access control for tasks including:
 * - Ownership checks
 * - Assignment-based access
 * - Admin vs user filtering
 */

import { Injectable } from '@nestjs/common'
import { eq, and, or, isNull, ne } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { AuthContext } from '../auth/auth.types'
import type { TaskResponseDto } from '../../../../packages/shared-types/src/api'

export interface TaskAccessResult {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  isOwner: boolean
  isAssignee: boolean
}

@Injectable()
export class TaskAccessService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Check if a user has access to a task
   */
  async checkAccess(taskId: string, auth: AuthContext): Promise<TaskAccessResult> {
    const [task] = await this.db.client
      .select({
        id: this.db.schema.tasks.id,
        ownerId: this.db.schema.tasks.ownerId,
        assigneeUserId: this.db.schema.tasks.assigneeUserId,
        assigneeType: this.db.schema.tasks.assigneeType,
        createdBy: this.db.schema.tasks.createdBy,
      })
      .from(this.db.schema.tasks)
      .where(
        and(
          eq(this.db.schema.tasks.id, taskId),
          eq(this.db.schema.tasks.agencyId, auth.agencyId)
        )
      )
      .limit(1)

    if (!task) {
      return {
        canView: false,
        canEdit: false,
        canDelete: false,
        isOwner: false,
        isAssignee: false,
      }
    }

    // Admins have full access
    if (auth.role === 'admin') {
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        isOwner: task.ownerId === auth.userId,
        isAssignee: task.assigneeUserId === auth.userId,
      }
    }

    const isOwner = task.ownerId === auth.userId
    const isAssignee = task.assigneeUserId === auth.userId
    const isCreator = task.createdBy === auth.userId
    // Agency-wide tasks (no owner) are visible to non-admins UNLESS they are admin_pool
    const isAgencyWide = task.ownerId === null && task.assigneeType !== 'admin_pool'

    // Users can view:
    // - Tasks they own
    // - Tasks assigned to them
    // - Tasks they created
    // - Agency-wide tasks (no owner, not admin_pool)
    const canView = isOwner || isAssignee || isCreator || isAgencyWide

    // Users can edit:
    // - Tasks they own
    // - Tasks they created (if no other owner set)
    const canEdit = isOwner || (isCreator && !task.ownerId)

    // Users can delete:
    // - Only tasks they own
    const canDelete = isOwner

    return {
      canView,
      canEdit,
      canDelete,
      isOwner,
      isAssignee,
    }
  }

  /**
   * Apply access control filtering to a list of tasks
   * For non-admins, filters to only tasks they can access
   */
  async applyAccessControlToMany(
    tasks: TaskResponseDto[],
    auth: AuthContext
  ): Promise<TaskResponseDto[]> {
    // Admins see everything
    if (auth.role === 'admin') {
      return tasks
    }

    // For regular users, filter to accessible tasks
    return tasks.filter((task) => {
      const isOwner = task.ownerId === auth.userId
      const isAssignee = task.assigneeUserId === auth.userId
      const isCreator = task.createdBy === auth.userId
      const isAgencyWide = !task.ownerId && task.assigneeType !== 'admin_pool'

      return isOwner || isAssignee || isCreator || isAgencyWide
    })
  }

  /**
   * Build WHERE conditions for task queries based on user role
   * This is used in service methods to apply RBAC at query level
   */
  buildAccessConditions(auth: AuthContext) {
    // Admins see all tasks in agency
    if (auth.role === 'admin') {
      return eq(this.db.schema.tasks.agencyId, auth.agencyId)
    }

    // Regular users see:
    // - Tasks they own
    // - Tasks assigned to them
    // - Tasks they created
    // - Agency-wide tasks (no owner, not admin_pool)
    return and(
      eq(this.db.schema.tasks.agencyId, auth.agencyId),
      or(
        eq(this.db.schema.tasks.ownerId, auth.userId),
        eq(this.db.schema.tasks.assigneeUserId, auth.userId),
        eq(this.db.schema.tasks.createdBy, auth.userId),
        and(isNull(this.db.schema.tasks.ownerId), ne(this.db.schema.tasks.assigneeType, 'admin_pool'))
      )
    )
  }
}
