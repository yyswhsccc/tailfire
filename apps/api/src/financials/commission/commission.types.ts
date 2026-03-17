/**
 * Commission System DTOs
 *
 * Request/response types for:
 * - Commission checks (received from suppliers, paid to agents)
 * - Commission check items (bookings reconciled to checks)
 * - Commission adjustments (taxes, corrections)
 * - Per-activity commission tracking
 * - Commission summary (dashboard)
 * - Agent payout calculation
 */

// ============================================================================
// ENUMS / CONSTANTS
// ============================================================================

export const COMMISSION_CHECK_TYPES = ['received', 'paid'] as const
export type CommissionCheckType = (typeof COMMISSION_CHECK_TYPES)[number]

export const COMMISSION_CHECK_STATUSES = ['pending', 'submitted', 'accepted', 'cancelled'] as const
export type CommissionCheckStatus = (typeof COMMISSION_CHECK_STATUSES)[number]

export const COMMISSION_ADJUSTMENT_TYPES = ['agent', 'company', 'backend'] as const
export type CommissionAdjustmentType = (typeof COMMISSION_ADJUSTMENT_TYPES)[number]

export const COMMISSION_ADJUSTMENT_STATUSES = ['pending', 'reconciled'] as const
export type CommissionAdjustmentStatus = (typeof COMMISSION_ADJUSTMENT_STATUSES)[number]

// Valid status transitions for checks
export const VALID_CHECK_TRANSITIONS: Record<CommissionCheckStatus, CommissionCheckStatus[]> = {
  pending: ['submitted', 'cancelled'],
  submitted: ['accepted', 'cancelled'],
  accepted: [], // Use recall endpoint to re-open
  cancelled: [],
}

// ============================================================================
// CHECK DTOs
// ============================================================================

export interface CreateCommissionCheckDto {
  checkNumber: string
  checkType: CommissionCheckType
  checkDate: string // ISO date
  checkAmountCents: number
  currency?: string // Default: CAD
  senderName?: string
  senderSupplierId?: string
  recipientName?: string
  recipientUserId?: string
  groupCheck?: boolean
  parentCheckId?: string
  payrollId?: string
  notes?: string
  source?: string
  sourceRef?: string
}

export interface UpdateCommissionCheckDto {
  checkNumber?: string
  checkDate?: string
  checkAmountCents?: number
  currency?: string
  senderName?: string
  senderSupplierId?: string
  recipientName?: string
  recipientUserId?: string
  payrollId?: string
  notes?: string
  status?: CommissionCheckStatus
}

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
  groupCheck: boolean
  parentCheckId: string | null
  payrollId: string | null
  notes: string | null
  source: string | null
  sourceRef: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  // Populated on detail view
  items?: CommissionCheckItemResponseDto[]
  adjustments?: CommissionAdjustmentResponseDto[]
  summary?: CommissionCheckSummaryDto
}

export interface CommissionCheckSummaryDto {
  totalItemsCents: number
  totalAdjustmentsCents: number
  reconciledTotal: number
  unreconciledCents: number
}

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
// CHECK ITEM DTOs
// ============================================================================

export interface AddCheckItemDto {
  activityPricingId: string
  projectedCents?: number
  receivedParentCents?: number
  receivedCents?: number
}

export interface CommissionCheckItemResponseDto {
  id: string
  checkId: string
  activityPricingId: string
  projectedCents: number | null
  receivedParentCents: number
  receivedCents: number
  createdAt: string
  updatedAt: string
}

// ============================================================================
// ADJUSTMENT DTOs
// ============================================================================

export interface CreateCommissionAdjustmentDto {
  checkId?: string
  description: string
  amountCents: number
  adjustmentType: CommissionAdjustmentType
  taxType?: string // 'GST', 'HST', 'VAT'
  taxRate?: number // e.g., 13.00 for 13%
  agentUserId?: string
  companyName?: string
  source?: string
  sourceRef?: string
}

export interface UpdateCommissionAdjustmentDto {
  description?: string
  amountCents?: number
  adjustmentType?: CommissionAdjustmentType
  taxType?: string
  taxRate?: number
  agentUserId?: string
  companyName?: string
}

export interface CommissionAdjustmentResponseDto {
  id: string
  checkId: string | null
  agencyId: string
  description: string
  amountCents: number
  adjustmentType: CommissionAdjustmentType
  taxType: string | null
  taxRate: string | null
  agentUserId: string | null
  companyName: string | null
  status: CommissionAdjustmentStatus
  source: string | null
  sourceRef: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CommissionAdjustmentFilterDto {
  checkId?: string
  adjustmentType?: CommissionAdjustmentType
  status?: CommissionAdjustmentStatus
  page?: number
  limit?: number
}

export interface PaginatedCommissionAdjustmentsResponseDto {
  data: CommissionAdjustmentResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// PER-ACTIVITY COMMISSION DTOs
// ============================================================================

export interface UpsertActivityCommissionDto {
  grossCommissionCents: number
  taxAmountCents?: number
  taxType?: string
  commissionRate?: number // Percentage
  source?: string
  sourceBookingRef?: string
}

export interface UpdateActivityCommissionDto {
  receivedCents?: number
  paidCents?: number
  adjustmentCents?: number
  receivedParentCents?: number
  platformFeeCents?: number
  commissionStatus?: 'pending' | 'received' | 'cancelled'
}

export interface ActivityCommissionResponseDto {
  id: string
  activityPricingId: string
  commissionRate: string | null
  commissionAmount: string
  commissionStatus: string
  grossCommissionCents: number | null
  taxAmountCents: number
  taxType: string | null
  netCommissionCents: number | null
  receivedCents: number
  paidCents: number
  adjustmentCents: number
  receivedParentCents: number
  platformFeeCents: number
  source: string | null
  sourceBookingRef: string | null
  createdAt: string
  updatedAt: string
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

export interface PayAgentDto {
  userIds: string[]
  checkDate?: string // Default: today
  checkNumberPrefix?: string
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
// PENDING RECEIVABLES DTOs (Commission Receive Deposit UI)
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
// DEPOSIT DTOs (Supplier Commission Deposit Flow)
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
