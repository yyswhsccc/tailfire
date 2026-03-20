import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'
import { HttpException, Logger } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { QUEUES, type EmailSyncJobData } from '../automation/automation.types'
import { ImapSyncService } from './imap-sync.service'
import { EmailAccountsService } from './email-accounts.service'

@Processor(QUEUES.EMAIL_SYNC, { concurrency: 5 })
export class EmailSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSyncProcessor.name)

  constructor(
    private readonly imapSyncService: ImapSyncService,
    private readonly emailAccountsService: EmailAccountsService,
    @InjectQueue(QUEUES.EMAIL_SYNC) private readonly emailSyncQueue: Queue,
  ) {
    super()
  }

  async process(job: Job<EmailSyncJobData>): Promise<void> {
    if (job.data.type === 'email.sync') {
      // Single account sync (on-demand or from recurring dispatcher)
      if (!job.data.emailAccountId) {
        this.logger.warn('email.sync job missing emailAccountId')
        return
      }
      this.logger.debug(`Syncing email account ${job.data.emailAccountId}`)
      try {
        const result = await this.imapSyncService.syncAccount(job.data.emailAccountId)
        if (result.errors.length > 0) {
          this.logger.warn(`Sync completed with errors: ${result.errors.join('; ')}`)
        }
      } catch (err: any) {
        // Auth failures are expected when credentials change — log and skip, don't retry
        const resp = err instanceof HttpException ? err.getResponse() : null
        if (typeof resp === 'object' && resp && (resp as any).code === 'IMAP_AUTH_FAILED') {
          this.logger.warn(`IMAP auth failed for account ${job.data.emailAccountId} — skipping sync`)
          return
        }
        throw err
      }
    } else if (job.data.type === 'email.dispatch_sync') {
      // Recurring dispatcher: enqueue one job per active account with dedupe
      const accounts = await this.emailAccountsService.findAllActive()
      this.logger.debug(`Dispatching sync for ${accounts.length} active accounts`)

      for (const account of accounts) {
        try {
          await this.emailSyncQueue.add(
            'email.sync',
            { type: 'email.sync', emailAccountId: account.id } satisfies EmailSyncJobData,
            {
              jobId: `sync-${account.id}`, // dedupe: skip if already queued/running
              removeOnComplete: { age: 3600, count: 200 },
              removeOnFail: { age: 24 * 3600 },
            },
          )
        } catch (err: any) {
          // Duplicate jobId conflict = account already has a pending/active sync — safe to skip
          if (!err.message?.includes('duplicate')) {
            this.logger.error(`Failed to enqueue sync for account ${account.id}: ${err.message}`)
          }
        }
      }
    }
  }
}
