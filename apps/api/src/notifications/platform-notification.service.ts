/**
 * Platform Notification Service
 *
 * Manages in-app notifications stored in the database.
 * These are always delivered regardless of user channel preferences.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { NotificationCategory } from './notification.types'

interface CreateNotificationParams {
  userId: string
  agencyId: string
  category: NotificationCategory | string
  title: string
  body: string
  actionUrl?: string
  metadata?: Record<string, unknown>
}

interface PlatformNotificationDto {
  id: string
  userId: string
  agencyId: string
  category: string
  title: string
  body: string
  actionUrl: string | null
  metadata: Record<string, unknown> | null
  status: 'unread' | 'read' | 'dismissed'
  createdAt: Date
  readAt: Date | null
  dismissedAt: Date | null
}

@Injectable()
export class PlatformNotificationService {
  private readonly logger = new Logger(PlatformNotificationService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create an in-app notification
   */
  async create(params: CreateNotificationParams): Promise<PlatformNotificationDto> {
    const [notification] = await this.db.client
      .insert(this.db.schema.platformNotifications)
      .values({
        userId: params.userId,
        agencyId: params.agencyId,
        category: params.category,
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        metadata: params.metadata,
        status: 'unread',
      })
      .returning()

    this.logger.debug(`Created platform notification ${notification!.id} for user ${params.userId}`)

    return this.mapToDto(notification!)
  }

  /**
   * Get unread notifications for a user
   */
  async getUnread(userId: string, limit = 50): Promise<PlatformNotificationDto[]> {
    const notifications = await this.db.client
      .select()
      .from(this.db.schema.platformNotifications)
      .where(
        and(
          eq(this.db.schema.platformNotifications.userId, userId),
          eq(this.db.schema.platformNotifications.status, 'unread')
        )
      )
      .orderBy(desc(this.db.schema.platformNotifications.createdAt))
      .limit(limit)

    return notifications.map(this.mapToDto)
  }

  /**
   * Get all notifications for a user (including read)
   */
  async getAll(
    userId: string,
    options?: { limit?: number; includeRead?: boolean; includeDismissed?: boolean }
  ): Promise<PlatformNotificationDto[]> {
    const limit = options?.limit ?? 100
    const conditions = [eq(this.db.schema.platformNotifications.userId, userId)]

    // Build status filter
    const statusFilter: ('unread' | 'read' | 'dismissed')[] = ['unread']
    if (options?.includeRead) statusFilter.push('read')
    if (options?.includeDismissed) statusFilter.push('dismissed')

    if (statusFilter.length < 3) {
      conditions.push(inArray(this.db.schema.platformNotifications.status, statusFilter))
    }

    const notifications = await this.db.client
      .select()
      .from(this.db.schema.platformNotifications)
      .where(and(...conditions))
      .orderBy(desc(this.db.schema.platformNotifications.createdAt))
      .limit(limit)

    return notifications.map(this.mapToDto)
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(this.db.schema.platformNotifications)
      .where(
        and(
          eq(this.db.schema.platformNotifications.userId, userId),
          eq(this.db.schema.platformNotifications.status, 'unread')
        )
      )

    return Number(result[0]?.count ?? 0)
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    const conditions = [eq(this.db.schema.platformNotifications.id, notificationId)]
    if (userId) {
      conditions.push(eq(this.db.schema.platformNotifications.userId, userId))
    }

    await this.db.client
      .update(this.db.schema.platformNotifications)
      .set({
        status: 'read',
        readAt: new Date(),
      })
      .where(and(...conditions))
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.db.client
      .update(this.db.schema.platformNotifications)
      .set({
        status: 'read',
        readAt: new Date(),
      })
      .where(
        and(
          eq(this.db.schema.platformNotifications.userId, userId),
          eq(this.db.schema.platformNotifications.status, 'unread')
        )
      )

    return result.count ?? 0
  }

  /**
   * Dismiss a notification
   */
  async dismiss(notificationId: string, userId?: string): Promise<void> {
    const conditions = [eq(this.db.schema.platformNotifications.id, notificationId)]
    if (userId) {
      conditions.push(eq(this.db.schema.platformNotifications.userId, userId))
    }

    await this.db.client
      .update(this.db.schema.platformNotifications)
      .set({
        status: 'dismissed',
        dismissedAt: new Date(),
      })
      .where(and(...conditions))
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteOld(agencyId: string, olderThanDays = 90): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const result = await this.db.client
      .delete(this.db.schema.platformNotifications)
      .where(
        and(
          eq(this.db.schema.platformNotifications.agencyId, agencyId),
          sql`${this.db.schema.platformNotifications.createdAt} < ${cutoffDate}`
        )
      )

    const deleted = result.count ?? 0
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} old notifications for agency ${agencyId}`)
    }

    return deleted
  }

  private mapToDto(notification: any): PlatformNotificationDto {
    return {
      id: notification.id,
      userId: notification.userId,
      agencyId: notification.agencyId,
      category: notification.category,
      title: notification.title,
      body: notification.body,
      actionUrl: notification.actionUrl,
      metadata: notification.metadata,
      status: notification.status,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      dismissedAt: notification.dismissedAt,
    }
  }
}
