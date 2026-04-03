/**
 * Contact Merge Controller
 *
 * Endpoints for merging duplicate contacts and detecting/dismissing duplicates.
 *
 * Route prefix is `contacts` (not `contacts/merge`) so that routes are:
 *   POST /contacts/merge
 *   GET  /contacts/duplicates
 *   POST /contacts/duplicates/dismiss
 *
 * IMPORTANT: This controller must be registered BEFORE ContactsController in
 * contacts.module.ts so that `contacts/merge` is matched before `contacts/:id`.
 */

import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ContactMergeService } from './contact-merge.service'
import type {
  ContactMergeRequest,
  DuplicateDismissRequest,
} from '../../../../packages/shared-types/src/api'

@ApiTags('Contacts')
@Controller('contacts')
export class ContactMergeController {
  constructor(private readonly mergeService: ContactMergeService) {}

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  async merge(@GetAuthContext() auth: AuthContext, @Body() body: ContactMergeRequest) {
    return this.mergeService.merge(body, auth)
  }

  @Get('duplicates')
  async detectDuplicates(@GetAuthContext() auth: AuthContext) {
    return this.mergeService.detectDuplicates(auth)
  }

  @Post('duplicates/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismissDuplicate(
    @GetAuthContext() auth: AuthContext,
    @Body() body: DuplicateDismissRequest,
  ) {
    return this.mergeService.dismissDuplicate(body, auth)
  }
}
