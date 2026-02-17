/**
 * Cruise Booking Module
 *
 * Provides FusionAPI integration for cruise booking.
 * Supports three booking flows:
 * - Agent: Agent searches, proposes, and books
 * - Client Handoff: Agent searches, proposes; client books
 * - OTA: Client searches and books (self-service)
 *
 * @see /Users/alguertin/.claude/plans/enchanted-whistling-dewdrop.md
 */

import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { ConfigModule } from '@nestjs/config'
import { CruiseBookingController } from './cruise-booking.controller'
import { TraveltekAuthService } from './services/traveltek-auth.service'
import { FusionApiService } from './services/fusion-api.service'
import { BookingSessionService } from './services/booking-session.service'
import { BookingService } from './services/booking.service'
import { ImportBookingService } from './services/import-booking.service'
import { DatabaseModule } from '../db/database.module'
import { TripsModule } from '../trips/trips.module'
import { ContactsModule } from '../contacts/contacts.module'

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TripsModule,
    ContactsModule,
    HttpModule.register({
      timeout: 30000, // FusionAPI can be slow for searches
      maxRedirects: 3,
    }),
  ],
  controllers: [CruiseBookingController],
  providers: [
    TraveltekAuthService,
    FusionApiService,
    BookingSessionService,
    BookingService,
    ImportBookingService,
  ],
  exports: [BookingService, BookingSessionService],
})
export class CruiseBookingModule {}
