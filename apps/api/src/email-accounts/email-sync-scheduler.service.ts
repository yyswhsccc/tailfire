import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QUEUES, type EmailSyncJobData } from '../automation/automation.types'

@Injectable()
export class EmailSyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(EmailSyncSchedulerService.name)

  constructor(
    @InjectQueue(QUEUES.EMAIL_SYNC) private readonly emailSyncQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      // Clean up any stale repeatable jobs from previous deploys
      const repeatableJobs = await this.emailSyncQueue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        if (job.name === 'email.dispatch_sync' || job.key?.includes('dispatch')) {
          await this.emailSyncQueue.removeRepeatableByKey(job.key)
          this.logger.debug(`Removed stale repeatable job: ${job.key}`)
        }
      }

      await this.emailSyncQueue.upsertJobScheduler(
        'email-sync-dispatcher',
        { pattern: '*/2 * * * *' }, // every 2 minutes
        {
          name: 'email.dispatch_sync',
          data: { type: 'email.dispatch_sync' } satisfies EmailSyncJobData,
        },
      )
      this.logger.log('Email sync dispatcher scheduled (every 2 minutes)')
    } catch (error: any) {
      this.logger.error(`Failed to schedule email sync dispatcher: ${error.message}`)
    }
  }
}
