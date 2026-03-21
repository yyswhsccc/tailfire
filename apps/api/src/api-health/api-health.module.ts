/**
 * API Health Module
 *
 * Provides active health monitoring for all external API providers.
 * Runs BullMQ checks every 15 minutes and daily cleanup of old results.
 *
 * Endpoints:
 * - GET  /admin/api-health              — Latest status for all providers
 * - GET  /admin/api-health/:provider/history — Last 24h check history
 * - POST /admin/api-health/:provider/check   — Trigger immediate check
 */

import { Module, Logger, OnModuleInit } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { BullModule, InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { CruiseBookingModule } from '../cruise-booking/cruise-booking.module'
import { NotificationModule } from '../notifications/notification.module'
import { ApiHealthController } from './api-health.controller'
import { ApiHealthService } from './api-health.service'
import { ApiHealthProcessor } from './api-health.processor'

@Module({
  imports: [
    HttpModule.register({ timeout: 15000 }),
    BullModule.registerQueue({
      name: 'api-health',
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    }),
    CruiseBookingModule,
    NotificationModule,
  ],
  controllers: [ApiHealthController],
  providers: [ApiHealthService, ApiHealthProcessor],
  exports: [ApiHealthService],
})
export class ApiHealthModule implements OnModuleInit {
  private readonly logger = new Logger(ApiHealthModule.name)

  constructor(
    @InjectQueue('api-health') private readonly healthQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      // Schedule health checks every 15 minutes
      await this.healthQueue.upsertJobScheduler(
        'api-health-check-all',
        { pattern: '*/15 * * * *' },
        {
          name: 'check-all',
          data: {},
        },
      )
      this.logger.log('API health check scheduled (every 15 minutes)')

      // Schedule daily cleanup at 3 AM
      await this.healthQueue.upsertJobScheduler(
        'api-health-cleanup',
        { pattern: '0 3 * * *' },
        {
          name: 'cleanup',
          data: {},
        },
      )
      this.logger.log('API health cleanup scheduled (daily at 3 AM)')
    } catch (error: any) {
      this.logger.error(`Failed to schedule health check jobs: ${error.message}`)
    }
  }
}
