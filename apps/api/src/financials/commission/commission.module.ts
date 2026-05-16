/**
 * Commission Module
 *
 * Provides commission check management, reconciliation,
 * per-activity commission tracking, and agent payout functionality.
 */

import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../db/database.module'
import { CommissionService } from './commission.service'
import { CommissionAdjustmentsService } from './commission-adjustments.service'
import { CommissionAuditService } from './commission-audit.service'
import { CommissionReconcileService } from './commission-reconcile.service'
import { CommissionSettlementReversalService } from './commission-settlement-reversal.service'
import { CommissionDriftService } from './commission-drift.service'
import { CommissionDriftScheduler } from './commission-drift-scheduler.service'
import { CommissionReportsService } from './commission-reports.service'
import { CommissionController } from './commission.controller'
import { CommissionAdjustmentsController } from './commission-adjustments.controller'

@Module({
  imports: [DatabaseModule],
  controllers: [CommissionController, CommissionAdjustmentsController],
  providers: [
    CommissionService,
    CommissionAdjustmentsService,
    CommissionAuditService,
    CommissionReconcileService,
    CommissionSettlementReversalService,
    // PR-3: drift snapshot writer + scheduler. Scheduler is module-scoped
    // (Nest instantiates once per app), so the setInterval lives for the
    // process lifetime. onModuleDestroy clears it cleanly during shutdown.
    CommissionDriftService,
    CommissionDriftScheduler,
    CommissionReportsService,
  ],
  exports: [
    CommissionService,
    CommissionAdjustmentsService,
    CommissionAuditService,
    CommissionReconcileService,
    CommissionSettlementReversalService,
    CommissionDriftService,
    CommissionReportsService,
  ],
})
export class CommissionModule {}
