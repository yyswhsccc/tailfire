/**
 * Advisor Profiles Module
 *
 * Public-facing advisor profiles for the OTA consumer portal.
 * Two auth levels:
 * - Public (no auth) — OTA reads published profiles, deals, trips
 * - Admin (JWT) — profile management, TLN sync, featured deals
 */

import { Module } from '@nestjs/common'
import { AdvisorProfilesController } from './advisor-profiles.controller'
import { AdvisorProfilesService } from './advisor-profiles.service'
import { TlnSyncService } from './tln-sync.service'

@Module({
  controllers: [AdvisorProfilesController],
  providers: [AdvisorProfilesService, TlnSyncService],
  exports: [AdvisorProfilesService],
})
export class AdvisorProfilesModule {}
