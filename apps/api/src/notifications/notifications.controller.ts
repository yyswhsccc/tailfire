/**
 * Notifications Controller
 *
 * REST API endpoints for platform notifications.
 * Provides CRUD operations for in-app notifications.
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { PlatformNotificationService } from './platform-notification.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import {
  GetNotificationsQueryDto,
  NotificationResponseDto,
  NotificationsListResponseDto,
  UnreadCountResponseDto,
  MarkAsReadResponseDto,
  DismissResponseDto,
  MarkMultipleAsReadDto,
} from './dto'

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly platformNotificationService: PlatformNotificationService) {}

  /**
   * Get paginated list of notifications for the current user
   * GET /notifications
   */
  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  @ApiResponse({ status: 200, description: 'List of notifications', type: NotificationsListResponseDto })
  async getNotifications(
    @GetAuthContext() auth: AuthContext,
    @Query() query: GetNotificationsQueryDto,
  ): Promise<NotificationsListResponseDto> {
    const limit = query.limit ?? 50
    const includeRead = query.includeRead ?? true
    const includeDismissed = query.includeDismissed ?? false

    const result = await this.platformNotificationService.getPaginated(auth.userId, {
      limit: limit + 1, // Fetch one extra to determine hasMore
      cursor: query.cursor,
      includeRead,
      includeDismissed,
      category: query.category,
    })

    const hasMore = result.length > limit
    const notifications = hasMore ? result.slice(0, limit) : result
    const nextCursor = hasMore && notifications.length > 0 ? notifications[notifications.length - 1]!.id : null

    return {
      notifications: notifications.map(this.mapToResponseDto),
      nextCursor,
      hasMore,
    }
  }

  /**
   * Get unread notification count for the current user
   * GET /notifications/unread-count
   */
  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({ status: 200, description: 'Unread count', type: UnreadCountResponseDto })
  async getUnreadCount(@GetAuthContext() auth: AuthContext): Promise<UnreadCountResponseDto> {
    const count = await this.platformNotificationService.getUnreadCount(auth.userId)
    return { count }
  }

  /**
   * Mark a notification as read
   * PATCH /notifications/:id/read
   */
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read', type: MarkAsReadResponseDto })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MarkAsReadResponseDto> {
    await this.platformNotificationService.markAsRead(id, auth.userId)
    return { success: true }
  }

  /**
   * Dismiss a notification
   * PATCH /notifications/:id/dismiss
   */
  @Patch(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification dismissed', type: DismissResponseDto })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async dismiss(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DismissResponseDto> {
    await this.platformNotificationService.dismiss(id, auth.userId)
    return { success: true }
  }

  /**
   * Mark all notifications as read for the current user
   * POST /notifications/mark-all-read
   */
  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read', type: MarkAsReadResponseDto })
  async markAllAsRead(@GetAuthContext() auth: AuthContext): Promise<MarkAsReadResponseDto> {
    const count = await this.platformNotificationService.markAllAsRead(auth.userId)
    return { success: true, count }
  }

  /**
   * Mark multiple notifications as read
   * POST /notifications/mark-multiple-read
   */
  @Post('mark-multiple-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  @ApiResponse({ status: 200, description: 'Notifications marked as read', type: MarkAsReadResponseDto })
  async markMultipleAsRead(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: MarkMultipleAsReadDto,
  ): Promise<MarkAsReadResponseDto> {
    const count = await this.platformNotificationService.markMultipleAsRead(dto.notificationIds, auth.userId)
    return { success: true, count }
  }

  /**
   * Get a single notification by ID
   * GET /notifications/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification details', type: NotificationResponseDto })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async getNotification(
    @GetAuthContext() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.platformNotificationService.getById(id, auth.userId)

    if (!notification) {
      throw new NotFoundException('Notification not found')
    }

    return this.mapToResponseDto(notification)
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(notification: any): NotificationResponseDto {
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
      notificationType: notification.notificationType,
      entityType: notification.entityType,
      entityId: notification.entityId,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      dismissedAt: notification.dismissedAt,
    }
  }
}
