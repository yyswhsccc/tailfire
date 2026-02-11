/**
 * Notification Preferences DTOs
 *
 * DTOs for managing user notification preferences.
 */

import { IsBoolean, IsOptional, IsString, IsEnum, IsObject } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { NotificationChannel, NotificationCategory } from '../notification.types'

/**
 * DTO for updating notification preferences
 */
export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Enable email notifications' })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean

  @ApiPropertyOptional({ description: 'Enable push notifications' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean

  @ApiPropertyOptional({ description: 'Enable in-app/platform notifications' })
  @IsOptional()
  @IsBoolean()
  platformEnabled?: boolean

  @ApiPropertyOptional({
    description: 'Category-specific channel preferences',
    example: {
      payment_reminders: ['email', 'platform'],
      trip_updates: ['email', 'push', 'platform'],
    },
  })
  @IsOptional()
  @IsObject()
  categoryPreferences?: Record<NotificationCategory, NotificationChannel[]>

  @ApiPropertyOptional({ description: 'Quiet hours start time (HH:mm)', example: '22:00' })
  @IsOptional()
  @IsString()
  quietHoursStart?: string | null

  @ApiPropertyOptional({ description: 'Quiet hours end time (HH:mm)', example: '07:00' })
  @IsOptional()
  @IsString()
  quietHoursEnd?: string | null

  @ApiPropertyOptional({ description: 'Timezone for quiet hours', example: 'America/Toronto' })
  @IsOptional()
  @IsString()
  timezone?: string
}

/**
 * DTO for registering a push notification token
 */
export class RegisterPushTokenDto {
  @ApiProperty({ description: 'Push notification token from device/browser' })
  @IsString()
  token!: string

  @ApiProperty({ description: 'Device identifier', example: 'iPhone 14 Pro' })
  @IsString()
  device!: string

  @ApiProperty({
    description: 'Platform type',
    enum: ['ios', 'android', 'web'],
  })
  @IsEnum(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web'
}

/**
 * Response DTO for notification preferences
 */
export class NotificationPreferencesResponseDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  userId!: string

  @ApiProperty()
  agencyId!: string

  @ApiProperty()
  emailEnabled!: boolean

  @ApiProperty()
  pushEnabled!: boolean

  @ApiProperty()
  platformEnabled!: boolean

  @ApiPropertyOptional()
  categoryPreferences?: Record<NotificationCategory, NotificationChannel[]>

  @ApiPropertyOptional()
  quietHoursStart?: string | null

  @ApiPropertyOptional()
  quietHoursEnd?: string | null

  @ApiProperty()
  timezone!: string

  @ApiProperty({ description: 'Number of registered push tokens' })
  pushTokenCount!: number

  @ApiProperty()
  createdAt!: Date

  @ApiProperty()
  updatedAt!: Date
}

/**
 * Response DTO for push token operations
 */
export class PushTokenResponseDto {
  @ApiProperty()
  success!: boolean

  @ApiPropertyOptional()
  message?: string

  @ApiPropertyOptional({ description: 'Total number of registered tokens after operation' })
  tokenCount?: number
}
