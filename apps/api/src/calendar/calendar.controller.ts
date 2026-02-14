/**
 * Calendar Controller
 *
 * REST API endpoints for calendar event aggregation.
 */

import {
  Controller,
  Get,
  Query,
  Param,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CalendarService } from './calendar.service'
import { CalendarQueryDto, DateRangeQueryDto } from './dto'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  CalendarEventsResponseDto,
  TodayEventsResponseDto,
  ContactEventsResponseDto,
  TripEventsResponseDto,
} from '../../../../packages/shared-types/src/api'

@ApiTags('Calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  /**
   * Get calendar events within a date range
   * GET /calendar/events?start=2026-01-01&end=2026-01-31&types[]=task&types[]=trip
   */
  @Get('events')
  async getEvents(
    @GetAuthContext() auth: AuthContext,
    @Query() query: CalendarQueryDto
  ): Promise<CalendarEventsResponseDto> {
    return this.calendarService.getEvents(query, auth)
  }

  /**
   * Get today's events (for navbar preview)
   * GET /calendar/events/today
   */
  @Get('events/today')
  async getTodayEvents(
    @GetAuthContext() auth: AuthContext
  ): Promise<TodayEventsResponseDto> {
    return this.calendarService.getTodayEvents(auth)
  }

  /**
   * Get events for a specific contact
   * GET /calendar/contacts/:id/events?start=2026-01-01&end=2026-12-31
   */
  @Get('contacts/:id/events')
  async getContactEvents(
    @GetAuthContext() auth: AuthContext,
    @Param('id') contactId: string,
    @Query() query: DateRangeQueryDto
  ): Promise<ContactEventsResponseDto> {
    return this.calendarService.getContactEvents(contactId, query, auth)
  }

  /**
   * Get events for a specific trip
   * GET /calendar/trips/:id/events?start=2026-01-01&end=2026-12-31
   */
  @Get('trips/:id/events')
  async getTripEvents(
    @GetAuthContext() auth: AuthContext,
    @Param('id') tripId: string,
    @Query() query: DateRangeQueryDto
  ): Promise<TripEventsResponseDto> {
    return this.calendarService.getTripEvents(tripId, query, auth)
  }
}
