import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { EmailAccountsService } from './email-accounts.service'
import { ImapSyncService } from './imap-sync.service'

/** Per-account timeout: 60 seconds max for a single syncAccount() call */
const ACCOUNT_SYNC_TIMEOUT_MS = 60_000

/**
 * Email Sync Scheduler
 *
 * Runs background INBOX sync every 2 minutes for all active email accounts.
 * Calls syncAccount() directly — bypasses BullMQ queuing entirely because
 * Upstash Redis (serverless) doesn't reliably promote delayed/queued jobs.
 *
 * Each account sync is wrapped in a timeout so a single failing/hanging
 * account cannot block the entire cycle or starve the event loop.
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

      // Run all accounts concurrently with per-account timeouts.
      // This prevents one slow/hanging account from blocking others.
      const results = await Promise.allSettled(
        accounts.map((account) => this.syncWithTimeout(account.id)),
      )

      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value > 0) {
          this.logger.log(`Background sync: ${r.value} new message(s) for ${accounts[i].id}`)
        } else if (r.status === 'rejected') {
          this.logger.warn(`Background sync failed for ${accounts[i].id}: ${r.reason?.message ?? r.reason}`)
        }
      }
    } catch (err: any) {
      this.logger.error(`Sync cycle error: ${err.message}`, err.stack)
    } finally {
      this.running = false
    }
  }

  /**
   * Run syncAccount with a hard timeout. If the IMAP connection hangs
   * (bad credentials, unreachable server), this ensures we don't block forever.
   */
  private syncWithTimeout(accountId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Sync timed out after ${ACCOUNT_SYNC_TIMEOUT_MS / 1000}s`))
      }, ACCOUNT_SYNC_TIMEOUT_MS)

      this.imapSyncService
        .syncAccount(accountId)
        .then((result) => {
          clearTimeout(timer)
          resolve(result.newMessages)
        })
        .catch((err) => {
          clearTimeout(timer)
          reject(err)
        })
    })
  }
}
