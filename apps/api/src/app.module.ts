import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { APP_GUARD } from '@nestjs/core'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DatabaseModule } from './db/database.module'
import { EncryptionModule } from './common/encryption'
import { CommonModule } from './common/common.module'
import { AuthModule } from './auth/auth.module'
import { UserStatusGuard } from './auth/guards/user-status.guard'
import { ActiveUserGuard } from './auth/guards/active-user.guard'
import { ContactsModule } from './contacts/contacts.module'
import { TripsModule } from './trips/trips.module'
import { ActivityLogsModule } from './activity-logs/activity-logs.module'
import { TagsModule } from './tags/tags.module'
import { ReferenceDataModule } from './reference-data/reference-data.module'
import { ApiCredentialsModule } from './api-credentials/api-credentials.module'
import { UnsplashModule } from './unsplash/unsplash.module'
import { FinancialsModule } from './financials/financials.module'
import { AmenitiesModule } from './amenities/amenities.module'
import { ExternalApisModule } from './external-apis/external-apis.module'
import { CruiseImportModule } from './cruise-import/cruise-import.module'
import { CruiseRepositoryModule } from './cruise-repository/cruise-repository.module'
import { CruiseBookingModule } from './cruise-booking/cruise-booking.module'
import { GlobusModule } from './globus/globus.module'
import { TourImportModule } from './tour-import/tour-import.module'
import { TourRepositoryModule } from './tour-repository/tour-repository.module'
import { TemplatesModule } from './templates/templates.module'
import { UserProfilesModule } from './user-profiles/user-profiles.module'
import { UsersModule } from './users/users.module'
import { HealthModule } from './health/health.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { SuppliersModule } from './suppliers/suppliers.module'
import { AutomationModule } from './automation/automation.module'
import { NotificationModule } from './notifications/notification.module'
import { TasksModule } from './tasks/tasks.module'
import { CalendarModule } from './calendar/calendar.module'
import { NotesModule } from './notes/notes.module'
import { CalendarEventsModule } from './calendar-events/calendar-events.module'
import { OcrImportModule } from './ocr-import/ocr-import.module'
import { PortalModule } from './portal/portal.module'
import { ClientPortalModule } from './client-portal/client-portal.module'
import { LoyaltyProgramsModule } from './loyalty-programs/loyalty-programs.module'
import { DocumentTemplatesModule } from './document-templates/document-templates.module'
import { DocumentRenderModule } from './document-render/document-render.module'

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      ignoreEnvFile: false,
    }),

    // Event-driven architecture
    EventEmitterModule.forRoot({ wildcard: true }),

    // Database
    DatabaseModule,

    // Encryption (global)
    EncryptionModule,

    // Common utilities (deprecation tracking, etc.)
    CommonModule,

    // Authentication (Supabase JWT)
    AuthModule,

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Rate limiting (30 req/min default for API key users; JWT users skip via custom guards)
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL) || 60000,
        limit: Number(process.env.THROTTLE_LIMIT) || 30,
      },
    ]),

    // Feature modules
    ContactsModule,
    TripsModule,
    ActivityLogsModule,
    TagsModule,
    ReferenceDataModule,
    ApiCredentialsModule,
    UnsplashModule,
    FinancialsModule,
    AmenitiesModule,

    // External API integration infrastructure
    ExternalApisModule,

    // Cruise data import (Traveltek FTP sync)
    CruiseImportModule,

    // Cruise repository (search/detail API)
    CruiseRepositoryModule,

    // Cruise booking (FusionAPI real-time booking)
    CruiseBookingModule,

    // Globus Tours (real-time proxy to Globus Family of Brands WebAPI)
    GlobusModule,

    // Tour data import (Globus Family of Brands catalog sync)
    TourImportModule,

    // Tour repository (search/detail API)
    TourRepositoryModule,

    // Itinerary & Package Templates (Library)
    TemplatesModule,

    // User Profiles (avatar, settings, public profile)
    UserProfilesModule,

    // User Management (Admin)
    UsersModule,

    // Health check for Railway/monitoring
    HealthModule,

    // Dashboard statistics
    DashboardModule,

    // Supplier management
    SuppliersModule,

    // Automation system (BullMQ job queues)
    AutomationModule,

    // Notification system (multi-channel)
    NotificationModule,

    // Task management (Calendar integration)
    TasksModule,

    // Calendar event aggregation
    CalendarModule,

    // Notes system (internal agent notes on contacts/trips)
    NotesModule,

    // Calendar events (standalone meetings, calls, follow-ups)
    CalendarEventsModule,

    // OCR document import (PDF booking confirmations, passports)
    OcrImportModule,

    // Loyalty Programs Catalog (Library)
    LoyaltyProgramsModule,

    // Client Portal (portal user endpoints)
    PortalModule,

    // Client Portal (contact-scoped trip/itinerary endpoints)
    ClientPortalModule,

    // Document Templates (block-based Handlebars rendering for email/PDF)
    DocumentTemplatesModule,

    // Document Render (PDF generation via BullMQ + Puppeteer)
    DocumentRenderModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global Guards - registered in reverse execution order
    // Execution order: JwtAuthGuard (in AuthModule) → UserStatusGuard → ActiveUserGuard
    {
      provide: APP_GUARD,
      useClass: ActiveUserGuard, // Registered 1st → Executes 3rd (checks pending)
    },
    {
      provide: APP_GUARD,
      useClass: UserStatusGuard, // Registered 2nd → Executes 2nd (checks isActive)
    },
  ],
})
export class AppModule {}
