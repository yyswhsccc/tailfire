import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QUEUES, type EmailSyncJobData } from '../automation/automation.types'

/**
 * Email Sync Scheduler
 *
 * Uses setInterval to trigger dispatch every 2 minutes, then enqueues
 * per-account sync jobs into the BullMQ email-sync queue. This hybrid
 * approach gives us:
 * - Reliable timing (setInterval, not dependent on Redis delayed job promotion)
 * - Worker concurrency (BullMQ workers process per-account jobs in parallel)
 * - Job deduplication (jobId prevents overlapping syncs per account)
 * - Job history/visibility (BullMQ job lifecycle)
 *
 * Note: BullMQ's repeat/scheduler APIs don't fire reliably on Upstash Redis
 * (delayed job promotion requires blocking Redis commands that serverless
 * Redis handles differently). This is documented and acceptable for the
 * current single-instance Railway deployment.
 */
@Injectable()
export class EmailSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSyncSchedulerService.name)
  private intervalHandle: ReturnType<typeof setInterval> | null = null

  constructor(
    @InjectQueue(QUEUES.EMAIL_SYNC) private readonly emailSyncQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Email sync scheduler starting (interval + BullMQ dispatch, every 2 minutes)')

    // First dispatch after 30s (let app fully boot)
    setTimeout(() => this.dispatchSyncJobs(), 30_000)

    // Then every 2 minutes
    this.intervalHandle = setInterval(() => this.dispatchSyncJobs(), 120_000)
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async dispatchSyncJobs() {
    try {
      // Add a dispatch job — the EmailSyncProcessor handles it
      await this.emailSyncQueue.add(
        'email.dispatch_sync',
        { type: 'email.dispatch_sync' } satisfies EmailSyncJobData,
        { removeOnComplete: true, removeOnFail: true },
      )
    } catch (err: any) {
      this.logger.error(`Failed to dispatch email sync: ${err.message}`)
    }
  }
}
