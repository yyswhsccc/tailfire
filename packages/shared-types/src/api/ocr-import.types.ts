/**
 * OCR Import Types
 *
 * Shared types for the OCR document import system.
 * Used by both API (NestJS) and Admin (Next.js) apps.
 */

// ============================================================================
// Document Types
// ============================================================================

export const OCR_DOCUMENT_TYPES = [
  'flight_confirmation',
  'hotel_confirmation',
  'cruise_confirmation',
  'passport',
  'transportation_confirmation',
  'dining_confirmation',
  'package_confirmation',
  'general_travel_document',
] as const

export type OcrDocumentType = (typeof OCR_DOCUMENT_TYPES)[number]

// ============================================================================
// Job Status
// ============================================================================

export const OCR_JOB_STATUSES = [
  'pending',
  'processing',
  'preview_ready',
  'confirmed',
  'failed',
] as const

export type OcrJobStatus = (typeof OCR_JOB_STATUSES)[number]

// ============================================================================
// Preview Request/Response
// ============================================================================

export interface OcrPreviewRequest {
  /** Optional pre-specified document type (auto-detect if omitted) */
  documentType?: OcrDocumentType
  /** Existing trip to add activity to */
  tripId?: string
  /** Existing contact for passport import */
  contactId?: string
}

export interface OcrPreviewResponse {
  status: OcrJobStatus
  jobId: string
  documentType: OcrDocumentType
  confidence: number
  extraction: OcrExtractionData
  contactMatches: OcrContactMatch[]
  tokensUsed: number
}

export interface OcrExtractionData {
  flight?: OcrFlightData | null
  lodging?: OcrLodgingData | null
  cruise?: OcrCruiseData | null
  passport?: OcrPassportData | null
  transportation?: OcrTransportationData | null
  dining?: OcrDiningData | null
  package?: OcrPackageData | null
  travelers: OcrTravelerData[]
  booking?: {
    confirmationNumber?: string | null
    totalPriceCents?: number | null
    currency?: string | null
    bookingDate?: string | null
  } | null
}

// ============================================================================
// Per-Type Data (frontend display)
// ============================================================================

export interface OcrFlightData {
  confirmationNumber?: string | null
  airline?: string | null
  segments: {
    segmentOrder: number
    airline?: string | null
    flightNumber?: string | null
    departureAirportCode?: string | null
    departureAirportName?: string | null
    departureDate?: string | null
    departureTime?: string | null
    departureTerminal?: string | null
    arrivalAirportCode?: string | null
    arrivalAirportName?: string | null
    arrivalDate?: string | null
    arrivalTime?: string | null
    arrivalTerminal?: string | null
    cabinClass?: string | null
    seatAssignment?: string | null
  }[]
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrLodgingData {
  confirmationNumber?: string | null
  propertyName?: string | null
  address?: string | null
  phone?: string | null
  website?: string | null
  checkInDate?: string | null
  checkInTime?: string | null
  checkOutDate?: string | null
  checkOutTime?: string | null
  roomType?: string | null
  roomCount?: number | null
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrCruiseData {
  confirmationNumber?: string | null
  cruiseLineName?: string | null
  shipName?: string | null
  voyageCode?: string | null
  departurePort?: string | null
  departureDate?: string | null
  arrivalPort?: string | null
  arrivalDate?: string | null
  cabinCategory?: string | null
  cabinNumber?: string | null
  nights?: number | null
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrPassportData {
  mrzLine1?: string | null
  mrzLine2?: string | null
  firstName?: string | null
  lastName?: string | null
  middleName?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  nationality?: string | null
  passportNumber?: string | null
  issuingCountry?: string | null
  expiryDate?: string | null
  placeOfBirth?: string | null
  mrzValid?: boolean
}

export interface OcrTransportationData {
  confirmationNumber?: string | null
  transportationType?: string | null
  companyName?: string | null
  pickupLocation?: string | null
  pickupDate?: string | null
  pickupTime?: string | null
  dropoffLocation?: string | null
  dropoffDate?: string | null
  dropoffTime?: string | null
  vehicleType?: string | null
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrDiningData {
  confirmationNumber?: string | null
  restaurantName?: string | null
  address?: string | null
  phone?: string | null
  reservationDate?: string | null
  reservationTime?: string | null
  partySize?: number | null
  totalPriceCents?: number | null
  currency?: string | null
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrPackageData {
  supplierName?: string | null
  bookingReference?: string | null
  bookingDate?: string | null
  currency?: string | null
  totalPriceCents?: number | null
  commissionRate?: number | null
  commissionAmountCents?: number | null
  taxesAndFeesCents?: number | null
  addOnsCents?: number | null
  remarks?: string | null
  components: OcrPackageComponent[]
  perPersonPricing: OcrPerPersonPrice[]
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
}

export interface OcrPackageComponent {
  componentType: 'flight' | 'lodging' | 'transportation' | 'dining' | 'other'
  name?: string | null
  description?: string | null
  flight?: {
    flightNumber?: string | null
    departureAirportCode?: string | null
    arrivalAirportCode?: string | null
    departureDate?: string | null
    departureTime?: string | null
    arrivalDate?: string | null
    arrivalTime?: string | null
    cabinClass?: string | null
    confirmationNumber?: string | null
  } | null
  lodging?: {
    propertyName?: string | null
    roomType?: string | null
    checkInDate?: string | null
    checkOutDate?: string | null
    address?: string | null
  } | null
  transportation?: {
    transportationType?: string | null
    pickupLocation?: string | null
    dropoffLocation?: string | null
    pickupDate?: string | null
    dropoffDate?: string | null
  } | null
}

export interface OcrPerPersonPrice {
  travelerIndex: number
  label: string
  basePriceCents: number
  taxesCents: number
  totalPriceCents: number
}

export interface OcrTravelerData {
  firstName: string
  lastName: string
  middleName?: string | null
  prefix?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  nationality?: string | null
  email?: string | null
  phone?: string | null
}

// ============================================================================
// Contact Matching
// ============================================================================

export interface OcrContactMatch {
  travelerIndex: number
  firstName: string
  lastName: string
  matchedContactId?: string | null
  matchedContactName?: string | null
  isNewContact: boolean
  confidence: number
}

// ============================================================================
// Policy Diff (supplier default vs extracted)
// ============================================================================

export interface PolicyFieldDiff {
  supplierDefault: string
  extracted: string
}

export interface PolicyDiff {
  supplierId: string
  supplierName: string
  termsAndConditions: PolicyFieldDiff | null
  cancellationPolicy: PolicyFieldDiff | null
}

// ============================================================================
// Confirm Request/Response
// ============================================================================

export interface OcrConfirmRequest {
  jobId: string
  /** Override or confirm detected document type */
  documentType: OcrDocumentType
  /** Existing trip to add to (or null to create new) */
  tripId?: string | null
  /** Existing contact for passport (or null to create new) */
  contactId?: string | null
  /** Name for new trip (if tripId not provided) */
  tripName?: string | null
  /** User overrides to extraction data (partial merge) */
  overrides?: Partial<OcrExtractionData> | null
  /** Contact match overrides — map traveler index to contactId */
  contactOverrides?: Record<number, string | null> | null
}

export interface OcrConfirmResponse {
  tripId?: string | null
  activityId?: string | null
  contactId?: string | null
  documentType: OcrDocumentType
  travelersCreated: number
  travelersMatched: number
  supplierId?: string | null
  policyDiff?: PolicyDiff | null
}

// ============================================================================
// Job Status (for polling)
// ============================================================================

export interface OcrJobStatusResponse {
  jobId: string
  status: OcrJobStatus
  documentType?: OcrDocumentType | null
  errorMessage?: string | null
  /** Present when status is 'preview_ready' */
  preview?: OcrPreviewResponse | null
}
