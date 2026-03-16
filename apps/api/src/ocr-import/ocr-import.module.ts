/**
 * OCR Import Module
 *
 * Orchestrates OCR document import: upload, preview, and confirm.
 * Depends on OcrModule for extraction and TripsModule for entity creation.
 */

import { Module, forwardRef } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { DatabaseModule } from '../db/database.module'
import { OcrModule } from '../ocr/ocr.module'
import { ContactsModule } from '../contacts/contacts.module'
import { TripsModule } from '../trips/trips.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { AutomationModule } from '../automation/automation.module'
import { CatalogMatcherModule } from '../catalog-matcher/catalog-matcher.module'
import { OcrImportController } from './ocr-import.controller'
import { OcrImportService } from './ocr-import.service'
import { QUEUES } from '../automation/automation.types'

@Module({
  imports: [
    DatabaseModule,
    OcrModule,
    forwardRef(() => ContactsModule),
    forwardRef(() => TripsModule),
    SuppliersModule,
    forwardRef(() => AutomationModule),
    CatalogMatcherModule,
    BullModule.registerQueue({
      name: QUEUES.OCR_PROCESSING,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600, count: 100 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    }),
  ],
  controllers: [OcrImportController],
  providers: [OcrImportService],
  exports: [OcrImportService],
})
export class OcrImportModule {}
