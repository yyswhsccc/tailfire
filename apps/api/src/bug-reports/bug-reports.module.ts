import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TripsModule } from '../trips/trips.module'
import { BugReportsController } from './bug-reports.controller'
import { BugReportsService } from './bug-reports.service'

@Module({
  imports: [ConfigModule, TripsModule],
  controllers: [BugReportsController],
  providers: [BugReportsService],
})
export class BugReportsModule {}
