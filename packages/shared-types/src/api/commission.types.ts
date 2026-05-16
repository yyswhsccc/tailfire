/**
 * Commission System Shared Types
 *
 * Response DTOs and filter types shared between API and frontend
 * for commission tracking, checks, and agent payouts.
 */

// ============================================================================
// ENUMS / CONSTANTS
// ============================================================================

export type CommissionCheckType = 'received' | 'paid'
export type CommissionCheckStatus = 'pending' | 'submitted' | 'accepted' | 'cancelled'

// ============================================================================
// CHECK RESPONSE DTOs
// ============================================================================

export interface CommissionCheckResponseDto {
  id: string
  agencyId: string
  checkNumber: string
  checkType: CommissionCheckType
  checkDate: string
  checkAmountCents: number
  currency: string
  senderName: string | null
  senderSupplierId: string | null
  recipientName: string | null
  recipientUserId: string | null
  status: CommissionCheckStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  items?: CommissionCheckItemResponseDto[]
  summary?: CommissionCheckSummaryDto
}

export interface CommissionCheckItemResponseDto {
  id: string
  checkId: string
  activityPricingId: string | null
  description: string | null
  projectedCents: number | null
  receivedParentCents: number
  receivedCents: number
  createdAt: string
}

export interface CommissionCheckSummaryDto {
  totalItemsCents: number
  totalAdjustmentsCents: number
  reconciledTotal: number
  unreconciledCents: number
}

// ============================================================================
// FILTER & PAGINATION DTOs
// ============================================================================

export interface CommissionCheckFilterDto {
  checkType?: CommissionCheckType
  status?: CommissionCheckStatus | CommissionCheckStatus[]
  dateFrom?: string
  dateTo?: string
  senderSupplierId?: string
  recipientUserId?: string
  page?: number
  limit?: number
}

export interface PaginatedCommissionChecksResponseDto {
  data: CommissionCheckResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// AGENT PAYOUT DTOs
// ============================================================================

export interface AgentCommissionDueDto {
  userId: string
  userName: string
  currency: string                  // ISO 4217, 3-letter (e.g. 'CAD', 'USD')
  bookingCount: number
  commissionDueCents: number
  adjustmentsCents: number
  totalDueCents: number
}

// ============================================================================
// DASHBOARD SUMMARY DTOs
// ============================================================================

export interface CommissionSummaryResponseDto {
  salesMtdCents: number
  salesYtdCents: number
  commissionReceivedMtdCents: number
  commissionReceivedYtdCents: number
}

// ============================================================================
// PENDING RECEIVABLES DTOs (Commission Receive Deposit)
// ============================================================================

export interface PendingReceivableDto {
  activityPricingId: string
  confirmationNumber: string | null
  bookingReference: string | null
  supplierName: string | null
  supplierId: string | null
  tripName: string
  tripId: string
  tripStartDate: string | null
  activityStartDate: string | null
  activityName: string
  passengerNames: string[]
  expectedCommissionCents: number
  commissionStatus: 'pending' | 'received' | 'cancelled' | null
  reconciliationDate: string | null
  reconciledBy: string | null
  agentName: string | null
}

export interface PendingReceivablesFilterDto {
  supplierId?: string
  search?: string
  departureDateFrom?: string
  departureDateTo?: string
  status?: 'pending' | 'all'
  page?: number
  limit?: number
}

export interface PendingReceivablesResponseDto {
  data: PendingReceivableDto[]
  filteredTotalCents: number
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// DEPOSIT DTOs (Commission Receive)
// ============================================================================

export interface CreateDepositDto {
  depositNumber: string
  depositDate: string
  totalAmountCents: number
  /** ISO 4217 three-letter currency code. Defaults to CAD on the server. */
  currency?: string
  supplierId?: string
  /**
   * Sender name as written on the check. Optional — when omitted, the
   * server falls back to supplier.name (if supplierId provided) or a
   * generic 'Supplier Deposit' label.
   */
  senderName?: string
  notes?: string
  fileUrl?: string
  fileName?: string
}

export interface AddDepositItemDto {
  activityPricingId: string
  receivedCents: number
  /**
   * Legacy field kept for backwards compatibility with the deposit UI. Maps
   * to commission_tracking.tax_amount_cents (slated for removal once
   * rollup columns drop). Prefer the PR-1 embedded_tax_* fields below.
   */
  taxCents?: number
  /**
   * PR-1 tax-on-commission fields. When omitted, the server derives them
   * from the supplier's commission_includes_tax + default_commission_*
   * settings via computeEmbeddedTaxFromInclusive. Caller wins.
   */
  embeddedTaxCents?: number
  embeddedTaxType?: string | null
  embeddedTaxRatePercent?: number | null
}

export interface FinalizeDepositDto {
  items: AddDepositItemDto[]
  unreconciled?: { description: string; amountCents: number }[]
}

export interface DepositDetailResponseDto extends CommissionCheckResponseDto {
  reconciliationDate: string | null
  reconciledBy: string | null
  accountingTransactionId: string | null
  fileUrl: string | null
  fileName: string | null
}
