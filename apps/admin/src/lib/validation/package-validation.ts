/**
 * Package Form Validation Schema
 *
 * Validation for Package activity type. Packages are containers that group
 * multiple activities with shared pricing/booking.
 *
 * Key concepts:
 * - Package = Activity Type (container)
 * - Booking = Status (not an entity)
 * - Each Package has its own Confirmation # and Group Booking #
 */

import { z } from 'zod'
import type {
  CreatePackageDto,
  UpdatePackageDto,
  PackageResponseDto,
  PackageStatus,
  PackagePaymentStatus,
} from '@tailfire/shared-types/api'

// ============================================================================
// Main Package Form Schema
// ============================================================================

export const packageFormSchema = z.object({
  // Core identification
  name: z.string().min(1, 'Package name is required').max(255),
  description: z.string().max(2000).optional().nullable(),

  // Confirmation details (Package has its own)
  confirmationNumber: z.string().max(255).optional().nullable(),
  groupBookingNumber: z.string().max(255).optional().nullable(),

  // Supplier
  supplierId: z.string().uuid().optional().nullable(),
  supplierName: z.string().max(255).optional().nullable(),

  // Proposal status (ActivityProposalStatus: draft, proposing, approved, cancelled)
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),
  paymentStatus: z.enum(['unpaid', 'deposit_paid', 'paid', 'refunded', 'partially_refunded']).default('unpaid'),

  // Pricing (Package-specific - flat_rate or per_person only)
  pricingType: z.enum(['flat_rate', 'per_person']).default('flat_rate'),
  totalPriceCents: z.number().int().nonnegative('Total price must be non-negative').default(0),
  taxesCents: z.number().int().nonnegative('Taxes must be non-negative').default(0),
  currency: z.string().length(3, 'Currency must be 3 characters').default('CAD'),

  // Commission
  commissionCents: z.number().int().nonnegative('Commission must be non-negative').optional().nullable(),
  commissionPercentage: z
    .number()
    .min(0, 'Commission percentage must be at least 0%')
    .max(100, 'Commission percentage cannot exceed 100%')
    .optional()
    .nullable(),

  // Policies
  cancellationPolicy: z.string().max(5000).optional().nullable(),
  cancellationDeadline: z.string().optional().nullable(), // ISO date string
  termsAndConditions: z.string().max(10000).optional().nullable(),

  // Notes
  notes: z.string().max(5000).optional().nullable(),

  // Linked activities (managed via separate API)
  linkedActivityIds: z.array(z.string().uuid()).default([]),
}).refine(
  (data) => {
    // Total price must be >= taxes
    if (data.taxesCents !== undefined && data.taxesCents !== null) {
      return data.totalPriceCents >= data.taxesCents
    }
    return true
  },
  {
    message: 'Total price must be greater than or equal to taxes',
    path: ['totalPriceCents'],
  }
)

export type PackageFormData = z.infer<typeof packageFormSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const PACKAGE_FORM_FIELDS = [
  'name',
  'description',
  'confirmationNumber',
  'groupBookingNumber',
  'supplierId',
  'supplierName',
  'status',
  'paymentStatus',
  'pricingType',
  'totalPriceCents',
  'taxesCents',
  'currency',
  'commissionCents',
  'commissionPercentage',
  'cancellationPolicy',
  'cancellationDeadline',
  'termsAndConditions',
  'notes',
  'linkedActivityIds',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Creates default form values from server data (PackageResponseDto)
 */
export function toPackageDefaults(
  serverData?: PackageResponseDto | null,
): PackageFormData {
  if (!serverData) {
    return {
      name: '',
      description: null,
      confirmationNumber: null,
      groupBookingNumber: null,
      supplierId: null,
      supplierName: null,
      proposalStatus: 'draft',
      paymentStatus: 'unpaid',
      pricingType: 'flat_rate',
      totalPriceCents: 0,
      taxesCents: 0,
      currency: 'CAD',
      commissionCents: null,
      commissionPercentage: null,
      cancellationPolicy: null,
      cancellationDeadline: null,
      termsAndConditions: null,
      notes: null,
      linkedActivityIds: [],
    }
  }

  // Package-specific fields are nested under packageDetails
  const details = serverData.packageDetails

  return {
    name: serverData.name,
    description: serverData.notes, // API uses 'notes' for description
    confirmationNumber: serverData.confirmationNumber,
    groupBookingNumber: details?.groupBookingNumber ?? null,
    supplierId: details?.supplierId ?? null,
    supplierName: details?.supplierName ?? null,
    proposalStatus: serverData.proposalStatus as 'draft' | 'proposing' | 'approved' | 'cancelled',
    paymentStatus: details?.paymentStatus ?? 'unpaid',
    pricingType: (details?.pricingType ?? 'flat_rate') as 'flat_rate' | 'per_person',
    // Read pricing from server response (activity_pricing table)
    totalPriceCents: serverData.pricing?.totalPriceCents ?? serverData.totalPriceCents ?? 0,
    taxesCents: serverData.pricing?.taxesAndFeesCents ?? 0,
    currency: serverData.pricing?.currency ?? serverData.currency ?? 'CAD',
    commissionCents: serverData.pricing?.commissionTotalCents ?? null,
    commissionPercentage: serverData.pricing?.commissionSplitPercentage ?? null,
    cancellationPolicy: details?.cancellationPolicy ?? null,
    cancellationDeadline: details?.cancellationDeadline ?? null,
    termsAndConditions: details?.termsAndConditions ?? null,
    notes: serverData.notes,
    linkedActivityIds: serverData.activities?.map(a => a.id) ?? [],
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Maps form data to CreatePackageDto for API
 * Includes pricing fields for activity_pricing persistence.
 */
export function toPackageApiPayload(
  data: PackageFormData,
  tripId: string,
): CreatePackageDto {
  return {
    tripId,
    name: data.name,
    confirmationNumber: data.confirmationNumber || null,
    supplierId: data.supplierId || null,
    supplierName: data.supplierName || null,
    proposalStatus: data.proposalStatus as PackageStatus,
    currency: data.currency,
    // Pricing fields
    totalPriceCents: data.totalPriceCents,
    taxesCents: data.taxesCents,
    pricingType: data.pricingType,
    commissionTotalCents: data.commissionCents ?? null,
    commissionSplitPercentage: data.commissionPercentage ?? null,
    paymentStatus: data.paymentStatus as PackagePaymentStatus,
    // Package-specific
    cancellationPolicy: data.cancellationPolicy || null,
    cancellationDeadline: data.cancellationDeadline || null,
    termsAndConditions: data.termsAndConditions || null,
    groupBookingNumber: data.groupBookingNumber || null,
    notes: data.notes || null,
    activityIds: data.linkedActivityIds,
  }
}

/**
 * Maps form data to UpdatePackageDto for API
 * Includes pricing fields for activity_pricing persistence.
 */
export function toPackageUpdatePayload(
  data: Partial<PackageFormData>,
): UpdatePackageDto {
  const payload: UpdatePackageDto = {}

  if (data.name !== undefined) payload.name = data.name
  if (data.confirmationNumber !== undefined) payload.confirmationNumber = data.confirmationNumber || null
  if (data.supplierId !== undefined) payload.supplierId = data.supplierId || null
  if (data.supplierName !== undefined) payload.supplierName = data.supplierName || null
  if (data.proposalStatus !== undefined) payload.proposalStatus = data.proposalStatus as PackageStatus
  if (data.paymentStatus !== undefined) payload.paymentStatus = data.paymentStatus as PackagePaymentStatus
  if (data.currency !== undefined) payload.currency = data.currency
  // Pricing fields
  if (data.totalPriceCents !== undefined) payload.totalPriceCents = data.totalPriceCents
  if (data.taxesCents !== undefined) payload.taxesCents = data.taxesCents
  if (data.pricingType !== undefined) payload.pricingType = data.pricingType
  if (data.commissionCents !== undefined) payload.commissionTotalCents = data.commissionCents
  if (data.commissionPercentage !== undefined) payload.commissionSplitPercentage = data.commissionPercentage
  // Package-specific
  if (data.cancellationPolicy !== undefined) payload.cancellationPolicy = data.cancellationPolicy || null
  if (data.cancellationDeadline !== undefined) payload.cancellationDeadline = data.cancellationDeadline || null
  if (data.termsAndConditions !== undefined) payload.termsAndConditions = data.termsAndConditions || null
  if (data.groupBookingNumber !== undefined) payload.groupBookingNumber = data.groupBookingNumber || null
  if (data.notes !== undefined) payload.notes = data.notes || null

  return payload
}

// ============================================================================
// Pricing Data Adapter
// ============================================================================

/**
 * Build PricingData object from PackageFormData
 * Used by PricingSection and CommissionSection components
 */
export function buildPackagePricingData(formData: PackageFormData) {
  return {
    invoiceType: 'individual_item' as const, // Package is the container, always individual
    pricingType: formData.pricingType as 'flat_rate' | 'per_person',
    totalPriceCents: formData.totalPriceCents,
    taxesAndFeesCents: formData.taxesCents,
    currency: formData.currency,
    commissionTotalCents: formData.commissionCents ?? undefined,
    commissionSplitPercentage: formData.commissionPercentage ?? undefined,
    commissionExpectedDate: null,
    termsAndConditions: formData.termsAndConditions ?? undefined,
    cancellationPolicy: formData.cancellationPolicy ?? undefined,
    confirmationNumber: formData.confirmationNumber ?? undefined,
    supplier: formData.supplierName ?? undefined,
  }
}
