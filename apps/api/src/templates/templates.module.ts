/**
 * Templates Module
 *
 * Provides itinerary and package template management functionality.
 * Templates store reusable structures that can be applied to trips and itineraries.
 *
 * This module depends on TripsModule for apply operations that create
 * itineraries, days, and activities via existing services.
 */

import { Module, forwardRef } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { TripsModule } from '../trips/trips.module'

// Services
import { ItineraryTemplatesService } from './itinerary-templates.service'
import { PackageTemplatesService } from './package-templates.service'
import { TemplateApplierService } from './template-applier.service'
import { TemplateExtractorService } from './template-extractor.service'
import { ItineraryCloneService } from './itinerary-clone.service'

// Controllers
import { ItineraryTemplatesController } from './itinerary-templates.controller'
import { PackageTemplatesController } from './package-templates.controller'
import { TemplateApplyController } from './template-apply.controller'
import { TemplateSaveController } from './template-save.controller'

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => TripsModule), // Forward ref to avoid circular dependency
  ],
  controllers: [
    ItineraryTemplatesController,
    PackageTemplatesController,
    TemplateApplyController,
    TemplateSaveController,
  ],
  providers: [
    ItineraryTemplatesService,
    PackageTemplatesService,
    TemplateApplierService,
    TemplateExtractorService,
    ItineraryCloneService,
  ],
  exports: [
    ItineraryTemplatesService,
    PackageTemplatesService,
    TemplateApplierService,
    TemplateExtractorService,
    ItineraryCloneService,
  ],
})
export class TemplatesModule {}
