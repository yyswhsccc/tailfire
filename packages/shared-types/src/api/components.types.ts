/**
 * Components API Types
 *
 * Polymorphic component types using discriminated unions for type-safe component-specific data.
 * Shared between API (NestJS) and client (React/Next.js).
 */

import { ActivityType, ActivityProposalStatus, ActivityBookingStatus, PricingType, PortType, Coordinates, Photo, PricingBreakdownItem } from './activities.types'

// =============================================================================
// Imports from Zod Schemas (for local use)
// =============================================================================

import type { TransportationSubtype, TransportationDetailsDto } from '../schemas'

// Re-export types for external consumers
export type { TransportationSubtype, TransportationDetailsDto }

// Re-export schemas for validation use
export { transportationSubtypeSchema, transportationDetailsDtoSchema } from '../schemas'

// =============================================================================
// Shared Booking Types
// =============================================================================

/**
 * Cancellation schedule item for structured cancellation policies.
 * Used in activity_pricing.cancellation_schedule_json for all activity types.
 */
export type CancellationScheduleItem = {
  daysRange: string           // "89-75", "74-61", "60-31", "30-0"
  penaltyPercent: number      // 25, 50, 75, 100
  penaltyAmountCents?: number // Optional absolute amount
  effectiveDate?: string      // "2026-01-12" (computed from start date)
  description?: string        // "25% Per Guest"
}

// =============================================================================
// Component-Specific Detail Types
// =============================================================================

/**
 * Flight segment - individual leg of a multi-segment journey
 * Used for connecting flights (e.g., YYZ → ORD → LHR)
 */
export type FlightSegmentDto = {
  id?: string
  segmentOrder: number
  airline?: string | null
  flightNumber?: string | null
  // Departure details
  departureAirportCode?: string | null
  departureAirportName?: string | null // Full airport name (from API or persisted)
  departureAirportCity?: string | null // City/municipality
  departureAirportLat?: number | null // Latitude for future map features
  departureAirportLon?: number | null // Longitude for future map features
  departureDate?: string | null // ISO date
  departureTime?: string | null // HH:mm
  departureTimezone?: string | null
  departureTerminal?: string | null
  departureGate?: string | null
  // Arrival details
  arrivalAirportCode?: string | null
  arrivalAirportName?: string | null // Full airport name (from API or persisted)
  arrivalAirportCity?: string | null // City/municipality
  arrivalAirportLat?: number | null // Latitude for future map features
  arrivalAirportLon?: number | null // Longitude for future map features
  arrivalDate?: string | null // ISO date
  arrivalTime?: string | null // HH:mm
  arrivalTimezone?: string | null
  arrivalTerminal?: string | null
  arrivalGate?: string | null
  // Aircraft details (from Aerodatabox)
  aircraftModel?: string | null
  aircraftRegistration?: string | null
  aircraftModeS?: string | null
  aircraftImageUrl?: string | null
  aircraftImageAuthor?: string | null
}

/**
 * Flight-specific details
 * Supports both legacy single-segment (flightDetails fields) and multi-segment (segments array)
 * When reading: segments array is populated, legacy fields contain first segment for backwards compat
 * When writing: API accepts either format, prefers segments[] for multi-segment flights
 */
export type FlightDetailsDto = {
  // Legacy single-segment fields (backwards compatibility - populated from first segment)
  airline?: string | null
  flightNumber?: string | null
  departureAirportCode?: string | null
  departureDate?: string | null // ISO date
  departureTime?: string | null // HH:mm
  departureTimezone?: string | null
  departureTerminal?: string | null
  departureGate?: string | null
  arrivalAirportCode?: string | null
  arrivalDate?: string | null // ISO date
  arrivalTime?: string | null // HH:mm
  arrivalTimezone?: string | null
  arrivalTerminal?: string | null
  arrivalGate?: string | null

  // Multi-segment support (NEW)
  segments?: FlightSegmentDto[]
}

/**
 * Lodging-specific details
 */
export type LodgingDetailsDto = {
  propertyName?: string | null
  address?: string | null
  phone?: string | null
  website?: string | null
  checkInDate?: string | null // ISO date (required in DB)
  checkInTime?: string | null // HH:mm
  checkOutDate?: string | null // ISO date (required in DB)
  checkOutTime?: string | null // HH:mm
  timezone?: string | null // IANA timezone
  roomType?: string | null
  roomCount?: number | null
  amenities?: string[] | null
  specialRequests?: string | null
}

// TransportationSubtype and TransportationDetailsDto are now re-exported from ../schemas
// See the re-exports section at the top of this file

/**
 * Activity-specific details (to be implemented)
 */
export type ActivityDetailsDto = {
  activitySubtype?: string | null
  location?: string | null
  startDate?: string | null
  startTime?: string | null
  timezone?: string | null
  endTime?: string | null
  isOvernight?: boolean
}

/**
 * Cruise source type values
 */
export type CruiseSource = 'traveltek' | 'manual'

/**
 * Cabin category type values
 */
export type CabinCategory = 'suite' | 'balcony' | 'oceanview' | 'inside'

/**
 * Port call structure for cruise itinerary
 */
export type CruisePortCall = {
  day: number
  portName: string
  // portId can be a UUID string (from catalog) or integer (from FusionAPI)
  portId?: string | number | null
  arriveDate: string
  departDate: string
  arriveTime: string
  departTime: string
  tender?: boolean
  description?: string
  latitude?: string
  longitude?: string
  // isSeaDay flag from catalog itinerary
  isSeaDay?: boolean
}

/**
 * Custom Cruise-specific details
 * Traveltek-aligned field structure for manual entry and future API ingestion
 */
export type CustomCruiseDetailsDto = {
  // Traveltek Identity
  traveltekCruiseId?: string | null // codetocruiseid for API reference
  source?: CruiseSource | null // 'traveltek' | 'manual'

  // Cruise Line Information
  cruiseLineName?: string | null
  cruiseLineCode?: string | null
  cruiseLineId?: string | null // UUID FK to cruise_lines (null for custom entries)
  shipName?: string | null
  shipCode?: string | null
  shipClass?: string | null
  shipImageUrl?: string | null
  cruiseShipId?: string | null // UUID FK to cruise_ships (null for custom entries)

  // Voyage Details
  itineraryName?: string | null
  voyageCode?: string | null
  region?: string | null
  cruiseRegionId?: string | null // UUID FK to cruise_regions (null for custom entries)
  nights?: number | null
  seaDays?: number | null

  // Departure Details
  departurePort?: string | null
  departurePortId?: string | null // UUID FK to cruise_ports (null for custom ports)
  departureDate?: string | null // ISO date
  departureTime?: string | null // HH:mm
  departureTimezone?: string | null // IANA timezone

  // Arrival Details
  arrivalPort?: string | null
  arrivalPortId?: string | null // UUID FK to cruise_ports (null for custom ports)
  arrivalDate?: string | null // ISO date
  arrivalTime?: string | null // HH:mm
  arrivalTimezone?: string | null // IANA timezone

  // Cabin Details (Normalized)
  cabinCategory?: string | null
  cabinCode?: string | null
  cabinNumber?: string | null
  cabinDeck?: string | null
  cabinLocation?: string | null
  cabinImageUrl?: string | null
  cabinDescription?: string | null

  // Booking Information
  bookingNumber?: string | null
  fareCode?: string | null
  bookingDeadline?: string | null // ISO date

  // JSON Data (Traveltek structures) - Always returns [] or {} not null
  portCallsJson?: CruisePortCall[] // Array of port calls
  cabinPricingJson?: Record<string, unknown> // Traveltek cachedprices structure
  shipContentJson?: Record<string, unknown> // shipcontent for images, amenities

  // Import-specific data
  diningPreferences?: Record<string, unknown> | null
  selectedExtras?: Record<string, unknown>[] | null
  selectedPromotions?: Record<string, unknown> | null

  // Traveltek internal IDs for re-sync/refresh
  traveltekBookingId?: number | null
  traveltekPortfolioId?: number | null

  // Cruise-specific booking fields
  reservationNumber?: string | null
  stateroomCategoryCode?: string | null
  onboardCreditCents?: number | null
  onboardCreditCurrency?: string | null

  // Additional Details
  inclusions?: string[] // What's included - always returns [] not null
  specialRequests?: string | null
}

/**
 * Tour itinerary day structure (for JSON storage)
 */
export type TourItineraryDayDto = {
  dayNumber: number
  title?: string | null
  description?: string | null
  overnightCity?: string | null
}

/**
 * Tour hotel structure (for JSON storage)
 */
export type TourHotelDto = {
  dayNumber?: number | null
  hotelName: string
  city?: string | null
  description?: string | null
}

/**
 * Tour inclusion structure (for JSON storage)
 */
export type TourInclusionDto = {
  inclusionType: 'included' | 'excluded' | 'highlight'
  category?: string | null
  description: string
}

/**
 * Custom Tour-specific details
 * Tour catalog data for multi-day guided tours
 */
export type CustomTourDetailsDto = {
  // Catalog linkage
  tourId?: string | null // UUID FK to catalog.tours
  operatorCode?: string | null // e.g., 'globus', 'cosmos', 'monograms'
  provider?: string | null // External provider (default: 'globus')
  providerIdentifier?: string | null // Tour code (e.g., 'CQ')

  // Departure selection
  departureId?: string | null // UUID FK to catalog.tour_departures
  departureCode?: string | null
  departureStartDate?: string | null // ISO date (land_start_date)
  departureEndDate?: string | null // ISO date (land_end_date)
  currency?: string | null // Default: 'CAD'
  basePriceCents?: number | null

  // Snapshot/metadata (denormalized for display)
  tourName?: string | null
  days?: number | null
  nights?: number | null
  startCity?: string | null
  endCity?: string | null

  // JSON data for extended info
  itineraryJson?: TourItineraryDayDto[] // Day-by-day itinerary
  inclusionsJson?: TourInclusionDto[] // Included/excluded features
  hotelsJson?: TourHotelDto[] // Hotels used on tour
}

/**
 * Tour Day-specific details
 * Minimal structure for tour_day child activities (read-only by default)
 */
export type TourDayDetailsDto = {
  dayNumber?: number | null
  overnightCity?: string | null
  isLocked?: boolean | null // True = read-only (default), False = detached/customizable
}

/**
 * Port Info-specific details
 */
export type PortInfoDetailsDto = {
  portType?: PortType | null // departure, arrival, sea_day, port_call
  portName?: string | null
  portLocation?: string | null
  arrivalDate?: string | null
  arrivalTime?: string | null
  departureDate?: string | null
  departureTime?: string | null
  timezone?: string | null
  dockName?: string | null
  address?: string | null
  coordinates?: { lat: number; lng: number } | null
  phone?: string | null
  website?: string | null
  excursionNotes?: string | null
  tenderRequired?: boolean | null
  specialRequests?: string | null
}

/**
 * Option category enum values
 */
export type OptionCategory =
  | 'upgrade'
  | 'add_on'
  | 'tour'
  | 'excursion'
  | 'insurance'
  | 'meal_plan'
  | 'other'

/**
 * Options-specific details for upsell options (upgrades, tours, excursions, insurance, meal plans)
 */
export type OptionsDetailsDto = {
  // Option Classification
  optionCategory?: OptionCategory | null

  // Selection & Availability
  isSelected?: boolean | null
  availabilityStartDate?: string | null // ISO date
  availabilityEndDate?: string | null // ISO date
  bookingDeadline?: string | null // ISO date

  // Capacity
  minParticipants?: number | null
  maxParticipants?: number | null
  spotsAvailable?: number | null

  // Duration
  durationMinutes?: number | null
  meetingPoint?: string | null
  meetingTime?: string | null // HH:mm

  // Provider/Vendor information
  providerName?: string | null
  providerPhone?: string | null
  providerEmail?: string | null
  providerWebsite?: string | null

  // Details (arrays)
  inclusions?: string[] // Always returns [] not null
  exclusions?: string[] // Always returns [] not null
  requirements?: string[] // Always returns [] not null
  whatToBring?: string[] // Always returns [] not null

  // Display
  displayOrder?: number | null
  highlightText?: string | null
  instructionsText?: string | null
}

/**
 * Info-specific details (minimal - just uses base fields)
 */
export type InfoDetailsDto = Record<string, never> // Empty object

/**
 * Dining-specific details
 */
export type DiningDetailsDto = {
  restaurantName?: string | null
  cuisineType?: string | null
  mealType?: string | null // breakfast, lunch, dinner, brunch, etc.
  reservationDate?: string | null // ISO date
  reservationTime?: string | null // HH:mm
  timezone?: string | null // IANA timezone
  partySize?: number | null // 1-100
  address?: string | null
  phone?: string | null
  website?: string | null
  coordinates?: { lat: number; lng: number } | null
  priceRange?: string | null // e.g., "$", "$$", "$$$", "$$$$"
  dressCode?: string | null // e.g., "casual", "smart casual", "formal"
  dietaryRequirements?: string[] | null // e.g., ["vegetarian", "gluten-free"]
  specialRequests?: string | null
  menuUrl?: string | null
}

// =============================================================================
// Booking Details (shared across activities)
// =============================================================================

/**
 * Booking detail fields shared across all bookable activities.
 * Used for terms, policies, and supplier information.
 */
export type BookingDetailsDto = {
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
  supplier?: string | null
}

// =============================================================================
// Base Component Type
// =============================================================================

/**
 * Base component fields shared across all component types.
 * @deprecated Use `BaseActivityDto` instead. The "component" terminology is being
 * phased out in favor of "activity" for consistency across the codebase.
 */
export type BaseComponentDto = {
  id: string
  itineraryDayId: string | null // Nullable for floating packages
  parentActivityId: string | null // For cruise → port_info relationship
  name: string
  description: string | null
  sequenceOrder: number

  // Timing (kept in base for backwards compatibility)
  startDatetime: string | null
  endDatetime: string | null
  timezone: string | null

  // Location (kept in base for backwards compatibility)
  location: string | null
  address: string | null
  coordinates: Coordinates | null

  // Details
  notes: string | null
  confirmationNumber: string | null
  // #302 — optional external "Book this activity →" CTA URL surfaced in the client proposal preview.
  referralUrl: string | null
  proposalStatus: ActivityProposalStatus
  bookingStatus: ActivityBookingStatus

  // Pricing (kept in base for backwards compatibility)
  pricingType: PricingType | null
  currency: string
  totalPriceCents: number | null
  taxesAndFeesCents: number | null
  activityPricingId: string | null
  invoiceType: 'individual_item' | 'part_of_package' | null
  pricingBreakdownJson: PricingBreakdownItem[] | null

  // Commission (expected values, not actuals from commission_tracking)
  commissionTotalCents: number | null
  commissionSplitPercentage: string | null // Decimal as string
  commissionExpectedDate: string | null // ISO date

  // Booking details
  termsAndConditions: string | null
  cancellationPolicy: string | null
  supplier: string | null
  bookingReference: string | null // Links round-trip flights/activities

  // Universal booking fields
  netPriceCents: number | null
  nonRefundableDeposit: boolean | null
  cancellationScheduleJson: CancellationScheduleItem[] | null

  // Media
  photos: Photo[] | null

  // Audit fields
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Discriminated Union for Component Response
// =============================================================================

/**
 * Flight component with flight-specific details.
 * @deprecated Use `FlightActivityDto` instead.
 */
export type FlightComponentDto = BaseComponentDto & {
  componentType: 'flight'
  activityType: 'flight' // For backwards compatibility
  flightDetails?: FlightDetailsDto | null
}

/**
 * Lodging component with lodging-specific details.
 * @deprecated Use `LodgingActivityDto` instead.
 */
export type LodgingComponentDto = BaseComponentDto & {
  componentType: 'lodging'
  activityType: 'lodging'
  lodgingDetails?: LodgingDetailsDto | null
}

/**
 * Transportation component with transportation-specific details.
 * @deprecated Use `TransportationActivityDto` instead.
 */
export type TransportationComponentDto = BaseComponentDto & {
  componentType: 'transportation'
  activityType: 'transportation'
  transportationDetails?: TransportationDetailsDto | null
}

/**
 * Activity component with activity-specific details.
 * @deprecated The "component" terminology is being phased out.
 */
export type ActivityComponentDto = BaseComponentDto & {
  componentType: 'activity'
  activityType: 'activity'
  activityDetails?: ActivityDetailsDto | null
}

/**
 * Custom Cruise component with cruise-specific details.
 * @deprecated Use `CustomCruiseActivityDto` instead.
 */
export type CustomCruiseComponentDto = BaseComponentDto & {
  componentType: 'custom_cruise'
  activityType: 'custom_cruise'
  customCruiseDetails?: CustomCruiseDetailsDto | null
}

/**
 * Port Info component with port-specific details.
 * @deprecated Use `PortInfoActivityDto` instead.
 */
export type PortInfoComponentDto = BaseComponentDto & {
  componentType: 'port_info'
  activityType: 'port_info'
  portInfoDetails?: PortInfoDetailsDto | null
}

/**
 * Options component with options-specific details.
 * @deprecated Use `OptionsActivityDto` instead.
 */
export type OptionsComponentDto = BaseComponentDto & {
  componentType: 'options'
  activityType: 'options'
  optionsDetails?: OptionsDetailsDto | null
}

/**
 * Info component (minimal structure).
 * @deprecated Use `InfoActivityDto` instead.
 */
export type InfoComponentDto = BaseComponentDto & {
  componentType: 'info'
  activityType: 'info'
  infoDetails?: InfoDetailsDto | null
}

/**
 * Dining component with dining-specific details.
 * @deprecated Use `DiningActivityDto` instead.
 */
export type DiningComponentDto = BaseComponentDto & {
  componentType: 'dining'
  activityType: 'dining'
  diningDetails?: DiningDetailsDto | null
}

/**
 * Custom Tour component with tour-specific details.
 * @deprecated Use `CustomTourActivityDto` instead.
 */
export type CustomTourComponentDto = BaseComponentDto & {
  componentType: 'custom_tour'
  activityType: 'custom_tour'
  customTourDetails?: CustomTourDetailsDto | null
}

/**
 * Tour Day component with tour day-specific details.
 * Child activity of custom_tour, representing a single day of the tour.
 * @deprecated Use `TourDayActivityDto` instead.
 */
export type TourDayComponentDto = BaseComponentDto & {
  componentType: 'tour_day'
  activityType: 'tour_day'
  tourDayDetails?: TourDayDetailsDto | null
}

/**
 * Discriminated union of all component types.
 * @deprecated Use `ActivityDto` instead.
 */
export type ComponentDto =
  | FlightComponentDto
  | LodgingComponentDto
  | TransportationComponentDto
  | ActivityComponentDto
  | CustomCruiseComponentDto
  | PortInfoComponentDto
  | OptionsComponentDto
  | InfoComponentDto
  | DiningComponentDto
  | CustomTourComponentDto
  | TourDayComponentDto

// =============================================================================
// Create Component DTOs
// =============================================================================

/**
 * Base create component fields.
 * @deprecated Use `BaseCreateActivityDto` instead.
 */
export type BaseCreateComponentDto = {
  itineraryDayId?: string | null // Optional/nullable for floating packages
  parentActivityId?: string | null // For cruise → port_info relationship
  componentType: ActivityType
  name: string
  description?: string | null
  sequenceOrder?: number

  // Timing
  startDatetime?: string | null
  endDatetime?: string | null
  timezone?: string | null

  // Location
  location?: string | null
  address?: string | null
  coordinates?: Coordinates | null

  // Details
  notes?: string | null
  confirmationNumber?: string | null
  // #302 — optional external "Book this activity →" CTA URL surfaced in the client proposal preview.
  referralUrl?: string | null
  proposalStatus?: ActivityProposalStatus
  bookingStatus?: ActivityBookingStatus

  // Pricing
  pricingType?: PricingType | null
  currency?: string
  totalPriceCents?: number | null
  taxesAndFeesCents?: number | null
  invoiceType?: 'individual_item' | 'part_of_package' | null
  pricingBreakdownJson?: PricingBreakdownItem[] | null

  // Commission
  commissionTotalCents?: number | null
  commissionSplitPercentage?: number | null
  commissionExpectedDate?: string | null // ISO date

  // Booking details
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
  supplier?: string | null
  bookingReference?: string | null // Links round-trip flights/activities

  // Universal booking fields
  netPriceCents?: number | null
  nonRefundableDeposit?: boolean | null
  cancellationScheduleJson?: CancellationScheduleItem[] | null

  // Media
  photos?: Photo[] | null
}

/**
 * Create Flight Component.
 * @deprecated Use `CreateFlightActivityDto` instead.
 */
export type CreateFlightComponentDto = BaseCreateComponentDto & {
  componentType: 'flight'
  flightDetails?: FlightDetailsDto
}

/**
 * Create Lodging Component.
 * @deprecated Use `CreateLodgingActivityDto` instead.
 */
export type CreateLodgingComponentDto = BaseCreateComponentDto & {
  componentType: 'lodging'
  lodgingDetails?: LodgingDetailsDto
}

/**
 * Create Transportation Component.
 * @deprecated Use `CreateTransportationActivityDto` instead.
 */
export type CreateTransportationComponentDto = BaseCreateComponentDto & {
  componentType: 'transportation'
  transportationDetails?: TransportationDetailsDto
}

/**
 * Create Activity Component.
 * @deprecated The "component" terminology is being phased out.
 */
export type CreateActivityComponentDto = BaseCreateComponentDto & {
  componentType: 'activity'
  activityDetails?: ActivityDetailsDto
}

/**
 * Create Custom Cruise Component.
 * @deprecated Use `CreateCustomCruiseActivityDto` instead.
 */
export type CreateCustomCruiseComponentDto = BaseCreateComponentDto & {
  componentType: 'custom_cruise'
  customCruiseDetails?: CustomCruiseDetailsDto
}

/**
 * Create Port Info Component.
 * @deprecated Use `CreatePortInfoActivityDto` instead.
 */
export type CreatePortInfoComponentDto = BaseCreateComponentDto & {
  componentType: 'port_info'
  portInfoDetails?: PortInfoDetailsDto
}

/**
 * Create Options Component.
 * @deprecated Use `CreateOptionsActivityDto` instead.
 */
export type CreateOptionsComponentDto = BaseCreateComponentDto & {
  componentType: 'options'
  optionsDetails?: OptionsDetailsDto
}

/**
 * Create Info Component.
 * @deprecated Use `CreateInfoActivityDto` instead.
 */
export type CreateInfoComponentDto = BaseCreateComponentDto & {
  componentType: 'info'
  infoDetails?: InfoDetailsDto
}

/**
 * Create Dining Component.
 * @deprecated Use `CreateDiningActivityDto` instead.
 */
export type CreateDiningComponentDto = BaseCreateComponentDto & {
  componentType: 'dining'
  diningDetails?: DiningDetailsDto
}

/**
 * Create Custom Tour Component.
 * @deprecated Use `CreateCustomTourActivityDto` instead.
 */
export type CreateCustomTourComponentDto = BaseCreateComponentDto & {
  componentType: 'custom_tour'
  customTourDetails?: CustomTourDetailsDto
}

/**
 * Create Tour Day Component.
 * @deprecated Use `CreateTourDayActivityDto` instead.
 */
export type CreateTourDayComponentDto = BaseCreateComponentDto & {
  componentType: 'tour_day'
  tourDayDetails?: TourDayDetailsDto
}

/**
 * Discriminated union for create component requests.
 * @deprecated Use the Activity-specific create DTOs instead.
 */
export type CreateComponentDto =
  | CreateFlightComponentDto
  | CreateLodgingComponentDto
  | CreateTransportationComponentDto
  | CreateActivityComponentDto
  | CreateCustomCruiseComponentDto
  | CreatePortInfoComponentDto
  | CreateOptionsComponentDto
  | CreateInfoComponentDto
  | CreateDiningComponentDto
  | CreateCustomTourComponentDto
  | CreateTourDayComponentDto

// =============================================================================
// Update Component DTOs
// =============================================================================

/**
 * Base update component fields (all optional).
 * @deprecated Use `BaseUpdateActivityDto` instead.
 */
export type BaseUpdateComponentDto = {
  name?: string
  description?: string | null
  sequenceOrder?: number

  // Timing
  startDatetime?: string | null
  endDatetime?: string | null
  timezone?: string | null

  // Location
  location?: string | null
  address?: string | null
  coordinates?: Coordinates | null

  // Details
  notes?: string | null
  confirmationNumber?: string | null
  // #302 — optional external "Book this activity →" CTA URL surfaced in the client proposal preview.
  referralUrl?: string | null
  proposalStatus?: ActivityProposalStatus
  bookingStatus?: ActivityBookingStatus

  // Pricing
  pricingType?: PricingType | null
  currency?: string
  totalPriceCents?: number | null
  taxesAndFeesCents?: number | null
  invoiceType?: 'individual_item' | 'part_of_package' | null
  pricingBreakdownJson?: PricingBreakdownItem[] | null

  // Commission
  commissionTotalCents?: number | null
  commissionSplitPercentage?: number | null
  commissionExpectedDate?: string | null // ISO date

  // Booking details
  termsAndConditions?: string | null
  cancellationPolicy?: string | null
  supplier?: string | null
  bookingReference?: string | null // Links round-trip flights/activities

  // Universal booking fields
  netPriceCents?: number | null
  nonRefundableDeposit?: boolean | null
  cancellationScheduleJson?: CancellationScheduleItem[] | null

  // Media
  photos?: Photo[] | null
}

/**
 * Update Flight Component.
 * @deprecated Use `UpdateFlightActivityDto` instead.
 */
export type UpdateFlightComponentDto = BaseUpdateComponentDto & {
  flightDetails?: FlightDetailsDto
}

/**
 * Update Lodging Component.
 * @deprecated Use `UpdateLodgingActivityDto` instead.
 */
export type UpdateLodgingComponentDto = BaseUpdateComponentDto & {
  lodgingDetails?: LodgingDetailsDto
}

/**
 * Update Transportation Component.
 * @deprecated Use `UpdateTransportationActivityDto` instead.
 */
export type UpdateTransportationComponentDto = BaseUpdateComponentDto & {
  transportationDetails?: TransportationDetailsDto
}

/**
 * Update Dining Component.
 * @deprecated Use `UpdateDiningActivityDto` instead.
 */
export type UpdateDiningComponentDto = BaseUpdateComponentDto & {
  diningDetails?: DiningDetailsDto
}

/**
 * Update Port Info Component.
 * @deprecated Use `UpdatePortInfoActivityDto` instead.
 */
export type UpdatePortInfoComponentDto = BaseUpdateComponentDto & {
  portInfoDetails?: PortInfoDetailsDto
}

/**
 * Update Options Component.
 * @deprecated Use `UpdateOptionsActivityDto` instead.
 */
export type UpdateOptionsComponentDto = BaseUpdateComponentDto & {
  optionsDetails?: OptionsDetailsDto
}

/**
 * Update Custom Cruise Component.
 * @deprecated Use `UpdateCustomCruiseActivityDto` instead.
 */
export type UpdateCustomCruiseComponentDto = BaseUpdateComponentDto & {
  customCruiseDetails?: CustomCruiseDetailsDto
}

/**
 * Update Activity Component.
 * @deprecated The "component" terminology is being phased out.
 */
export type UpdateActivityComponentDto = BaseUpdateComponentDto & {
  activityDetails?: ActivityDetailsDto
}

/**
 * Update Info Component.
 * @deprecated Use `UpdateInfoActivityDto` instead.
 */
export type UpdateInfoComponentDto = BaseUpdateComponentDto & {
  infoDetails?: InfoDetailsDto
}

/**
 * Update Custom Tour Component.
 * @deprecated Use `UpdateCustomTourActivityDto` instead.
 */
export type UpdateCustomTourComponentDto = BaseUpdateComponentDto & {
  customTourDetails?: CustomTourDetailsDto
}

/**
 * Update Tour Day Component.
 * @deprecated Use `UpdateTourDayActivityDto` instead.
 */
export type UpdateTourDayComponentDto = BaseUpdateComponentDto & {
  tourDayDetails?: TourDayDetailsDto
}

/**
 * Generic update component DTO (can update any type).
 * @deprecated Use the Activity-specific update DTOs instead.
 */
export type UpdateComponentDto = BaseUpdateComponentDto & {
  flightDetails?: FlightDetailsDto
  lodgingDetails?: LodgingDetailsDto
  transportationDetails?: TransportationDetailsDto
  activityDetails?: ActivityDetailsDto
  customCruiseDetails?: CustomCruiseDetailsDto
  portInfoDetails?: PortInfoDetailsDto
  optionsDetails?: OptionsDetailsDto
  infoDetails?: InfoDetailsDto
  diningDetails?: DiningDetailsDto
  customTourDetails?: CustomTourDetailsDto
  tourDayDetails?: TourDayDetailsDto
}

// =============================================================================
// Activity Terminology Types (CANONICAL - use these in new code)
// =============================================================================
// The "activity" terminology is preferred over "component" for public APIs.
// Component* types are deprecated and retained only for backward compatibility.

/**
 * Base Activity DTO - canonical type for activity responses.
 * Prefer this over BaseComponentDto in new code.
 */
export type BaseActivityDto = BaseComponentDto

/**
 * Base create activity fields - canonical type for create requests.
 * Prefer this over BaseCreateComponentDto in new code.
 */
export type BaseCreateActivityDto = BaseCreateComponentDto

/**
 * Base update activity fields - canonical type for update requests.
 * Prefer this over BaseUpdateComponentDto in new code.
 */
export type BaseUpdateActivityDto = BaseUpdateComponentDto

/**
 * Activity response DTO - discriminated union of all activity types.
 * Prefer this over ComponentDto in new code.
 */
export type ActivityDto = ComponentDto

// Activity-specific create DTOs (preferred over Component variants)
/** Create flight activity request. Prefer over CreateFlightComponentDto. */
export type CreateFlightActivityDto = CreateFlightComponentDto
/** Create lodging activity request. Prefer over CreateLodgingComponentDto. */
export type CreateLodgingActivityDto = CreateLodgingComponentDto
/** Create transportation activity request. Prefer over CreateTransportationComponentDto. */
export type CreateTransportationActivityDto = CreateTransportationComponentDto
/** Create dining activity request. Prefer over CreateDiningComponentDto. */
export type CreateDiningActivityDto = CreateDiningComponentDto
/** Create options activity request. Prefer over CreateOptionsComponentDto. */
export type CreateOptionsActivityDto = CreateOptionsComponentDto
/** Create custom cruise activity request. Prefer over CreateCustomCruiseComponentDto. */
export type CreateCustomCruiseActivityDto = CreateCustomCruiseComponentDto
/** Create port info activity request. Prefer over CreatePortInfoComponentDto. */
export type CreatePortInfoActivityDto = CreatePortInfoComponentDto
/** Create info activity request. Prefer over CreateInfoComponentDto. */
export type CreateInfoActivityDto = CreateInfoComponentDto
/** Create custom tour activity request. Prefer over CreateCustomTourComponentDto. */
export type CreateCustomTourActivityDto = CreateCustomTourComponentDto
/** Create tour day activity request. Prefer over CreateTourDayComponentDto. */
export type CreateTourDayActivityDto = CreateTourDayComponentDto

// Activity-specific update DTOs (preferred over Component variants)
/** Update flight activity request. Prefer over UpdateFlightComponentDto. */
export type UpdateFlightActivityDto = UpdateFlightComponentDto
/** Update lodging activity request. Prefer over UpdateLodgingComponentDto. */
export type UpdateLodgingActivityDto = UpdateLodgingComponentDto
/** Update transportation activity request. Prefer over UpdateTransportationComponentDto. */
export type UpdateTransportationActivityDto = UpdateTransportationComponentDto
/** Update dining activity request. Prefer over UpdateDiningComponentDto. */
export type UpdateDiningActivityDto = UpdateDiningComponentDto
/** Update options activity request. Prefer over UpdateOptionsComponentDto. */
export type UpdateOptionsActivityDto = UpdateOptionsComponentDto
/** Update custom cruise activity request. Prefer over UpdateCustomCruiseComponentDto. */
export type UpdateCustomCruiseActivityDto = UpdateCustomCruiseComponentDto
/** Update port info activity request. Prefer over UpdatePortInfoComponentDto. */
export type UpdatePortInfoActivityDto = UpdatePortInfoComponentDto
/** Update info activity request. Prefer over UpdateInfoComponentDto. */
export type UpdateInfoActivityDto = UpdateInfoComponentDto
/** Update custom tour activity request. Prefer over UpdateCustomTourComponentDto. */
export type UpdateCustomTourActivityDto = UpdateCustomTourComponentDto
/** Update tour day activity request. Prefer over UpdateTourDayComponentDto. */
export type UpdateTourDayActivityDto = UpdateTourDayComponentDto
// Note: UpdateActivityDto is defined in activities.types.ts for the "activity" component type

// Activity-specific response DTOs (preferred over Component variants)
/** Flight activity with flight-specific details. Prefer over FlightComponentDto. */
export type FlightActivityDto = FlightComponentDto
/** Lodging activity with lodging-specific details. Prefer over LodgingComponentDto. */
export type LodgingActivityDto = LodgingComponentDto
/** Transportation activity with transportation-specific details. Prefer over TransportationComponentDto. */
export type TransportationActivityDto = TransportationComponentDto
/** Dining activity with dining-specific details. Prefer over DiningComponentDto. */
export type DiningActivityDto = DiningComponentDto
/** Options activity with options-specific details. Prefer over OptionsComponentDto. */
export type OptionsActivityDto = OptionsComponentDto
/** Custom cruise activity with cruise-specific details. Prefer over CustomCruiseComponentDto. */
export type CustomCruiseActivityDto = CustomCruiseComponentDto
/** Port info activity with port-specific details. Prefer over PortInfoComponentDto. */
export type PortInfoActivityDto = PortInfoComponentDto
/** Info activity with minimal structure. Prefer over InfoComponentDto. */
export type InfoActivityDto = InfoComponentDto
/** Custom tour activity with tour-specific details. Prefer over CustomTourComponentDto. */
export type CustomTourActivityDto = CustomTourComponentDto
/** Tour day activity with tour day-specific details. Prefer over TourDayComponentDto. */
export type TourDayActivityDto = TourDayComponentDto
