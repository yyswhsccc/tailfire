import { Module } from '@nestjs/common'
import { ClientPortalController } from './client-portal.controller'
import { ClientPortalService } from './client-portal.service'
import { AuthModule } from '../auth/auth.module'
import { TripsModule } from '../trips/trips.module'
import { DatabaseModule } from '../db/database.module'

@Module({
  imports: [AuthModule, TripsModule, DatabaseModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
