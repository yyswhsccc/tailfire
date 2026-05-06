// Report Metadata
export type ReportCategory = 'sales' | 'financial' | 'operational' | 'compliance' | 'crm' | 'insurance'
export type ReportScope = 'admin-only' | 'admin-and-agent'

export interface ReportDefinition {
  slug: string
  name: string
  description: string
  category: ReportCategory
  scope: ReportScope
  supportsMyToggle: boolean
}

// Query Parameters
export interface ReportDateRange {
  startDate: string
  endDate: string
}

export type DatePreset = 'mtd' | 'ytd' | 'full-year' | 'last-month' | 'last-quarter' | 'q1' | 'q2' | 'q3' | 'q4' | 'last-year' | 'custom'

export interface ReportQueryParams {
  startDate: string
  endDate: string
  viewScope?: 'my' | 'agency'
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, string>
}

// Structured summary item for summary cards
export interface SummaryItem {
  label: string
  value: string
  format?: 'currency' | 'number' | 'percent' | 'text'
}

// Response Envelope
export interface ReportResponse<T> {
  reportSlug: string
  reportName: string
  generatedAt: string
  dateRange: ReportDateRange
  viewScope: 'my' | 'agency'
  totalRows: number
  page: number
  pageSize: number
  data: T[]
  summary?: Record<string, number | string>
  summaryItems?: SummaryItem[]
  /** Page-level totals (sum of current page rows) */
  pageTotals?: Record<string, number | null>
  /** Full dataset totals (sum across ALL rows, ignoring pagination) */
  grandTotals?: Record<string, number | null>
}

// === Per-Report Row Types ===

export interface BookedSalesRow {
  tripId: string
  tripName: string
  referenceNumber: string | null
  agentName: string
  clientName: string
  bookedDate: string
  departureDate: string | null
  totalPriceCents: number
  currency: string
  activityCount: number
  travelerCount: number
}

export interface DepartedSalesRow {
  tripId: string
  tripName: string
  referenceNumber: string | null
  agentName: string
  clientName: string
  departureDate: string
  returnDate: string | null
  totalPriceCents: number
  currency: string
  activityCount: number
  travelerCount: number
}

export interface SalesByAgentRow {
  agentId: string
  agentName: string
  bookingCount: number
  totalSalesCents: number
  avgBookingValueCents: number
  currency: string
}

export interface SalesByDestinationRow {
  destination: string
  tripType: string
  bookingCount: number
  totalSalesCents: number
  travelerCount: number
  currency: string
}

export interface SalesBySupplierRow {
  supplierName: string
  activityType: string
  activityCount: number
  totalSalesCents: number
  commissionCents: number
  currency: string
}

export interface BookingPipelineRow {
  status: string
  tripCount: number
  totalEstimatedCents: number
  currency: string
}

export interface CommissionAgingRow {
  activityId: string
  activityName: string
  supplierName: string
  tripName: string
  agentName: string
  expectedCents: number
  receivedCents: number
  outstandingCents: number
  departureDate: string
  daysSinceDeparture: number
  agingBucket: '0-30' | '31-60' | '61-90' | '90+'
  currency: string
}

export interface CommissionReconciliationRow {
  checkId: string
  checkNumber: string | null
  supplierName: string
  checkDate: string
  checkAmountCents: number
  matchedAmountCents: number
  unmatchedAmountCents: number
  itemCount: number
  status: string
  currency: string
}

export interface PaymentScheduleRow {
  tripId: string
  tripName: string
  clientName: string
  agentName: string
  itemLabel: string
  dueDate: string
  amountCents: number
  paidCents: number
  remainingCents: number
  status: string
  daysUntilDue: number
  currency: string
}

export interface AgentCommissionStatementRow {
  activityId: string
  activityName: string
  tripName: string
  supplierName: string
  departureDate: string | null
  totalSalesCents: number
  commissionRate: number | null
  grossCommissionCents: number
  receivedCents: number
  paidToAgentCents: number
  pendingCents: number
  currency: string
}

export interface UpcomingDeparturesRow {
  tripId: string
  tripName: string
  clientName: string
  agentName: string
  departureDate: string
  returnDate: string | null
  travelerCount: number
  status: string
  paymentStatus: 'paid' | 'partial' | 'unpaid'
  outstandingCents: number
  documentsComplete: boolean
  daysUntilDeparture: number
  currency: string
}

export interface OntarioGrossSalesRow {
  month: string
  bookingCount: number
  totalSalesCents: number
  serviceFeesCents: number
  grossSalesCents: number
  currency: string
}

export interface ClientSpendingRow {
  contactId: string
  clientName: string
  email: string | null
  tripCount: number
  totalSpendCents: number
  avgTripValueCents: number
  lastTripDate: string | null
  firstTripDate: string | null
  currency: string
}

export interface RepeatClientRow {
  contactId: string
  clientName: string
  email: string | null
  tripCount: number
  totalSpendCents: number
  firstTripDate: string
  lastTripDate: string
  avgDaysBetweenTrips: number | null
  currency: string
}

export interface DormantClientRow {
  contactId: string
  clientName: string
  email: string | null
  phone: string | null
  agentName: string | null
  lastTripDate: string
  daysSinceLastTrip: number
  lifetimeSpendCents: number
  tripCount: number
  currency: string
}

export interface PassportExpiryRow {
  contactId: string
  travelerName: string
  passportNumber: string | null
  passportExpiry: string
  daysUntilExpiry: number
  nationality: string | null
  upcomingTripName: string | null
  upcomingTripDate: string | null
}

export interface UpcomingBirthdayRow {
  contactId: string
  clientName: string
  email: string | null
  phone: string | null
  birthDate: string
  daysUntilBirthday: number
  agentName: string | null
  age: number
}

export interface NewClientsRow {
  contactId: string
  clientName: string
  email: string | null
  createdAt: string
  agentName: string | null
  hasTrip: boolean
  firstTripDate: string | null
}

export interface ClientCompletenessRow {
  contactId: string
  clientName: string
  hasEmail: boolean
  hasPhone: boolean
  hasAddress: boolean
  hasDob: boolean
  hasPassport: boolean
  completenessScore: number
  missingFields: string[]
}

export interface TopClientsRevenueRow {
  contactId: string
  clientName: string
  email: string | null
  tripCount: number
  totalSpendCents: number
  avgTripValueCents: number
  lastTripDate: string | null
  currency: string
}

export interface InsurancePenetrationRow {
  period: string
  totalTravelers: number
  coveredTravelers: number
  ownInsuranceTravelers: number
  declinedTravelers: number
  pendingTravelers: number
  penetrationRate: number
}

export interface InsuranceDeclineRow {
  tripId: string
  tripName: string
  travelerName: string
  departureDate: string | null
  declinedAt: string | null
  acknowledgedAt: string | null
  declinedReason: string | null
  isAcknowledged: boolean
}

export interface InsuranceRevenueRow {
  providerName: string
  packageName: string
  policyType: string
  packageCount: number
  totalPremiumCents: number
  totalCoverageCents: number
  travelerCount: number
  currency: string
}

export interface InsuranceByPolicyTypeRow {
  policyType: string
  packageCount: number
  travelerCount: number
  totalPremiumCents: number
  avgPremiumCents: number
  penetrationRate: number
  currency: string
}

export interface InsuranceUnresolvedRow {
  tripId: string
  tripName: string
  travelerName: string
  departureDate: string | null
  daysUntilDeparture: number | null
  status: string
  agentName: string | null
}
