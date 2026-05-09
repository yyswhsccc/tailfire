import { Module } from '@nestjs/common'
import { IcTaxProfilesService } from './ic-tax-profiles/ic-tax-profiles.service'
import { IcPayoutAccountsService } from './payout-accounts/ic-payout-accounts.service'
import { IcPayoutAuthorizationsService } from './authorizations/ic-payout-authorizations.service'
import { RctiPdfService } from './authorizations/rcti-pdf.service'
import { TripsModule } from '../trips/trips.module'
import { DocumentRenderModule } from '../document-render/document-render.module'

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
 *   - IcPayoutAuthorizationsService (Task 9) ✓
 *   - RctiPdfService                (Task 9) ✓
 *
 * Imports:
 *   - TripsModule            → provides StorageService (document storage)
 *   - DocumentRenderModule   → provides PuppeteerPdfService (PDF rendering)
 */
@Module({
  imports: [TripsModule, DocumentRenderModule],
  providers: [
    IcTaxProfilesService,
    IcPayoutAccountsService,
    IcPayoutAuthorizationsService,
    RctiPdfService,
  ],
  exports: [
    IcTaxProfilesService,
    IcPayoutAccountsService,
    IcPayoutAuthorizationsService,
    RctiPdfService,
  ],
})
export class IcPayoutsModule {}
