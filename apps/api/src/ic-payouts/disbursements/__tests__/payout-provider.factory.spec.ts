import { PayoutProviderFactory } from '../providers/payout-provider.factory'
import { ManualPayoutProvider } from '../providers/manual.provider'
import type { Rail } from '../../payout-accounts/ic-payout-accounts.service'

describe('PayoutProviderFactory', () => {
  const manual = new ManualPayoutProvider()
  const factory = new PayoutProviderFactory(manual)

  it.each<Rail>(['interac_etransfer', 'eft', 'wise', 'wire', 'visa_direct'])(
    'routes %s to ManualPayoutProvider (Phase 1)',
    (rail) => {
      expect(factory.for(rail)).toBe(manual)
    },
  )
})
