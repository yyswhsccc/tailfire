import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { QUEUES } from '../automation/automation.types'
import { DatabaseModule } from '../db/database.module'
import { EncryptionModule } from '../common/encryption/encryption.module'
import { EmailAccountsController } from './email-accounts.controller'
import { EmailAccountsService } from './email-accounts.service'
import { ImapSyncService } from './imap-sync.service'
import { SmtpSendService } from './smtp-send.service'
import { EmailSyncProcessor } from './email-sync.processor'
import { EmailSyncSchedulerService } from './email-sync-scheduler.service'

/**
 * EmailAccountsModule — Agent personal email (IMAP/SMTP)
 *
 * IMPORTANT: This module is completely separate from EmailModule (Resend transactional emails).
 * Do NOT import from apps/api/src/email/ in any file here.
 *
 * Self-registers its own BullMQ queue (email-sync) following DocumentRenderModule pattern.
 * Do NOT modify AutomationModule to register this queue.
 */
@Module({
  imports: [
    DatabaseModule,
    EncryptionModule,
    BullModule.registerQueue({
      name: QUEUES.EMAIL_SYNC,
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 200 },
        removeOnFail: { age: 24 * 3600 },
      },
    }),
  ],
  controllers: [EmailAccountsController],
  providers: [
    EmailAccountsService,
    ImapSyncService,
    SmtpSendService,
    EmailSyncProcessor,
    EmailSyncSchedulerService,
  ],
  exports: [EmailAccountsService, ImapSyncService],
})
export class EmailAccountsModule {}
