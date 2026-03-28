/**
 * Cruise Repository Module
 *
 * Provides API for browsing and searching cruise sailings.
 * Supports tiered authentication:
 * - JWT auth (admin/client portal) - no rate limiting
 * - API key auth (OTA public) - aggressive rate limiting (30 req/min)
 */

import { Module } from '@nestjs/common'
import { CruiseRepositoryController } from './cruise-repository.controller'
import { CruiseRepositoryService } from './cruise-repository.service'
import { SailingSlugService } from './sailing-slugs.service'
import { CatalogAuthGuard, CatalogThrottleGuard } from '../common/guards'
import { DatabaseModule } from '../db/database.module'
import { CruiseImportModule } from '../cruise-import/cruise-import.module'

@Module({
  imports: [
    DatabaseModule,
    CruiseImportModule,
    // CatalogAuthGuard uses Passport JWT strategy from AuthModule (global)
    // ThrottlerModule is configured globally in AppModule
    // CatalogThrottleGuard handles tiered rate limiting
  ],
  controllers: [CruiseRepositoryController],
  providers: [CruiseRepositoryService, SailingSlugService, CatalogAuthGuard, CatalogThrottleGuard],
  exports: [CruiseRepositoryService],
})
export class CruiseRepositoryModule {}
