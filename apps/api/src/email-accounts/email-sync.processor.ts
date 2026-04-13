import { Processor, WorkerHost, InjectQueue, OnWorkerEvent } from '@nestjs/bullmq'
import { HttpException, Logger, NotFoundException } from '@nestjs/common'
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
    this.logger.debug(`Processing job: ${job.name} (id=${job.id})`)

    switch (job.name) {
      case 'email.dispatch_sync':
        await this.handleDispatchSync()
        break
      case 'email.sync':
        await this.handleAccountSync(job)
        break
      default:
        // Fall back to routing by data.type for backwards compatibility
        if (job.data?.type === 'email.dispatch_sync') {
          await this.handleDispatchSync()
        } else if (job.data?.type === 'email.sync') {
          await this.handleAccountSync(job)
        } else {
          this.logger.warn(`Unknown job: name=${job.name}, type=${job.data?.type}`)
        }
    }
  }

  private async handleDispatchSync(): Promise<void> {
    const accounts = await this.emailAccountsService.findAllActive()
    this.logger.log(`Dispatching sync for ${accounts.length} active email account(s)`)

    for (const account of accounts) {
      try {
        await this.emailSyncQueue.add(
          'email.sync',
          { type: 'email.sync', emailAccountId: account.id } satisfies EmailSyncJobData,
          {
            removeOnComplete: true,
            removeOnFail: { age: 24 * 3600 },
          },
        )
      } catch (err: any) {
        if (!err.message?.includes('duplicate')) {
          this.logger.error(`Failed to enqueue sync for account ${account.id}: ${err.message}`)
        }
      }
    }
  }

  private async handleAccountSync(job: Job<EmailSyncJobData>): Promise<void> {
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
      if (err instanceof NotFoundException) {
        this.logger.warn(`Email account ${job.data.emailAccountId} not found — skipping sync (likely deleted)`)
        return
      }
      const resp = err instanceof HttpException ? err.getResponse() : null
      if (typeof resp === 'object' && resp && (resp as any).code === 'IMAP_AUTH_FAILED') {
        this.logger.warn(`IMAP auth failed for account ${job.data.emailAccountId} — skipping sync`)
        return
      }
      throw err
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Job active: ${job.name} (id=${job.id})`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(`Job failed: ${job?.name} (id=${job?.id}): ${error.message}`)
  }
}
