/**
 * Lodging (Hotel) Component Promoter
 *
 * Converts JSONB hotel data from an OTA trip request into a real Tailfire
 * lodging activity via ComponentOrchestrationService.createLodging().
 *
 * Expected JSONB data shape (from OTA consumer portal):
 * {
 *   propertyName: string,
 *   checkInDate: string,       // YYYY-MM-DD
 *   checkOutDate: string,      // YYYY-MM-DD
 *   checkInTime: string,       // HH:mm
 *   checkOutTime: string,      // HH:mm
 *   roomType: string,
 *   roomCount: number,
 *   address: string,
 *   totalPrice: number,        // Dollars (will be multiplied by 100 for cents)
 *   currency: string,
 *   supplier: string,
 * }
 */

import { Injectable, Logger } from '@nestjs/common'
import { ComponentOrchestrationService } from '../../trips/component-orchestration.service'
import type { ComponentPromoter, PromotionContext } from './base.promoter'
import type { CreateLodgingComponentDto } from '@tailfire/shared-types'

@Injectable()
export class LodgingPromoter implements ComponentPromoter {
  readonly type = 'hotel'
  private readonly logger = new Logger(LodgingPromoter.name)

  constructor(
    private readonly orchestration: ComponentOrchestrationService,
  ) {}

  async promote(component: any, context: PromotionContext): Promise<string> {
    const data = component.data ?? {}
    const display = component.display ?? {}

    this.logger.log(
      `Promoting hotel component ${component.id} for trip ${context.tripId}`,
    )

    // Determine the itinerary day ID from the check-in date
    const itineraryDayId = data.checkInDate
      ? context.itineraryDayMap.get(data.checkInDate)
      : undefined

    const propertyName = data.propertyName ?? data.hotelName ?? 'Hotel'
    const name = display.name ?? data.name ?? propertyName

    // Price conversion: dollars to cents
    const totalPriceCents = data.totalPrice != null
      ? Math.round(data.totalPrice * 100)
      : data.totalPriceCents ?? null

    const dto: CreateLodgingComponentDto = {
      itineraryDayId: itineraryDayId ?? null,
      componentType: 'lodging',
      name,
      description: data.description ?? display.description ?? null,
      proposalStatus: 'draft',
      bookingStatus: 'unbooked',
      timezone: data.timezone ?? null,
      location: data.location ?? data.city ?? null,
      address: data.address ?? null,
      coordinates: data.coordinates ?? null,
      currency: data.currency ?? 'CAD',
      totalPriceCents,
      supplier: data.supplier ?? null,
      confirmationNumber: data.confirmationNumber ?? null,
      pricingType: 'per_room',
      lodgingDetails: {
        propertyName,
        address: data.address ?? null,
        phone: data.phone ?? null,
        website: data.website ?? null,
        checkInDate: data.checkInDate ?? null,
        checkInTime: data.checkInTime ?? null,
        checkOutDate: data.checkOutDate ?? null,
        checkOutTime: data.checkOutTime ?? null,
        timezone: data.timezone ?? null,
        roomType: data.roomType ?? null,
        roomCount: data.roomCount ?? null,
        amenities: data.amenities ?? null,
        specialRequests: data.specialRequests ?? null,
      },
    }

    const result = await this.orchestration.createLodging(dto)

    this.logger.log(
      `Hotel promoted: activity ${result.id} on trip ${context.tripId}`,
    )
    return result.id
  }
}
