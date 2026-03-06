/**
 * Payment Schedules API Types
 *
 * Activity-level payment schedule types for managing deposits, installments, and expected payments.
 * Shared between API (NestJS) and client (React/Next.js).
 *
 * Note: The canonical field name is "activityPricingId". The database column is still
 * named "component_pricing_id" (snake_case convention) but all TypeScript/API code
 * uses activityPricingId exclusively.
 */

import type { ActivityType } from './activities.types'

// =============================================================================
// Enum Types (matching database enums)
// =============================================================================

export type ScheduleType = 'full' | 'deposit' | 'installments' | 'guarantee'
export type DepositType = 'percentage' | 'fixed_amount'
export type ExpectedPaymentStatus = 'pending' | 'partial' | 'paid' | 'overdue'
export type PaymentTransactionType = 'payment' | 'refund' | 'adjustment'
export type PaymentMethod = 'cash' | 'check' | 'credit_card' | 'bank_transfer' | 'stripe' | 'other'
export type CommissionStatus = 'pending' | 'received' | 'cancelled'

// =============================================================================
// Expected Payment Item DTOs
// =============================================================================

/**
 * Expected payment item (read response)
 */
export type ExpectedPaymentItemDto = {
  id: string
  paymentScheduleConfigId: string
  paymentName: string
  expectedAmountCents: number
  dueDate: string | null // ISO date string
  status: ExpectedPaymentStatus
  sequenceOrder: number
  paidAmountCents: number
  contactId: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Create expected payment item
 */
export type CreateExpectedPaymentItemDto = {
  paymentName: string
  expectedAmountCents: number
  dueDate?: string | null // ISO date string
  sequenceOrder: number
}

/**
 * Update expected payment item
 */
export type UpdateExpectedPaymentItemDto = {
  paymentName?: string
  expectedAmountCents?: number
  dueDate?: string | null
  status?: ExpectedPaymentStatus
  sequenceOrder?: number
  paidAmountCents?: number
  contactId?: string | null
}

// =============================================================================
// Payment Schedule Config DTOs
// =============================================================================

/**
 * Payment schedule configuration (read response)
 */
export type PaymentScheduleConfigDto = {
  id: string
  /** Activity pricing ID. References component_pricing.id (DB column: component_pricing_id). */
  activityPricingId: string
  /** Traveler booking ID. When set, this schedule is for a specific traveler booking. */
  travelerBookingId: string | null
  scheduleType: ScheduleType
  allowPartialPayments: boolean
  depositType: DepositType | null
  depositPercentage: string | null // numeric(5,2) as string
  depositAmountCents: number | null
  createdAt: string
  updatedAt: string

  // Related expected payment items
  expectedPaymentItems?: ExpectedPaymentItemDto[]

  // Credit card guarantee (when scheduleType = 'guarantee')
  creditCardGuarantee?: CreditCardGuaranteeDto | null
}

/**
 * Create payment schedule configuration
 */
export type CreatePaymentScheduleConfigDto = {
  /** Activity pricing ID. References component_pricing.id (DB column: component_pricing_id). */
  activityPricingId: string
  /** Traveler booking ID. When set, creates a per-traveler schedule. */
  travelerBookingId?: string | null
  scheduleType: ScheduleType
  allowPartialPayments?: boolean

  // Deposit settings (required when scheduleType = 'deposit')
  depositType?: DepositType | null
  depositPercentage?: number | null
  depositAmountCents?: number | null

  // Expected payment items to create
  expectedPaymentItems?: CreateExpectedPaymentItemDto[]

  // Credit card guarantee (required when scheduleType = 'guarantee')
  creditCardGuarantee?: CreateCreditCardGuaranteeDto | null
}

/**
 * Update payment schedule configuration
 */
export type UpdatePaymentScheduleConfigDto = {
  scheduleType?: ScheduleType
  allowPartialPayments?: boolean
  depositType?: DepositType | null
  depositPercentage?: number | null
  depositAmountCents?: number | null

  // Expected payment items to update/create
  expectedPaymentItems?: {
    id?: string // If provided, updates existing item; otherwise creates new
    paymentName: string
    expectedAmountCents: number
    dueDate?: string | null
    sequenceOrder: number
  }[]

  // Credit card guarantee
  creditCardGuarantee?: UpdateCreditCardGuaranteeDto | null
}

// =============================================================================
// Credit Card Guarantee DTOs
// =============================================================================

/**
 * Credit card guarantee/authorization (read response)
 * Used when scheduleType = 'guarantee' to store credit card authorization details
 */
export type CreditCardGuaranteeDto = {
  id: string
  paymentScheduleConfigId: string
  cardHolderName: string
  cardLast4: string // Last 4 digits only (PCI compliance)
  authorizationCode: string
  authorizationDate: string // ISO timestamp
  authorizationAmountCents: number
  createdAt: string
  updatedAt: string
}

/**
 * Create credit card guarantee
 */
export type CreateCreditCardGuaranteeDto = {
  paymentScheduleConfigId: string
  cardHolderName: string
  cardLast4: string
  authorizationCode: string
  authorizationDate: string // ISO timestamp
  authorizationAmountCents: number
}

/**
 * Update credit card guarantee
 */
export type UpdateCreditCardGuaranteeDto = {
  cardHolderName?: string
  cardLast4?: string
  authorizationCode?: string
  authorizationDate?: string
  authorizationAmountCents?: number
}

// =============================================================================
// Helper Types for Calculations
// =============================================================================

/**
 * Deposit calculation result
 */
export type DepositCalculation = {
  depositAmountCents: number
  remainingAmountCents: number
  totalAmountCents: number
}

/**
 * Installment calculation result
 */
export type InstallmentCalculation = {
  installments: {
    paymentName: string
    expectedAmountCents: number
    sequenceOrder: number
  }[]
  totalAmountCents: number
}

// =============================================================================
// Payment Transaction DTOs
// =============================================================================

/**
 * Payment transaction (read response)
 * Records actual payments, refunds, or adjustments against expected payment items
 */
export type PaymentTransactionDto = {
  id: string
  expectedPaymentItemId: string
  transactionType: PaymentTransactionType
  amountCents: number
  currency: string
  paymentMethod: PaymentMethod | null
  referenceNumber: string | null
  transactionDate: string // ISO timestamp
  notes: string | null
  contactId: string | null
  createdAt: string
  createdBy: string | null
}

/**
 * Create payment transaction
 */
export type CreatePaymentTransactionDto = {
  expectedPaymentItemId: string
  transactionType: PaymentTransactionType
  amountCents: number
  currency: string
  paymentMethod?: PaymentMethod | null
  referenceNumber?: string | null
  transactionDate: string // ISO timestamp
  notes?: string | null
  contactId?: string | null
}

/**
 * Payment transaction list response (with expected payment item context)
 */
export type PaymentTransactionListResponseDto = {
  transactions: PaymentTransactionDto[]
  expectedPaymentItem: {
    id: string
    paymentName: string
    expectedAmountCents: number
    paidAmountCents: number
    status: ExpectedPaymentStatus
  }
}

/**
 * Trip-level expected payment item with activity context
 */
export type TripExpectedPaymentDto = ExpectedPaymentItemDto & {
  activityId: string
  activityName: string
  activityType: ActivityType
  activityPricingId: string
  currency: string
  remainingCents: number
  isLocked: boolean
  contactName: string | null
  /** Traveler name (booking holder) — distinct from contactName (payer) */
  travelerName: string | null
  /** Traveler booking ID, if this payment belongs to a per-traveler schedule */
  travelerBookingId: string | null
}

/**
 * Trip-level payment transaction with activity context
 */
export type TripPaymentTransactionDto = PaymentTransactionDto & {
  activityId: string
  activityName: string
  paymentName: string
  contactName: string | null
  /** Traveler name (booking holder) — distinct from contactName (payer) */
  travelerName: string | null
}

/**
 * Contact-level payment transaction with trip context
 */
export type ContactPaymentTransactionDto = TripPaymentTransactionDto & {
  tripId: string
  tripName: string
}

/**
 * Trip-level payment summary
 */
export type TripPaymentsSummaryDto = {
  tripId: string
  totalExpectedCents: number
  totalPaidCents: number
  totalRemainingCents: number
  overdueCount: number
  upcomingCount: number
  activities: {
    activityId: string
    activityName: string
    expectedAmountCents: number
    paidAmountCents: number
    status: ExpectedPaymentStatus
    nextDueDate: string | null
  }[]
}

// =============================================================================
// Payment Schedule Templates (Agency-Scoped Reusable Patterns)
// =============================================================================

/**
 * Audit action types for payment schedule audit log
 */
export type PaymentAuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'status_changed'
  | 'locked'
  | 'unlocked'
  | 'template_applied'

/**
 * Payment schedule template item (read response)
 * Defines a single payment milestone within a template
 */
export type PaymentScheduleTemplateItemDto = {
  id: string
  templateId: string
  sequenceOrder: number
  paymentName: string
  /** Percentage of total (mutually exclusive with fixedAmountCents) */
  percentage: string | null // decimal(5,2) as string
  /** Fixed amount in cents (mutually exclusive with percentage) */
  fixedAmountCents: number | null
  /** Days after booking date (mutually exclusive with daysBeforeDeparture) */
  daysFromBooking: number | null
  /** Days before departure date (mutually exclusive with daysFromBooking) */
  daysBeforeDeparture: number | null
  createdAt: string
}

/**
 * Create payment schedule template item
 * Exactly ONE of percentage/fixedAmountCents must be set
 * Exactly ONE of daysFromBooking/daysBeforeDeparture must be set
 */
export type CreatePaymentScheduleTemplateItemDto = {
  sequenceOrder: number
  paymentName: string
  /** Percentage of total (e.g., 25 for 25%). Mutually exclusive with fixedAmountCents. */
  percentage?: number | null
  /** Fixed amount in cents. Mutually exclusive with percentage. */
  fixedAmountCents?: number | null
  /** Days after booking date. Mutually exclusive with daysBeforeDeparture. */
  daysFromBooking?: number | null
  /** Days before departure date. Mutually exclusive with daysFromBooking. */
  daysBeforeDeparture?: number | null
}

/**
 * Payment schedule template (read response)
 * Agency-scoped reusable payment pattern
 */
export type PaymentScheduleTemplateDto = {
  id: string
  agencyId: string
  name: string
  description: string | null
  scheduleType: ScheduleType
  isDefault: boolean
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  /** Template items (payment milestones) */
  items?: PaymentScheduleTemplateItemDto[]
}

/**
 * Create payment schedule template
 */
export type CreatePaymentScheduleTemplateDto = {
  name: string
  description?: string | null
  scheduleType: ScheduleType
  isDefault?: boolean
  /** Template items to create. At least one item required. */
  items: CreatePaymentScheduleTemplateItemDto[]
}

/**
 * Update payment schedule template
 */
export type UpdatePaymentScheduleTemplateDto = {
  name?: string
  description?: string | null
  scheduleType?: ScheduleType
  isDefault?: boolean
  isActive?: boolean
  /** Template items to replace (full replacement, not partial update) */
  items?: CreatePaymentScheduleTemplateItemDto[]
}

/**
 * Apply template to activity pricing
 *
 * CRITICAL: The service MUST resolve relative date offsets (daysFromBooking,
 * daysBeforeDeparture) to absolute dates BEFORE running TICO validation.
 * Otherwise, the 45-day final payment check and sum validation can pass
 * with undefined dates, leading to invalid schedules.
 *
 * Resolution order:
 * 1. Parse template items with percentage/fixed amounts
 * 2. Calculate absolute due dates using bookingDate and departureDate
 * 3. Run validatePaymentSchedule() with resolved items
 * 4. If valid, persist to expected_payment_items
 */
export type ApplyTemplateDto = {
  templateId: string
  /** Total price in cents (used to calculate percentage-based items) */
  totalAmountCents: number
  /** Currency code (defaults to 'CAD') */
  currency?: string
  /** Booking date for calculating days_from_booking offsets (ISO date string) */
  bookingDate?: string
  /** Departure date for calculating days_before_departure offsets (ISO date string). Required for TICO 45-day validation. */
  departureDate: string
}

/**
 * Apply template response
 */
export type ApplyTemplateResponseDto = {
  /** Updated payment schedule config */
  config: PaymentScheduleConfigDto
  /** Resolved expected payment items with absolute due dates */
  items: ExpectedPaymentItemDto[]
  /** Template tracking */
  templateId: string
  templateVersion: number
}

// =============================================================================
// Payment Schedule Audit Log
// =============================================================================

/**
 * Payment schedule audit log entry (read response)
 * IMMUTABLE: Records are append-only for TICO compliance
 */
export type PaymentScheduleAuditLogDto = {
  id: string
  entityType: 'template' | 'config' | 'item' | 'transaction'
  entityId: string
  agencyId: string
  action: PaymentAuditAction
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  performedBy: string
  performedAt: string // ISO timestamp
  ipAddress: string | null
  userAgent: string | null
}

/**
 * Audit log query parameters
 */
export type AuditLogQueryDto = {
  entityType?: 'template' | 'config' | 'item' | 'transaction'
  entityId?: string
  action?: PaymentAuditAction
  /** ISO date string - filter entries after this date */
  from?: string
  /** ISO date string - filter entries before this date */
  to?: string
  limit?: number
  offset?: number
}

// =============================================================================
// Item Locking (TICO Compliance)
// =============================================================================

/**
 * Expected payment item with locking fields (extended DTO)
 */
export type ExpectedPaymentItemWithLockingDto = ExpectedPaymentItemDto & {
  /** Whether the item is locked (edit-protected) */
  isLocked: boolean
  /** When the item was locked (ISO timestamp) */
  lockedAt: string | null
  /** User ID who locked the item */
  lockedBy: string | null
}

/**
 * Unlock item request (admin only)
 */
export type UnlockPaymentItemDto = {
  /** Reason for unlocking (minimum 10 characters, required for audit trail) */
  reason: string
}

// =============================================================================
// TICO Validation Types
// =============================================================================

/**
 * TICO validation rules (constants)
 */
export const TICO_VALIDATION_RULES = {
  /** Final payment must be at least this many days before departure */
  MIN_FINAL_PAYMENT_DAYS_BEFORE_DEPARTURE: 45,
  /** Sum of all payment items MUST equal total price exactly */
  REQUIRE_EXACT_SUM: true,
  /** Maximum number of installments allowed */
  MAX_INSTALLMENTS: 12,
  /** Minimum payment amount (cents) - prevents $0 payments */
  MIN_PAYMENT_AMOUNT_CENTS: 100, // $1.00
  /** Warn if deposit exceeds this percentage of total */
  DEPOSIT_WARNING_THRESHOLD_PERCENT: 50,
} as const

/**
 * Payment schedule validation error detail
 */
export type PaymentScheduleValidationError = {
  code: 'SUM_MISMATCH' | 'FINAL_PAYMENT_TOO_LATE' | 'PAYMENT_TOO_SMALL' | 'TOO_MANY_INSTALLMENTS'
  message: string
  /** Additional context (varies by error code) */
  [key: string]: unknown
}

/**
 * Payment schedule validation warning detail
 */
export type PaymentScheduleValidationWarning = {
  code: 'HIGH_DEPOSIT' | 'PAST_DUE_DATE'
  message: string
  [key: string]: unknown
}

/**
 * Payment schedule validation result
 */
export type PaymentScheduleValidationResult = {
  isValid: boolean
  errors: PaymentScheduleValidationError[]
  warnings: PaymentScheduleValidationWarning[]
}

// =============================================================================
// TICO Disclosure Document Types
// =============================================================================

/**
 * Payment schedule disclosure document (TICO requirement)
 * Generated document showing all payment terms to travelers
 */
export type PaymentScheduleDisclosureDto = {
  /** Document metadata */
  documentId: string
  generatedAt: string // ISO timestamp
  generatedBy: string

  /** Trip context */
  tripId: string
  tripName: string
  departureDate: string // ISO date
  returnDate?: string

  /** Traveler info */
  primaryTraveler: {
    firstName: string
    lastName: string
    email?: string
  }

  /** Payment schedule summary */
  paymentSchedule: {
    totalAmountCents: number
    currency: string
    paidAmountCents: number
    remainingAmountCents: number
    items: Array<{
      sequenceOrder: number
      description: string
      dueDate: string // ISO date
      amountCents: number
      paidAmountCents: number
      status: ExpectedPaymentStatus
    }>
  }

  /** Policies */
  cancellationPolicy?: string
  termsAndConditions?: string

  /** Agency info */
  agency: {
    name: string
    ticoNumber: string
    contactEmail: string
    contactPhone: string
  }
}
