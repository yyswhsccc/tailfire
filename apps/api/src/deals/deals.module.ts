/**
 * Deals Module
 *
 * Travel deals CRUD for the OTA consumer portal.
 * Three auth levels:
 * - Public (no auth) — OTA reads published deals
 * - Admin (JWT) — deal management
 * - Scraper (internal API key) — bulk import from VPS
 */

import { Module } from '@nestjs/common'
import { DealsController } from './deals.controller'
import { DealsService } from './deals.service'
import { InternalApiKeyGuard } from '../cruise-import/guards/internal-api-key.guard'

@Module({
  controllers: [DealsController],
  providers: [DealsService, InternalApiKeyGuard],
  exports: [DealsService],
})
export class DealsModule {}
