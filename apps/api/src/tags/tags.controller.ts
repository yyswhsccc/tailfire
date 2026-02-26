/**
 * Tags Controller
 *
 * REST API endpoints for multi-tenant, type-aware tag management.
 * Uses @GetAuthContext() for agency/user scoping on all endpoints.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TagsService } from './tags.service'
import {
  CreateTagDto,
  UpdateTagDto,
  TagFilterDto,
  UpdateEntityTagsDto,
  CreateAndAssignTagDto,
} from './dto'
import type {
  TagResponseDto,
  TagWithUsageDto,
} from '@tailfire/shared-types'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { TripAccessService } from '../trips/trip-access.service'
import { ContactAccessService } from '../contacts/contact-access.service'
import { DatabaseService } from '../db/database.service'
import { eq } from 'drizzle-orm'

@ApiTags('Tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * Get all tags with optional filtering and usage counts
   * GET /tags?search=vacation&category=trip-type&type=system
   */
  @Get()
  async findAll(
    @Query() filters: TagFilterDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagWithUsageDto[]> {
    return this.tagsService.findAll(filters, auth)
  }

  /**
   * Create a new tag
   * POST /tags
   * System tags require admin role
   */
  @Post()
  async create(
    @Body() createTagDto: CreateTagDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto> {
    return this.tagsService.create(createTagDto, auth)
  }

  /**
   * Get a single tag by ID
   * GET /tags/:id
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto> {
    return this.tagsService.findOne(id, auth)
  }

  /**
   * Update a tag
   * PATCH /tags/:id
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTagDto: UpdateTagDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto> {
    return this.tagsService.update(id, updateTagDto, auth)
  }

  /**
   * Delete a tag
   * DELETE /tags/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @GetAuthContext() auth: AuthContext,
  ): Promise<void> {
    return this.tagsService.remove(id, auth)
  }
}

/**
 * Trip Tags Controller
 * Endpoints for managing tags on trips.
 * Verifies trip access before allowing tag operations.
 */
@ApiTags('Trip Tags')
@Controller('trips/:tripId/tags')
export class TripTagsController {
  constructor(
    private readonly tagsService: TagsService,
    private readonly tripAccess: TripAccessService,
  ) {}

  @Get()
  async getTags(
    @Param('tripId') tripId: string,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto[]> {
    await this.tripAccess.verifyReadAccess(tripId, auth)
    return this.tagsService.getTagsForTrip(tripId, auth)
  }

  @Put()
  async updateTags(
    @Param('tripId') tripId: string,
    @Body() dto: UpdateEntityTagsDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto[]> {
    await this.tripAccess.verifyWriteAccess(tripId, auth)
    return this.tagsService.updateTripTags(tripId, dto.tagIds, auth)
  }

  @Post()
  async createAndAssignTag(
    @Param('tripId') tripId: string,
    @Body() dto: CreateAndAssignTagDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto> {
    await this.tripAccess.verifyWriteAccess(tripId, auth)
    return this.tagsService.createAndAssignToTrip(tripId, dto, auth)
  }
}

/**
 * Contact Tags Controller
 * Endpoints for managing tags on contacts.
 * Verifies contact access before allowing tag operations.
 */
@ApiTags('Contact Tags')
@Controller('contacts/:contactId/tags')
export class ContactTagsController {
  constructor(
    private readonly tagsService: TagsService,
    private readonly contactAccess: ContactAccessService,
  ) {}

  @Get()
  async getTags(
    @Param('contactId') contactId: string,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto[]> {
    const access = await this.contactAccess.canAccessSensitiveData(contactId, auth)
    if (!access.canAccessBasic) {
      throw new ForbiddenException(access.reason)
    }
    return this.tagsService.getTagsForContact(contactId, auth)
  }

  @Put()
  async updateTags(
    @Param('contactId') contactId: string,
    @Body() dto: UpdateEntityTagsDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto[]> {
    const access = await this.contactAccess.canAccessSensitiveData(contactId, auth)
    if (!access.canAccessSensitive) {
      throw new ForbiddenException(access.canAccessBasic
        ? 'You have read-only access to this contact'
        : access.reason)
    }
    return this.tagsService.updateContactTags(contactId, dto.tagIds, auth)
  }

  @Post()
  async createAndAssignTag(
    @Param('contactId') contactId: string,
    @Body() dto: CreateAndAssignTagDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto> {
    const access = await this.contactAccess.canAccessSensitiveData(contactId, auth)
    if (!access.canAccessSensitive) {
      throw new ForbiddenException(access.canAccessBasic
        ? 'You have read-only access to this contact'
        : access.reason)
    }
    return this.tagsService.createAndAssignToContact(contactId, dto, auth)
  }
}

/**
 * Calendar Event Tags Controller
 * Endpoints for managing tags on calendar events.
 * Verifies calendar event agency ownership before allowing tag operations.
 */
@ApiTags('Calendar Event Tags')
@Controller('calendar-events/:eventId/tags')
export class CalendarEventTagsController {
  constructor(
    private readonly tagsService: TagsService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Verify the calendar event belongs to the caller's agency.
   * Returns the event's createdBy for write-level checks.
   */
  private async verifyEventAccess(eventId: string, agencyId: string): Promise<{ createdBy: string }> {
    const [event] = await this.db.client
      .select({
        agencyId: this.db.schema.calendarEvents.agencyId,
        createdBy: this.db.schema.calendarEvents.createdBy,
      })
      .from(this.db.schema.calendarEvents)
      .where(eq(this.db.schema.calendarEvents.id, eventId))
      .limit(1)

    if (!event) {
      throw new NotFoundException(`Calendar event with ID ${eventId} not found`)
    }
    if (event.agencyId !== agencyId) {
      throw new ForbiddenException('Calendar event belongs to a different agency')
    }
    return { createdBy: event.createdBy }
  }

  @Get()
  async getTags(
    @Param('eventId') eventId: string,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto[]> {
    await this.verifyEventAccess(eventId, auth.agencyId)
    return this.tagsService.getTagsForCalendarEvent(eventId, auth)
  }

  @Put()
  async updateTags(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEntityTagsDto,
    @GetAuthContext() auth: AuthContext,
  ): Promise<TagResponseDto[]> {
    const event = await this.verifyEventAccess(eventId, auth.agencyId)
    if (event.createdBy !== auth.userId && auth.role !== 'admin') {
      throw new ForbiddenException('Only the event creator or an admin can modify event tags')
    }
    return this.tagsService.updateCalendarEventTags(eventId, dto.tagIds, auth)
  }
}
