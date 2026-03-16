/**
 * Trip Notifications Controller
 *
 * REST API endpoints for financial trip notifications (alerts about trips).
 * NOTE: Uses 'trip-notifications' prefix to avoid conflict with platform notifications.
 *
 * Endpoints:
 * - GET /trips/:tripId/notifications - Get notifications for a trip
 * - GET /trip-notifications/:id - Get a single trip notification
 * - POST /trip-notifications/:id/dismiss - Dismiss a trip notification
 */

import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TripNotificationsService } from './trip-notifications.service'
import { TripAccessService } from '../trips/trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  TripNotificationResponseDto,
  TripNotificationsFilterDto,
  PaginatedNotificationsResponseDto,
  DismissNotificationDto,
} from '@tailfire/shared-types'

@ApiTags('Trip Notifications')
@Controller()
export class TripNotificationsController {
  constructor(
    private readonly notificationsService: TripNotificationsService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Get notifications for a trip with optional filtering
   * GET /trips/:tripId/notifications
   */
  @Get('trips/:tripId/notifications')
  async getNotifications(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Query() filters: TripNotificationsFilterDto
  ): Promise<PaginatedNotificationsResponseDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.notificationsService.getNotifications(tripId, filters)
  }

  /**
   * Get a single trip notification by ID
   * GET /trip-notifications/:id
   */
  @Get('trip-notifications/:id')
  async getNotification(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<TripNotificationResponseDto> {
    const notification = await this.notificationsService.getNotification(id)
    await this.tripAccessService.verifyReadAccess(notification.tripId, auth)
    return notification
  }

  /**
   * Dismiss a trip notification
   * POST /trip-notifications/:id/dismiss
   */
  @Post('trip-notifications/:id/dismiss')
  async dismissNotification(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: DismissNotificationDto
  ): Promise<TripNotificationResponseDto> {
    const notification = await this.notificationsService.getNotification(id)
    await this.tripAccessService.verifyWriteAccess(notification.tripId, auth)
    return this.notificationsService.dismissNotification(id, dto)
  }
}
