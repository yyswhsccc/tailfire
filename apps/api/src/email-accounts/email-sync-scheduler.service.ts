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
      // Use the legacy repeat API — proven reliable in AutomationService for
      // birthday checks, payment scans, and other recurring jobs on this
      // Railway + Upstash Redis setup.
      await this.emailSyncQueue.add(
        'email.dispatch_sync',
        { type: 'email.dispatch_sync' } satisfies EmailSyncJobData,
        {
          repeat: { every: 120_000 }, // every 2 minutes
          jobId: 'email-sync-dispatcher',
          removeOnComplete: { age: 3600, count: 50 },
          removeOnFail: { age: 24 * 3600 },
        },
      )
      this.logger.log('Email sync dispatcher scheduled (every 2 minutes, legacy repeat API)')
    } catch (error: any) {
      this.logger.error(`Failed to schedule email sync dispatcher: ${error.message}`, error.stack)
    }
  }
}
