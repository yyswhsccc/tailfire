import { Module } from '@nestjs/common'
import { IcTaxProfilesService } from './ic-tax-profiles/ic-tax-profiles.service'
import { IcPayoutAccountsService } from './payout-accounts/ic-payout-accounts.service'

/**
 * IcPayoutsModule
 *
 * Skeleton module for the IC Commission Payouts feature.
 * DatabaseModule and EncryptionModule are both @Global(), so they don't need
 * to be listed in imports — their providers are available everywhere.
 *
 * Services added in Tasks 7–9+:
 *   - IcTaxProfilesService          (Task 7) ✓
 *   - IcPayoutAccountsService       (Task 8) ✓
 *   - IcPayoutAuthorizationsService (Task 9)
 */
@Module({
  providers: [IcTaxProfilesService, IcPayoutAccountsService],
  exports: [IcTaxProfilesService, IcPayoutAccountsService],
})
export class IcPayoutsModule {}
