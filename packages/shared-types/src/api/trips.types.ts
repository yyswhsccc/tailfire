/**
 * Trip API DTOs
 *
 * These types define the API contract for Trip-related operations.
 * Used by NestJS controllers for request validation and response serialization.
 *
 * SERVER-MANAGED FIELDS:
 * The following fields are automatically set by the server and should NOT be included in create/update DTOs:
 * - agencyId: Extracted from authenticated user's agency context
 * - branchId: Extracted from authenticated user's branch context (if applicable)
 * - ownerId: Set to the authenticated user's ID (primary advisor)
 * - createdAt/updatedAt: Auto-generated timestamps
 * - createdBy/updatedBy: Set to authenticated user's ID
 */

// Import types for reference (currently unused but may be needed in the future)
// import type { Trip, TripInsert, TripTraveler, Itinerary } from '../database'
import type { ContactResponseDto } from './contacts.types'

// ============================================================================
// CREATE DTOs
// ============================================================================

/**
 * CreateTripDto
 *
 * Client-provided fields for creating a new trip.
 *
 * SERVER-MANAGED (not in DTO):
 * - agencyId: From auth context
 * - branchId: From auth context (optional)
 * - ownerId: From auth context (authenticated user becomes primary advisor)
 */
export interface CreateTripDto {
  // Required fields
  name: string

  // Optional basic info
  description?: string
  tripType?: 'leisure' | 'business' | 'group' | 'honeymoon' | 'corporate' | 'custom'

  // Optional dates
  startDate?: string // ISO date string
  endDate?: string // ISO date string
  bookingDate?: string // ISO date string

  // Optional status
  status?: 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'

  // Optional associations
  primaryContactId?: string // UUID

  // Optional references
  referenceNumber?: string
  externalReference?: string

  // Optional financial
  currency?: string // ISO 4217 (default: CAD)
  estimatedTotalCost?: number

  // Optional metadata
  tags?: string[]
  customFields?: Record<string, any>

  // Date/Time Management (Phase 3.5)
  timezone?: string // IANA timezone identifier (e.g., 'America/Toronto')

  // Trip Settings
  pricingVisibility?: 'show_all' | 'hide_all' | 'travelers_only'
  allowPdfDownloads?: boolean
  itineraryStyle?: 'side_by_side' | 'stacked' | 'compact'
  calendarDisplayMode?: 'trip' | 'activities'

  // Commission fee rate override (nullable — when absent/null, uses agency default)
  commissionFeeRateOverride?: number | null // 0-100

  // Optional group association
  tripGroupId?: string | null

  // Source attribution (admin, ota, import, etc.)
  source?: string
}

export interface CreateTripCollaboratorDto {
  userId: string // UUID
  commissionPercentage: number // 0-100
  role?: string // 'lead', 'support', 'specialist'
}

/**
 * Base fields common to both traveler creation methods
 */
interface CreateTripTravelerBaseDto {
  // Traveler info
  role?: 'primary_contact' | 'full_access' | 'limited_access'
  isPrimaryTraveler?: boolean
  travelerType?: 'adult' | 'child' | 'infant'

  // Emergency contact (flexible)
  emergencyContactId?: string // UUID reference
  emergencyContactInline?: {
    name: string
    phone: string
    relationship?: string
    email?: string
  }

  // Special requirements
  specialRequirements?: string

  // Ordering
  sequenceOrder?: number
}

/**
 * Create traveler by referencing an existing contact
 */
interface CreateTripTravelerByContactDto extends CreateTripTravelerBaseDto {
  contactId: string // UUID - REQUIRED when using contact reference
  contactSnapshot?: never // Cannot provide snapshot when using contactId
}

/**
 * Create traveler with inline contact information (snapshot)
 * Requires minimum identifying information
 */
interface CreateTripTravelerBySnapshotDto extends CreateTripTravelerBaseDto {
  contactId?: never // Cannot provide contactId when using snapshot
  contactSnapshot: {
    firstName: string // REQUIRED
    lastName: string // REQUIRED
    email?: string
    phone?: string
    dateOfBirth?: string
    passportNumber?: string
    passportExpiry?: string
    nationality?: string
  }
}

/**
 * CreateTripTravelerDto - Discriminated union
 *
 * Travelers MUST be created using either:
 * 1. A contactId reference to an existing contact, OR
 * 2. A contactSnapshot with at minimum firstName and lastName
 *
 * This prevents invalid travelers with no identifying information.
 */
export type CreateTripTravelerDto =
  | CreateTripTravelerByContactDto
  | CreateTripTravelerBySnapshotDto

export interface CreateTravelerGroupDto {
  name: string
  groupType: 'room' | 'dining' | 'activity' | 'transfer' | 'custom'
  description?: string
  sequenceOrder?: number
}

export interface AddTravelerToGroupDto {
  tripTravelerId: string // UUID
  role?: string
  notes?: string
}

export interface CreateItineraryDto {
  name: string
  description?: string
  coverPhoto?: string // Optional cover photo URL (TERN pattern)
  overview?: string // Rich text overview statement (TERN pattern)
  startDate?: string // ISO date string - can override trip start date (TERN pattern)
  endDate?: string // ISO date string - can override trip end date (TERN pattern)
  status?: 'draft' | 'proposing' | 'approved' | 'archived'
  sequenceOrder?: number
}

// ============================================================================
// UPDATE DTOs
// ============================================================================

export interface UpdateTripDto {
  name?: string
  description?: string
  tripType?: 'leisure' | 'business' | 'group' | 'honeymoon' | 'corporate' | 'custom'
  startDate?: string
  endDate?: string
  bookingDate?: string
  status?: 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'
  ownerId?: string | null // Can set to null only if status is 'inbound'
  primaryContactId?: string
  referenceNumber?: string
  externalReference?: string
  currency?: string
  estimatedTotalCost?: number
  tags?: string[]
  customFields?: Record<string, any>
  isArchived?: boolean
  isPublished?: boolean
  timezone?: string // IANA timezone identifier (e.g., 'America/Toronto')
  tripGroupId?: string | null
  commissionFeeRateOverride?: number | null
  calendarDisplayMode?: 'trip' | 'activities'
}

export interface UpdateTripCollaboratorDto {
  commissionPercentage?: number
  role?: string
  isActive?: boolean
}

export interface UpdateTripTravelerDto {
  contactId?: string
  role?: 'primary_contact' | 'full_access' | 'limited_access'
  isPrimaryTraveler?: boolean
  travelerType?: 'adult' | 'child' | 'infant'
  contactSnapshot?: Record<string, any>
  emergencyContactId?: string
  emergencyContactInline?: Record<string, any>
  specialRequirements?: string
  sequenceOrder?: number
}

export interface UpdateTravelerGroupDto {
  name?: string
  groupType?: 'room' | 'dining' | 'activity' | 'transfer' | 'custom'
  description?: string
  sequenceOrder?: number
}

export interface UpdateTravelerGroupMemberDto {
  role?: string
  notes?: string
}

export interface UpdateItineraryDto {
  name?: string
  description?: string
  coverPhoto?: string // Optional cover photo URL (TERN pattern)
  overview?: string // Rich text overview statement (TERN pattern)
  startDate?: string // ISO date string - can override trip start date (TERN pattern)
  endDate?: string // ISO date string - can override trip end date (TERN pattern)
  // Destinations (geolocation)
  primaryDestinationName?: string | null
  primaryDestinationLat?: number | null
  primaryDestinationLng?: number | null
  secondaryDestinationName?: string | null
  secondaryDestinationLat?: number | null
  secondaryDestinationLng?: number | null
  status?: 'draft' | 'proposing' | 'approved' | 'archived'
  isSelected?: boolean
  sequenceOrder?: number
}

// ============================================================================
// FILTER/QUERY DTOs
// ============================================================================

export interface TripFilterDto {
  // Pagination
  page?: number
  limit?: number

  // Search
  search?: string // Full-text search across name, description, reference

  // Filters
  status?: 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'
  tripType?: 'leisure' | 'business' | 'group' | 'honeymoon' | 'corporate' | 'custom'
  ownerId?: string // Filter by owner
  primaryContactId?: string // Filter by primary contact
  isArchived?: boolean
  isPublished?: boolean
  includeDeleted?: boolean
  tags?: string[] // Match any of these tags
  tripGroupId?: string // Filter by trip group
  ungrouped?: boolean // Filter to trips not in any group
  unassigned?: boolean // Filter to trips with no owner
  hasBookings?: 'yes' | 'no' // Filter by whether trip has booked activities

  // Date filters
  startDateFrom?: string
  startDateTo?: string
  endDateFrom?: string
  endDateTo?: string
  createdAtFrom?: string
  createdAtTo?: string

  // Sorting
  sortBy?: 'name' | 'startDate' | 'endDate' | 'status' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

export interface TripTravelerFilterDto {
  tripId?: string
  contactId?: string
  role?: 'primary_contact' | 'full_access' | 'limited_access'
  isPrimaryTraveler?: boolean
  travelerType?: 'adult' | 'child' | 'infant'
}

export interface TravelerGroupFilterDto {
  tripId?: string
  groupType?: 'room' | 'dining' | 'activity' | 'transfer' | 'custom'
}

export interface ItineraryFilterDto {
  tripId?: string
  status?: 'draft' | 'proposing' | 'approved' | 'archived'
  isSelected?: boolean
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Lightweight user summary for embedding in responses
 */
export interface UserSummaryDto {
  id: string
  name: string
  email: string
}

export interface TripResponseDto {
  id: string
  agencyId: string | null // Nullable - single agency model
  branchId: string | null
  ownerId: string | null // Nullable for inbound trips
  owner?: UserSummaryDto // Populated when user data is available
  name: string
  description: string | null
  tripType: string | null
  startDate: string | null
  endDate: string | null
  bookingDate: string | null
  status: string
  primaryContactId: string | null
  referenceNumber: string | null
  externalReference: string | null
  currency: string
  estimatedTotalCost: string | null // Decimal as string
  tags: string[]
  customFields: Record<string, any> | null
  isArchived: boolean
  isPublished: boolean
  timezone: string | null // IANA timezone identifier (e.g., 'America/Toronto')
  pricingVisibility: 'show_all' | 'hide_all' | 'travelers_only'
  allowPdfDownloads: boolean
  itineraryStyle: 'side_by_side' | 'stacked' | 'compact'
  calendarDisplayMode: 'trip' | 'activities'
  coverPhotoUrl: string | null // URL of the trip's cover photo
  shareToken: string | null
  tripGroupId: string | null
  clientSelectedItineraryId: string | null
  commissionFeeRateOverride: string | null // Decimal as string, null = use agency default
  deletedAt: string | null
  deletedBy: string | null
  statusBeforeCancel: string | null
  createdAt: string
  updatedAt: string
}

export interface TripWithDetailsResponseDto extends TripResponseDto {
  // Populated relationships
  primaryContact?: ContactResponseDto
  collaborators?: TripCollaboratorResponseDto[]
  travelers?: TripTravelerResponseDto[]
  travelerGroups?: TravelerGroupResponseDto[]
  itineraries?: ItineraryResponseDto[]

  // Computed fields
  travelerCount?: number
  durationDays?: number
}

export interface TripCollaboratorResponseDto {
  id: string
  tripId: string
  userId: string
  commissionPercentage: string // Decimal as string
  role: string | null
  isActive: boolean
  createdAt: string
  // Populated user data (Phase 2)
  // user?: UserResponseDto
}

export interface TripTravelerResponseDto {
  id: string
  tripId: string
  contactId: string | null
  role: 'primary_contact' | 'full_access' | 'limited_access'
  isPrimaryTraveler: boolean
  travelerType: string
  contactSnapshot: Record<string, any> | null
  emergencyContactId: string | null
  emergencyContactInline: Record<string, any> | null
  specialRequirements: string | null
  sequenceOrder: number
  snapshotUpdatedAt: string | null
  contactDeletedAt: string | null
  isSnapshotStale?: boolean
  createdAt: string
  updatedAt: string
  // Populated contact data
  contact?: ContactResponseDto
  emergencyContact?: ContactResponseDto
}

export interface TravelerGroupResponseDto {
  id: string
  tripId: string
  name: string
  groupType: string
  description: string | null
  sequenceOrder: number | null
  createdAt: string
  updatedAt: string
  // Member count
  memberCount?: number
}

export interface TravelerGroupWithMembersResponseDto extends TravelerGroupResponseDto {
  members: TravelerGroupMemberResponseDto[]
}

export interface TravelerGroupMemberResponseDto {
  id: string
  travelerGroupId: string
  tripTravelerId: string
  role: string | null
  notes: string | null
  addedAt: string
  // Populated traveler data
  traveler?: TripTravelerResponseDto
}

export interface ItineraryResponseDto {
  id: string
  tripId: string
  name: string
  description: string | null
  coverPhoto: string | null // Optional cover photo URL (TERN pattern)
  overview: string | null // Rich text overview statement (TERN pattern)
  startDate: string | null // ISO date string - can override trip start date (TERN pattern)
  endDate: string | null // ISO date string - can override trip end date (TERN pattern)
  // Destinations (geolocation)
  primaryDestinationName: string | null
  primaryDestinationLat: number | null
  primaryDestinationLng: number | null
  secondaryDestinationName: string | null
  secondaryDestinationLat: number | null
  secondaryDestinationLng: number | null
  status: string
  isSelected: boolean
  sequenceOrder: number
  // Versioning
  currentVersion: number
  publishedVersion: number | null
  lastPublishedAt: string | null
  hasUnpublishedChanges: boolean
  createdAt: string
  updatedAt: string
}

// ============================================================================
// PAGINATED RESPONSE
// ============================================================================

export interface PaginatedTripsResponseDto {
  data: TripResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PaginatedItinerariesResponseDto {
  data: ItineraryResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export interface BulkAddTravelersDto {
  travelers: CreateTripTravelerDto[]
}

export interface BulkUpdateTravelerSequenceDto {
  travelers: Array<{
    id: string
    sequenceOrder: number
  }>
}

/**
 * Result of a bulk operation with per-item tracking
 */
export interface BulkTripOperationResult {
  /** IDs of trips that were successfully processed */
  success: string[]
  /** IDs of trips that failed with their failure reasons */
  failed: Array<{
    id: string
    reason: string
  }>
}

/**
 * DTO for bulk delete operation
 */
export interface BulkDeleteTripsDto {
  tripIds: string[]
}

/**
 * DTO for bulk archive/unarchive operation
 */
export interface BulkArchiveTripsDto {
  tripIds: string[]
  archive: boolean
}

/**
 * DTO for bulk status change operation
 */
export interface BulkChangeStatusDto {
  tripIds: string[]
  status: 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'
}

/**
 * Response DTO for filter options endpoint
 */
export interface TripFilterOptionsResponseDto {
  /** All valid trip statuses */
  statuses: string[]
  /** All valid trip types */
  tripTypes: string[]
  /** Distinct tags from user's trips */
  tags: string[]
  /** Available trip groups for the agency */
  groups: { id: string; name: string }[]
}

// ============================================================================
// SHARE / GROUP DTOs
// ============================================================================

/** Public-safe trip data for shared links (no travelers, payments, notes) */
export interface TripShareDto {
  id: string
  name: string
  description: string | null
  tripType: string | null
  startDate: string | null
  endDate: string | null
  coverPhotoUrl: string | null
  itineraries: Array<{
    id: string
    name: string
    description: string | null
    coverPhoto: string | null
    overview: string | null
    startDate: string | null
    endDate: string | null
  }>
}

export type TripGroupType = 'folder' | 'group_booking'
export type TripGroupStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled'

export interface TripGroupDto {
  id: string
  agencyId: string
  name: string
  description: string | null
  type: TripGroupType
  groupNumber: string | null
  primarySupplierId: string | null
  destination: string | null
  startDate: string | null
  endDate: string | null
  status: TripGroupStatus | null
  tripCount?: number
  createdAt: string
  updatedAt: string
}

export interface UpdateTripGroupApiDto {
  name?: string
  description?: string
  type?: TripGroupType
  groupNumber?: string
  primarySupplierId?: string | null
  destination?: string
  startDate?: string | null
  endDate?: string | null
  status?: TripGroupStatus
}

/** Minimal trip data for group member listing */
export interface TripGroupTripDto {
  id: string
  name: string
  status: string
  startDate: string | null
  endDate: string | null
  primaryContactId: string | null
  primaryContactFirstName: string | null
  primaryContactLastName: string | null
}

export interface GroupTravelerDto {
  travelerId: string
  contactId: string | null
  role: string
  tripId: string
  tripName: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
}

export interface TripGroupSummaryDto {
  groupId: string
  totalPackagePriceCents: number
  totalCommissionProjectedCents: number
  totalCommissionReceivedCents: number
  totalBalanceCents: number
  currency: string
  tripSummaries: TripGroupTripSummaryDto[]
}

export interface TripGroupTripSummaryDto {
  tripId: string
  tripName: string
  status: string
  packagePriceCents: number
  commissionProjectedCents: number
  commissionReceivedCents: number
  balanceCents: number
  paymentStatus: 'paid' | 'partial' | 'outstanding' | 'none'
}

export interface TripGroupDocumentDto {
  id: string
  tripGroupId: string
  documentType: string | null
  fileUrl: string
  fileName: string
  fileSize: number | null
  uploadedAt: string
}

export interface TripGroupMediaDto {
  id: string
  tripGroupId: string
  mediaType: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  caption: string | null
  orderIndex: number
  uploadedAt: string
}

// ============================================================================
// TRIP SHARING DTOs
// ============================================================================

/**
 * Access level for trip sharing
 * - read: View trip details only
 * - write: Can modify trip (add activities, update details)
 */
export type TripShareAccessLevel = 'read' | 'write'

/**
 * Create a trip share
 * NOTE: This is separate from trip_collaborators which handles commission splits
 */
export interface CreateTripShareDto {
  sharedWithUserId: string
  accessLevel?: TripShareAccessLevel // Defaults to 'read'
  notes?: string
  reason?: string
  scopedContactId?: string
  expiresAt?: string
}

/**
 * Update a trip share
 */
export interface UpdateTripShareDto {
  accessLevel?: TripShareAccessLevel
  notes?: string
}

/**
 * Response DTO for trip share
 */
export interface TripShareResponseDto {
  id: string
  tripId: string
  sharedWithUserId: string
  accessLevel: TripShareAccessLevel
  sharedBy: string
  sharedAt: string
  notes: string | null
  reason: string | null
  scopedContactId: string | null
  grantedBy: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  // Populated user data (when available)
  sharedWithUser?: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
  }
  sharedByUser?: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
  }
}

/**
 * Re-assign trip ownership (Admin only)
 */
export interface UpdateTripOwnerDto {
  ownerId: string | null // null = only valid for inbound trips
}

/**
 * Result of trip reassignment with contact cascade
 */
export interface ReassignCascadeResult {
  trip: TripResponseDto
  cascade: {
    contactsAssigned: number
    contactsSkipped: { contactName: string; currentOwner: string }[]
  }
}

/**
 * Bulk reassign trips request
 */
export interface BulkReassignTripsDto {
  tripIds: string[]
  newOwnerId: string
}

/**
 * Bulk reassign preview result
 */
export interface BulkReassignPreviewDto {
  tripsCount: number
  contactsToAssign: { id: string; name: string; reason: 'unowned' | 'inactive_owner' }[]
  contactsToSkip: { id: string; name: string; currentOwnerName: string }[]
}

/**
 * Bulk reassign execution result
 */
export interface BulkReassignResultDto {
  tripsReassigned: number
  contactsAssigned: number
  contactsSkipped: { contactName: string; currentOwner: string }[]
}

// ============================================================================
// CANCELLATION
// ============================================================================

/**
 * Cancel a trip with optional reason
 */
export interface CancelTripDto {
  reason?: string // Optional cancellation reason
  notifyTravelers?: boolean // Optional: send cancellation email to trip travelers
}

// ============================================================================
// SHARED TRIP PROPOSAL DTOs (public share page with full itinerary)
// ============================================================================

/** Activity type discriminator for shared proposal */
export type SharedActivityType =
  | 'flight'
  | 'lodging'
  | 'transportation'
  | 'dining'
  | 'custom_cruise'
  | 'custom_tour'
  | 'package'
  | 'port_info'
  | 'options'
  | 'tour'
  | 'cruise'
  | 'tour_day'

/** Activity proposal status for display */
export type SharedProposalStatus = 'draft' | 'proposing' | 'approved' | 'cancelled'

/** Activity booking status for display */
export type SharedBookingStatus = 'unbooked' | 'booked' | 'cancelled'

/**
 * @deprecated Use SharedProposalStatus instead
 */
export type SharedActivityStatus = SharedProposalStatus

/** Sanitized pricing breakdown item (no traveler names) */
export interface SharedPricingBreakdownItem {
  description: string
  amountCents: number
}

/** Public-safe pricing for an activity */
export interface SharedActivityPricingDto {
  totalPriceCents: number
  currency: string
  pricingType: string | null
  breakdownItems: SharedPricingBreakdownItem[] | null
}

// --- Type-specific detail DTOs ---

export interface SharedFlightSegmentDto {
  segmentOrder: number
  airline: string | null
  flightNumber: string | null
  departureAirportCode: string | null
  departureAirportName: string | null
  departureDate: string | null
  departureTime: string | null
  departureTerminal: string | null
  arrivalAirportCode: string | null
  arrivalAirportName: string | null
  arrivalDate: string | null
  arrivalTime: string | null
  arrivalTerminal: string | null
}

export interface SharedFlightDetailDto {
  type: 'flight'
  airline: string | null
  flightNumber: string | null
  departureAirportCode: string | null
  departureDate: string | null
  departureTime: string | null
  departureTerminal: string | null
  arrivalAirportCode: string | null
  arrivalDate: string | null
  arrivalTime: string | null
  arrivalTerminal: string | null
  segments: SharedFlightSegmentDto[]
}

export interface SharedLodgingDetailDto {
  type: 'lodging'
  propertyName: string | null
  checkInDate: string | null
  checkInTime: string | null
  checkOutDate: string | null
  checkOutTime: string | null
  roomType: string | null
  roomCount: number
  amenities: string[]
}

export interface SharedTransportDetailDto {
  type: 'transportation'
  subtype: string | null
  providerName: string | null
  vehicleType: string | null
  pickupDate: string | null
  pickupTime: string | null
  pickupAddress: string | null
  pickupName: string | null
  pickupLat: number | null
  pickupLng: number | null
  pickupPlaceId: string | null
  dropoffDate: string | null
  dropoffTime: string | null
  dropoffAddress: string | null
  dropoffName: string | null
  dropoffLat: number | null
  dropoffLng: number | null
  dropoffPlaceId: string | null
  rentalCompany: string | null
  rentalBookingRef: string | null
  rentalCarClass: string | null
  rentalFuelPolicy: string | null
  departureStation: string | null
  arrivalStation: string | null
  /**
   * Multi-leg journey for train/bus with interchanges (#304).
   * Null or empty array = direct single-leg journey described by the
   * pickup/dropoff fields above.
   */
  legs: SharedTransportLegDto[] | null
  isRoundTrip: boolean
}

export interface SharedTransportLegDto {
  trainNumber: string | null
  operator: string | null
  departureStation: string | null
  arrivalStation: string | null
  departureDate: string | null
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
  /** Buffer in minutes to the next leg. Ignored on the final leg. */
  interchangeMinutesAfter: number | null
}

export interface SharedDiningDetailDto {
  type: 'dining'
  restaurantName: string | null
  cuisineType: string | null
  mealType: string | null
  reservationDate: string | null
  reservationTime: string | null
  partySize: number | null
  priceRange: string | null
  dressCode: string | null
}

export interface SharedCruiseDetailDto {
  type: 'custom_cruise'
  cruiseLineName: string | null
  shipName: string | null
  itineraryName: string | null
  nights: number | null
  departurePort: string | null
  departureDate: string | null
  arrivalPort: string | null
  arrivalDate: string | null
  cabinCategory: string | null
  cabinDescription: string | null
  region: string | null
  portCalls: Array<{
    day: number
    portName: string
    arriveTime: string | null
    departTime: string | null
  }>
}

export interface SharedTourDetailDto {
  type: 'custom_tour'
  tourName: string | null
  days: number | null
  nights: number | null
  startCity: string | null
  endCity: string | null
  itineraryDays: Array<{
    dayNumber: number
    title: string | null
    description: string | null
    overnightCity: string | null
  }>
}

export interface SharedPackageDetailDto {
  type: 'package'
  supplierName: string | null
  childActivities: SharedActivityDto[]
}

export interface SharedPortInfoDetailDto {
  type: 'port_info'
  portType: string | null
  portName: string | null
  portLocation: string | null
  arrivalDate: string | null
  arrivalTime: string | null
  departureDate: string | null
  departureTime: string | null
  tenderRequired: boolean
}

export interface SharedOptionsDetailDto {
  type: 'options'
  optionCategory: string | null
  isSelected: boolean
  providerName: string | null
  durationMinutes: number | null
  inclusions: string[]
}

export interface SharedGenericDetailDto {
  type: 'generic'
}

/** Discriminated union of all detail types */
export type SharedActivityDetailDto =
  | SharedFlightDetailDto
  | SharedLodgingDetailDto
  | SharedTransportDetailDto
  | SharedDiningDetailDto
  | SharedCruiseDetailDto
  | SharedTourDetailDto
  | SharedPackageDetailDto
  | SharedPortInfoDetailDto
  | SharedOptionsDetailDto
  | SharedGenericDetailDto

/** Public-safe media item for shared proposal */
export interface SharedMediaDto {
  url: string
  caption: string | null
}

/** Public-safe activity for shared proposal */
export interface SharedActivityDto {
  id: string
  activityType: SharedActivityType
  name: string
  description: string | null
  sequenceOrder: number
  startDatetime: string | null
  endDatetime: string | null
  timezone: string | null
  location: string | null
  address: string | null
  proposalStatus: SharedProposalStatus
  bookingStatus: SharedBookingStatus
  confirmationNumber: string | null
  /** Optional external "Book this activity →" CTA URL (#302). */
  referralUrl: string | null
  thumbnail: string | null
  media: SharedMediaDto[]
  pricing: SharedActivityPricingDto | null
  detail: SharedActivityDetailDto | null
}

/** Public-safe itinerary day */
export interface SharedItineraryDayDto {
  id: string
  dayNumber: number
  date: string | null
  title: string | null
  sequenceOrder: number
  activities: SharedActivityDto[]
}

/** Public-safe itinerary summary */
export interface SharedItineraryDto {
  id: string
  name: string
  description: string | null
  coverPhoto: string | null
  overview: string | null
  startDate: string | null
  endDate: string | null
  status: string
  publishedVersion: number | null
  days: SharedItineraryDayDto[]
}

/** Agent profile for public display (no email) */
export interface SharedAgentProfileDto {
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  publicPhone: string | null
  bio: string | null
}

/** Comment on a proposal activity or day */
export interface ProposalCommentDto {
  id: string
  activityId: string | null
  dayId: string | null
  versionNumber: number | null
  authorType: 'client' | 'agent'
  authorName: string
  content: string
  createdAt: string
}

/** Request to create a comment on a proposal */
export interface CreateProposalCommentDto {
  itineraryId?: string
  activityId?: string
  dayId?: string
  content: string
}

/** Response with comments and per-activity/day counts */
export interface ProposalCommentsResponseDto {
  comments: ProposalCommentDto[]
  commentCounts: Record<string, number>
}

// ============================================================================
// CLIENT ACTIVITY RESPONSES
// ============================================================================

/** Per-activity client response type */
export type ClientActivityResponseType = 'confirmed' | 'declined'

/** Per-activity response from client */
export interface ClientActivityResponseDto {
  id: string
  activityId: string
  versionNumber: number
  response: ClientActivityResponseType
  contactName: string
  note: string | null
  createdAt: string
}

/** Request to create/update an activity response */
export interface CreateActivityResponseDto {
  itineraryId?: string
  activityId: string
  response: ClientActivityResponseType
  note?: string
}

/** Activity responses with a lookup map */
export interface ActivityResponsesSummaryDto {
  responses: ClientActivityResponseDto[]
  responseMap: Record<string, ClientActivityResponseType>
}

/** Full shared trip proposal (extends TripShareDto) */
export interface SharedTripProposalDto extends TripShareDto {
  pricingVisible: boolean
  currency: string
  /** @deprecated Use proposedItineraries instead */
  itinerary: SharedItineraryDto | null
  /** All proposing itineraries with published content */
  proposedItineraries: SharedItineraryDto[]
  agent: SharedAgentProfileDto | null
  primaryContactName: string | null
  /** @deprecated Each itinerary has its own publishedVersion */
  publishedVersion: number | null
  /** ID of the itinerary the client has selected */
  clientSelectedItineraryId: string | null
}

/** Client selects their preferred itinerary */
export interface SelectItineraryDto {
  itineraryId: string
}

/** Agent confirms client's selection */
export interface ConfirmSelectionDto {
  itineraryId: string
}

// ============================================================================
// ITINERARY VERSIONING DTOs
// ============================================================================

/** Summary of a published itinerary version (for version history list) */
export interface ItineraryVersionSummaryDto {
  id: string
  versionNumber: number
  changeSummary: string | null
  publishedByName: string | null
  publishedAt: string
}

/** Request body for publishing an itinerary version */
export interface PublishItineraryDto {
  changeSummary?: string
}

// ============================================================================
// TRIP GROUP SHARING DTOs
// ============================================================================

/**
 * Access level for trip group sharing
 */
export type TripGroupShareAccessLevel = 'read' | 'write'

/**
 * Source of a trip group share
 * - manual: User-created share
 * - auto_trip_owner: System-created when a trip owner's trip is added to the group
 */
export type TripGroupShareSource = 'manual' | 'auto_trip_owner'

/**
 * Create a trip group share
 */
export interface CreateTripGroupShareDto {
  sharedWithUserId: string
  accessLevel?: TripGroupShareAccessLevel
  notes?: string
}

/**
 * Update a trip group share
 */
export interface UpdateTripGroupShareDto {
  accessLevel?: TripGroupShareAccessLevel
  notes?: string
}

/**
 * Response DTO for trip group share
 */
export interface TripGroupShareResponseDto {
  id: string
  tripGroupId: string
  sharedWithUserId: string
  accessLevel: TripGroupShareAccessLevel
  sharedBy: string
  sharedAt: string
  notes: string | null
  source: TripGroupShareSource
  createdAt: string
  updatedAt: string
}
