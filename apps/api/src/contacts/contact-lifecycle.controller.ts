/**
 * Contact Lifecycle Controller
 *
 * Admin endpoint for backfilling contact lifecycle state from trip data.
 * Must be registered BEFORE ContactsController in contacts.module.ts.
 */

import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { ContactLifecycleService } from './contact-lifecycle.service'

@ApiTags('Contacts')
@Controller('contacts')
export class ContactLifecycleController {
  constructor(private readonly lifecycleService: ContactLifecycleService) {}

  @Post('backfill-lifecycle')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Backfill contact lifecycle status from trip data (admin only)' })
  async backfillLifecycle() {
    return this.lifecycleService.backfillAll()
  }
}
