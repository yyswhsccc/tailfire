/**
 * Automation Module
 *
 * Centralized job queue system using BullMQ for scheduled and delayed tasks.
 *
 * Provides:
 * - Trip status auto-transitions (booked -> in_progress -> completed)
 * - Client care automations (welcome emails, follow-ups)
 * - Notification delivery
 *
 * Does NOT include:
 * - Cruise sync (stays as cron + advisory locks)
 * - Tour sync (stays as cron)
 */

import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { HttpModule } from '@nestjs/axios'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { DatabaseModule } from '../db/database.module'
import { OcrModule } from '../ocr/ocr.module'
import { TripsModule } from '../trips/trips.module'
import { NotificationModule } from '../notifications/notification.module'
import { EmailModule } from '../email/email.module'
import { AutomationService } from './automation.service'
import { TripAutomationProcessor } from './processors/trip-automation.processor'
import { ClientCareProcessor } from './processors/client-care.processor'
import { NotificationsProcessor } from './processors/notifications.processor'
import { TripLifecycleListener } from './listeners/trip-lifecycle.listener'
import { OcrProcessingProcessor } from './processors/ocr-processing.processor'
import { EnrichmentProcessor } from './processors/enrichment.processor'
import { AutomationController } from './admin/automation.controller'
import { GooglePlacesModule } from '../external-apis/providers/google-places/google-places.module'
import { ApiCredentialsModule } from '../api-credentials/api-credentials.module'
import { CatalogMatcherModule } from '../catalog-matcher/catalog-matcher.module'
import { DocumentTemplatesModule } from '../document-templates/document-templates.module'
import { QUEUES } from './automation.types'

@Module({
  imports: [
    // BullMQ configuration
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL')

        if (!redisUrl) {
          // In development, provide defaults
          return {
            connection: {
              host: 'localhost',
              port: 6379,
            },
            defaultJobOptions: {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
            },
          }
        }

        // Parse Redis URL for production
        const url = new URL(redisUrl)
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
            username: url.username || undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        }
      },
      inject: [ConfigService],
    }),

    // Register queues
    BullModule.registerQueue(
      {
        name: QUEUES.TRIP_AUTOMATION,
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
      {
        name: QUEUES.CLIENT_CARE,
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
      {
        name: QUEUES.NOTIFICATIONS,
        defaultJobOptions: {
          removeOnComplete: { age: 3600, count: 500 }, // Shorter retention for notifications
          removeOnFail: { age: 24 * 3600 },
        },
      },
      {
        name: QUEUES.OCR_PROCESSING,
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 100 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
      {
        name: QUEUES.ENRICHMENT,
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 200 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    ),

    DatabaseModule,
    OcrModule,
    forwardRef(() => TripsModule),
    forwardRef(() => NotificationModule),
    EmailModule,
    HttpModule,
    GooglePlacesModule,
    ApiCredentialsModule,
    CatalogMatcherModule,
    DocumentTemplatesModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    TripAutomationProcessor,
    ClientCareProcessor,
    NotificationsProcessor,
    OcrProcessingProcessor,
    EnrichmentProcessor,
    TripLifecycleListener,
  ],
  exports: [AutomationService],
})
export class AutomationModule {}
