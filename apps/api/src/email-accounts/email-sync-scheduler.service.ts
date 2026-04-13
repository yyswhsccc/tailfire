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
      // Clean up stale job schedulers from previous deploys (use new scheduler API, not legacy repeatable API)
      const schedulers = await this.emailSyncQueue.getJobSchedulers()
      for (const s of schedulers) {
        if (s.id === 'email-sync-dispatcher') {
          await this.emailSyncQueue.removeJobScheduler('email-sync-dispatcher')
          this.logger.debug('Removed stale job scheduler: email-sync-dispatcher')
        }
      }

      // Also clean legacy repeatable jobs if any exist
      const repeatableJobs = await this.emailSyncQueue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        await this.emailSyncQueue.removeRepeatableByKey(job.key)
        this.logger.debug(`Removed legacy repeatable job: ${job.key}`)
      }

      const scheduled = await this.emailSyncQueue.upsertJobScheduler(
        'email-sync-dispatcher',
        { every: 120000 }, // every 2 minutes (use 'every' instead of cron 'pattern' for reliability)
        {
          name: 'email.dispatch_sync',
          data: { type: 'email.dispatch_sync' } satisfies EmailSyncJobData,
        },
      )
      this.logger.log(`Email sync dispatcher scheduled (every 120s, next job id: ${scheduled?.id})`)
    } catch (error: any) {
      this.logger.error(`Failed to schedule email sync dispatcher: ${error.message}`, error.stack)
    }
  }
}
