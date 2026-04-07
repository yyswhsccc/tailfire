/**
 * Contact Relationships Controller
 *
 * REST API endpoints for managing relationships between contacts.
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
  ForbiddenException,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ContactRelationshipsService } from './contact-relationships.service'
import {
  CreateContactRelationshipDto,
  UpdateContactRelationshipDto,
  ContactRelationshipFilterDto,
} from './dto'
import type {
  ContactRelationshipResponseDto,
} from '../../../../packages/shared-types/src/api'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ContactAccessService } from './contact-access.service'

@ApiTags('Contact Relationships')
@Controller('contacts/:contactId/relationships')
export class ContactRelationshipsController {
  constructor(
    private readonly relationshipsService: ContactRelationshipsService,
    private readonly contactAccessService: ContactAccessService,
  ) {}

  /**
   * Create a new relationship for a contact
   * POST /contacts/:contactId/relationships
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Body() dto: CreateContactRelationshipDto,
  ): Promise<ContactRelationshipResponseDto> {
    if (auth.role !== 'admin') {
      const access1 = await this.contactAccessService.canAccessSensitiveData(contactId, auth)
      const access2 = await this.contactAccessService.canAccessSensitiveData(dto.contactId2, auth)
      if (!access1.canAccessSensitive || !access2.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to manage relationships')
      }
    }
    return this.relationshipsService.create(contactId, dto, auth.agencyId)
  }

  /**
   * Get all relationships with optional filters
   * GET /contacts/:contactId/relationships?category=family
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Query() filters: ContactRelationshipFilterDto,
  ): Promise<ContactRelationshipResponseDto[]> {
    if (auth.role !== 'admin') {
      const access = await this.contactAccessService.canAccessSensitiveData(contactId, auth)
      if (!access.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to view relationships')
      }
    }
    return this.relationshipsService.findAll({ ...filters, contactId }, auth.agencyId)
  }

  /**
   * Update a relationship
   * PUT /contacts/:contactId/relationships/:id
   */
  @Put(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateContactRelationshipDto,
  ): Promise<ContactRelationshipResponseDto> {
    const relationship = await this.relationshipsService.findOne(id)
    if (auth.role !== 'admin') {
      const access1 = await this.contactAccessService.canAccessSensitiveData(relationship.contactId1, auth)
      const access2 = await this.contactAccessService.canAccessSensitiveData(relationship.contactId2, auth)
      if (!access1.canAccessSensitive && !access2.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to manage relationships')
      }
    }
    return this.relationshipsService.update(id, dto, auth.agencyId)
  }

  /**
   * Delete a relationship
   * DELETE /contacts/:contactId/relationships/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    const relationship = await this.relationshipsService.findOne(id)
    if (auth.role !== 'admin') {
      const access1 = await this.contactAccessService.canAccessSensitiveData(relationship.contactId1, auth)
      const access2 = await this.contactAccessService.canAccessSensitiveData(relationship.contactId2, auth)
      if (!access1.canAccessSensitive && !access2.canAccessSensitive) {
        throw new ForbiddenException('Full contact access required to manage relationships')
      }
    }
    return this.relationshipsService.remove(id, auth.agencyId)
  }
}
