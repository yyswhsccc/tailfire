/**
 * Financial System API DTOs
 *
 * These types define the API contract for Financial System operations:
 * - Currency exchange rates
 * - Activity traveller splits
 * - Service fees (with Stripe integration)
 * - Agency settings (Stripe Connect, compliance)
 * - Trip notifications
 * - Financial summary
 */

// ============================================================================
// ENUMS / CONSTANTS
// ============================================================================

export const SPLIT_TYPES = ['equal', 'custom'] as const
export type SplitType = (typeof SPLIT_TYPES)[number]

export const SERVICE_FEE_RECIPIENTS = ['primary_traveller', 'all_travellers'] as const
export type ServiceFeeRecipient = (typeof SERVICE_FEE_RECIPIENTS)[number]

export const SERVICE_FEE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'partially_refunded',
  'refunded',
  'cancelled',
] as const
export type ServiceFeeStatus = (typeof SERVICE_FEE_STATUSES)[number]

export const NOTIFICATION_TYPES = [
  'split_recalculation_needed',
  'payment_received',
  'payment_overdue',
  'refund_processed',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_STATUSES = ['pending', 'dismissed', 'acted'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const STRIPE_ACCOUNT_STATUSES = [
  'not_connected',
  'pending',
  'active',
  'restricted',
  'disabled',
] as const
export type StripeAccountStatus = (typeof STRIPE_ACCOUNT_STATUSES)[number]

// ============================================================================
// CURRENCY EXCHANGE RATES
// ============================================================================

export interface CurrencyExchangeRateResponseDto {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: string // Decimal as string
  rateDate: string // ISO date
  source: string | null
  createdAt: string
}

export interface GetExchangeRateDto {
  fromCurrency: string // ISO 4217 (e.g., 'USD')
  toCurrency: string // ISO 4217 (e.g., 'CAD')
  date?: string // ISO date, defaults to today
}

export interface ConvertCurrencyDto {
  amountCents: number
  fromCurrency: string
  toCurrency: string
  date?: string // ISO date for rate lookup
}

export interface ConvertCurrencyResponseDto {
  originalAmountCents: number
  originalCurrency: string
  convertedAmountCents: number
  convertedCurrency: string
  rate: string
  rateDate: string
}

// ============================================================================
// ACTIVITY TRAVELLER SPLITS
// ============================================================================

/**
 * Single split entry for a traveller on an activity
 */
export interface ActivityTravellerSplitDto {
  travellerId: string // UUID
  amountCents: number
  notes?: string
}

/**
 * Replace all splits for an activity (PUT semantics)
 * If splits array is empty, defaults to equal split among all travellers
 */
export interface SetActivitySplitsDto {
  /** 'equal' auto-calculates, 'custom' uses provided amounts */
  splitType: SplitType
  /** Required when splitType is 'custom', ignored for 'equal' */
  splits?: ActivityTravellerSplitDto[]
}

export interface ActivityTravellerSplitResponseDto {
  id: string
  tripId: string
  activityId: string
  travellerId: string
  splitType: SplitType
  amountCents: number
  currency: string
  exchangeRateToTripCurrency: string | null
  exchangeRateSnapshotAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  // Populated relations
  traveller?: TravellerSummaryDto
}

export interface TravellerSummaryDto {
  id: string
  contactId: string | null
  firstName: string | null
  lastName: string | null
  travelerType: string
  role: string
}

export interface ActivitySplitsSummaryResponseDto {
  activityId: string
  activityName: string
  totalAmountCents: number
  currency: string
  splitType: SplitType
  splits: ActivityTravellerSplitResponseDto[]
  /** True if all travellers are included in splits */
  isComplete: boolean
  /** Travellers missing from custom splits */
  missingTravellers?: TravellerSummaryDto[]
}

// ============================================================================
// SERVICE FEES
// ============================================================================

export interface CreateServiceFeeDto {
  title: string
  amountCents: number
  currency?: string // Defaults to 'CAD'
  dueDate?: string // ISO date
  description?: string
  recipientType?: ServiceFeeRecipient // Defaults to 'primary_traveller'
}

export interface UpdateServiceFeeDto {
  title?: string
  amountCents?: number
  currency?: string
  dueDate?: string
  description?: string
  recipientType?: ServiceFeeRecipient
}

/**
 * Send a service fee invoice via Stripe
 * Only allowed when status is 'draft'
 */
export interface SendServiceFeeDto {
  /** Optional: Override the recipient email (uses primary contact email by default) */
  recipientEmail?: string
}

/**
 * Refund a service fee (full or partial)
 * Only allowed when status is 'paid'
 */
export interface RefundServiceFeeDto {
  /** Amount to refund in cents. If not provided, refunds full amount */
  amountCents?: number
  reason?: string
}

/**
 * Cancel a service fee
 * Only allowed when status is 'draft' or 'sent'
 */
export interface CancelServiceFeeDto {
  reason?: string
}

export interface ServiceFeeResponseDto {
  id: string
  tripId: string
  recipientType: ServiceFeeRecipient
  title: string
  amountCents: number
  currency: string
  dueDate: string | null
  description: string | null
  status: ServiceFeeStatus
  exchangeRateToTripCurrency: string | null
  amountInTripCurrencyCents: number | null
  stripeInvoiceId: string | null
  stripePaymentIntentId: string | null
  stripeHostedInvoiceUrl: string | null
  refundedAmountCents: number
  refundReason: string | null
  sentAt: string | null
  paidAt: string | null
  refundedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface ServiceFeeFilterDto {
  tripId?: string
  status?: ServiceFeeStatus | ServiceFeeStatus[]
  recipientType?: ServiceFeeRecipient
  dueDateFrom?: string
  dueDateTo?: string
  page?: number
  limit?: number
}

export interface PaginatedServiceFeesResponseDto {
  data: ServiceFeeResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// AGENCY SETTINGS
// ============================================================================

export interface UpdateAgencySettingsDto {
  // Compliance settings
  jurisdictionCode?: string
  complianceDisclaimerText?: string
  insuranceWaiverText?: string
  // Branding
  logoUrl?: string
  primaryColor?: string // Hex color (e.g., '#FF5733')
  // Commission fee (Tailfire technology fee, % deducted from net commission before agent split)
  commissionFeeRate?: number // 0-100, default 5.00
}

export interface AgencySettingsResponseDto {
  id: string
  agencyId: string
  stripeAccountId: string | null
  stripeAccountStatus: StripeAccountStatus
  stripeChargesEnabled: boolean
  stripePayoutsEnabled: boolean
  stripeOnboardingCompletedAt: string | null
  jurisdictionCode: string | null
  complianceDisclaimerText: string | null
  insuranceWaiverText: string | null
  commissionFeeRate: string // Decimal as string (e.g., "5.00")
  logoUrl: string | null
  primaryColor: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Response from Stripe Connect onboarding initiation
 */
export interface StripeOnboardingResponseDto {
  /** URL to redirect user to for Stripe onboarding */
  onboardingUrl: string
  /** Expiry time for the onboarding link */
  expiresAt: string
}

/**
 * Response from Stripe Connect account status check
 */
export interface StripeAccountStatusResponseDto {
  status: StripeAccountStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  /** If restricted, contains list of required fields/actions */
  requirements?: string[]
}

// ============================================================================
// TRIP NOTIFICATIONS
// ============================================================================

export interface TripNotificationResponseDto {
  id: string
  tripId: string
  notificationType: NotificationType
  status: NotificationStatus
  message: string
  metadata: TripNotificationMetadata | null
  createdAt: string
  dismissedAt: string | null
  actedAt: string | null
}

export interface TripNotificationMetadata {
  travellerId?: string
  travellerName?: string
  affectedActivityIds?: string[]
  affectedActivityNames?: string[]
  serviceFeeId?: string
  amount?: number
  currency?: string
}

export interface DismissNotificationDto {
  /** Optional: Mark as 'acted' instead of 'dismissed' */
  acted?: boolean
}

export interface TripNotificationsFilterDto {
  tripId?: string
  status?: NotificationStatus | NotificationStatus[]
  notificationType?: NotificationType | NotificationType[]
  page?: number
  limit?: number
}

export interface PaginatedNotificationsResponseDto {
  data: TripNotificationResponseDto[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// FINANCIAL SUMMARY
// ============================================================================

/**
 * Comprehensive financial summary for a trip
 */
export interface TripFinancialSummaryResponseDto {
  tripId: string
  tripCurrency: string

  /** Total cost of all activities */
  activitiesSummary: {
    totalCents: number
    totalInTripCurrencyCents: number
    byActivity: ActivityCostSummaryDto[]
  }

  /** Service fees charged to travellers */
  serviceFeesSummary: {
    totalCents: number
    totalInTripCurrencyCents: number
    paidCents: number
    pendingCents: number
    refundedCents: number
    byStatus: Record<ServiceFeeStatus, number>
  }

  /** Per-traveller cost breakdown */
  travellerBreakdown: TravellerFinancialBreakdownDto[]

  /** Commission summary from component pricing */
  commissionSummary: {
    expectedTotalCents: number
    receivedTotalCents: number
    pendingTotalCents: number
  }

  /** Grand totals */
  grandTotal: {
    /** Total trip cost (activities + service fees) */
    totalCostCents: number
    /** Total collected (service fees paid) */
    totalCollectedCents: number
    /** Outstanding amount */
    outstandingCents: number
  }
}

export interface ActivityCostSummaryDto {
  activityId: string
  activityName: string
  activityType: string
  totalCostCents: number
  currency: string
  totalInTripCurrencyCents: number
  hasSplits: boolean
  splitType: SplitType | null
}

export interface TravellerFinancialBreakdownDto {
  travellerId: string
  travellerName: string
  travelerType: string
  isPrimary: boolean

  /** Activity costs assigned to this traveller */
  activityCostsCents: number
  activityCostsInTripCurrencyCents: number

  /** Service fees applicable to this traveller */
  serviceFeesCents: number
  serviceFeesInTripCurrencyCents: number

  /** Total for this traveller */
  totalCents: number
  totalInTripCurrencyCents: number
}

// ============================================================================
// TRIP-ORDER PDF
// ============================================================================

export interface GenerateTripOrderDto {
  /** Sections to include in the PDF */
  sections?: TripOrderSection[]
  /** Optional custom header text */
  headerText?: string
}

export const TRIP_ORDER_SECTIONS = [
  'header',
  'summary',
  'activities',
  'traveller_breakdown',
  'payment_terms',
  'branding',
  'compliance',
  'insurance_waiver',
] as const
export type TripOrderSection = (typeof TRIP_ORDER_SECTIONS)[number]

export interface TripOrderResponseDto {
  /** URL to download the generated PDF */
  pdfUrl: string
  /** Expiry time for the download URL */
  expiresAt: string
  /** Filename for the PDF */
  filename: string
}

// ============================================================================
// STRIPE WEBHOOK EVENTS (internal tracking)
// ============================================================================

export interface StripeWebhookEventResponseDto {
  id: string
  eventId: string
  eventType: string
  stripeAccountId: string | null
  processedAt: string
}
