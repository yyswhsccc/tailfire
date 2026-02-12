/**
 * Notifications DTOs
 *
 * DTOs for platform notification endpoints.
 */

import { IsOptional, IsString, IsBoolean, IsInt, Min, Max, IsUUID } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { NOTIFICATION_CATEGORY_VALUES, type NotificationCategory } from '../notification.types'

/**
 * Query parameters for listing notifications
 */
export class GetNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of notifications to return',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @ApiPropertyOptional({
    description: 'Cursor for pagination (notification ID to start after)',
  })
  @IsOptional()
  @IsString()
  cursor?: string

  @ApiPropertyOptional({
    description: 'Include read notifications',
    default: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeRead?: boolean

  @ApiPropertyOptional({
    description: 'Include dismissed notifications',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDismissed?: boolean

  @ApiPropertyOptional({
    description: 'Filter by notification category',
    enum: NOTIFICATION_CATEGORY_VALUES,
  })
  @IsOptional()
  @IsString()
  category?: NotificationCategory
}

/**
 * Response DTO for a single notification
 */
export class NotificationResponseDto {
  @ApiProperty({ description: 'Unique notification ID' })
  id!: string

  @ApiProperty({ description: 'User ID this notification belongs to' })
  userId!: string

  @ApiProperty({ description: 'Agency ID' })
  agencyId!: string

  @ApiProperty({ description: 'Notification category' })
  category!: string

  @ApiProperty({ description: 'Notification title' })
  title!: string

  @ApiProperty({ description: 'Notification body content' })
  body!: string

  @ApiPropertyOptional({ description: 'Deep link URL for in-app navigation' })
  actionUrl?: string | null

  @ApiPropertyOptional({ description: 'Additional metadata' })
  metadata?: Record<string, unknown> | null

  @ApiProperty({
    description: 'Notification status',
    enum: ['unread', 'read', 'dismissed'],
  })
  status!: 'unread' | 'read' | 'dismissed'

  @ApiPropertyOptional({ description: 'Specific notification type' })
  notificationType?: string | null

  @ApiPropertyOptional({ description: 'Related entity type' })
  entityType?: string | null

  @ApiPropertyOptional({ description: 'Related entity ID' })
  entityId?: string | null

  @ApiProperty({ description: 'When the notification was created' })
  createdAt!: Date

  @ApiPropertyOptional({ description: 'When the notification was read' })
  readAt?: Date | null

  @ApiPropertyOptional({ description: 'When the notification was dismissed' })
  dismissedAt?: Date | null
}

/**
 * Response DTO for paginated notifications list
 */
export class NotificationsListResponseDto {
  @ApiProperty({ description: 'List of notifications', type: [NotificationResponseDto] })
  notifications!: NotificationResponseDto[]

  @ApiPropertyOptional({ description: 'Cursor for next page (null if no more results)' })
  nextCursor?: string | null

  @ApiProperty({ description: 'Whether there are more notifications to fetch' })
  hasMore!: boolean
}

/**
 * Response DTO for unread count
 */
export class UnreadCountResponseDto {
  @ApiProperty({ description: 'Number of unread notifications' })
  count!: number
}

/**
 * Response DTO for mark as read operation
 */
export class MarkAsReadResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success!: boolean

  @ApiPropertyOptional({ description: 'Number of notifications marked as read' })
  count?: number
}

/**
 * Response DTO for dismiss operation
 */
export class DismissResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success!: boolean
}

/**
 * DTO for marking multiple notifications as read
 */
export class MarkMultipleAsReadDto {
  @ApiProperty({
    description: 'Array of notification IDs to mark as read',
    type: [String],
  })
  @IsUUID('4', { each: true })
  notificationIds!: string[]
}
