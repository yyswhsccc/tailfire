/**
 * DisbursementProcessor
 *
 * BullMQ processor for the 'ic-payout-disburse' queue.
 *
 * Lifecycle for Phase 1 (ManualPayoutProvider):
 *   1. Load disbursement — skip if not found or not 'queued'
 *   2. Transition queued → sending (atomic guard via WHERE status='queued')
 *   3. Open an attempt row (outcome=NULL, in-progress)
 *   4. Call provider.send() → returns 'awaiting_manual'
 *   5. Leave in 'sending' state — admin completes via DisbursementController.markSent / markFailed
 *
 * v2 paths ('sent', 'failed' returned by an integrated provider) are handled defensively
 * but not acted upon in Phase 1 — admins investigate and use the controller.
 */

import { Injectable, Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { QUEUES } from '../../automation/automation.types'
import { DisbursementService } from './disbursement.service'
import { PayoutProviderFactory } from './providers/payout-provider.factory'
import { IcPayoutAccountsService } from '../payout-accounts/ic-payout-accounts.service'
import type { Rail } from '../payout-accounts/ic-payout-accounts.service'

const { icDisbursements, icPayoutAccounts } = schema

@Processor(QUEUES.IC_PAYOUT_DISBURSE)
@Injectable()
export class DisbursementProcessor extends WorkerHost {
  private readonly logger = new Logger(DisbursementProcessor.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly providerFactory: PayoutProviderFactory,
    private readonly accounts: IcPayoutAccountsService,
    private readonly disbursements: DisbursementService,
  ) {
    super()
  }

  async process(job: Job<{ disbursementId: string; idempotencyKey?: string }>): Promise<void> {
    const { disbursementId } = job.data

    // 1. Load disbursement
    const [d] = await this.db.client
      .select()
      .from(icDisbursements)
      .where(eq(icDisbursements.id, disbursementId))
      .limit(1)

    if (!d) {
      this.logger.warn(`Disbursement ${disbursementId} not found — skipping`)
      return
    }

    if (d.status !== 'queued') {
      this.logger.warn(
        `Disbursement ${disbursementId} in unexpected status '${d.status}'; expected 'queued' — skipping`,
      )
      return
    }

    // 2. Transition queued → sending (atomic — WHERE guard prevents double-transition)
    await this.disbursements.transitionToSending(disbursementId)

    // 3. Open an in-progress attempt row (outcome=NULL)
    const { attemptNumber } = await this.disbursements.openAttempt(
      disbursementId,
      d.provider,
      d.rail as Rail,
    )

    // 4. Load payout account for the destination mask
    const [account] = await this.db.client
      .select()
      .from(icPayoutAccounts)
      .where(eq(icPayoutAccounts.id, d.payoutAccountId))
      .limit(1)

    // 5. Get provider and call send()
    const provider = this.providerFactory.for(d.rail as Rail)

    const result = await provider.send({
      disbursementId,
      amountCents: d.amountCents,
      currency: d.currency,
      rail: d.rail as Rail,
      destination: {
        mask: account?.detailsMask ?? '****',
        encryptedDetailsAccessor: () =>
          this.accounts.getDecryptedDetails(d.payoutAccountId, 'system', 'disbursement-send'),
      },
      idempotencyKey: d.idempotencyKey,
    })

    if (result.status === 'awaiting_manual') {
      this.logger.log(
        `Disbursement ${disbursementId} is awaiting manual send (attempt ${attemptNumber}). ` +
        `Admin must complete via mark-sent or mark-failed endpoint.`,
      )
      // Stay in 'sending'. Admin completes via controller.
      // TODO(Task 39): emit 'ic-payout.disbursement.awaiting-manual-send' event with disbursementId
      return
    }

    // v2 paths: provider returned 'sent' or 'failed' directly.
    // Phase 1: ManualPayoutProvider always returns 'awaiting_manual', so these are unreachable.
    // Handle defensively — log loudly, do not auto-transition. Admin investigates.
    if (result.status === 'sent') {
      this.logger.warn(
        `Provider returned auto-sent for disbursement ${disbursementId} (attempt ${attemptNumber}). ` +
        `Phase 1 should not see this. Leaving in 'sending' state — admin must mark-sent or mark-failed.`,
      )
    } else if (result.status === 'failed') {
      this.logger.error(
        `Provider returned failed for disbursement ${disbursementId} (attempt ${attemptNumber}): ` +
        `${result.error ?? 'no error detail'}. Leaving in 'sending' state — admin must mark-failed.`,
      )
    }
  }
}
