/**
 * Calendar Events Module
 *
 * Provides standalone calendar events (meetings, calls, follow-ups).
 */

import { Module } from '@nestjs/common'
import { CalendarEventsController } from './calendar-events.controller'
import { CalendarEventsService } from './calendar-events.service'

@Module({
  controllers: [CalendarEventsController],
  providers: [CalendarEventsService],
  exports: [CalendarEventsService],
})
export class CalendarEventsModule {}
