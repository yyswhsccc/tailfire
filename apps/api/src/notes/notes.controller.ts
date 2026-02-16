/**
 * Notes Controller
 *
 * REST API endpoints for the central notes system.
 * Enforces entity-level access control before delegating to NotesService.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { NotesService } from './notes.service'
import { CreateNoteDto, UpdateNoteDto, NoteFilterDto } from './dto'
import type {
  NoteResponseDto,
  PaginatedNotesResponseDto,
} from '../../../../packages/shared-types/src/api'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { TripAccessService } from '../trips/trip-access.service'
import { ContactsService } from '../contacts/contacts.service'

@ApiTags('Notes')
@Controller('notes')
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    private readonly tripAccessService: TripAccessService,
    private readonly contactsService: ContactsService
  ) {}

  /**
   * Create a new note
   * POST /notes
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateNoteDto
  ): Promise<NoteResponseDto> {
    // Verify entity access before creating
    await this.verifyEntityAccess(dto.tripId, dto.contactId, auth)
    return this.notesService.create(dto, auth.agencyId, auth.userId)
  }

  /**
   * Get all notes with filtering and pagination
   * GET /notes
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Query() filters: NoteFilterDto
  ): Promise<PaginatedNotesResponseDto> {
    // Verify entity access for filtered queries
    if (filters.tripId) {
      await this.tripAccessService.verifyReadAccess(filters.tripId, auth)
    }
    if (filters.contactId) {
      await this.contactsService.findOne(filters.contactId, auth.agencyId)
    }
    return this.notesService.findAll(filters, auth.agencyId)
  }

  /**
   * Get a single note by ID
   * GET /notes/:id
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<NoteResponseDto> {
    return this.notesService.findOne(id, auth.agencyId)
  }

  /**
   * Update a note
   * PUT /notes/:id
   */
  @Put(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto
  ): Promise<NoteResponseDto> {
    return this.notesService.update(
      id,
      dto,
      auth.agencyId,
      auth.userId,
      auth.role === 'admin'
    )
  }

  /**
   * Delete a note
   * DELETE /notes/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<void> {
    return this.notesService.remove(
      id,
      auth.agencyId,
      auth.userId,
      auth.role === 'admin'
    )
  }

  /**
   * Toggle pin on a note
   * PATCH /notes/:id/pin
   */
  @Patch(':id/pin')
  async togglePin(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { isPinned: boolean }
  ): Promise<NoteResponseDto> {
    return this.notesService.togglePin(
      id,
      body.isPinned,
      auth.agencyId,
      auth.userId,
      auth.role === 'admin'
    )
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Verify the user has access to the target entity before creating a note
   */
  private async verifyEntityAccess(
    tripId: string | undefined,
    contactId: string | undefined,
    auth: AuthContext
  ): Promise<void> {
    if (!tripId && !contactId) {
      throw new BadRequestException(
        'Either tripId or contactId must be provided'
      )
    }
    if (tripId) {
      await this.tripAccessService.verifyReadAccess(tripId, auth)
    }
    if (contactId) {
      // findOne throws NotFoundException if not found or not in agency
      await this.contactsService.findOne(contactId, auth.agencyId)
    }
  }
}
