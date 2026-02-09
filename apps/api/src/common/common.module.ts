/**
 * Common Module
 *
 * Provides shared services and utilities used across the application.
 */

import { Module, Global } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { UserValidationService } from './user-validation.service'

// DeprecationTrackingService archived to _deprecated/ (was only used by legacy BookingsController)

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [UserValidationService],
  exports: [UserValidationService],
})
export class CommonModule {}
