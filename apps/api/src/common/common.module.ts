/**
 * Common Module
 *
 * Provides shared services and utilities used across the application.
 */

import { Module, Global } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { UserValidationService } from './user-validation.service'
import { OtaRevalidationService } from './services/ota-revalidation.service'

// DeprecationTrackingService archived to _deprecated/ (was only used by legacy BookingsController)

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [UserValidationService, OtaRevalidationService],
  exports: [UserValidationService, OtaRevalidationService],
})
export class CommonModule {}
