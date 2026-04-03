/**
 * Contact Import Controller
 *
 * Two-phase import workflow:
 * 1. POST /contacts/import/preview — classify rows (new, update, possible_match, skip)
 * 2. POST /contacts/import/confirm — execute the import based on user decisions
 */

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ContactImportService } from './contact-import.service'
import type { ContactImportRow, ContactImportConfirmRow } from '@tailfire/shared-types'

@ApiTags('Contacts')
@Controller('contacts/import')
export class ContactImportController {
  constructor(private readonly importService: ContactImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { rows: ContactImportRow[] },
  ) {
    return this.importService.preview(body.rows, auth)
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @GetAuthContext() auth: AuthContext,
    @Body() body: { rows: ContactImportConfirmRow[]; tags: string[] },
  ) {
    return this.importService.confirm(body.rows, body.tags, auth)
  }
}
