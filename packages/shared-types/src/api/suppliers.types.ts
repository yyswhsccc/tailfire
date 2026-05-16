/**
 * Suppliers API Types
 *
 * TypeScript definitions for supplier management endpoints.
 * Shared between API (NestJS) and client (React/Next.js).
 */

// =============================================================================
// Contact Information
// =============================================================================

/**
 * Supplier contact information stored as JSONB
 */
export interface SupplierContactInfo {
  email?: string
  phone?: string
  website?: string
  address?: string
}

// =============================================================================
// Response DTOs
// =============================================================================

/**
 * Supplier Response DTO
 * Represents a supplier in the system
 */
export interface SupplierDto {
  id: string
  name: string
  legalName: string | null
  supplierType: string | null
  contactInfo: SupplierContactInfo | null
  defaultCommissionRate: string | null
  /**
   * PR-1 tax-on-commission defaults. When `commissionIncludesTax` is true,
   * the deposit finalize flow derives embedded_tax_cents per check item via
   *   embedded_tax = gross × rate / (100 + rate)
   * (computeEmbeddedTaxFromInclusive in commission-formula.ts). When false,
   * received_cents on the check item is treated as tax-exclusive.
   */
  defaultCommissionTaxType: string | null
  defaultCommissionTaxRatePercent: string | null
  commissionIncludesTax: boolean
  isActive: boolean
  isPreferred: boolean
  notes: string | null
  defaultTermsAndConditions: string | null
  defaultCancellationPolicy: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Supplier List Response DTO
 * Paginated list of suppliers
 */
export interface SupplierListResponseDto {
  suppliers: SupplierDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// =============================================================================
// Request DTOs
// =============================================================================

/**
 * Create Supplier DTO
 */
export interface CreateSupplierDto {
  name: string
  legalName?: string
  supplierType?: string
  contactInfo?: SupplierContactInfo
  defaultCommissionRate?: string
  // PR-2 commit 7: commission-tax defaults (PR-1 schema fields).
  defaultCommissionTaxType?: string | null
  defaultCommissionTaxRatePercent?: string | null
  commissionIncludesTax?: boolean
  isActive?: boolean
  isPreferred?: boolean
  notes?: string
  defaultTermsAndConditions?: string
  defaultCancellationPolicy?: string
}

/**
 * Update Supplier DTO
 */
export interface UpdateSupplierDto {
  name?: string
  legalName?: string
  supplierType?: string
  contactInfo?: SupplierContactInfo
  defaultCommissionRate?: string
  // PR-2 commit 7: commission-tax defaults (PR-1 schema fields).
  defaultCommissionTaxType?: string | null
  defaultCommissionTaxRatePercent?: string | null
  commissionIncludesTax?: boolean
  isActive?: boolean
  isPreferred?: boolean
  notes?: string
  defaultTermsAndConditions?: string
  defaultCancellationPolicy?: string
}

/**
 * List Suppliers Query Params DTO
 */
export interface ListSuppliersParamsDto {
  /** Search by name */
  search?: string
  /** Filter by supplier type */
  supplierType?: string
  /** Filter by active status */
  isActive?: boolean
  /** Page number (1-based) */
  page?: number
  /** Items per page */
  limit?: number
}

// =============================================================================
// Supplier Types Constants
// =============================================================================

/**
 * Common supplier types
 */
export const SUPPLIER_TYPES = [
  'hotel',
  'airline',
  'tour_operator',
  'cruise_line',
  'transfer',
  'restaurant',
  'activity_provider',
  'insurance',
  'other',
] as const

export type SupplierType = (typeof SUPPLIER_TYPES)[number]
