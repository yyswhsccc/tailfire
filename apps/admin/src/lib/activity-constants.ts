import {
  Hotel,
  Plane,
  Compass,
  Car,
  Ship,
  UtensilsCrossed,
  Settings,
  Anchor,
  Package,
  MapPin,
  CalendarDays,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import type { ActivityType as DatabaseActivityType } from '@tailfire/shared-types/api'

/**
 * UI activity type - includes 'package' for routing, but package is NOT a database activity type.
 * Package is a separate entity (packages table) - activities link to packages via packageId column.
 */
export type UIActivityType = DatabaseActivityType | 'package'

// Re-export the database type for API consumers
export type { DatabaseActivityType as ActivityType }

/**
 * Centralized metadata for activity types
 * Single source of truth for icons, colors, labels, and drag/drop metadata
 */

export interface ActivityTypeMetadata {
  type: UIActivityType
  label: string
  icon: LucideIcon
  colorClass: string
  defaultName: string

  // Component capabilities (polymorphic pattern)
  hasSupplier: boolean      // Does this component support supplier associations?
  hasPricing: boolean        // Does this component support pricing/booking?
  hasMedia: boolean          // Does this component support media uploads?
  hasDocs: boolean           // Does this component support document uploads?
  allowedFields: string[]    // Type-specific fields that are allowed for this component

  // UI visibility
  hidden?: boolean           // If true, hide from activity type selectors (for legacy types)
}

export const ACTIVITY_TYPE_METADATA: Record<UIActivityType, ActivityTypeMetadata> = {
  flight: {
    type: 'flight',
    label: 'Flight',
    icon: Plane,
    colorClass: 'text-blue-600 bg-blue-50',
    defaultName: 'Flight',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: ['airline', 'flightNumber', 'departureAirportCode', 'arrivalAirportCode', 'departureDate', 'departureTime', 'arrivalDate', 'arrivalTime', 'departureTimezone', 'arrivalTimezone', 'departureTerminal', 'departureGate', 'arrivalTerminal', 'arrivalGate'],
  },
  lodging: {
    type: 'lodging',
    label: 'Lodging',
    icon: Hotel,
    colorClass: 'text-pink-600 bg-pink-50',
    defaultName: 'Hotel Stay',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: ['propertyName', 'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'checkInTimezone', 'checkOutTimezone'],
  },
  transportation: {
    type: 'transportation',
    label: 'Transportation',
    icon: Car,
    colorClass: 'text-green-600 bg-green-50',
    defaultName: 'Transportation',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: ['transportationSubtype', 'departureLocation', 'arrivalLocation', 'departureDate', 'departureTime', 'arrivalDate', 'arrivalTime', 'departureTimezone', 'arrivalTimezone'],
  },
  tour: {
    type: 'tour',
    label: 'Tour',
    icon: Compass,
    colorClass: 'text-orange-700 bg-orange-100',
    defaultName: 'Tour',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: ['activitySubtype', 'location', 'startDate', 'startTime', 'endTime', 'timezone', 'isOvernight'],
  },
  options: {
    type: 'options',
    label: 'Options',
    icon: Settings,
    colorClass: 'text-purple-600 bg-purple-50',
    defaultName: 'Options',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: ['optionCategory', 'isSelected', 'availabilityStartDate', 'availabilityEndDate', 'bookingDeadline', 'minParticipants', 'maxParticipants', 'spotsAvailable', 'durationMinutes', 'meetingPoint', 'meetingTime', 'providerName', 'providerPhone', 'providerEmail', 'providerWebsite', 'inclusions', 'exclusions', 'requirements', 'whatToBring', 'displayOrder', 'highlightText', 'instructionsText'],
  },
  custom_cruise: {
    type: 'custom_cruise',
    label: 'Custom Cruise',
    icon: Ship,
    colorClass: 'text-cyan-600 bg-cyan-50',
    defaultName: 'Custom Cruise',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: [
      // Traveltek Identity
      'traveltekCruiseId', 'source',
      // Cruise Line Information
      'cruiseLineName', 'cruiseLineCode', 'shipName', 'shipCode', 'shipClass', 'shipImageUrl',
      // Voyage Details
      'itineraryName', 'voyageCode', 'region', 'nights', 'seaDays',
      // Departure Details
      'departurePort', 'departureDate', 'departureTime', 'departureTimezone',
      // Arrival Details
      'arrivalPort', 'arrivalDate', 'arrivalTime', 'arrivalTimezone',
      // Cabin Details
      'cabinCategory', 'cabinCode', 'cabinNumber', 'cabinDeck',
      // Booking Information
      'bookingNumber', 'fareCode', 'bookingDeadline',
      // JSON Data
      'portCallsJson', 'cabinPricingJson', 'shipContentJson',
      // Additional Details
      'inclusions', 'specialRequests',
    ],
  },
  port_info: {
    type: 'port_info',
    label: 'Port Info',
    icon: Anchor,
    colorClass: 'text-blue-600 bg-blue-50',
    defaultName: 'Port Information',
    hasSupplier: false,
    hasPricing: false,
    hasMedia: true,
    hasDocs: true,
    allowedFields: ['portName', 'portLocation', 'arrivalDate', 'arrivalTime', 'departureDate', 'departureTime', 'timezone', 'dockName', 'address', 'coordinates', 'phone', 'website', 'excursionNotes', 'tenderRequired', 'specialRequests'],
  },
  dining: {
    type: 'dining',
    label: 'Dining',
    icon: UtensilsCrossed,
    colorClass: 'text-orange-600 bg-orange-50',
    defaultName: 'Restaurant',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: ['restaurantName', 'cuisineType', 'mealType', 'reservationDate', 'reservationTime', 'timezone', 'partySize', 'address', 'phone', 'website', 'coordinates', 'priceRange', 'dressCode', 'dietaryRequirements', 'specialRequests', 'menuUrl'],
  },
  cruise: {
    type: 'cruise',
    label: 'Cruise (Legacy)',
    icon: Ship,
    colorClass: 'text-cyan-500 bg-cyan-50',
    defaultName: 'Cruise',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: [], // Legacy type - use custom_cruise for new cruises
    hidden: true, // Hide from activity type selectors (existing records still render)
  },
  package: {
    type: 'package',
    label: 'Package',
    icon: Package,
    colorClass: 'text-amber-600 bg-amber-50',
    defaultName: 'Package',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: [], // Packages use their own form with different fields
  },
  custom_tour: {
    type: 'custom_tour',
    label: 'Custom Tour',
    icon: MapPin,
    colorClass: 'text-emerald-600 bg-emerald-50',
    defaultName: 'Custom Tour',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: true,
    hasDocs: true,
    allowedFields: [
      'tourId', 'operatorCode', 'provider', 'providerIdentifier',
      'departureId', 'departureCode', 'departureStartDate', 'departureEndDate',
      'currency', 'basePriceCents', 'tourName', 'days', 'nights',
      'startCity', 'endCity', 'itineraryJson', 'inclusionsJson', 'hotelsJson',
    ],
  },
  tour_day: {
    type: 'tour_day',
    label: 'Tour Day',
    icon: CalendarDays,
    colorClass: 'text-emerald-500 bg-emerald-50',
    defaultName: 'Tour Day',
    hasSupplier: false,
    hasPricing: false,
    hasMedia: false,
    hasDocs: false,
    allowedFields: ['dayNumber', 'overnightCity', 'isLocked'],
  },
  insurance: {
    type: 'insurance',
    label: 'Insurance',
    icon: Shield,
    colorClass: 'text-emerald-600 bg-emerald-50',
    defaultName: 'Insurance',
    hasSupplier: true,
    hasPricing: true,
    hasMedia: false,
    hasDocs: true,
    allowedFields: ['name', 'description', 'status', 'startDate', 'endDate'],
  },
} as const

/**
 * Valid activity types that can be dragged from the component library
 */
export const VALID_ACTIVITY_TYPES: UIActivityType[] = Object.keys(
  ACTIVITY_TYPE_METADATA
) as UIActivityType[]

/**
 * Check if a string is a valid UI activity type
 */
export function isValidActivityType(type: unknown): type is UIActivityType {
  return typeof type === 'string' && VALID_ACTIVITY_TYPES.includes(type as UIActivityType)
}

/**
 * Default/fallback metadata for unknown activity types
 */
const DEFAULT_METADATA: ActivityTypeMetadata = {
  type: 'tour' as UIActivityType,
  label: 'Activity',
  icon: Compass,
  colorClass: 'text-gray-600 bg-gray-100',
  defaultName: 'Activity',
  hasSupplier: false,
  hasPricing: false,
  hasMedia: false,
  hasDocs: false,
  allowedFields: [],
}

/**
 * Get metadata for an activity type (with fallback for unknown types)
 */
export function getActivityTypeMetadata(type: string | null | undefined): ActivityTypeMetadata {
  if (!type || !(type in ACTIVITY_TYPE_METADATA)) {
    return DEFAULT_METADATA
  }
  return ACTIVITY_TYPE_METADATA[type as UIActivityType]
}

/**
 * Parse colorClass string into separate icon and badge classes
 * colorClass format: "text-{color}-{shade} bg-{color}-{shade}"
 */
export function parseColorClass(colorClass: string): { iconColor: string; badgeBg: string } {
  const parts = colorClass.split(' ')
  const textClass = parts.find(p => p.startsWith('text-')) || 'text-gray-600'
  const bgClass = parts.find(p => p.startsWith('bg-')) || 'bg-gray-100'
  return { iconColor: textClass, badgeBg: bgClass }
}

/**
 * Default values for creating new components
 * Used when dragging from component library or quick-adding
 */
export const COMPONENT_DEFAULTS: Record<UIActivityType, { name: string; proposalStatus: string }> = {
  flight: { name: 'Flight', proposalStatus: 'draft' },
  lodging: { name: 'Hotel Stay', proposalStatus: 'draft' },
  transportation: { name: 'Transportation', proposalStatus: 'draft' },
  tour: { name: 'Tour', proposalStatus: 'draft' },
  options: { name: 'Options', proposalStatus: 'draft' },
  custom_cruise: { name: 'Custom Cruise', proposalStatus: 'draft' },
  port_info: { name: 'Port Information', proposalStatus: 'draft' },
  dining: { name: 'Restaurant', proposalStatus: 'draft' },
  cruise: { name: 'Cruise', proposalStatus: 'draft' },
  package: { name: 'Package', proposalStatus: 'draft' },
  custom_tour: { name: 'Custom Tour', proposalStatus: 'draft' },
  tour_day: { name: 'Tour Day', proposalStatus: 'draft' },
  insurance: { name: 'Insurance', proposalStatus: 'draft' },
} as const

/**
 * Status badge variant mapping
 */
export type StatusVariant = 'inbound' | 'planning' | 'booked' | 'secondary'

export function getStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'draft':
      return 'inbound'
    case 'approved':
    case 'booked':
      return 'booked'
    case 'cancelled':
      return 'secondary'
    case 'proposing':
      return 'planning'
    default:
      return 'planning'
  }
}

/**
 * Check if an activity is a package container
 * Packages belong in the Bookings tab, not on the itinerary
 */
export function isPackageActivity<T extends { componentType?: string | null }>(
  activity: T
): boolean {
  return activity.componentType === 'package'
}

/**
 * Check if an activity is an insurance activity
 * Insurance activities belong in the Insurance tab, not on the itinerary
 */
export function isInsuranceActivity<T extends { componentType?: string | null }>(
  activity: T
): boolean {
  return activity.componentType === 'insurance'
}

/**
 * Filter out package activities from a list
 * Use this for itinerary views - packages should only appear in Bookings tab
 */
export function filterItineraryActivities<T extends { componentType?: string | null }>(
  activities: T[] | undefined | null
): T[] {
  if (!activities) return []
  return activities.filter((a) => !isPackageActivity(a) && !isInsuranceActivity(a))
}
