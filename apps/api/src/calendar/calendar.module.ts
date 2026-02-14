/**
 * Calendar Module
 *
 * Provides calendar event aggregation from multiple sources.
 */

import { Module, forwardRef } from '@nestjs/common'
import { CalendarController } from './calendar.controller'
import { CalendarService } from './calendar.service'
import { TripsModule } from '../trips/trips.module'

@Module({
  imports: [
    forwardRef(() => TripsModule), // For TripAccessService (RBAC filtering)
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
