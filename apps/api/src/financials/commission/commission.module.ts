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
import { CommissionController } from './commission.controller'
import { CommissionAdjustmentsController } from './commission-adjustments.controller'

@Module({
  imports: [DatabaseModule],
  controllers: [CommissionController, CommissionAdjustmentsController],
  providers: [CommissionService, CommissionAdjustmentsService],
  exports: [CommissionService, CommissionAdjustmentsService],
})
export class CommissionModule {}
