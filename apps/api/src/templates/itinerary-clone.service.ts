/**
 * Itinerary Clone Service
 *
 * Duplicates an itinerary within a trip by extracting its content
 * via the template extractor and applying it to a new itinerary.
 * Lives in the templates module to avoid circular dependency issues.
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { TemplateExtractorService } from './template-extractor.service'
import { TemplateApplierService } from './template-applier.service'
import { ItinerariesService } from '../trips/itineraries.service'
import { TripsService } from '../trips/trips.service'
import type { ItineraryResponseDto } from '@tailfire/shared-types'

@Injectable()
export class ItineraryCloneService {
  private readonly logger = new Logger(ItineraryCloneService.name)

  constructor(
    private readonly templateExtractorService: TemplateExtractorService,
    private readonly templateApplierService: TemplateApplierService,
    private readonly itinerariesService: ItinerariesService,
    private readonly tripsService: TripsService,
  ) {}

  /**
   * Duplicate an itinerary within the same trip.
   * Creates a new itinerary with copied metadata and days/activities.
   */
  async duplicateItinerary(
    tripId: string,
    itineraryId: string,
    _actorId: string,
  ): Promise<ItineraryResponseDto> {
    // 1. Fetch source itinerary and trip (for agencyId)
    const source = await this.itinerariesService.findOne(itineraryId, tripId)
    if (!source) {
      throw new NotFoundException('Itinerary not found')
    }
    const trip = await this.tripsService.findOne(tripId)
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    this.logger.log(`Duplicating itinerary ${itineraryId} in trip ${tripId}`)

    // 2. Extract payload using template extractor
    const payload = await this.templateExtractorService.extractItineraryPayload(itineraryId)

    // 3. Create new itinerary with copied metadata
    const newItinerary = await this.itinerariesService.create(tripId, {
      name: `${source.name} (Copy)`,
      description: source.description ?? undefined,
      coverPhoto: source.coverPhoto ?? undefined,
      overview: source.overview ?? undefined,
      startDate: source.startDate ?? undefined,
      endDate: source.endDate ?? undefined,
      status: 'draft',
    })

    // 4. Apply payload (creates days + activities)
    if (payload.dayOffsets && payload.dayOffsets.length > 0) {
      await this.templateApplierService.applyPayloadToItinerary(
        newItinerary.id,
        tripId,
        payload,
        source.startDate,
        trip.agencyId ?? '',
      )
    }

    this.logger.log(`Successfully duplicated itinerary ${itineraryId} -> ${newItinerary.id}`)

    // 5. Return the full new itinerary
    return this.itinerariesService.findOne(newItinerary.id)
  }
}
