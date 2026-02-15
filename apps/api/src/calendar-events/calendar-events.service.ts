/**
 * Calendar Events Service
 *
 * CRUD operations for standalone calendar events with pagination and access control.
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { eq, and, ilike, sql, desc, gte, lte } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { CreateCalendarEventDto, UpdateCalendarEventDto, CalendarEventFilterDto } from './dto'
import type {
  CalendarEventResponseDto,
  PaginatedCalendarEventsResponseDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class CalendarEventsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a new calendar event
   */
  async create(
    dto: CreateCalendarEventDto,
    agencyId: string,
    userId: string
  ): Promise<CalendarEventResponseDto> {
    const [event] = await this.db.client
      .insert(this.db.schema.calendarEvents)
      .values({
        agencyId,
        title: dto.title,
        description: dto.description,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        allDay: dto.allDay ?? false,
        eventType: dto.eventType ?? 'meeting',
        contactId: dto.contactId,
        tripId: dto.tripId,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    if (!event) {
      throw new Error('Failed to create calendar event')
    }

    return this.findOne(event.id, agencyId)
  }

  /**
   * Get paginated list of calendar events
   */
  async findAll(
    filters: CalendarEventFilterDto,
    agencyId: string
  ): Promise<PaginatedCalendarEventsResponseDto> {
    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    const conditions = [eq(this.db.schema.calendarEvents.agencyId, agencyId)]

    if (filters.contactId) {
      conditions.push(eq(this.db.schema.calendarEvents.contactId, filters.contactId))
    }
    if (filters.tripId) {
      conditions.push(eq(this.db.schema.calendarEvents.tripId, filters.tripId))
    }
    if (filters.search) {
      conditions.push(
        ilike(this.db.schema.calendarEvents.title, `%${filters.search}%`)
      )
    }
    if (filters.upcoming) {
      conditions.push(gte(this.db.schema.calendarEvents.startAt, new Date()))
    }

    const whereClause = and(...conditions)

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(this.db.schema.calendarEvents)
      .where(whereClause)
    const count = countResult[0]?.count ?? 0

    // Get events with creator info
    const creatorProfile = this.db.schema.userProfiles

    const rows = await this.db.client
      .select({
        event: this.db.schema.calendarEvents,
        creatorId: sql<string>`creator.id`.as('creator_id'),
        creatorFirstName: sql<string>`creator.first_name`.as('creator_first_name'),
        creatorLastName: sql<string>`creator.last_name`.as('creator_last_name'),
        creatorAvatarUrl: sql<string>`creator.avatar_url`.as('creator_avatar_url'),
      })
      .from(this.db.schema.calendarEvents)
      .leftJoin(
        sql`${creatorProfile} as creator`,
        sql`creator.id = ${this.db.schema.calendarEvents.createdBy}`
      )
      .where(whereClause)
      .orderBy(desc(this.db.schema.calendarEvents.startAt))
      .limit(limit)
      .offset(offset)

    const data: CalendarEventResponseDto[] = rows.map((row) =>
      this.mapToResponse(row)
    )

    return {
      data,
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    }
  }

  /**
   * Get a single calendar event by ID
   */
  async findOne(id: string, agencyId: string): Promise<CalendarEventResponseDto> {
    const creatorProfile = this.db.schema.userProfiles

    const [row] = await this.db.client
      .select({
        event: this.db.schema.calendarEvents,
        creatorId: sql<string>`creator.id`.as('creator_id'),
        creatorFirstName: sql<string>`creator.first_name`.as('creator_first_name'),
        creatorLastName: sql<string>`creator.last_name`.as('creator_last_name'),
        creatorAvatarUrl: sql<string>`creator.avatar_url`.as('creator_avatar_url'),
      })
      .from(this.db.schema.calendarEvents)
      .leftJoin(
        sql`${creatorProfile} as creator`,
        sql`creator.id = ${this.db.schema.calendarEvents.createdBy}`
      )
      .where(
        and(
          eq(this.db.schema.calendarEvents.id, id),
          eq(this.db.schema.calendarEvents.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!row) {
      throw new NotFoundException(`Calendar event ${id} not found`)
    }

    return this.mapToResponse(row)
  }

  /**
   * Update a calendar event (only creator or admin)
   */
  async update(
    id: string,
    dto: UpdateCalendarEventDto,
    agencyId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<CalendarEventResponseDto> {
    const existing = await this.findOne(id, agencyId)
    if (existing.createdBy !== userId && !isAdmin) {
      throw new ForbiddenException('Only the event creator or an admin can edit this event')
    }

    const updateData: Record<string, unknown> = {
      updatedBy: userId,
      updatedAt: new Date(),
    }

    if (dto.title !== undefined) updateData.title = dto.title
    if (dto.description !== undefined) updateData.description = dto.description
    if (dto.startAt !== undefined) updateData.startAt = new Date(dto.startAt)
    if (dto.endAt !== undefined) updateData.endAt = new Date(dto.endAt)
    if (dto.allDay !== undefined) updateData.allDay = dto.allDay
    if (dto.eventType !== undefined) updateData.eventType = dto.eventType

    await this.db.client
      .update(this.db.schema.calendarEvents)
      .set(updateData)
      .where(
        and(
          eq(this.db.schema.calendarEvents.id, id),
          eq(this.db.schema.calendarEvents.agencyId, agencyId)
        )
      )

    return this.findOne(id, agencyId)
  }

  /**
   * Delete a calendar event (only creator or admin)
   */
  async remove(
    id: string,
    agencyId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<void> {
    const existing = await this.findOne(id, agencyId)
    if (existing.createdBy !== userId && !isAdmin) {
      throw new ForbiddenException('Only the event creator or an admin can delete this event')
    }

    await this.db.client
      .delete(this.db.schema.calendarEvents)
      .where(
        and(
          eq(this.db.schema.calendarEvents.id, id),
          eq(this.db.schema.calendarEvents.agencyId, agencyId)
        )
      )
  }

  /**
   * Find calendar events within a date range (for calendar aggregation)
   * No pagination — returns all matching rows.
   */
  async findInRange(
    start: string,
    end: string,
    agencyId: string,
    contactId?: string,
    tripId?: string
  ) {
    const conditions = [
      eq(this.db.schema.calendarEvents.agencyId, agencyId),
      gte(this.db.schema.calendarEvents.startAt, new Date(start)),
      lte(this.db.schema.calendarEvents.startAt, new Date(end)),
    ]

    if (contactId) {
      conditions.push(eq(this.db.schema.calendarEvents.contactId, contactId))
    }
    if (tripId) {
      conditions.push(eq(this.db.schema.calendarEvents.tripId, tripId))
    }

    return this.db.client
      .select()
      .from(this.db.schema.calendarEvents)
      .where(and(...conditions))
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapToResponse(row: any): CalendarEventResponseDto {
    const event = row.event
    return {
      id: event.id,
      agencyId: event.agencyId,
      title: event.title,
      description: event.description ?? undefined,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt?.toISOString() ?? undefined,
      allDay: event.allDay,
      eventType: event.eventType,
      contactId: event.contactId ?? undefined,
      tripId: event.tripId ?? undefined,
      createdBy: event.createdBy,
      createdByUser: {
        id: row.creatorId,
        firstName: row.creatorFirstName ?? undefined,
        lastName: row.creatorLastName ?? undefined,
        avatarUrl: row.creatorAvatarUrl ?? undefined,
      },
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    }
  }
}
