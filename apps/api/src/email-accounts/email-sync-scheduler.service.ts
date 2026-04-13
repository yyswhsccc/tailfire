import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QUEUES, type EmailSyncJobData } from '../automation/automation.types'
import { EmailAccountsService } from './email-accounts.service'
import { ImapSyncService } from './imap-sync.service'

@Injectable()
export class EmailSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSyncSchedulerService.name)
  private intervalHandle: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly emailAccountsService: EmailAccountsService,
    private readonly imapSyncService: ImapSyncService,
  ) {}

  async onModuleInit() {
    this.logger.log('Email sync scheduler starting (setInterval, every 2 minutes)')

    // Run first sync after 30s delay (let the app fully boot)
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
    try {
      const accounts = await this.emailAccountsService.findAllActive()
      if (accounts.length === 0) {
        this.logger.debug('No active email accounts to sync')
        return
      }

      this.logger.log(`Background sync: processing ${accounts.length} active email account(s)`)

      for (const account of accounts) {
        try {
          const result = await this.imapSyncService.syncAccount(account.id)
          if (result.newMessages > 0) {
            this.logger.log(`Synced ${result.newMessages} new message(s) for account ${account.id}`)
          }
          if (result.errors.length > 0) {
            this.logger.warn(`Sync errors for ${account.id}: ${result.errors.join('; ')}`)
          }
        } catch (err: any) {
          this.logger.warn(`Sync failed for account ${account.id}: ${err.message}`)
        }
      }
    } catch (err: any) {
      this.logger.error(`Email sync cycle failed: ${err.message}`, err.stack)
    }
  }
}
