/**
 * Notes Service
 *
 * Business logic for note CRUD operations with pagination and access control.
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { eq, and, ilike, sql, desc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { CreateNoteDto, UpdateNoteDto, NoteFilterDto } from './dto'
import type {
  NoteResponseDto,
  PaginatedNotesResponseDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class NotesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a new note
   */
  async create(
    dto: CreateNoteDto,
    agencyId: string,
    userId: string
  ): Promise<NoteResponseDto> {
    // Validate exactly one entity reference
    if (!dto.tripId && !dto.contactId) {
      throw new BadRequestException(
        'Either tripId or contactId must be provided'
      )
    }
    if (dto.tripId && dto.contactId) {
      throw new BadRequestException(
        'Only one of tripId or contactId can be provided'
      )
    }

    const [note] = await this.db.client
      .insert(this.db.schema.notes)
      .values({
        agencyId,
        content: dto.content,
        tripId: dto.tripId,
        contactId: dto.contactId,
        isPinned: dto.isPinned ?? false,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    if (!note) {
      throw new Error('Failed to create note')
    }

    return this.findOne(note.id, agencyId)
  }

  /**
   * Get paginated list of notes
   */
  async findAll(
    filters: NoteFilterDto,
    agencyId: string
  ): Promise<PaginatedNotesResponseDto> {
    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    const conditions = [eq(this.db.schema.notes.agencyId, agencyId)]

    if (filters.tripId) {
      conditions.push(eq(this.db.schema.notes.tripId, filters.tripId))
    }
    if (filters.contactId) {
      conditions.push(eq(this.db.schema.notes.contactId, filters.contactId))
    }
    if (filters.search) {
      conditions.push(
        ilike(this.db.schema.notes.content, `%${filters.search}%`)
      )
    }

    const whereClause = and(...conditions)

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(this.db.schema.notes)
      .where(whereClause)
    const count = countResult[0]?.count ?? 0

    // Get notes with creator info, ordered by pinned first then newest
    const creatorProfile = this.db.schema.userProfiles
    const updaterProfile = this.db.schema.userProfiles

    const rows = await this.db.client
      .select({
        note: this.db.schema.notes,
        creatorId: sql<string>`creator.id`.as('creator_id'),
        creatorFirstName: sql<string>`creator.first_name`.as(
          'creator_first_name'
        ),
        creatorLastName: sql<string>`creator.last_name`.as('creator_last_name'),
        creatorAvatarUrl: sql<string>`creator.avatar_url`.as(
          'creator_avatar_url'
        ),
        updaterId: sql<string>`updater.id`.as('updater_id'),
        updaterFirstName: sql<string>`updater.first_name`.as(
          'updater_first_name'
        ),
        updaterLastName: sql<string>`updater.last_name`.as('updater_last_name'),
        updaterAvatarUrl: sql<string>`updater.avatar_url`.as(
          'updater_avatar_url'
        ),
      })
      .from(this.db.schema.notes)
      .leftJoin(
        sql`${creatorProfile} as creator`,
        sql`creator.id = ${this.db.schema.notes.createdBy}`
      )
      .leftJoin(
        sql`${updaterProfile} as updater`,
        sql`updater.id = ${this.db.schema.notes.updatedBy}`
      )
      .where(whereClause)
      .orderBy(
        desc(this.db.schema.notes.isPinned),
        desc(this.db.schema.notes.createdAt)
      )
      .limit(limit)
      .offset(offset)

    const data: NoteResponseDto[] = rows.map((row) =>
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
   * Get a single note by ID
   */
  async findOne(id: string, agencyId: string): Promise<NoteResponseDto> {
    const creatorProfile = this.db.schema.userProfiles
    const updaterProfile = this.db.schema.userProfiles

    const [row] = await this.db.client
      .select({
        note: this.db.schema.notes,
        creatorId: sql<string>`creator.id`.as('creator_id'),
        creatorFirstName: sql<string>`creator.first_name`.as(
          'creator_first_name'
        ),
        creatorLastName: sql<string>`creator.last_name`.as('creator_last_name'),
        creatorAvatarUrl: sql<string>`creator.avatar_url`.as(
          'creator_avatar_url'
        ),
        updaterId: sql<string>`updater.id`.as('updater_id'),
        updaterFirstName: sql<string>`updater.first_name`.as(
          'updater_first_name'
        ),
        updaterLastName: sql<string>`updater.last_name`.as('updater_last_name'),
        updaterAvatarUrl: sql<string>`updater.avatar_url`.as(
          'updater_avatar_url'
        ),
      })
      .from(this.db.schema.notes)
      .leftJoin(
        sql`${creatorProfile} as creator`,
        sql`creator.id = ${this.db.schema.notes.createdBy}`
      )
      .leftJoin(
        sql`${updaterProfile} as updater`,
        sql`updater.id = ${this.db.schema.notes.updatedBy}`
      )
      .where(
        and(
          eq(this.db.schema.notes.id, id),
          eq(this.db.schema.notes.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!row) {
      throw new NotFoundException(`Note ${id} not found`)
    }

    return this.mapToResponse(row)
  }

  /**
   * Update a note (only creator or admin)
   */
  async update(
    id: string,
    dto: UpdateNoteDto,
    agencyId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<NoteResponseDto> {
    const existing = await this.findOne(id, agencyId)
    if (existing.createdBy !== userId && !isAdmin) {
      throw new ForbiddenException('Only the note creator or an admin can edit this note')
    }

    await this.db.client
      .update(this.db.schema.notes)
      .set({
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(this.db.schema.notes.id, id),
          eq(this.db.schema.notes.agencyId, agencyId)
        )
      )

    return this.findOne(id, agencyId)
  }

  /**
   * Delete a note (only creator or admin)
   */
  async remove(
    id: string,
    agencyId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<void> {
    const existing = await this.findOne(id, agencyId)
    if (existing.createdBy !== userId && !isAdmin) {
      throw new ForbiddenException('Only the note creator or an admin can delete this note')
    }

    await this.db.client
      .delete(this.db.schema.notes)
      .where(
        and(
          eq(this.db.schema.notes.id, id),
          eq(this.db.schema.notes.agencyId, agencyId)
        )
      )
  }

  /**
   * Toggle pin on a note (only creator or admin)
   */
  async togglePin(
    id: string,
    isPinned: boolean,
    agencyId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<NoteResponseDto> {
    const existing = await this.findOne(id, agencyId)
    if (existing.createdBy !== userId && !isAdmin) {
      throw new ForbiddenException('Only the note creator or an admin can pin this note')
    }

    await this.db.client
      .update(this.db.schema.notes)
      .set({
        isPinned,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(this.db.schema.notes.id, id),
          eq(this.db.schema.notes.agencyId, agencyId)
        )
      )

    return this.findOne(id, agencyId)
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapToResponse(row: any): NoteResponseDto {
    const note = row.note
    const result: NoteResponseDto = {
      id: note.id,
      agencyId: note.agencyId,
      content: note.content,
      tripId: note.tripId ?? undefined,
      contactId: note.contactId ?? undefined,
      isPinned: note.isPinned,
      createdBy: note.createdBy,
      createdByUser: {
        id: row.creatorId,
        firstName: row.creatorFirstName ?? undefined,
        lastName: row.creatorLastName ?? undefined,
        avatarUrl: row.creatorAvatarUrl ?? undefined,
      },
      updatedBy: note.updatedBy ?? undefined,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }

    if (row.updaterId) {
      result.updatedByUser = {
        id: row.updaterId,
        firstName: row.updaterFirstName ?? undefined,
        lastName: row.updaterLastName ?? undefined,
        avatarUrl: row.updaterAvatarUrl ?? undefined,
      }
    }

    return result
  }
}
