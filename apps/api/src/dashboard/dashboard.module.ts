import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { TripAccessService } from '../trips/trip-access.service'
import { TripGroupAccessService } from '../trips/trip-group-access.service'
import { TaskAccessService } from '../tasks/task-access.service'

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, TripAccessService, TripGroupAccessService, TaskAccessService],
})
export class DashboardModule {}
