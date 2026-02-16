/**
 * Calendar Events Controller
 *
 * REST API endpoints for standalone calendar events.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CalendarEventsService } from './calendar-events.service'
import { CreateCalendarEventDto, UpdateCalendarEventDto, CalendarEventFilterDto } from './dto'
import type {
  CalendarEventResponseDto,
  PaginatedCalendarEventsResponseDto,
} from '../../../../packages/shared-types/src/api'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'

@ApiTags('Calendar Events')
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(
    private readonly calendarEventsService: CalendarEventsService
  ) {}

  /**
   * Create a new calendar event
   * POST /calendar-events
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateCalendarEventDto
  ): Promise<CalendarEventResponseDto> {
    return this.calendarEventsService.create(dto, auth.agencyId, auth.userId)
  }

  /**
   * Get all calendar events with filtering and pagination
   * GET /calendar-events
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Query() filters: CalendarEventFilterDto
  ): Promise<PaginatedCalendarEventsResponseDto> {
    return this.calendarEventsService.findAll(filters, auth.agencyId)
  }

  /**
   * Get a single calendar event by ID
   * GET /calendar-events/:id
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<CalendarEventResponseDto> {
    return this.calendarEventsService.findOne(id, auth.agencyId)
  }

  /**
   * Update a calendar event
   * PUT /calendar-events/:id
   */
  @Put(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto
  ): Promise<CalendarEventResponseDto> {
    return this.calendarEventsService.update(
      id,
      dto,
      auth.agencyId,
      auth.userId,
      auth.role === 'admin'
    )
  }

  /**
   * Delete a calendar event
   * DELETE /calendar-events/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<void> {
    return this.calendarEventsService.remove(
      id,
      auth.agencyId,
      auth.userId,
      auth.role === 'admin'
    )
  }
}
