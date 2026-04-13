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
    this.logger.log('EmailSyncSchedulerService initializing...')
    try {
      // upsertJobScheduler handles create-or-update — no manual cleanup needed
      const scheduled = await this.emailSyncQueue.upsertJobScheduler(
        'email-sync-dispatcher',
        { every: 120000 }, // every 2 minutes
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
