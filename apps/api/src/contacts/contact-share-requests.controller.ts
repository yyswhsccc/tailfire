/**
 * Contact Share Requests Controller
 *
 * REST endpoints for the contact share request workflow.
 * Agents can request access to contacts owned by other agents.
 * Contact owners (or admins) can approve or deny requests.
 */

import { Controller, Post, Get, Patch, Param, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ContactShareRequestsService } from './contact-share-requests.service'
import { ResolveShareRequestDto } from './dto/contact-share-request.dto'

@ApiTags('Contact Share Requests')
@Controller('contacts')
export class ContactShareRequestsController {
  constructor(private readonly shareRequestsService: ContactShareRequestsService) {}

  /**
   * POST /contacts/:id/share-requests
   * Request access to a contact owned by another agent
   */
  @Post(':id/share-requests')
  @HttpCode(HttpStatus.CREATED)
  async createRequest(
    @GetAuthContext() auth: AuthContext,
    @Param('id') contactId: string,
  ) {
    return this.shareRequestsService.createRequest(contactId, auth)
  }

  /**
   * GET /contacts/share-requests/pending
   * Get pending share requests for contacts owned by the current user
   */
  @Get('share-requests/pending')
  async getPending(@GetAuthContext() auth: AuthContext) {
    return this.shareRequestsService.getPendingForOwner(auth)
  }

  /**
   * PATCH /contacts/share-requests/:id
   * Approve or deny a pending share request
   */
  @Patch('share-requests/:id')
  async resolve(
    @GetAuthContext() auth: AuthContext,
    @Param('id') requestId: string,
    @Body() dto: ResolveShareRequestDto,
  ) {
    return this.shareRequestsService.resolve(requestId, dto.status, dto.reason, auth)
  }
}
