import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { EmailAccountsService } from './email-accounts.service'
import { ImapSyncService } from './imap-sync.service'

/**
 * Email Sync Scheduler
 *
 * Runs background INBOX sync every 2 minutes for all active email accounts.
 * Calls syncAccount() directly — bypasses BullMQ queuing entirely because
 * Upstash Redis (serverless) doesn't reliably promote delayed/queued jobs.
 *
 * Notifications are sent by syncAccount() when new messages are found.
 */
@Injectable()
export class EmailSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSyncSchedulerService.name)
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private readonly emailAccountsService: EmailAccountsService,
    private readonly imapSyncService: ImapSyncService,
  ) {}

  async onModuleInit() {
    this.logger.log('Email sync scheduler started (every 2 minutes)')

    // First sync after 30s (let app boot)
    setTimeout(() => this.runSyncCycle(), 30_000)

    // Then every 2 minutes
    this.intervalHandle = setInterval(() => this.runSyncCycle(), 120_000)
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async runSyncCycle() {
    if (this.running) {
      this.logger.debug('Sync cycle already in progress — skipping')
      return
    }

    this.running = true
    try {
      const accounts = await this.emailAccountsService.findAllActive()
      if (accounts.length === 0) return

      this.logger.debug(`Background sync: ${accounts.length} account(s)`)

      for (const account of accounts) {
        try {
          const result = await this.imapSyncService.syncAccount(account.id)
          if (result.newMessages > 0) {
            this.logger.log(`Background sync: ${result.newMessages} new message(s) for ${account.id}`)
          }
        } catch (err: any) {
          this.logger.warn(`Background sync failed for ${account.id}: ${err.message}`)
        }
      }
    } catch (err: any) {
      this.logger.error(`Sync cycle error: ${err.message}`, err.stack)
    } finally {
      this.running = false
    }
  }
}
