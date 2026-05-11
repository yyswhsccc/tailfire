import { Injectable } from '@nestjs/common'
import type { PayoutProvider, PayoutSendContext, PayoutSendResult } from '../payout-provider.interface'

/**
 * Manual provider — Phase 1 default.
 *
 * Does NOT send anything itself. Returns `awaiting_manual` so the disbursement
 * processor leaves the disbursement in `sending` status until an admin marks it
 * sent (with reference + proof) via the admin controller endpoint.
 *
 * The disbursement queue notifies admins that a payout is awaiting manual send.
 */
@Injectable()
export class ManualPayoutProvider implements PayoutProvider {
  readonly name = 'manual' as const

  async send(_ctx: PayoutSendContext): Promise<PayoutSendResult> {
    return { status: 'awaiting_manual' }
  }
}
