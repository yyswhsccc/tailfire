/**
 * Portal Module
 *
 * Client portal endpoints for authenticated portal users.
 */

import { Module } from '@nestjs/common'
import { PortalController } from './portal.controller'
import { PortalService } from './portal.service'
import { AuthModule } from '../auth/auth.module'
import { TripsModule } from '../trips/trips.module'

@Module({
  imports: [AuthModule, TripsModule],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
