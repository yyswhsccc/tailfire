/**
 * Contact Shares Controller
 *
 * REST API endpoints for contact sharing.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ContactSharesService } from './contact-shares.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type { ContactShareResponseDto } from '../../../../packages/shared-types/src/api'
import { CreateContactShareDto, UpdateContactShareDto } from './dto'

@ApiTags('Contact Shares')
@Controller('contacts/:contactId/shares')
export class ContactSharesController {
  constructor(private readonly contactSharesService: ContactSharesService) {}

  /**
   * Share a contact with another user
   * POST /contacts/:contactId/shares
   * Only the contact owner or admin can share
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Body() dto: CreateContactShareDto,
  ): Promise<ContactShareResponseDto> {
    return this.contactSharesService.create(contactId, dto, auth)
  }

  /**
   * List all shares for a contact
   * GET /contacts/:contactId/shares
   * Only the contact owner or admin can view
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
  ): Promise<ContactShareResponseDto[]> {
    return this.contactSharesService.findAll(contactId, auth)
  }

  /**
   * Update a share's access level
   * PATCH /contacts/:contactId/shares/:userId
   * Only the contact owner or admin can update
   */
  @Patch(':userId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateContactShareDto,
  ): Promise<ContactShareResponseDto> {
    return this.contactSharesService.update(contactId, userId, dto, auth)
  }

  /**
   * Revoke a share
   * DELETE /contacts/:contactId/shares/:userId
   * Only the contact owner or admin can revoke
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.contactSharesService.remove(contactId, userId, auth)
  }
}
