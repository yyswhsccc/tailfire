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
  activityPricingId: string
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
