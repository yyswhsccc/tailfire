/**
 * Activities API Types
 *
 * TypeScript definitions for activity management endpoints.
 * Shared between API (NestJS) and client (React/Next.js).
 */

// =============================================================================
// Imports from Zod Schemas (source of truth)
// =============================================================================

import type {
  ActivityType,
  ActivityProposalStatus,
  ActivityBookingStatus,
  ActivityStatus,
  PricingType,
  PortType,
  Coordinates,
  Photo,
  CreateActivityDto,
  UpdateActivityDto,
} from '../schemas'

// Re-export for external consumers
export type { ActivityType, ActivityProposalStatus, ActivityBookingStatus, ActivityStatus, PricingType, PortType, Coordinates, Photo, CreateActivityDto, UpdateActivityDto }

// =============================================================================
// Package Type Aliases (for backward compatibility)
// =============================================================================

/**
 * Package status type alias (packages use ActivityProposalStatus)
 */
export type PackageStatus = ActivityProposalStatus

/**
 * Package payment status type
 */
export type PackagePaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'

/**
 * Package pricing type alias (packages use PricingType)
 */
export type PackagePricingType = PricingType

// Re-export schemas for validation use
export {
  activityTypeSchema,
  activityProposalStatusSchema,
  activityBookingStatusSchema,
  activityStatusSchema,
  pricingTypeSchema,
  portTypeSchema,
  coordinatesSchema,
  photoSchema,
  createActivityDtoSchema,
  updateActivityDtoSchema,
} from '../schemas'

// =============================================================================
// Supporting Types (kept for reference - actual types come from schemas)
// =============================================================================

/**
 * Per-person or per-unit pricing breakdown item
 */
export type PricingBreakdownItem = {
  label: string           // e.g., "Mrs Jacqueline Belanger" or "Adult 1"
  priceCents: number      // individual price in cents
  travelerId?: string     // optional link to trip_traveler UUID
}

/**
 * Activity Pricing DTO
 * Represents pricing data from activity_pricing table
 */
export type ActivityPricingDto = {
  totalPriceCents: number
  currency: string
  pricingType: PricingType | null
  // Extended fields for taxes and commission
  taxesAndFeesCents?: number | null
  commissionTotalCents?: number | null
  commissionSplitPercentage?: number | null
  // Per-person/per-unit breakdown
  pricingBreakdownJson?: PricingBreakdownItem[] | null
}

// =============================================================================
// Response DTOs
// =============================================================================

/**
 * Activity Response DTO
 * Represents a single activity within an itinerary day
 */
export type ActivityResponseDto = {
  id: string
  itineraryDayId: string | null // Nullable for floating packages

  // Parent activity reference (for cruise → port_info relationship, and package children)
  parentActivityId: string | null

  // Core fields
  activityType: ActivityType
  componentType: ActivityType // Polymorphic discriminator
  name: string
  description: string | null
  sequenceOrder: number

  // Timing: ISO 8601 strings with timezone
  // Fallback chain: activity.timezone → trip.timezone → browser timezone
  startDatetime: string | null // ISO 8601 with timezone
  endDatetime: string | null // ISO 8601 with timezone
  timezone: string | null // IANA timezone identifier (e.g., 'America/New_York')

  // Location
  location: string | null
  address: string | null
  coordinates: Coordinates | null

  // Details
  notes: string | null
  confirmationNumber: string | null
  proposalStatus: ActivityProposalStatus
  bookingStatus: ActivityBookingStatus

  // Booking tracking
  isVisibleInCalendar: boolean
  bookingDate: string | null // ISO 8601 date when booking was confirmed

  // Package reference (for linking activities to packages)
  packageId: string | null

  // Pricing (from activity_pricing table)
  pricing: ActivityPricingDto | null
  activityPricingId?: string | null // ID of activity_pricing record (for payment schedule config)
  pricingType: PricingType | null // Display hint (kept for backward compatibility)
  pricingBreakdownJson?: PricingBreakdownItem[] | null // Per-person pricing breakdown
  currency: string // 3-letter currency code (default: 'USD')

  // Media (deferred - kept nullable for future photo uploads)
  photos: Photo[] | null

  // Thumbnail URL (first media image from activity_media or photos)
  thumbnail: string | null

  // Audit fields
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Request DTOs
// =============================================================================

// CreateActivityDto and UpdateActivityDto are now re-exported from ../schemas
// See the re-exports section at the top of this file

/**
 * Reorder Activities DTO
 * Used for drag-and-drop reordering within a day
 */
export type ReorderActivitiesDto = {
  activityOrders: Array<{
    id: string
    sequenceOrder: number
  }>
}

/**
 * Move Activity DTO
 * Move activity to a different day
 */
export type MoveActivityDto = {
  targetDayId: string
  sequenceOrder?: number
}

/**
 * Activity Filter DTO
 * Query parameters for listing activities
 */
export type ActivityFilterDto = {
  itineraryDayId?: string // Filter by day
  activityType?: ActivityType // Filter by type
  proposalStatus?: ActivityProposalStatus // Filter by proposal status
  bookingStatus?: ActivityBookingStatus // Filter by booking status
  sortBy?: 'sequenceOrder' | 'startDatetime' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// =============================================================================
// Booking Status Types (for dedicated booking status endpoint)
// =============================================================================

import type { ExpectedPaymentStatus, CommissionStatus } from './payment-schedules.types.js'

/**
 * Activity Booking Status DTO
 * Aggregated payment and commission status for a single activity
 */
export type ActivityBookingStatusDto = {
  activityId: string
  paymentStatus: ExpectedPaymentStatus | null
  paymentPaidCents: number
  paymentTotalCents: number
  paymentRemainingCents: number
  commissionStatus: CommissionStatus | null
  commissionTotalCents: number
  hasPaymentSchedule: boolean
  nextDueDate: string | null // ISO date string
}

/**
 * Trip Booking Status Response DTO
 * Aggregated booking status for all activities in a trip
 */
export type TripBookingStatusResponseDto = {
  tripId: string
  activities: Record<string, ActivityBookingStatusDto> // Map of activityId -> status
  summary: {
    totalActivities: number
    activitiesWithPaymentSchedule: number
    totalExpectedCents: number
    totalPaidCents: number
    totalRemainingCents: number
    overdueCount: number
    upcomingDueCount: number
  }
}

// =============================================================================
// Per-Traveler Booking Types
// =============================================================================

/**
 * Traveler Booking DTO
 * Individual booking record for a traveler on an activity
 * (e.g., separate cabin/confirmation for each passenger on a cruise)
 */
export type TravelerBookingDto = {
  id: string
  activityId: string
  tripTravelerId: string
  travelerName: string // resolved from trip_travelers → contacts
  confirmationNumber: string | null
  bookingReference: string | null
  bookingStatus: string | null
  supplier: string | null
  priceCents: number | null
  currency: string
  commissionCents: number | null
  bookingDetailsJson: Record<string, unknown>
  externalBookingId: string | null
  externalSystem: string | null
}

/**
 * Create Traveler Booking DTO
 */
export type CreateTravelerBookingDto = {
  tripTravelerId: string
  confirmationNumber?: string | null
  bookingReference?: string | null
  bookingStatus?: string
  supplier?: string | null
  priceCents?: number | null
  currency?: string
  commissionCents?: number | null
  bookingDetailsJson?: Record<string, unknown>
  externalBookingId?: string | null
  externalSystem?: string | null
}

/**
 * Update Traveler Booking DTO
 */
export type UpdateTravelerBookingDto = Partial<Omit<CreateTravelerBookingDto, 'tripTravelerId'>>

// =============================================================================
// Package Activity Types (packages are now activities with activityType='package')
// =============================================================================

/**
 * Package Summary DTO (for list views)
 * Represents a package activity with aggregated info
 */
export type PackageSummaryDto = {
  id: string
  tripId: string
  name: string
  proposalStatus: ActivityProposalStatus
  paymentStatus: 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'
  supplierName: string | null
  confirmationNumber: string | null
  currency: string
  totalPriceCents: number
  activityCount: number
  dateBooked: string | null // ISO date
  itineraryIds: string[] // IDs of itineraries containing linked activities
  createdAt: string
  updatedAt: string
}

/**
 * Package Response DTO (full detail)
 * Extended activity response with package-specific details and children
 */
export type PackageResponseDto = ActivityResponseDto & {
  // Package-specific details (from package_details table)
  packageDetails: PackageDetailsDto | null
  // Child activities linked to this package
  activities: PackageLinkedActivityDto[]
  // Travelers linked to this package
  travelers: PackageTravelerDto[]
  // Per-traveler booking records (confirmation #, pricing per traveler)
  travelerBookings: TravelerBookingDto[]
  // Financial totals
  totalPriceCents: number
  totalPaidCents: number
  totalUnpaidCents: number
  // Trip context
  tripId: string
}

/**
 * Package Details DTO
 * Data from the package_details table
 */
export type PackageDetailsDto = {
  supplierId: string | null
  supplierName: string | null
  paymentStatus: 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'
  pricingType: PricingType | null
  cancellationPolicy: string | null
  cancellationDeadline: string | null // ISO date
  termsAndConditions: string | null
  groupBookingNumber: string | null
}

/**
 * Package Linked Activity DTO
 * Activity summary for display within a package
 */
export type PackageLinkedActivityDto = {
  id: string
  name: string
  activityType: ActivityType
  proposalStatus: ActivityProposalStatus
  dayNumber: number | null
  endDayNumber: number | null // For spanning activities (lodging, cruise): last day number
  dayDate: string | null // ISO date
  parentActivityId: string | null // For nested relationships (e.g., port_info under cruise)
  sequenceOrder: number
  totalPriceCents: number | null
}

/**
 * Package Traveler DTO
 * Traveler linked to a package
 */
export type PackageTravelerDto = {
  id: string
  tripTravelerId: string
  travelerName: string
  createdAt: string
}

/**
 * Activity Traveler DTO
 * Represents a traveler linked to an activity with optional loyalty program
 */
export type ActivityTravelerDto = {
  id: string
  activityId: string
  tripTravelerId: string
  travelerName: string
  contactLoyaltyProgramId: string | null
  createdAt: string
}

/**
 * Link Travelers DTO
 * Supports both legacy (tripTravelerIds) and v2 (links with loyalty) shapes
 */
export type LinkTravelersDto = {
  tripTravelerIds?: string[]
  links?: TravelerLinkItemDto[]
}

export type TravelerLinkItemDto = {
  tripTravelerId: string
  contactLoyaltyProgramId?: string
}

/**
 * Package List Response DTO
 * Paginated list of packages
 */
export type PackageListResponseDto = {
  data: PackageSummaryDto[]
  total: number
  page: number
  pageSize: number
}

/**
 * Trip Package Totals DTO
 * Aggregated financial totals for all packages in a trip
 */
export type TripPackageTotalsDto = {
  totalPackages: number
  grandTotalCents: number
  bookedTotalCents: number
  totalCollectedCents: number
  outstandingCents: number
  expectedCommissionCents: number
  pendingCommissionCents: number
}

/**
 * Unlinked Activity DTO
 * Activity not linked to any package
 */
export type UnlinkedActivityDto = {
  id: string
  name: string
  activityType: ActivityType
  itineraryId: string
  itineraryDayId: string
  dayNumber: number | null
  endDayNumber: number | null // For spanning activities (lodging, cruise): last day number
  date: string | null // ISO date
  sequenceOrder: number
  totalPriceCents: number | null
  parentActivityId: string | null
  supplierName: string | null
  bookingStatus: ActivityBookingStatus
  confirmationNumber: string | null
  paymentStatus: string | null // 'paid' | 'deposit_paid' | 'unpaid' | null (no schedule)
  paidCents: number | null
  currency: string | null
  commissionTotalCents: number | null
  travelerBookings?: TravelerBookingDto[]
}

/**
 * Unlinked Activities Response DTO
 */
export type UnlinkedActivitiesResponseDto = {
  activities: UnlinkedActivityDto[]
  total: number
}

/**
 * Package Filter DTO
 * Query parameters for listing packages
 */
export type PackageFilterDto = {
  tripId?: string
  page?: number
  pageSize?: number
  search?: string
  proposalStatus?: ActivityProposalStatus
  paymentStatus?: 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'
  supplierId?: string
  sortBy?: 'name' | 'createdAt' | 'totalPriceCents' | 'proposalStatus'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Create Package DTO
 * Data for creating a new package activity
 */
export type CreatePackageDto = {
  tripId: string
  name: string
  itineraryDayId?: string | null // Optional - packages can float
  proposalStatus?: ActivityProposalStatus
  confirmationNumber?: string | null
  notes?: string | null
  currency?: string
  // Pricing fields
  totalPriceCents?: number
  taxesCents?: number
  pricingType?: 'flat_rate' | 'per_person'
  commissionTotalCents?: number | null
  commissionSplitPercentage?: number | null
  paymentStatus?: PackagePaymentStatus
  // Package-specific
  supplierId?: string | null
  supplierName?: string | null
  cancellationPolicy?: string | null
  cancellationDeadline?: string | null
  termsAndConditions?: string | null
  groupBookingNumber?: string | null
  // Activities to link immediately
  activityIds?: string[]
}

/**
 * Update Package DTO
 * Data for updating an existing package
 */
export type UpdatePackageDto = {
  name?: string
  proposalStatus?: ActivityProposalStatus
  confirmationNumber?: string | null
  notes?: string | null
  currency?: string
  // Pricing fields
  totalPriceCents?: number
  taxesCents?: number
  pricingType?: 'flat_rate' | 'per_person'
  commissionTotalCents?: number | null
  commissionSplitPercentage?: number | null
  // Package-specific
  supplierId?: string | null
  supplierName?: string | null
  paymentStatus?: 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'
  cancellationPolicy?: string | null
  cancellationDeadline?: string | null
  termsAndConditions?: string | null
  groupBookingNumber?: string | null
}

/**
 * Link Activities to Package DTO
 */
export type LinkActivitiesToPackageDto = {
  activityIds: string[]
}

/**
 * Unlink Activities from Package DTO
 */
export type UnlinkActivitiesFromPackageDto = {
  activityIds: string[]
}

/**
 * Mark Package as Booked DTO
 */
export type MarkPackageAsBookedDto = {
  bookingDate?: string // ISO date, defaults to today
  confirmationNumber?: string // Booking confirmation number
  paymentStatus?: 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded'
}
