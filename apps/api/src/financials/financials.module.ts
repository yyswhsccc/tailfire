/**
 * Financials Module
 *
 * Provides financial management functionality including:
 * - Exchange rates (ExchangeRate-API integration)
 * - Activity traveller splits
 * - Trip notifications (Phase 5)
 * - Financial summary (Phase 6)
 * - Service fees (Phase 7)
 * - Stripe Connect integration (Phases 9-11)
 */

import { Module, forwardRef } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { EmailModule } from '../email/email.module'
import { DocumentTemplatesModule } from '../document-templates/document-templates.module'
import { DocumentRenderModule } from '../document-render/document-render.module'
import { CommissionModule } from './commission/commission.module'

// Shared access services (added directly — NOT via TripsModule to avoid circular dep)
import { TripAccessService } from '../trips/trip-access.service'
import { TripGroupAccessService } from '../trips/trip-group-access.service'

// Services
import { ExchangeRatesService } from './exchange-rates.service'
import { TravellerSplitsService } from './traveller-splits.service'
import { TripNotificationsService } from './trip-notifications.service'
import { FinancialSummaryService } from './financial-summary.service'
import { ServiceFeesService } from './service-fees.service'
import { TripOrderService } from './trip-order.service'
import { StripeConnectService } from './stripe-connect.service'
import { StripeInvoiceService } from './stripe-invoice.service'

// Controllers
import { ExchangeRatesController } from './exchange-rates.controller'
import { TravellerSplitsController } from './traveller-splits.controller'
import { TripNotificationsController } from './trip-notifications.controller'
import { FinancialSummaryController } from './financial-summary.controller'
import { ServiceFeesController } from './service-fees.controller'
import { TripOrderController } from './trip-order.controller'
import { StripeConnectController } from './stripe-connect.controller'
import { StripeInvoiceController } from './stripe-invoice.controller'

@Module({
  imports: [DatabaseModule, forwardRef(() => EmailModule), DocumentTemplatesModule, DocumentRenderModule, CommissionModule],
  controllers: [
    ExchangeRatesController,
    TravellerSplitsController,
    TripNotificationsController,
    FinancialSummaryController,
    ServiceFeesController,
    TripOrderController,
    StripeConnectController,
    StripeInvoiceController,
  ],
  providers: [
    ExchangeRatesService,
    TravellerSplitsService,
    TripNotificationsService,
    FinancialSummaryService,
    ServiceFeesService,
    TripOrderService,
    StripeConnectService,
    StripeInvoiceService,
    TripAccessService,
    TripGroupAccessService,
  ],
  exports: [
    ExchangeRatesService,
    TravellerSplitsService,
    TripNotificationsService,
    FinancialSummaryService,
    ServiceFeesService,
    TripOrderService,
    StripeConnectService,
    StripeInvoiceService,
    CommissionModule, // PR-1: re-export so TripsService can inject CommissionAuditService
  ],
})
export class FinancialsModule {}
