/**
 * Cruise Component Promoter
 *
 * Converts JSONB cruise data from an OTA trip request into a real Tailfire
 * custom_cruise activity via ComponentOrchestrationService.createCustomCruise().
 *
 * Expected JSONB data shape (from OTA consumer portal):
 * {
 *   cruiseLineName: string,
 *   shipName: string,
 *   itineraryName: string,
 *   departurePort: string,
 *   arrivalPort: string,
 *   departureDate: string,     // YYYY-MM-DD
 *   arrivalDate: string,       // YYYY-MM-DD
 *   nights: number,
 *   cabinCategory: string,
 *   cabinCode: string,
 *   region: string,
 *   totalPrice: number,        // Dollars (will be multiplied by 100 for cents)
 *   currency: string,
 *   supplier: string,
 *   portCalls: [{ day, portName, arriveDate, departDate, arriveTime, departTime }],
 * }
 */

import { Injectable, Logger } from '@nestjs/common'
import { ComponentOrchestrationService } from '../../trips/component-orchestration.service'
import type { ComponentPromoter, PromotionContext } from './base.promoter'
import type { CreateCustomCruiseComponentDto } from '@tailfire/shared-types'

@Injectable()
export class CruisePromoter implements ComponentPromoter {
  readonly type = 'cruise'
  private readonly logger = new Logger(CruisePromoter.name)

  constructor(
    private readonly orchestration: ComponentOrchestrationService,
  ) {}

  async promote(component: any, context: PromotionContext): Promise<string> {
    const data = component.data ?? {}
    const display = component.display ?? {}

    this.logger.log(
      `Promoting cruise component ${component.id} for trip ${context.tripId}`,
    )

    // Determine the itinerary day ID from the departure date
    const itineraryDayId = data.departureDate
      ? context.itineraryDayMap.get(data.departureDate)
      : undefined

    const cruiseLineName = data.cruiseLineName ?? data.cruiseLine ?? null
    const shipName = data.shipName ?? null
    const name = display.name ?? data.name ??
      ([cruiseLineName, shipName, data.itineraryName].filter(Boolean).join(' - ') ||
      'Cruise')

    // Build start/end datetimes
    const startDatetime = data.departureDate && data.departureTime
      ? `${data.departureDate}T${data.departureTime}:00`
      : data.departureDate
        ? `${data.departureDate}T00:00:00`
        : null
    const endDatetime = data.arrivalDate && data.arrivalTime
      ? `${data.arrivalDate}T${data.arrivalTime}:00`
      : data.arrivalDate
        ? `${data.arrivalDate}T23:59:00`
        : null

    // Price conversion: dollars to cents
    const totalPriceCents = data.totalPrice != null
      ? Math.round(data.totalPrice * 100)
      : data.totalPriceCents ?? null

    const dto: CreateCustomCruiseComponentDto = {
      itineraryDayId: itineraryDayId ?? null,
      componentType: 'custom_cruise',
      name,
      description: data.description ?? display.description ?? null,
      proposalStatus: 'draft',
      bookingStatus: 'unbooked',
      startDatetime,
      endDatetime,
      timezone: data.departureTimezone ?? data.timezone ?? null,
      location: data.departurePort ?? null,
      currency: data.currency ?? 'CAD',
      totalPriceCents,
      supplier: data.supplier ?? cruiseLineName,
      confirmationNumber: data.confirmationNumber ?? data.bookingNumber ?? null,
      customCruiseDetails: {
        source: 'manual',
        cruiseLineName,
        cruiseLineCode: data.cruiseLineCode ?? null,
        shipName,
        shipCode: data.shipCode ?? null,
        itineraryName: data.itineraryName ?? null,
        voyageCode: data.voyageCode ?? null,
        region: data.region ?? null,
        nights: data.nights ?? null,
        seaDays: data.seaDays ?? null,
        departurePort: data.departurePort ?? null,
        departureDate: data.departureDate ?? null,
        departureTime: data.departureTime ?? null,
        departureTimezone: data.departureTimezone ?? null,
        arrivalPort: data.arrivalPort ?? null,
        arrivalDate: data.arrivalDate ?? null,
        arrivalTime: data.arrivalTime ?? null,
        arrivalTimezone: data.arrivalTimezone ?? null,
        cabinCategory: data.cabinCategory ?? null,
        cabinCode: data.cabinCode ?? null,
        cabinNumber: data.cabinNumber ?? null,
        bookingNumber: data.bookingNumber ?? null,
        fareCode: data.fareCode ?? null,
        portCallsJson: data.portCalls ?? data.portCallsJson ?? [],
        inclusions: data.inclusions ?? [],
        specialRequests: data.specialRequests ?? null,
      },
    }

    const result = await this.orchestration.createCustomCruise(dto)

    this.logger.log(
      `Cruise promoted: activity ${result.id} on trip ${context.tripId}`,
    )
    return result.id
  }
}
