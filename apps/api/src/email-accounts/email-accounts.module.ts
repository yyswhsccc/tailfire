import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { QUEUES } from '../automation/automation.types'
import { DatabaseModule } from '../db/database.module'
import { EncryptionModule } from '../common/encryption/encryption.module'
import { NotificationModule } from '../notifications/notification.module'
import { TripsModule } from '../trips/trips.module'
import { EmailAccountsController } from './email-accounts.controller'
import { EmailAccountsService } from './email-accounts.service'
import { ImapSyncService } from './imap-sync.service'
import { SmtpSendService } from './smtp-send.service'
import { EmailSyncProcessor } from './email-sync.processor'
import { EmailSyncSchedulerService } from './email-sync-scheduler.service'
import { ImapWriteService } from './imap-write.service'
import { EmailWritebackProcessor } from './email-writeback.processor'

/**
 * EmailAccountsModule — Agent personal email (IMAP/SMTP)
 *
 * IMPORTANT: EmailModule now imports this module (via forwardRef) for SMTP-first sending.
 * However, this module must NOT import from apps/api/src/email/ to avoid circular dependencies.
 * Shared utilities live in apps/api/src/common/email/ instead.
 *
 * Self-registers its own BullMQ queue (email-sync) following DocumentRenderModule pattern.
 * Do NOT modify AutomationModule to register this queue.
 */
@Module({
  imports: [
    DatabaseModule,
    EncryptionModule,
    NotificationModule,
    forwardRef(() => TripsModule), // For StorageService (attachment downloads)
    BullModule.registerQueue({
      name: QUEUES.EMAIL_SYNC,
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 200 },
        removeOnFail: { age: 24 * 3600 },
      },
    }),
    BullModule.registerQueue({
      name: QUEUES.EMAIL_WRITEBACK,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
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
    ImapWriteService,
    EmailWritebackProcessor,
  ],
  exports: [EmailAccountsService, ImapSyncService, SmtpSendService, ImapWriteService],
})
export class EmailAccountsModule {}
