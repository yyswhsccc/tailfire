import { Injectable } from '@nestjs/common'
import type { Rail } from '../../payout-accounts/ic-payout-accounts.service'
import type { PayoutProvider } from '../payout-provider.interface'
import { ManualPayoutProvider } from './manual.provider'

/**
 * Routes a disbursement to the correct provider based on rail.
 *
 * Phase 1: always returns ManualPayoutProvider regardless of rail.
 * Phase 2 will add provider routing by rail + per-agency config (e.g.,
 *   - eft / interac_etransfer → VoPay
 *   - wise → Wise API
 *   - visa_direct → DreamPay
 * ).
 */
@Injectable()
export class PayoutProviderFactory {
  constructor(private readonly manual: ManualPayoutProvider) {}

  for(_rail: Rail): PayoutProvider {
    return this.manual
  }
}
