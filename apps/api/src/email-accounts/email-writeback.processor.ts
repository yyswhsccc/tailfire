import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { QUEUES } from '../automation/automation.types'
import { ImapWriteService } from './imap-write.service'

interface WritebackFlagsPayload {
  accountId: string
  uid: number
  folder: string
  isSeen?: boolean
  isFlagged?: boolean
}

/**
 * EmailWritebackProcessor — BullMQ worker for the email-writeback queue.
 *
 * Handles queued IMAP write operations so the API can respond instantly
 * while flag/move/delete operations happen asynchronously.
 */
@Processor(QUEUES.EMAIL_WRITEBACK, { concurrency: 3 })
export class EmailWritebackProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailWritebackProcessor.name)

  constructor(private readonly imapWriteService: ImapWriteService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'flags': {
        const data = job.data as WritebackFlagsPayload
        this.logger.debug(
          `Writing flags for UID ${data.uid} in ${data.folder} (account ${data.accountId})`,
        )
        await this.imapWriteService.writeFlags(
          data.accountId,
          data.uid,
          data.folder,
          { isSeen: data.isSeen, isFlagged: data.isFlagged },
        )
        break
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`)
    }
  }
}
