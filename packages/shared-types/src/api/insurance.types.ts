/**
 * Insurance API Types
 *
 * Trip insurance packages and per-traveler coverage tracking.
 * Shared between API (NestJS) and client (React/Next.js).
 */

// =============================================================================
// Enum Types (matching database enums)
// =============================================================================

export type InsurancePolicyType =
  | 'trip_cancellation'
  | 'medical'
  | 'comprehensive'
  | 'evacuation'
  | 'baggage'
  | 'other'

export type TravelerInsuranceStatus =
  | 'pending'
  | 'has_own_insurance'
  | 'declined'
  | 'selected_package'

// =============================================================================
// Insurance Package DTOs
// =============================================================================

/**
 * Insurance package (read response)
 */
export type TripInsurancePackageDto = {
  id: string
  tripId: string
  providerName: string
  packageName: string
  policyType: InsurancePolicyType
  coverageAmountCents: number | null
  premiumCents: number
  deductibleCents: number | null
  currency: string
  coverageStartDate: string | null // ISO date string
  coverageEndDate: string | null // ISO date string
  coverageDetails: Record<string, unknown> | null
  termsUrl: string | null
  isFromCatalog: boolean
  displayOrder: number
  activityId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Create insurance package
 */
export type CreateTripInsurancePackageDto = {
  providerName: string
  packageName: string
  policyType: InsurancePolicyType
  coverageAmountCents?: number | null
  premiumCents: number
  deductibleCents?: number | null
  currency?: string // Defaults to CAD
  coverageStartDate?: string | null
  coverageEndDate?: string | null
  coverageDetails?: Record<string, unknown> | null
  termsUrl?: string | null
  activityId?: string | null
  isFromCatalog?: boolean
  displayOrder?: number
  isActive?: boolean
}

/**
 * Update insurance package
 */
export type UpdateTripInsurancePackageDto = {
  providerName?: string
  packageName?: string
  policyType?: InsurancePolicyType
  coverageAmountCents?: number | null
  premiumCents?: number
  deductibleCents?: number | null
  currency?: string
  coverageStartDate?: string | null
  coverageEndDate?: string | null
  coverageDetails?: Record<string, unknown> | null
  termsUrl?: string | null
  activityId?: string | null
  isFromCatalog?: boolean
  displayOrder?: number
  isActive?: boolean
}

// =============================================================================
// Traveler Insurance DTOs
// =============================================================================

/**
 * Traveler insurance status (read response)
 */
export type TripTravelerInsuranceDto = {
  id: string
  tripId: string
  tripTravelerId: string
  status: TravelerInsuranceStatus

  // Selected package info (when status = 'selected_package')
  selectedPackageId: string | null
  selectedPackage?: TripInsurancePackageDto | null

  // External insurance info (when status = 'has_own_insurance')
  externalPolicyNumber: string | null
  externalProviderName: string | null
  externalCoverageDetails: string | null

  // Declined info (when status = 'declined')
  declinedReason: string | null
  declinedAt: string | null
  acknowledgedAt: string | null

  // Payment tracking
  premiumPaidCents: number | null
  policyNumber: string | null

  notes: string | null
  createdAt: string
  updatedAt: string

  // Populated traveler info (optional)
  traveler?: {
    id: string
    contactSnapshot?: {
      firstName?: string
      lastName?: string
    } | null
  }
}

/**
 * Create traveler insurance record
 */
export type CreateTripTravelerInsuranceDto = {
  tripTravelerId: string
  status?: TravelerInsuranceStatus
  selectedPackageId?: string | null
  externalPolicyNumber?: string | null
  externalProviderName?: string | null
  externalCoverageDetails?: string | null
  declinedReason?: string | null
  notes?: string | null
}

/**
 * Update traveler insurance status
 *
 * Status-specific required fields:
 * - selected_package: selectedPackageId REQUIRED
 * - has_own_insurance: externalPolicyNumber or externalProviderName REQUIRED
 * - declined: acknowledgedAt is auto-set (compliance)
 */
export type UpdateTripTravelerInsuranceDto = {
  status?: TravelerInsuranceStatus
  selectedPackageId?: string | null
  externalPolicyNumber?: string | null
  externalProviderName?: string | null
  externalCoverageDetails?: string | null
  declinedReason?: string | null
  premiumPaidCents?: number | null
  policyNumber?: string | null
  notes?: string | null
}

// =============================================================================
// List and Summary Response Types
// =============================================================================

/**
 * List of insurance packages for a trip
 */
export type TripInsurancePackagesListDto = {
  packages: TripInsurancePackageDto[]
  tripId: string
}

/**
 * List of traveler insurance records for a trip
 */
export type TripTravelersInsuranceListDto = {
  travelers: TripTravelerInsuranceDto[]
  tripId: string
  summary: {
    total: number
    pending: number
    hasOwnInsurance: number
    declined: number
    selectedPackage: number
  }
}

/**
 * Coverage details structure (optional, for structured data)
 */
export type InsuranceCoverageDetails = {
  medicalCoverageCents?: number
  evacuationCoverageCents?: number
  baggageCoverageCents?: number
  tripCancellationCoverageCents?: number
  tripInterruptionCoverageCents?: number
  preExistingConditionsCovered?: boolean
  adventureSportsCovered?: boolean
  cancellationReasons?: string[]
  additionalBenefits?: string[]
  exclusions?: string[]
}
