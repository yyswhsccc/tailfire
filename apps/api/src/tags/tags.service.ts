/**
 * Tags Service
 *
 * Multi-tenant, type-aware tag management.
 *
 * Tag visibility rules:
 * - System tags: visible to all agents in the agency (admin-only CRUD)
 * - Agent tags: visible only to the creating agent
 *
 * Private tag safety: replace operations only touch tags the caller can see,
 * preserving other agents' private tags on the entity.
 */

import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { eq, ilike, desc, asc, sql, and, inArray, or } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type {
  TagResponseDto,
  TagWithUsageDto,
  CreateTagDto,
  UpdateTagDto,
  TagFilterDto,
  CreateAndAssignTagDto,
} from '@tailfire/shared-types'

interface TagAuthContext {
  agencyId: string
  userId: string
  role: 'admin' | 'user'
}

@Injectable()
export class TagsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Build visibility condition: system tags for agency + own agent tags
   */
  private visibilityCondition(agencyId: string, userId: string) {
    return and(
      eq(this.db.schema.tags.agencyId, agencyId),
      or(
        eq(this.db.schema.tags.type, 'system'),
        and(
          eq(this.db.schema.tags.type, 'agent'),
          eq(this.db.schema.tags.createdBy, userId),
        ),
      ),
    )
  }

  /**
   * Format a tag row into a response DTO
   */
  private formatTag(tag: {
    id: string
    name: string
    category: string | null
    color: string | null
    type: string
    createdBy: string | null
    createdAt: Date
    updatedAt: Date
  }): TagResponseDto {
    return {
      id: tag.id,
      name: tag.name,
      category: tag.category,
      color: tag.color,
      type: tag.type as 'system' | 'agent',
      createdBy: tag.createdBy,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
    }
  }

  /**
   * Get all tags with optional filtering and usage counts
   */
  async findAll(filters: TagFilterDto, auth: TagAuthContext): Promise<TagWithUsageDto[]> {
    const {
      search,
      category,
      type,
      sortBy = 'name',
      sortOrder = 'asc',
      limit = 100,
      offset = 0,
    } = filters

    // Build where conditions with visibility
    const conditions = [this.visibilityCondition(auth.agencyId, auth.userId)!]

    if (search) {
      conditions.push(ilike(this.db.schema.tags.name, `%${search}%`))
    }
    if (category) {
      conditions.push(eq(this.db.schema.tags.category, category))
    }
    if (type) {
      conditions.push(eq(this.db.schema.tags.type, type))
    }

    // Query tags with usage counts across all entity types
    const tags = await this.db.client
      .select({
        id: this.db.schema.tags.id,
        name: this.db.schema.tags.name,
        category: this.db.schema.tags.category,
        color: this.db.schema.tags.color,
        type: this.db.schema.tags.type,
        createdBy: this.db.schema.tags.createdBy,
        createdAt: this.db.schema.tags.createdAt,
        updatedAt: this.db.schema.tags.updatedAt,
        tripCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${this.db.schema.tripTags}
          WHERE ${this.db.schema.tripTags.tagId} = ${this.db.schema.tags.id}
        )`,
        contactCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${this.db.schema.contactTags}
          WHERE ${this.db.schema.contactTags.tagId} = ${this.db.schema.tags.id}
        )`,
        taskCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM task_tags
          WHERE task_tags.tag_id = ${this.db.schema.tags.id}
        )`,
        eventCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${this.db.schema.calendarEventTags}
          WHERE ${this.db.schema.calendarEventTags.tagId} = ${this.db.schema.tags.id}
        )`,
      })
      .from(this.db.schema.tags)
      .where(and(...conditions))
      .orderBy(
        sortBy === 'usageCount'
          ? (sortOrder === 'asc'
            ? sql`(
                (SELECT COUNT(*) FROM ${this.db.schema.tripTags} WHERE ${this.db.schema.tripTags.tagId} = ${this.db.schema.tags.id}) +
                (SELECT COUNT(*) FROM ${this.db.schema.contactTags} WHERE ${this.db.schema.contactTags.tagId} = ${this.db.schema.tags.id}) +
                (SELECT COUNT(*) FROM task_tags WHERE task_tags.tag_id = ${this.db.schema.tags.id}) +
                (SELECT COUNT(*) FROM ${this.db.schema.calendarEventTags} WHERE ${this.db.schema.calendarEventTags.tagId} = ${this.db.schema.tags.id})
              ) ASC`
            : sql`(
                (SELECT COUNT(*) FROM ${this.db.schema.tripTags} WHERE ${this.db.schema.tripTags.tagId} = ${this.db.schema.tags.id}) +
                (SELECT COUNT(*) FROM ${this.db.schema.contactTags} WHERE ${this.db.schema.contactTags.tagId} = ${this.db.schema.tags.id}) +
                (SELECT COUNT(*) FROM task_tags WHERE task_tags.tag_id = ${this.db.schema.tags.id}) +
                (SELECT COUNT(*) FROM ${this.db.schema.calendarEventTags} WHERE ${this.db.schema.calendarEventTags.tagId} = ${this.db.schema.tags.id})
              ) DESC`)
          : (sortOrder === 'asc'
            ? asc(this.db.schema.tags[sortBy])
            : desc(this.db.schema.tags[sortBy]))
      )
      .limit(limit)
      .offset(offset)

    return tags.map((tag) => ({
      ...this.formatTag(tag),
      tripCount: tag.tripCount,
      contactCount: tag.contactCount,
      taskCount: tag.taskCount,
      eventCount: tag.eventCount,
      usageCount: tag.tripCount + tag.contactCount + tag.taskCount + tag.eventCount,
    }))
  }

  /**
   * Get a single tag by ID (with visibility check)
   */
  async findOne(id: string, auth: TagAuthContext): Promise<TagResponseDto> {
    const [tag] = await this.db.client
      .select()
      .from(this.db.schema.tags)
      .where(and(
        eq(this.db.schema.tags.id, id),
        this.visibilityCondition(auth.agencyId, auth.userId),
      ))
      .limit(1)

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`)
    }

    return this.formatTag(tag)
  }

  /**
   * Create a new tag
   * - System tags: admin only
   * - Agent tags: any authenticated user (defaults to agent type for non-admins)
   */
  async create(dto: CreateTagDto, auth: TagAuthContext): Promise<TagResponseDto> {
    const tagType = dto.type || (auth.role === 'admin' ? 'system' : 'agent')

    // Only admins can create system tags
    if (tagType === 'system' && auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can create system tags')
    }

    // Check for name collision within scope
    const scopeConditions = [
      eq(this.db.schema.tags.agencyId, auth.agencyId),
      eq(this.db.schema.tags.type, tagType),
      ilike(this.db.schema.tags.name, dto.name.trim()),
    ]
    if (tagType === 'agent') {
      scopeConditions.push(eq(this.db.schema.tags.createdBy, auth.userId))
    }

    const existing = await this.db.client
      .select()
      .from(this.db.schema.tags)
      .where(and(...scopeConditions))
      .limit(1)

    if (existing.length > 0) {
      throw new ConflictException(`Tag with name "${dto.name}" already exists`)
    }

    const [tag] = await this.db.client
      .insert(this.db.schema.tags)
      .values({
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        color: dto.color?.trim() || null,
        agencyId: auth.agencyId,
        type: tagType,
        createdBy: tagType === 'agent' ? auth.userId : null,
      })
      .returning()

    return this.formatTag(tag!)
  }

  /**
   * Update a tag
   * - System tags: admin only
   * - Agent tags: owner only
   */
  async update(id: string, dto: UpdateTagDto, auth: TagAuthContext): Promise<TagResponseDto> {
    const existing = await this.findOne(id, auth)

    // Auth check
    if (existing.type === 'system' && auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can edit system tags')
    }
    if (existing.type === 'agent' && existing.createdBy !== auth.userId) {
      throw new ForbiddenException('You can only edit your own tags')
    }

    // If updating name, check for conflicts within scope
    if (dto.name) {
      const scopeConditions = [
        eq(this.db.schema.tags.agencyId, auth.agencyId),
        eq(this.db.schema.tags.type, existing.type),
        ilike(this.db.schema.tags.name, dto.name),
        sql`${this.db.schema.tags.id} != ${id}`,
      ]
      if (existing.type === 'agent') {
        scopeConditions.push(eq(this.db.schema.tags.createdBy, auth.userId))
      }

      const conflict = await this.db.client
        .select()
        .from(this.db.schema.tags)
        .where(and(...scopeConditions))
        .limit(1)

      if (conflict.length > 0) {
        throw new ConflictException(`Tag with name "${dto.name}" already exists`)
      }
    }

    const [tag] = await this.db.client
      .update(this.db.schema.tags)
      .set({
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.category !== undefined && { category: dto.category?.trim() || null }),
        ...(dto.color !== undefined && { color: dto.color?.trim() || null }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.tags.id, id))
      .returning()

    return this.formatTag(tag!)
  }

  /**
   * Delete a tag (cascade removes all junction entries)
   */
  async remove(id: string, auth: TagAuthContext): Promise<void> {
    const existing = await this.findOne(id, auth)

    if (existing.type === 'system' && auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete system tags')
    }
    if (existing.type === 'agent' && existing.createdBy !== auth.userId) {
      throw new ForbiddenException('You can only delete your own tags')
    }

    await this.db.client
      .delete(this.db.schema.tags)
      .where(eq(this.db.schema.tags.id, id))
  }

  // ===========================================================================
  // Trip Tag Operations
  // ===========================================================================

  async getTagsForTrip(tripId: string, auth: TagAuthContext): Promise<TagResponseDto[]> {
    const tags = await this.db.client
      .select({
        id: this.db.schema.tags.id,
        name: this.db.schema.tags.name,
        category: this.db.schema.tags.category,
        color: this.db.schema.tags.color,
        type: this.db.schema.tags.type,
        createdBy: this.db.schema.tags.createdBy,
        createdAt: this.db.schema.tags.createdAt,
        updatedAt: this.db.schema.tags.updatedAt,
      })
      .from(this.db.schema.tags)
      .innerJoin(
        this.db.schema.tripTags,
        eq(this.db.schema.tags.id, this.db.schema.tripTags.tagId)
      )
      .where(and(
        eq(this.db.schema.tripTags.tripId, tripId),
        this.visibilityCondition(auth.agencyId, auth.userId),
      ))
      .orderBy(asc(this.db.schema.tags.name))

    return tags.map((tag) => this.formatTag(tag))
  }

  /**
   * Replace tags for a trip.
   * CRITICAL: Only replaces tags the caller can see (system + own agent).
   * Preserves other agents' private tags.
   */
  async updateTripTags(tripId: string, tagIds: string[], auth: TagAuthContext): Promise<TagResponseDto[]> {
    // Verify all provided tag IDs exist and are visible to this user
    if (tagIds.length > 0) {
      const validTags = await this.db.client
        .select({ id: this.db.schema.tags.id })
        .from(this.db.schema.tags)
        .where(and(
          inArray(this.db.schema.tags.id, tagIds),
          this.visibilityCondition(auth.agencyId, auth.userId),
        ))

      if (validTags.length !== tagIds.length) {
        throw new BadRequestException('One or more tag IDs are invalid')
      }
    }

    // Delete only junctions for tags the caller can see (preserve other agents' private tags)
    await this.db.client.execute(sql`
      DELETE FROM trip_tags
      WHERE trip_id = ${tripId}
      AND tag_id IN (
        SELECT id FROM tags
        WHERE agency_id = ${auth.agencyId}
        AND (type = 'system' OR (type = 'agent' AND created_by = ${auth.userId}))
      )
    `)

    // Insert new associations
    if (tagIds.length > 0) {
      await this.db.client
        .insert(this.db.schema.tripTags)
        .values(tagIds.map((tagId) => ({ tripId, tagId })))
        .onConflictDoNothing()
    }

    return this.getTagsForTrip(tripId, auth)
  }

  async createAndAssignToTrip(
    tripId: string,
    dto: CreateAndAssignTagDto,
    auth: TagAuthContext,
  ): Promise<TagResponseDto> {
    const tag = await this.create(dto, auth)

    await this.db.client
      .insert(this.db.schema.tripTags)
      .values({ tripId, tagId: tag.id })

    return tag
  }

  // ===========================================================================
  // Contact Tag Operations
  // ===========================================================================

  async getTagsForContact(contactId: string, auth: TagAuthContext): Promise<TagResponseDto[]> {
    const tags = await this.db.client
      .select({
        id: this.db.schema.tags.id,
        name: this.db.schema.tags.name,
        category: this.db.schema.tags.category,
        color: this.db.schema.tags.color,
        type: this.db.schema.tags.type,
        createdBy: this.db.schema.tags.createdBy,
        createdAt: this.db.schema.tags.createdAt,
        updatedAt: this.db.schema.tags.updatedAt,
      })
      .from(this.db.schema.tags)
      .innerJoin(
        this.db.schema.contactTags,
        eq(this.db.schema.tags.id, this.db.schema.contactTags.tagId)
      )
      .where(and(
        eq(this.db.schema.contactTags.contactId, contactId),
        this.visibilityCondition(auth.agencyId, auth.userId),
      ))
      .orderBy(asc(this.db.schema.tags.name))

    return tags.map((tag) => this.formatTag(tag))
  }

  async updateContactTags(contactId: string, tagIds: string[], auth: TagAuthContext): Promise<TagResponseDto[]> {
    if (tagIds.length > 0) {
      const validTags = await this.db.client
        .select({ id: this.db.schema.tags.id })
        .from(this.db.schema.tags)
        .where(and(
          inArray(this.db.schema.tags.id, tagIds),
          this.visibilityCondition(auth.agencyId, auth.userId),
        ))

      if (validTags.length !== tagIds.length) {
        throw new BadRequestException('One or more tag IDs are invalid')
      }
    }

    // Delete only visible tags (preserve other agents' private tags)
    await this.db.client.execute(sql`
      DELETE FROM contact_tags
      WHERE contact_id = ${contactId}
      AND tag_id IN (
        SELECT id FROM tags
        WHERE agency_id = ${auth.agencyId}
        AND (type = 'system' OR (type = 'agent' AND created_by = ${auth.userId}))
      )
    `)

    if (tagIds.length > 0) {
      await this.db.client
        .insert(this.db.schema.contactTags)
        .values(tagIds.map((tagId) => ({ contactId, tagId })))
        .onConflictDoNothing()
    }

    return this.getTagsForContact(contactId, auth)
  }

  async createAndAssignToContact(
    contactId: string,
    dto: CreateAndAssignTagDto,
    auth: TagAuthContext,
  ): Promise<TagResponseDto> {
    const tag = await this.create(dto, auth)

    await this.db.client
      .insert(this.db.schema.contactTags)
      .values({ contactId, tagId: tag.id })

    return tag
  }

  // ===========================================================================
  // Calendar Event Tag Operations
  // ===========================================================================

  async getTagsForCalendarEvent(calendarEventId: string, auth: TagAuthContext): Promise<TagResponseDto[]> {
    const tags = await this.db.client
      .select({
        id: this.db.schema.tags.id,
        name: this.db.schema.tags.name,
        category: this.db.schema.tags.category,
        color: this.db.schema.tags.color,
        type: this.db.schema.tags.type,
        createdBy: this.db.schema.tags.createdBy,
        createdAt: this.db.schema.tags.createdAt,
        updatedAt: this.db.schema.tags.updatedAt,
      })
      .from(this.db.schema.tags)
      .innerJoin(
        this.db.schema.calendarEventTags,
        eq(this.db.schema.tags.id, this.db.schema.calendarEventTags.tagId)
      )
      .where(and(
        eq(this.db.schema.calendarEventTags.calendarEventId, calendarEventId),
        this.visibilityCondition(auth.agencyId, auth.userId),
      ))
      .orderBy(asc(this.db.schema.tags.name))

    return tags.map((tag) => this.formatTag(tag))
  }

  async updateCalendarEventTags(calendarEventId: string, tagIds: string[], auth: TagAuthContext): Promise<TagResponseDto[]> {
    if (tagIds.length > 0) {
      const validTags = await this.db.client
        .select({ id: this.db.schema.tags.id })
        .from(this.db.schema.tags)
        .where(and(
          inArray(this.db.schema.tags.id, tagIds),
          this.visibilityCondition(auth.agencyId, auth.userId),
        ))

      if (validTags.length !== tagIds.length) {
        throw new BadRequestException('One or more tag IDs are invalid')
      }
    }

    await this.db.client.execute(sql`
      DELETE FROM calendar_event_tags
      WHERE calendar_event_id = ${calendarEventId}
      AND tag_id IN (
        SELECT id FROM tags
        WHERE agency_id = ${auth.agencyId}
        AND (type = 'system' OR (type = 'agent' AND created_by = ${auth.userId}))
      )
    `)

    if (tagIds.length > 0) {
      await this.db.client
        .insert(this.db.schema.calendarEventTags)
        .values(tagIds.map((tagId) => ({ calendarEventId, tagId })))
        .onConflictDoNothing()
    }

    return this.getTagsForCalendarEvent(calendarEventId, auth)
  }
}
