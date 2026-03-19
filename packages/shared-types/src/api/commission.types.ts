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
  supplierId?: string
  notes?: string
  fileUrl?: string
  fileName?: string
}

export interface AddDepositItemDto {
  activityPricingId: string
  receivedCents: number
  taxCents?: number
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
