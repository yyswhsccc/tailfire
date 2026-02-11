/**
 * Notification Preferences Controller
 *
 * REST API endpoints for managing user notification preferences.
 * Allows users to configure their notification channels and settings.
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import {
  UpdateNotificationPreferencesDto,
  RegisterPushTokenDto,
  NotificationPreferencesResponseDto,
  PushTokenResponseDto,
} from './dto'
import type { PushToken } from './notification.types'

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@Controller('users/me/notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get current user's notification preferences
   * GET /users/me/notification-preferences
   */
  @Get()
  @ApiOperation({ summary: 'Get notification preferences' })
  @ApiResponse({ status: 200, description: 'User notification preferences', type: NotificationPreferencesResponseDto })
  async getPreferences(
    @GetAuthContext() auth: AuthContext,
  ): Promise<NotificationPreferencesResponseDto> {
    // Ensure preferences exist (creates defaults if needed)
    const prefs = await this.notificationService.ensurePreferences(auth.userId, auth.agencyId)

    return this.mapToResponseDto(prefs)
  }

  /**
   * Update current user's notification preferences
   * PATCH /users/me/notification-preferences
   */
  @Patch()
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Updated notification preferences', type: NotificationPreferencesResponseDto })
  async updatePreferences(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    const updated = await this.notificationService.updatePreferences(auth.userId, auth.agencyId, {
      emailEnabled: dto.emailEnabled,
      pushEnabled: dto.pushEnabled,
      platformEnabled: dto.platformEnabled,
      categoryPreferences: dto.categoryPreferences,
      quietHoursStart: dto.quietHoursStart,
      quietHoursEnd: dto.quietHoursEnd,
      timezone: dto.timezone,
    })

    return this.mapToResponseDto(updated)
  }

  /**
   * Register a push notification token
   * POST /users/me/notification-preferences/push-tokens
   */
  @Post('push-tokens')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register push notification token' })
  @ApiResponse({ status: 201, description: 'Token registered', type: PushTokenResponseDto })
  async registerPushToken(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<PushTokenResponseDto> {
    const result = await this.notificationService.registerPushToken(auth.userId, auth.agencyId, {
      token: dto.token,
      device: dto.device,
      platform: dto.platform,
    })

    return {
      success: result.success,
      message: 'Push token registered successfully',
      tokenCount: result.tokenCount,
    }
  }

  /**
   * Remove a push notification token
   * DELETE /users/me/notification-preferences/push-tokens/:token
   */
  @Delete('push-tokens/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove push notification token' })
  @ApiResponse({ status: 200, description: 'Token removed', type: PushTokenResponseDto })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async removePushToken(
    @GetAuthContext() auth: AuthContext,
    @Param('token') token: string,
  ): Promise<PushTokenResponseDto> {
    const result = await this.notificationService.removePushToken(auth.userId, token)

    if (!result.success) {
      throw new NotFoundException('Push token not found')
    }

    return {
      success: true,
      message: 'Push token removed successfully',
      tokenCount: result.tokenCount,
    }
  }

  /**
   * List registered push tokens
   * GET /users/me/notification-preferences/push-tokens
   */
  @Get('push-tokens')
  @ApiOperation({ summary: 'List registered push tokens' })
  @ApiResponse({
    status: 200,
    description: 'List of registered push tokens',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          device: { type: 'string' },
          platform: { type: 'string', enum: ['ios', 'android', 'web'] },
          createdAt: { type: 'string', format: 'date-time' },
          lastUsed: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async listPushTokens(
    @GetAuthContext() auth: AuthContext,
  ): Promise<Array<Omit<PushToken, 'token'>>> {
    const tokens = await this.notificationService.getPushTokens(auth.userId)

    // Return tokens without exposing the actual token value for security
    return tokens.map((t) => ({
      device: t.device,
      platform: t.platform,
      createdAt: t.createdAt,
      lastUsed: t.lastUsed,
    }))
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(prefs: any): NotificationPreferencesResponseDto {
    const pushTokens: PushToken[] = prefs.pushTokens || []

    return {
      id: prefs.id,
      userId: prefs.userId,
      agencyId: prefs.agencyId,
      emailEnabled: prefs.emailEnabled,
      pushEnabled: prefs.pushEnabled,
      platformEnabled: prefs.platformEnabled,
      categoryPreferences: prefs.categoryPreferences,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
      timezone: prefs.timezone || 'America/Toronto',
      pushTokenCount: pushTokens.length,
      createdAt: prefs.createdAt,
      updatedAt: prefs.updatedAt,
    }
  }
}
