/**
 * Tour Component Promoter
 *
 * Converts JSONB tour data from an OTA trip request into a real Tailfire
 * custom_tour activity via ComponentOrchestrationService.createCustomTour().
 *
 * Expected JSONB data shape (from OTA consumer portal):
 * {
 *   tourName: string,
 *   operatorCode: string,      // e.g. 'globus', 'cosmos'
 *   provider: string,          // e.g. 'globus'
 *   providerIdentifier: string,// Tour code (e.g. 'CQ')
 *   startDate: string,         // YYYY-MM-DD
 *   endDate: string,           // YYYY-MM-DD
 *   days: number,
 *   nights: number,
 *   startCity: string,
 *   endCity: string,
 *   totalPrice: number,        // Dollars (will be multiplied by 100 for cents)
 *   currency: string,
 *   supplier: string,
 *   itineraryDays: [{ dayNumber, title, description, overnightCity }],
 *   inclusions: [{ inclusionType, category, description }],
 *   hotels: [{ dayNumber, hotelName, city, description }],
 * }
 */

import { Injectable, Logger } from '@nestjs/common'
import { ComponentOrchestrationService } from '../../trips/component-orchestration.service'
import type { ComponentPromoter, PromotionContext } from './base.promoter'
import type { CreateCustomTourComponentDto } from '@tailfire/shared-types'

@Injectable()
export class TourPromoter implements ComponentPromoter {
  readonly type = 'tour'
  private readonly logger = new Logger(TourPromoter.name)

  constructor(
    private readonly orchestration: ComponentOrchestrationService,
  ) {}

  async promote(component: any, context: PromotionContext): Promise<string> {
    const data = component.data ?? {}
    const display = component.display ?? {}

    this.logger.log(
      `Promoting tour component ${component.id} for trip ${context.tripId}`,
    )

    // Determine the itinerary day ID from the start date
    const itineraryDayId = data.startDate
      ? context.itineraryDayMap.get(data.startDate)
      : undefined

    const tourName = data.tourName ?? data.name ?? 'Tour'
    const name = display.name ?? tourName

    // Build start/end datetimes
    const startDatetime = data.startDate
      ? `${data.startDate}T00:00:00`
      : null
    const endDatetime = data.endDate
      ? `${data.endDate}T23:59:00`
      : null

    // Price conversion: dollars to cents
    const totalPriceCents = data.totalPrice != null
      ? Math.round(data.totalPrice * 100)
      : data.totalPriceCents ?? null

    // Base price in cents for the departure record
    const basePriceCents = data.basePrice != null
      ? Math.round(data.basePrice * 100)
      : data.basePriceCents ?? totalPriceCents ?? null

    const dto: CreateCustomTourComponentDto = {
      itineraryDayId: itineraryDayId ?? null,
      componentType: 'custom_tour',
      name,
      description: data.description ?? display.description ?? null,
      proposalStatus: 'draft',
      bookingStatus: 'unbooked',
      startDatetime,
      endDatetime,
      timezone: data.timezone ?? null,
      location: data.startCity ?? data.location ?? null,
      currency: data.currency ?? 'CAD',
      totalPriceCents,
      supplier: data.supplier ?? data.provider ?? null,
      confirmationNumber: data.confirmationNumber ?? null,
      customTourDetails: {
        tourId: data.tourId ?? null,
        operatorCode: data.operatorCode ?? null,
        provider: data.provider ?? null,
        providerIdentifier: data.providerIdentifier ?? null,
        departureId: data.departureId ?? null,
        departureCode: data.departureCode ?? null,
        departureStartDate: data.startDate ?? null,
        departureEndDate: data.endDate ?? null,
        currency: data.currency ?? 'CAD',
        basePriceCents,
        tourName,
        days: data.days ?? null,
        nights: data.nights ?? null,
        startCity: data.startCity ?? null,
        endCity: data.endCity ?? null,
        itineraryJson: data.itineraryDays ?? data.itineraryJson ?? [],
        inclusionsJson: data.inclusions ?? data.inclusionsJson ?? [],
        hotelsJson: data.hotels ?? data.hotelsJson ?? [],
      },
    }

    const result = await this.orchestration.createCustomTour(dto)

    this.logger.log(
      `Tour promoted: activity ${result.id} on trip ${context.tripId}`,
    )
    return result.id
  }
}
