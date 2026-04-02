/**
 * Flight Component Promoter
 *
 * Converts JSONB flight data from an OTA trip request into a real Tailfire
 * flight activity via ComponentOrchestrationService.createFlight().
 *
 * Expected JSONB data shape (from OTA consumer portal):
 * {
 *   airline: string,
 *   departureDate: string,     // YYYY-MM-DD
 *   arrivalDate: string,       // YYYY-MM-DD
 *   origin: string,            // Airport code (e.g. "YYZ")
 *   destination: string,       // Airport code (e.g. "LHR")
 *   segments: [{ segmentOrder, airline, flightNumber, departureAirportCode, departureDate,
 *                departureTime, arrivalAirportCode, arrivalDate, arrivalTime, ... }],
 *   totalPrice: number,        // Dollars (will be multiplied by 100 for cents)
 *   currency: string,
 *   supplier: string,
 * }
 */

import { Injectable, Logger } from '@nestjs/common'
import { ComponentOrchestrationService } from '../../trips/component-orchestration.service'
import type { ComponentPromoter, PromotionContext } from './base.promoter'
import type { CreateFlightComponentDto, FlightSegmentDto } from '@tailfire/shared-types'

@Injectable()
export class FlightPromoter implements ComponentPromoter {
  readonly type = 'flight'
  private readonly logger = new Logger(FlightPromoter.name)

  constructor(
    private readonly orchestration: ComponentOrchestrationService,
  ) {}

  async promote(component: any, context: PromotionContext): Promise<string> {
    const data = component.data ?? {}
    const display = component.display ?? {}

    this.logger.log(
      `Promoting flight component ${component.id} for trip ${context.tripId}`,
    )

    // Build flight segments from JSONB data
    const segments: FlightSegmentDto[] = []
    if (Array.isArray(data.segments)) {
      for (let i = 0; i < data.segments.length; i++) {
        const seg = data.segments[i]
        segments.push({
          segmentOrder: seg.segmentOrder ?? i + 1,
          airline: seg.airline ?? data.airline ?? null,
          flightNumber: seg.flightNumber ?? null,
          departureAirportCode: seg.departureAirportCode ?? null,
          departureAirportName: seg.departureAirportName ?? null,
          departureAirportCity: seg.departureAirportCity ?? null,
          departureDate: seg.departureDate ?? null,
          departureTime: seg.departureTime ?? null,
          departureTimezone: seg.departureTimezone ?? null,
          departureTerminal: seg.departureTerminal ?? null,
          arrivalAirportCode: seg.arrivalAirportCode ?? null,
          arrivalAirportName: seg.arrivalAirportName ?? null,
          arrivalAirportCity: seg.arrivalAirportCity ?? null,
          arrivalDate: seg.arrivalDate ?? null,
          arrivalTime: seg.arrivalTime ?? null,
          arrivalTimezone: seg.arrivalTimezone ?? null,
          arrivalTerminal: seg.arrivalTerminal ?? null,
        })
      }
    }

    // Build name from segments or top-level data
    const origin = segments[0]?.departureAirportCode ?? data.origin ?? 'TBD'
    const destination =
      segments[segments.length - 1]?.arrivalAirportCode ?? data.destination ?? 'TBD'
    const name = display.name ?? data.name ?? `Flight ${origin} - ${destination}`

    // Determine the itinerary day ID from the departure date
    const departureDate = segments[0]?.departureDate ?? data.departureDate
    const itineraryDayId = departureDate
      ? context.itineraryDayMap.get(departureDate)
      : undefined

    // Build start/end datetimes
    const startDatetime = departureDate && segments[0]?.departureTime
      ? `${departureDate}T${segments[0].departureTime}:00`
      : null
    const lastSeg = segments[segments.length - 1]
    const endDatetime = lastSeg?.arrivalDate && lastSeg?.arrivalTime
      ? `${lastSeg.arrivalDate}T${lastSeg.arrivalTime}:00`
      : null

    // Price conversion: dollars to cents
    const totalPriceCents = data.totalPrice != null
      ? Math.round(data.totalPrice * 100)
      : data.totalPriceCents ?? null

    const dto: CreateFlightComponentDto = {
      itineraryDayId: itineraryDayId ?? null,
      componentType: 'flight',
      name,
      description: data.description ?? display.description ?? null,
      proposalStatus: 'draft',
      bookingStatus: 'unbooked',
      startDatetime,
      endDatetime,
      timezone: data.timezone ?? segments[0]?.departureTimezone ?? null,
      location: data.location ?? destination,
      currency: data.currency ?? 'CAD',
      totalPriceCents,
      supplier: data.supplier ?? null,
      confirmationNumber: data.confirmationNumber ?? null,
      flightDetails: {
        airline: segments[0]?.airline ?? data.airline ?? null,
        flightNumber: segments[0]?.flightNumber ?? null,
        departureAirportCode: segments[0]?.departureAirportCode ?? data.origin ?? null,
        departureDate: segments[0]?.departureDate ?? data.departureDate ?? null,
        departureTime: segments[0]?.departureTime ?? null,
        departureTimezone: segments[0]?.departureTimezone ?? null,
        arrivalAirportCode: lastSeg?.arrivalAirportCode ?? data.destination ?? null,
        arrivalDate: lastSeg?.arrivalDate ?? data.arrivalDate ?? null,
        arrivalTime: lastSeg?.arrivalTime ?? null,
        arrivalTimezone: lastSeg?.arrivalTimezone ?? null,
        segments: segments.length > 0 ? segments : undefined,
      },
    }

    const result = await this.orchestration.createFlight(dto)

    this.logger.log(
      `Flight promoted: activity ${result.id} on trip ${context.tripId}`,
    )
    return result.id
  }
}
