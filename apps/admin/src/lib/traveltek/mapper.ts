/**
 * Traveltek to Tailfire cruise data mapper.
 *
 * Transforms validated Traveltek cruise JSON into CreateCustomCruiseActivityDto format.
 * Returns dto, ui data, and warnings array for non-fatal issues.
 */

import type {
  CreateCustomCruiseActivityDto,
  CustomCruiseDetailsDto,
  CruisePortCall,
} from '@tailfire/shared-types/api'
import type { TraveltekCruise, TraveltekItineraryPort } from './schemas'

/**
 * UI data for combobox selections after import
 */
export interface TraveltekImportUI {
  // Traveltek IDs for combobox syncing
  cruiseLineId: number | null
  shipId: number | null
  regionIds: number[]

  // Display names for confirmation
  cruiseLineName: string | null
  shipName: string | null
  regionNames: string[]

  // File info
  fileName: string | null
}

/**
 * Import result with DTO, UI data, and warnings
 */
export interface TraveltekMapperResult {
  dto: CreateCustomCruiseActivityDto
  ui: TraveltekImportUI
  warnings: string[]
}

/**
 * Check if a port is a sea day based on name
 */
function isSeaDay(portName: string): boolean {
  const normalized = portName.toLowerCase().trim()
  return normalized === 'at sea' || normalized === 'sea day' || normalized.includes('at sea')
}

/**
 * Normalize empty strings to null
 */
function normalizeString(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  return value
}

/**
 * Normalize time string (HH:MM format)
 * Traveltek uses "00:00" for empty times
 */
function normalizeTime(value: string | null | undefined): string | null {
  const normalized = normalizeString(value)
  if (normalized === '00:00') {
    return null
  }
  return normalized
}

/**
 * Format time for display (add :00 for seconds if needed)
 */
function formatTime(value: string | null | undefined): string | null {
  const normalized = normalizeTime(value)
  if (!normalized) return null
  // Ensure HH:mm format
  return normalized
}

/**
 * Map Traveltek itinerary port to CruisePortCall
 */
function mapItineraryToPortCall(port: TraveltekItineraryPort): CruisePortCall & { isSeaDay: boolean } {
  return {
    day: port.day,
    portName: port.itineraryname || port.name,
    portId: port.portid,
    arriveDate: port.arrivedate,
    departDate: port.departdate,
    arriveTime: port.arrivetime || '',
    departTime: port.departtime || '',
    description: normalizeString(port.description) || undefined,
    latitude: normalizeString(port.latitude) || undefined,
    longitude: normalizeString(port.longitude) || undefined,
    isSeaDay: isSeaDay(port.itineraryname || port.name),
  }
}

/**
 * Calculate sea days from itinerary
 */
function countSeaDays(itinerary: TraveltekItineraryPort[]): number {
  return itinerary.filter((port) => isSeaDay(port.itineraryname || port.name)).length
}

/**
 * Get departure port info from first itinerary item
 */
function getDepartureInfo(
  cruise: TraveltekCruise,
  warnings: string[]
): { port: string | null; date: string | null; time: string | null } {
  const firstPort = cruise.itinerary[0]

  if (!firstPort) {
    warnings.push('No itinerary items found for departure info')
    return {
      port: null,
      date: cruise.startdate,
      time: null,
    }
  }

  // Use ports mapping if available, fallback to port name
  const portName =
    cruise.ports[String(firstPort.portid)] ||
    firstPort.itineraryname ||
    firstPort.name ||
    null

  return {
    port: portName,
    date: firstPort.departdate || cruise.startdate,
    time: formatTime(firstPort.departtime),
  }
}

/**
 * Get arrival port info from last itinerary item
 */
function getArrivalInfo(
  cruise: TraveltekCruise,
  warnings: string[]
): { port: string | null; date: string | null; time: string | null } {
  const lastPort = cruise.itinerary[cruise.itinerary.length - 1]

  if (!lastPort) {
    warnings.push('No itinerary items found for arrival info')
    return {
      port: null,
      date: cruise.enddate,
      time: null,
    }
  }

  // Check if last port has valid arrival info
  const hasArrivalTime = lastPort.arrivetime && lastPort.arrivetime !== '00:00'

  if (!hasArrivalTime) {
    warnings.push(
      `Last port "${lastPort.itineraryname || lastPort.name}" has no arrival time - using depart time`
    )
  }

  // Use ports mapping if available, fallback to port name
  const portName =
    cruise.ports[String(lastPort.portid)] ||
    lastPort.itineraryname ||
    lastPort.name ||
    null

  return {
    port: portName,
    date: lastPort.arrivedate || cruise.enddate,
    time: formatTime(hasArrivalTime ? lastPort.arrivetime : lastPort.departtime),
  }
}

/**
 * Get primary region from regions object
 */
function getPrimaryRegion(cruise: TraveltekCruise): { id: number | null; name: string | null } {
  const regionIds = Object.keys(cruise.regions)

  if (regionIds.length === 0) {
    return { id: null, name: null }
  }

  // Use first region as primary
  const firstRegionId = regionIds[0]!
  const primaryId = parseInt(firstRegionId, 10)
  const primaryName = cruise.regions[firstRegionId] || null

  return { id: primaryId, name: primaryName }
}

/**
 * Map Traveltek cruise to CreateCustomCruiseActivityDto
 */
export function mapTraveltekToTailfire(
  cruise: TraveltekCruise,
  options: { fileName?: string } = {}
): TraveltekMapperResult {
  const warnings: string[] = []

  // Get departure and arrival info
  const departure = getDepartureInfo(cruise, warnings)
  const arrival = getArrivalInfo(cruise, warnings)

  // Get region info
  const primaryRegion = getPrimaryRegion(cruise)
  const regionIds = Object.keys(cruise.regions).map((id) => parseInt(id, 10))
  const regionNames = Object.values(cruise.regions).filter(Boolean) as string[]

  // Map port calls with isSeaDay flag
  const portCallsJson = cruise.itinerary.map(mapItineraryToPortCall)

  // Calculate sea days
  const seaDays = countSeaDays(cruise.itinerary)

  // Build custom cruise details
  const customCruiseDetails: CustomCruiseDetailsDto = {
    // Source
    source: 'traveltek',
    traveltekCruiseId: String(cruise.cruiseid),

    // Cruise Line
    cruiseLineName: normalizeString(cruise.linecontent.name),
    cruiseLineCode: normalizeString(cruise.linecontent.code),

    // Ship
    shipName: normalizeString(cruise.shipcontent?.name || null),
    shipCode: null, // Not directly available in Traveltek
    shipClass: normalizeString(cruise.shipcontent?.shipclass || null),
    shipImageUrl: null, // Would need to extract from shipcontent images

    // Voyage
    itineraryName: normalizeString(cruise.name),
    voyageCode: normalizeString(cruise.voyagecode),
    region: primaryRegion.name,
    nights: Math.max(0, cruise.nights),
    seaDays,

    // Departure
    departurePort: departure.port,
    departureDate: departure.date,
    departureTime: departure.time,
    departureTimezone: null, // Not available in Traveltek data

    // Arrival
    arrivalPort: arrival.port,
    arrivalDate: arrival.date,
    arrivalTime: arrival.time,
    arrivalTimezone: null, // Not available in Traveltek data

    // Cabin (not set from import - user selects)
    cabinCategory: null,
    cabinCode: null,
    cabinNumber: null,
    cabinDeck: null,

    // Booking (not set from import)
    bookingNumber: null,
    fareCode: null,
    bookingDeadline: null,

    // JSON data
    portCallsJson: portCallsJson as CruisePortCall[],
    cabinPricingJson: cruise.cheapest || {},
    shipContentJson: cruise.shipcontent || {},

    // Additional
    inclusions: [],
    specialRequests: null,
  }

  // Generate name from cruise details
  const cruiseName = [
    cruise.linecontent.name,
    cruise.shipcontent?.name,
    '-',
    cruise.name,
  ]
    .filter(Boolean)
    .join(' ')

  // Build the DTO
  const dto: CreateCustomCruiseActivityDto = {
    itineraryDayId: '', // Must be set by caller
    componentType: 'custom_cruise',
    name: cruiseName,
    description: null,
    proposalStatus: 'draft',

    // Pricing (not set from import)
    pricingType: 'per_person',
    currency: 'USD',
    totalPriceCents: null,
    taxesAndFeesCents: null,
    confirmationNumber: null,

    // Commission (not set from import)
    commissionTotalCents: null,
    commissionSplitPercentage: null,
    commissionExpectedDate: null,

    // Cruise details
    customCruiseDetails,
  }

  // Build UI data for combobox syncing
  const ui: TraveltekImportUI = {
    cruiseLineId: cruise.linecontent.id,
    shipId: cruise.shipid,
    regionIds,
    cruiseLineName: cruise.linecontent.name,
    shipName: cruise.shipcontent?.name || null,
    regionNames,
    fileName: options.fileName || null,
  }

  // Add warnings for missing data
  if (!cruise.enddate) {
    warnings.push('End date not provided - calculated from last itinerary item')
  }

  if (portCallsJson.length === 0) {
    warnings.push('No port calls found in itinerary')
  }

  return { dto, ui, warnings }
}

/**
 * Type guard to check if a result has warnings
 */
export function hasWarnings(result: TraveltekMapperResult): boolean {
  return result.warnings.length > 0
}
