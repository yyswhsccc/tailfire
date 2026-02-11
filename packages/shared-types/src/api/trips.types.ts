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
  status?: 'inbound' | 'draft' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled'

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
  status?: 'inbound' | 'draft' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled'
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
  status?: 'inbound' | 'draft' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled'
  tripType?: 'leisure' | 'business' | 'group' | 'honeymoon' | 'corporate' | 'custom'
  ownerId?: string // Filter by owner
  primaryContactId?: string // Filter by primary contact
  isArchived?: boolean
  isPublished?: boolean
  tags?: string[] // Match any of these tags
  tripGroupId?: string // Filter by trip group

  // Date filters
  startDateFrom?: string
  startDateTo?: string
  endDateFrom?: string
  endDateTo?: string

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
  coverPhotoUrl: string | null // URL of the trip's cover photo
  shareToken: string | null
  tripGroupId: string | null
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
  status: 'inbound' | 'draft' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled'
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

/** Trip group (collection/folder) */
export interface TripGroupDto {
  id: string
  agencyId: string
  name: string
  description: string | null
  tripCount?: number
  createdAt: string
  updatedAt: string
}

/** Update trip group */
export interface UpdateTripGroupApiDto {
  name?: string
  description?: string
}

/** Minimal trip data for group member listing */
export interface TripGroupTripDto {
  id: string
  name: string
  status: string
  startDate: string | null
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

// ============================================================================
// CANCELLATION
// ============================================================================

/**
 * Cancel a trip with optional reason
 */
export interface CancelTripDto {
  reason?: string // Optional cancellation reason
}
