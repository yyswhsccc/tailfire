/**
 * Flight Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles flight segments, departure/arrival details, and pricing validation.
 */

import { z } from 'zod'
import type { CreateFlightActivityDto, PricingType } from '@tailfire/shared-types/api'

// ============================================================================
// Helper: Optional valid date string (ISO format)
// ============================================================================

const optionalDateString = z.string()
  .transform((val) => {
    if (!val) return null
    const d = new Date(val)
    return Number.isNaN(d.getTime()) ? null : val
  })
  .nullable()
  .optional()

const optionalTimeString = z.string()
  .nullable()
  .optional()

// ============================================================================
// Flight Seat Schema (nested within segment)
// ============================================================================

export const flightSeatSchema = z.object({
  id: z.string().optional(),
  travelerName: z.string().default(''),
  seatNumber: z.string().default(''),
})

// ============================================================================
// Flight Segment Schema (for multi-leg flights)
// ============================================================================

export const flightSegmentSchema = z.object({
  id: z.string(),
  date: optionalDateString,
  airline: z.string().default(''),
  airlineCode: z.string().default(''),
  flightNumber: z.string().default(''),
  isManualEntry: z.boolean().default(false),

  // Airport codes
  departureAirport: z.string().default(''),
  arrivalAirport: z.string().default(''),

  // Dates (ISO format YYYY-MM-DD)
  departureDate: optionalDateString,
  arrivalDate: optionalDateString,

  // Times (HH:mm format)
  departureTime: optionalTimeString,
  arrivalTime: optionalTimeString,

  // Timezones
  departureTimezone: z.string().default(''),
  arrivalTimezone: z.string().default(''),

  // Terminal & Gate
  departureTerminal: z.string().default(''),
  departureGate: z.string().default(''),
  arrivalTerminal: z.string().default(''),
  arrivalGate: z.string().default(''),

  // Aircraft details (from Aerodatabox)
  aircraftModel: z.string().default(''),
  aircraftRegistration: z.string().default(''),
  aircraftModeS: z.string().default(''),
  aircraftImageUrl: z.string().default(''),
  aircraftImageAuthor: z.string().default(''),

  // Seats
  seats: z.array(flightSeatSchema).default([]),
})

// ============================================================================
// Flight Details Schema (main flight info)
// ============================================================================

export const flightDetailsSchema = z.object({
  airline: z.string().optional().default(''),
  flightNumber: z.string().optional().default(''),
  departureAirportCode: z.string().optional().default(''),
  arrivalAirportCode: z.string().optional().default(''),
  departureDate: optionalDateString,
  departureTime: optionalTimeString,
  departureTimezone: z.string().optional().default(''),
  departureTerminal: z.string().optional().default(''),
  departureGate: z.string().optional().default(''),
  arrivalDate: optionalDateString,
  arrivalTime: optionalTimeString,
  arrivalTimezone: z.string().optional().default(''),
  arrivalTerminal: z.string().optional().default(''),
  arrivalGate: z.string().optional().default(''),
})

// ============================================================================
// Main Flight Form Schema
// ============================================================================

export const flightFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('flight').default('flight'),
  name: z.string().default(''), // Auto-generated from flight info
  description: z.string().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Flight details (main flight info)
  flightDetails: flightDetailsSchema.optional(),

  // Flight segments (for multi-leg flights)
  flightSegments: z.array(flightSegmentSchema).default([]),

  // Itinerary display mode
  itineraryDisplay: z.enum(['single', 'multi', 'round_trip']).default('single'),

  // Pricing fields
  totalPriceCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Price cannot be negative'))
    .default(0),
  taxesAndFeesCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Taxes cannot be negative'))
    .default(0),
  currency: z.string().default('CAD'),
  pricingType: z.enum(['per_person', 'per_group', 'fixed', 'per_room', 'total']).default('per_person'),
  confirmationNumber: z.string().default(''),

  // Commission fields
  commissionTotalCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative())
    .default(0),
  commissionSplitPercentage: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().min(0).max(100))
    .default(0),
  commissionExpectedDate: optionalDateString,

  // Booking details
  termsAndConditions: z.string().default(''),
  cancellationPolicy: z.string().default(''),
  supplier: z.string().default(''),
})

export type FlightFormData = z.infer<typeof flightFormSchema>
export type FlightSegmentData = z.infer<typeof flightSegmentSchema>
export type FlightDetailsData = z.infer<typeof flightDetailsSchema>
export type FlightSeatData = z.infer<typeof flightSeatSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const FLIGHT_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
  'flightDetails',
  'flightSegments',
  'itineraryDisplay',
  'totalPriceCents',
  'taxesAndFeesCents',
  'currency',
  'pricingType',
  'confirmationNumber',
  'commissionTotalCents',
  'commissionSplitPercentage',
  'commissionExpectedDate',
  'termsAndConditions',
  'cancellationPolicy',
  'supplier',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Generate a unique ID for new segments
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Create a default empty flight segment
 */
export function createDefaultSegment(dayDate?: string | null): FlightSegmentData {
  return {
    id: generateId(),
    date: dayDate || null,
    airline: '',
    airlineCode: '',
    flightNumber: '',
    isManualEntry: false,
    departureAirport: '',
    arrivalAirport: '',
    departureDate: dayDate || null,
    arrivalDate: null,
    departureTime: null,
    arrivalTime: null,
    departureTimezone: '',
    arrivalTimezone: '',
    departureTerminal: '',
    departureGate: '',
    arrivalTerminal: '',
    arrivalGate: '',
    aircraftModel: '',
    aircraftRegistration: '',
    aircraftModeS: '',
    aircraftImageUrl: '',
    aircraftImageAuthor: '',
    seats: [],
  }
}

/**
 * Map API segment (FlightSegmentDto) to form segment (FlightSegmentData)
 * Handles field name conversions: departureAirportCode → departureAirport
 */
function mapApiSegmentToFormSegment(apiSegment: any, dayDate?: string | null): FlightSegmentData {
  return {
    id: apiSegment.id || generateId(),
    date: apiSegment.departureDate || dayDate || null,
    airline: apiSegment.airline || '',
    airlineCode: '',
    flightNumber: apiSegment.flightNumber || '',
    isManualEntry: true, // Loaded from DB, so treat as manual
    departureAirport: apiSegment.departureAirportCode || '',
    arrivalAirport: apiSegment.arrivalAirportCode || '',
    departureDate: apiSegment.departureDate || dayDate || null,
    arrivalDate: apiSegment.arrivalDate || null,
    departureTime: apiSegment.departureTime || null,
    arrivalTime: apiSegment.arrivalTime || null,
    departureTimezone: apiSegment.departureTimezone || '',
    arrivalTimezone: apiSegment.arrivalTimezone || '',
    departureTerminal: apiSegment.departureTerminal || '',
    departureGate: apiSegment.departureGate || '',
    arrivalTerminal: apiSegment.arrivalTerminal || '',
    arrivalGate: apiSegment.arrivalGate || '',
    aircraftModel: apiSegment.aircraftModel || '',
    aircraftRegistration: apiSegment.aircraftRegistration || '',
    aircraftModeS: apiSegment.aircraftModeS || '',
    aircraftImageUrl: apiSegment.aircraftImageUrl || '',
    aircraftImageAuthor: apiSegment.aircraftImageAuthor || '',
    seats: [],
  }
}

/**
 * Creates default form values, handling server data hydration
 */
export function toFlightDefaults(
  serverData?: Partial<FlightFormData> | null,
  dayDate?: string | null,
  tripCurrency?: string | null
): FlightFormData {
  // Handle segments - check multiple sources:
  // 1. serverData.flightSegments (if form data was passed directly)
  // 2. serverData.flightDetails.segments (from API response)
  // 3. Create default segment if nothing found
  let segments: FlightSegmentData[]

  if (serverData?.flightSegments && serverData.flightSegments.length > 0) {
    // Form data passed directly
    segments = serverData.flightSegments
  } else if ((serverData as any)?.flightDetails?.segments?.length > 0) {
    // API response with segments in flightDetails
    const apiSegments = (serverData as any).flightDetails.segments
    segments = apiSegments.map((seg: any) => mapApiSegmentToFormSegment(seg, dayDate))
  } else {
    // No segments found, create default
    segments = [createDefaultSegment(dayDate)]
  }

  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'flight',
    name: serverData?.name ?? '',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',

    flightDetails: serverData?.flightDetails ?? {
      airline: '',
      flightNumber: '',
      departureAirportCode: '',
      arrivalAirportCode: '',
      departureDate: dayDate || null,
      departureTime: null,
      departureTimezone: '',
      departureTerminal: '',
      departureGate: '',
      arrivalDate: null,
      arrivalTime: null,
      arrivalTimezone: '',
      arrivalTerminal: '',
      arrivalGate: '',
    },

    flightSegments: segments,
    itineraryDisplay: serverData?.itineraryDisplay ?? 'single',

    totalPriceCents: serverData?.totalPriceCents ?? 0,
    taxesAndFeesCents: serverData?.taxesAndFeesCents ?? 0,
    currency: serverData?.currency ?? tripCurrency ?? 'CAD',
    pricingType: serverData?.pricingType ?? 'per_person',
    confirmationNumber: serverData?.confirmationNumber ?? '',

    commissionTotalCents: serverData?.commissionTotalCents ?? 0,
    commissionSplitPercentage: serverData?.commissionSplitPercentage ?? 0,
    commissionExpectedDate: serverData?.commissionExpectedDate ?? null,

    termsAndConditions: serverData?.termsAndConditions ?? '',
    cancellationPolicy: serverData?.cancellationPolicy ?? '',
    supplier: serverData?.supplier ?? '',
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Maps form data to API payload with proper type conversions.
 *
 * IMPORTANT: The form uses flightSegments[] for UI input (from search/manual entry),
 * and the API expects data in both flightDetails (legacy single-segment) and
 * flightDetails.segments[] (multi-segment support). This function:
 * 1. Copies first segment data to flightDetails for backwards compatibility
 * 2. Maps all segments to flightDetails.segments[] for multi-segment persistence
 */
export function toFlightApiPayload(data: FlightFormData): CreateFlightActivityDto {
  // Get the first segment - this is where flight search data is applied
  const firstSegment = data.flightSegments[0]

  // Check if first segment has meaningful data (airline or flight number)
  const segmentHasData = firstSegment && (firstSegment.airline || firstSegment.flightNumber)

  // Check if flightDetails is empty/missing meaningful data
  const flightDetailsEmpty = !data.flightDetails?.airline && !data.flightDetails?.flightNumber

  // Map all segments to API format for multi-segment persistence
  const segments = data.flightSegments
    .filter((seg) => seg.airline || seg.flightNumber || seg.departureAirport || seg.arrivalAirport)
    .map((seg, index) => ({
      id: seg.id,
      segmentOrder: index,
      airline: seg.airline || null,
      flightNumber: seg.flightNumber || null,
      departureAirportCode: seg.departureAirport || null,
      arrivalAirportCode: seg.arrivalAirport || null,
      departureDate: seg.departureDate || null,
      departureTime: seg.departureTime || null,
      departureTimezone: seg.departureTimezone || null,
      departureTerminal: seg.departureTerminal || null,
      departureGate: seg.departureGate || null,
      arrivalDate: seg.arrivalDate || null,
      arrivalTime: seg.arrivalTime || null,
      arrivalTimezone: seg.arrivalTimezone || null,
      arrivalTerminal: seg.arrivalTerminal || null,
      arrivalGate: seg.arrivalGate || null,
      aircraftModel: seg.aircraftModel || null,
      aircraftRegistration: seg.aircraftRegistration || null,
      aircraftModeS: seg.aircraftModeS || null,
      aircraftImageUrl: seg.aircraftImageUrl || null,
      aircraftImageAuthor: seg.aircraftImageAuthor || null,
    }))

  // Build flightDetails: prefer existing flightDetails, but use segment data as fallback
  // This handles the case where applyFlightData() populates segments but not flightDetails
  let flightDetails: CreateFlightActivityDto['flightDetails'] = undefined

  if (segmentHasData && flightDetailsEmpty && firstSegment) {
    // Copy first segment data to flightDetails (segment fields → API fields)
    flightDetails = {
      airline: firstSegment.airline || null,
      flightNumber: firstSegment.flightNumber || null,
      departureAirportCode: firstSegment.departureAirport || null,
      arrivalAirportCode: firstSegment.arrivalAirport || null,
      departureDate: firstSegment.departureDate || null,
      departureTime: firstSegment.departureTime || null,
      departureTimezone: firstSegment.departureTimezone || null,
      departureTerminal: firstSegment.departureTerminal || null,
      departureGate: firstSegment.departureGate || null,
      arrivalDate: firstSegment.arrivalDate || null,
      arrivalTime: firstSegment.arrivalTime || null,
      arrivalTimezone: firstSegment.arrivalTimezone || null,
      arrivalTerminal: firstSegment.arrivalTerminal || null,
      arrivalGate: firstSegment.arrivalGate || null,
      segments: segments.length > 0 ? segments : undefined,
    }
  } else if (data.flightDetails) {
    // Use existing flightDetails
    flightDetails = {
      airline: data.flightDetails.airline || null,
      flightNumber: data.flightDetails.flightNumber || null,
      departureAirportCode: data.flightDetails.departureAirportCode || null,
      arrivalAirportCode: data.flightDetails.arrivalAirportCode || null,
      departureDate: data.flightDetails.departureDate || null,
      departureTime: data.flightDetails.departureTime || null,
      departureTimezone: data.flightDetails.departureTimezone || null,
      departureTerminal: data.flightDetails.departureTerminal || null,
      departureGate: data.flightDetails.departureGate || null,
      arrivalDate: data.flightDetails.arrivalDate || null,
      arrivalTime: data.flightDetails.arrivalTime || null,
      arrivalTimezone: data.flightDetails.arrivalTimezone || null,
      arrivalTerminal: data.flightDetails.arrivalTerminal || null,
      arrivalGate: data.flightDetails.arrivalGate || null,
      segments: segments.length > 0 ? segments : undefined,
    }
  }

  // Generate proper flight name if empty or generic "Flight"
  const shouldGenerateName = !data.name || data.name === 'Flight' || data.name.trim() === ''
  const flightName = shouldGenerateName ? generateFlightName(data, flightDetails) : data.name

  return {
    itineraryDayId: data.itineraryDayId,
    componentType: 'flight',
    name: flightName,
    description: data.description,
    proposalStatus: data.proposalStatus,
    flightDetails,
    totalPriceCents: data.totalPriceCents,
    taxesAndFeesCents: data.taxesAndFeesCents,
    currency: data.currency,
    pricingType: data.pricingType as PricingType,
    confirmationNumber: data.confirmationNumber || undefined,
    commissionTotalCents: data.commissionTotalCents,
    commissionSplitPercentage: data.commissionSplitPercentage,
    commissionExpectedDate: data.commissionExpectedDate || undefined,
    // Booking details - send undefined if empty to avoid overwriting
    termsAndConditions: data.termsAndConditions || undefined,
    cancellationPolicy: data.cancellationPolicy || undefined,
    supplier: data.supplier || undefined,
  }
}

/**
 * Generate a flight name from segment data or flight details
 * Priority: segment data > flightDetails > fallback "Flight"
 */
function generateFlightName(
  data: FlightFormData,
  flightDetails?: CreateFlightActivityDto['flightDetails']
): string {
  const firstSegment = data.flightSegments[0]
  const parts: string[] = []

  // Try to get data from segment first, fallback to flightDetails
  const airline = firstSegment?.airline || flightDetails?.airline || ''
  const flightNumber = firstSegment?.flightNumber || flightDetails?.flightNumber || ''
  const departureAirport = firstSegment?.departureAirport || flightDetails?.departureAirportCode || ''
  const arrivalAirport = firstSegment?.arrivalAirport || flightDetails?.arrivalAirportCode || ''

  if (airline) {
    parts.push(airline)
  }
  if (flightNumber) {
    // Avoid duplicating airline code in flight number (e.g., "PD PD 547" → "PD 547")
    if (!flightNumber.startsWith(airline)) {
      parts.push(flightNumber)
    } else {
      // If flight number already contains airline, just use it
      parts.length = 0 // Clear previous airline
      parts.push(flightNumber)
    }
  }
  if (departureAirport && arrivalAirport) {
    parts.push(`${departureAirport} → ${arrivalAirport}`)
  }

  return parts.length > 0 ? parts.join(' ') : 'Flight'
}
