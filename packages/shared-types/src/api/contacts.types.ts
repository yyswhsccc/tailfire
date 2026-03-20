/**
 * Contact API DTOs
 *
 * These types define the API contract for Contact-related operations.
 * Used by NestJS controllers for request validation and response serialization.
 */

import type { BaseFilterDto } from './common.types'

// Import types for reference (currently unused but may be needed in the future)
// import type { Contact, ContactInsert} from '../database'

// ============================================================================
// CREATE DTOs
// ============================================================================

export interface CreateContactDto {
  // Name fields (at least one required, validated server-side)
  firstName?: string
  lastName?: string
  legalFirstName?: string
  legalLastName?: string
  middleName?: string
  preferredName?: string
  prefix?: string // 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Mx.'
  suffix?: string // 'Jr.', 'Sr.', 'III', 'PhD'

  // LGBTQ+ inclusive (all optional)
  gender?: string // 'male', 'female', 'non-binary', 'prefer_not_to_say'
  pronouns?: string // 'she/her', 'he/him', 'they/them', 'ze/zir'
  maritalStatus?: string // 'single', 'married', 'domestic_partnership', etc.

  // Optional contact info
  email?: string
  phone?: string

  // Optional personal info
  dateOfBirth?: string // ISO date string

  // Passport info
  passportNumber?: string
  passportExpiry?: string // ISO date string
  passportCountry?: string // ISO 3166-1 alpha-3
  passportIssueDate?: string // ISO date string
  nationality?: string // ISO 3166-1 alpha-3

  // TSA Credentials
  redressNumber?: string
  knownTravelerNumber?: string

  // Optional address
  addressLine1?: string
  addressLine2?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string // ISO 3166-1 alpha-3

  // Optional requirements
  dietaryRequirements?: string
  mobilityRequirements?: string

  // Travel preferences
  seatPreference?: string // 'aisle', 'window', 'middle', 'no_preference'
  cabinPreference?: string // 'economy', 'premium_economy', 'business', 'first'
  floorPreference?: string // 'high', 'low', 'no_preference'
  travelPreferences?: string // JSONB

  // Lifecycle (optional on create, defaults applied)
  contactType?: 'lead' | 'client' // Defaults to 'lead'
  contactStatus?: 'prospecting' | 'quoted' | 'booked' | 'traveling' | 'returned' | 'awaiting_next' | 'inactive'
  becameClientAt?: string // ISO timestamp, required when contactType is 'client'

  // Marketing consent (optional on create, defaults to false)
  marketingEmailOptIn?: boolean
  marketingSmsOptIn?: boolean
  marketingPhoneOptIn?: boolean
  marketingOptInSource?: string

  // Optional metadata
  tags?: string[]

  // Date/Time Management (Phase 3.5)
  timezone?: string // IANA timezone identifier (e.g., 'America/Toronto')
}

export interface CreateContactRelationshipDto {
  contactId2: string // UUID of the second contact
  labelForContact1?: string // e.g., "spouse", "parent"
  labelForContact2?: string // e.g., "spouse", "child"
  category?: RelationshipCategory
  customLabel?: string
  notes?: string
}

export interface CreateContactGroupDto {
  name: string
  groupType: 'family' | 'corporate' | 'wedding' | 'friends' | 'custom'
  description?: string
  primaryContactId?: string // UUID
  tags?: string[]
}

export interface AddContactToGroupDto {
  contactId: string // UUID
  role?: string
  notes?: string
}

// ============================================================================
// UPDATE DTOs
// ============================================================================

export interface UpdateContactDto {
  // All fields optional for partial updates
  // Name fields
  firstName?: string
  lastName?: string
  legalFirstName?: string
  legalLastName?: string
  middleName?: string
  preferredName?: string
  prefix?: string
  suffix?: string

  // LGBTQ+ inclusive
  gender?: string
  pronouns?: string
  maritalStatus?: string

  // Contact info
  email?: string
  phone?: string
  dateOfBirth?: string

  // Passport
  passportNumber?: string
  passportExpiry?: string
  passportCountry?: string
  passportIssueDate?: string
  nationality?: string

  // TSA
  redressNumber?: string
  knownTravelerNumber?: string

  // Address
  addressLine1?: string
  addressLine2?: string
  city?: string
  province?: string
  postalCode?: string
  country?: string

  // Requirements
  dietaryRequirements?: string
  mobilityRequirements?: string

  // Travel preferences
  seatPreference?: string
  cabinPreference?: string
  floorPreference?: string
  travelPreferences?: string

  // Lifecycle (use specific endpoints for type/status changes)
  contactType?: 'lead' | 'client'
  contactStatus?: 'prospecting' | 'quoted' | 'booked' | 'traveling' | 'returned' | 'awaiting_next' | 'inactive'
  firstBookingDate?: string
  lastTripReturnDate?: string

  // Marketing consent (use marketing-consent endpoint instead)
  marketingEmailOptIn?: boolean
  marketingSmsOptIn?: boolean
  marketingPhoneOptIn?: boolean
  marketingOptInSource?: string
  marketingOptOutReason?: string

  // Metadata
  tags?: string[]
  isActive?: boolean

  // Date/Time Management (Phase 3.5)
  timezone?: string // IANA timezone identifier (e.g., 'America/Toronto')
}

export interface UpdateContactRelationshipDto {
  labelForContact1?: string
  labelForContact2?: string
  category?: RelationshipCategory
  customLabel?: string
  notes?: string
}

export interface UpdateContactGroupDto {
  name?: string
  groupType?: 'family' | 'corporate' | 'wedding' | 'friends' | 'custom'
  description?: string
  primaryContactId?: string
  tags?: string[]
  isActive?: boolean
}

export interface UpdateContactGroupMemberDto {
  role?: string
  notes?: string
}

// New DTOs for Phase 2 & 3 endpoints
export interface UpdateContactStatusDto {
  status: 'prospecting' | 'quoted' | 'booked' | 'traveling' | 'returned' | 'awaiting_next' | 'inactive'
}

export interface UpdateMarketingConsentDto {
  email?: boolean
  sms?: boolean
  phone?: boolean
  source?: string // Required when opting in
  optOutReason?: string // Optional when opting out
}

// ============================================================================
// FILTER/QUERY DTOs
// ============================================================================

export interface ContactFilterDto {
  // Pagination
  page?: number
  limit?: number

  // Search
  search?: string // Full-text search across name, email, phone

  // Filters
  isActive?: boolean
  tags?: string[] // Match any of these tags
  hasPassport?: boolean
  passportExpiring?: boolean // Within 6 months

  // Sorting
  sortBy?: 'firstName' | 'lastName' | 'email' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

// Relationship category type for reuse
export type RelationshipCategory = 'family' | 'business' | 'travel_companions' | 'group' | 'other' | 'custom'

export interface ContactRelationshipFilterDto {
  contactId?: string // Filter relationships for a specific contact
  category?: RelationshipCategory
}

export interface ContactGroupFilterDto extends BaseFilterDto {
  groupType?: 'family' | 'corporate' | 'wedding' | 'friends' | 'custom'
  isActive?: boolean
  sortBy?: 'name' | 'createdAt' | 'updatedAt'
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export interface ContactResponseDto {
  id: string
  agencyId: string | null // Nullable - single agency model
  ownerId: string | null // NULL = agency-wide contact, non-NULL = user-owned
  // branchId: string | null // Phase 2 - Multi-branch support (not yet in schema)

  // Name fields
  firstName: string | null
  lastName: string | null
  legalFirstName: string | null
  legalLastName: string | null
  middleName: string | null
  preferredName: string | null
  prefix: string | null
  suffix: string | null

  // Computed display names (server-side)
  displayName: string // preferredName ?? firstName ?? legalFirstName ?? 'Unknown'
  legalFullName: string | null // Full legal name for documents

  // LGBTQ+ inclusive
  gender: string | null
  pronouns: string | null
  maritalStatus: string | null

  // Contact info
  email: string | null
  phone: string | null
  dateOfBirth: string | null

  // Passport
  passportNumber: string | null
  passportExpiry: string | null
  passportCountry: string | null
  passportIssueDate: string | null
  nationality: string | null

  // TSA Credentials
  redressNumber: string | null
  knownTravelerNumber: string | null

  // Address
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  country: string | null

  // Requirements
  dietaryRequirements: string | null
  mobilityRequirements: string | null

  // Travel preferences
  seatPreference: string | null
  cabinPreference: string | null
  floorPreference: string | null
  travelPreferences: string | null

  // Lifecycle & Status
  contactType: 'lead' | 'client'
  contactStatus: 'prospecting' | 'quoted' | 'booked' | 'traveling' | 'returned' | 'awaiting_next' | 'inactive'
  becameClientAt: string | null
  firstBookingDate: string | null
  lastTripReturnDate: string | null

  // Marketing Consent
  marketingEmailOptIn: boolean
  marketingEmailOptInAt: string | null
  marketingSmsOptIn: boolean
  marketingSmsOptInAt: string | null
  marketingPhoneOptIn: boolean
  marketingPhoneOptInAt: string | null
  marketingOptInSource: string | null
  marketingOptOutAt: string | null
  marketingOptOutReason: string | null

  // Trust balances
  trustBalanceCad: string | null // Decimal as string
  trustBalanceUsd: string | null // Decimal as string

  // Metadata
  tags: string[]
  isActive: boolean

  // Date/Time Management (Phase 3.5)
  timezone: string | null // IANA timezone identifier (e.g., 'America/Toronto')

  // Photo
  photoUrl: string | null

  // Portal
  portalUserId: string | null
  portalStatus: 'not_invited' | 'pending' | 'active' // computed
  portalInvitedAt: string | null

  // Audit
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp

  // Access level indicator (set by ContactAccessService.applyAccessControl)
  _accessLevel?: 'basic' | 'full'
}

export interface ContactWithRelationshipsResponseDto extends ContactResponseDto {
  relationships: ContactRelationshipResponseDto[]
  groups: ContactGroupResponseDto[]
}

export interface ContactRelationshipResponseDto {
  id: string
  contactId1: string
  contactId2: string
  labelForContact1: string | null
  labelForContact2: string | null
  category: string
  customLabel: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  // Populated contact data
  relatedContact?: ContactResponseDto
}

export interface ContactGroupResponseDto {
  id: string
  agencyId: string | null // Nullable - single agency model
  // branchId: string | null // Phase 2 - Multi-branch support (not yet in schema)
  name: string
  groupType: string
  description: string | null
  primaryContactId: string | null
  tags: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Member count
  memberCount?: number
}

export interface ContactGroupWithMembersResponseDto extends ContactGroupResponseDto {
  members: ContactGroupMemberResponseDto[]
}

export interface ContactGroupMemberResponseDto {
  id: string
  groupId: string
  contactId: string
  role: string | null
  notes: string | null
  joinedAt: string
  // Populated contact data
  contact?: ContactResponseDto
}

// ============================================================================
// LOYALTY PROGRAM DTOs
// ============================================================================

export interface LoyaltyProgramDto {
  id: string
  contactId: string
  programName: string
  providerName: string
  membershipNumber: string
  tierLevel: string | null
  notes: string | null
  loyaltyProgramId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ============================================================================
// PAGINATED RESPONSE
// ============================================================================

export interface PaginatedContactsResponseDto {
  data: ContactResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PaginatedContactGroupsResponseDto {
  data: ContactGroupResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// CONTACT SHARING DTOs
// ============================================================================

/**
 * Access level for contact sharing
 * - basic: Name, email, phone, address only (limited view)
 * - full: All fields including sensitive data (passport, DOB, marketing, etc.)
 */
export type ContactShareAccessLevel = 'basic' | 'full'

/**
 * Create a contact share
 */
export interface CreateContactShareDto {
  sharedWithUserId: string
  accessLevel?: ContactShareAccessLevel // Defaults to 'basic'
  notes?: string
}

/**
 * Update a contact share
 */
export interface UpdateContactShareDto {
  accessLevel?: ContactShareAccessLevel
  notes?: string
}

/**
 * Response DTO for contact share
 */
export interface ContactShareResponseDto {
  id: string
  contactId: string
  sharedWithUserId: string
  accessLevel: ContactShareAccessLevel
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
 * Re-assign contact ownership (Admin only)
 */
export interface UpdateContactOwnerDto {
  ownerId: string | null // null = agency-wide contact
}

// ============================================================================
// PORTAL DTOs
// ============================================================================

export interface PortalInviteResponseDto {
  contactId: string
  portalUserId: string
  email: string
  inviteSent: boolean
}
