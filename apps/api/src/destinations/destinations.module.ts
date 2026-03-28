/**
 * Destinations Module
 *
 * Universal hub entity that unifies cruise ports, tour cities, and enrichment
 * data into a single addressable destination. Supports:
 * - Public read endpoints (OTA consumer portal)
 * - Admin bootstrap endpoint (seed from cruise ports catalog)
 * - Paginated search with type/country/text filters
 */

import { Module } from '@nestjs/common'
import { DestinationsController } from './destinations.controller'
import { DestinationsService } from './destinations.service'
import { DestinationsBootstrapService } from './destinations-bootstrap.service'
import { SerpApiService } from './serpapi.service'
import { DestinationEnrichmentService } from './destination-enrichment.service'

@Module({
  controllers: [DestinationsController],
  providers: [
    DestinationsService,
    DestinationsBootstrapService,
    SerpApiService,
    DestinationEnrichmentService,
  ],
  exports: [DestinationsService],
})
export class DestinationsModule {}
