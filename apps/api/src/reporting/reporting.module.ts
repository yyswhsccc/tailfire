/**
 * Reporting Module
 *
 * Provides the reporting system: catalog, query execution, and PDF/CSV export.
 *
 * Dependencies:
 *   - TripsModule → TripAccessService (scoped trip ID resolution)
 *   - DocumentRenderModule → PuppeteerPdfService (PDF generation)
 */

import { Module, forwardRef } from '@nestjs/common'
import { TripsModule } from '../trips/trips.module'
import { DocumentRenderModule } from '../document-render/document-render.module'
import { ReportingController } from './reporting.controller'
import { ReportingService } from './reporting.service'
import { ReportExportService } from './export/report-export.service'

@Module({
  imports: [
    forwardRef(() => TripsModule), // TripAccessService
    DocumentRenderModule, // PuppeteerPdfService
  ],
  controllers: [ReportingController],
  providers: [ReportingService, ReportExportService],
})
export class ReportingModule {}
