import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { IcTaxProfilesService } from './ic-tax-profiles/ic-tax-profiles.service'
import { IcPayoutAccountsService } from './payout-accounts/ic-payout-accounts.service'
import { IcPayoutAuthorizationsService } from './authorizations/ic-payout-authorizations.service'
import { RctiPdfService } from './authorizations/rcti-pdf.service'
import { AgencyTaxFilingService } from './agency-tax-filing/agency-tax-filing.service'
import { IcInvoiceNumberAllocator } from './invoices/ic-invoice-number-allocator.service'
import { PlaceOfSupplyService } from './place-of-supply/place-of-supply.service'
import { IcInvoiceService } from './invoices/ic-invoice.service'
import { IcInvoicePdfService } from './invoices/ic-invoice-pdf.service'
import { ManualPayoutProvider } from './disbursements/providers/manual.provider'
import { PayoutProviderFactory } from './disbursements/providers/payout-provider.factory'
import { DisbursementService } from './disbursements/disbursement.service'
import { DisbursementProcessor } from './disbursements/disbursement.processor'
import { DisbursementController } from './disbursements/disbursement.controller'
import { IcTaxProfilesController } from './ic-tax-profiles/ic-tax-profiles.controller'
import { IcPayoutAccountsController } from './payout-accounts/ic-payout-accounts.controller'
import { IcPayoutAuthorizationsController } from './authorizations/ic-payout-authorizations.controller'
import { AgencyTaxFilingController } from './agency-tax-filing/agency-tax-filing.controller'
import { IcInvoiceController } from './invoices/ic-invoice.controller'
import { TripsModule } from '../trips/trips.module'
import { DocumentRenderModule } from '../document-render/document-render.module'
import { QUEUES } from '../automation/automation.types'

/**
 * IcPayoutsModule
 *
 * Skeleton module for the IC Commission Payouts feature.
 * DatabaseModule and EncryptionModule are both @Global(), so they don't need
 * to be listed in imports — their providers are available everywhere.
 *
 * Services added in Tasks 7–16+:
 *   - IcTaxProfilesService          (Task 7) ✓
 *   - IcPayoutAccountsService       (Task 8) ✓
 *   - IcPayoutAuthorizationsService (Task 9) ✓
 *   - RctiPdfService                (Task 9) ✓
 *   - AgencyTaxFilingService        (Task 16) ✓
 *   - IcInvoiceNumberAllocator      (Task 20) ✓
 *   - PlaceOfSupplyService          (Task 22) ✓
 *   - IcInvoicePdfService           (Task 24 stub, Task 25 will implement) ✓
 *   - IcInvoiceService              (Task 24) ✓
 *   - ManualPayoutProvider          (Task 33) ✓
 *   - PayoutProviderFactory         (Task 33) ✓
 *
 *   - DisbursementService          (Task 34) ✓
 *   - DisbursementProcessor        (Task 34) ✓
 *
 * Controllers added in Task 10:
 *   - IcTaxProfilesController          (Task 10) ✓
 *   - IcPayoutAccountsController       (Task 10) ✓
 *   - IcPayoutAuthorizationsController (Task 10) ✓
 *   - AgencyTaxFilingController        (Task 16) ✓
 *   - IcInvoiceController              (Task 26) ✓
 *   - DisbursementController           (Task 34) ✓
 *
 * Imports:
 *   - TripsModule            → provides StorageService (document storage)
 *   - DocumentRenderModule   → provides PuppeteerPdfService (PDF rendering)
 */
@Module({
  imports: [
    TripsModule,
    DocumentRenderModule,
    BullModule.registerQueue(
      {
        name: QUEUES.IC_PAYOUT_DISBURSE,
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      },
      {
        name: QUEUES.IC_PAYOUT_WEBHOOK,
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
      {
        name: QUEUES.IC_PAYOUT_RECONCILE,
        defaultJobOptions: {
          removeOnComplete: { age: 24 * 3600, count: 100 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    ),
  ],
  controllers: [
    IcTaxProfilesController,
    IcPayoutAccountsController,
    IcPayoutAuthorizationsController,
    AgencyTaxFilingController,
    IcInvoiceController,
    DisbursementController,
  ],
  providers: [
    IcTaxProfilesService,
    IcPayoutAccountsService,
    IcPayoutAuthorizationsService,
    RctiPdfService,
    AgencyTaxFilingService,
    IcInvoiceNumberAllocator,
    PlaceOfSupplyService,
    IcInvoicePdfService,
    IcInvoiceService,
    ManualPayoutProvider,
    PayoutProviderFactory,
    DisbursementService,
    DisbursementProcessor,
  ],
  exports: [
    IcTaxProfilesService,
    IcPayoutAccountsService,
    IcPayoutAuthorizationsService,
    RctiPdfService,
    AgencyTaxFilingService,
    IcInvoiceNumberAllocator,
    PlaceOfSupplyService,
    IcInvoicePdfService,
    IcInvoiceService,
    ManualPayoutProvider,
    PayoutProviderFactory,
    DisbursementService,
  ],
})
export class IcPayoutsModule {}
