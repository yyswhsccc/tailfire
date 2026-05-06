/**
 * Report Manifest — per-report column definitions, total rules, and summary card config.
 *
 * This is the single source of truth for how each report's table is rendered,
 * which columns get footer totals, and which summary cards appear above/below the table.
 */

export interface ReportColumnDef {
  key: string
  label: string
  align?: 'left' | 'right'
  mono?: boolean
  format?: 'currency' | 'number' | 'percent' | 'date' | 'text'
}

export interface ReportManifestEntry {
  columns: ReportColumnDef[]
  /** Which columns should show totals in the footer. 'sum' | 'avg' | 'count' */
  totalRules?: Record<string, 'sum' | 'avg' | 'count'>
  /** Summary card definitions — metrics shown above/below the table */
  summaryCards?: Array<{
    key: string
    label: string
    format: 'currency' | 'number' | 'percent'
  }>
}

// =============================================================================
// Manifest for all 26 reports
// =============================================================================

export const REPORT_MANIFEST: Record<string, ReportManifestEntry> = {
  // ── Sales ─────────────────────────────────────────────────────────────────

  'booked-sales': {
    columns: [
      { key: 'tripName', label: 'Trip' },
      { key: 'referenceNumber', label: 'Ref #', mono: true },
      { key: 'agentName', label: 'Agent' },
      { key: 'clientName', label: 'Client' },
      { key: 'bookedDate', label: 'Booked', format: 'date' },
      { key: 'departureDate', label: 'Departure', format: 'date' },
      { key: 'travelerCount', label: 'Pax', align: 'right', format: 'number' },
      { key: 'activityCount', label: 'Items', align: 'right', format: 'number' },
      { key: 'totalPriceCents', label: 'Total', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      travelerCount: 'sum',
      activityCount: 'sum',
      totalPriceCents: 'sum',
    },
    summaryCards: [
      { key: 'totalPriceCents', label: 'Total Sales', format: 'currency' },
      { key: '_rowCount', label: 'Bookings', format: 'number' },
      { key: 'travelerCount', label: 'Total Pax', format: 'number' },
    ],
  },

  'departed-sales': {
    columns: [
      { key: 'tripName', label: 'Trip' },
      { key: 'referenceNumber', label: 'Ref #', mono: true },
      { key: 'agentName', label: 'Agent' },
      { key: 'clientName', label: 'Client' },
      { key: 'departureDate', label: 'Departure', format: 'date' },
      { key: 'returnDate', label: 'Return', format: 'date' },
      { key: 'travelerCount', label: 'Pax', align: 'right', format: 'number' },
      { key: 'activityCount', label: 'Items', align: 'right', format: 'number' },
      { key: 'totalPriceCents', label: 'Total', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      travelerCount: 'sum',
      activityCount: 'sum',
      totalPriceCents: 'sum',
    },
    summaryCards: [
      { key: 'totalPriceCents', label: 'Total Sales', format: 'currency' },
      { key: '_rowCount', label: 'Trips', format: 'number' },
      { key: 'travelerCount', label: 'Total Pax', format: 'number' },
    ],
  },

  'sales-by-agent': {
    columns: [
      { key: 'agentName', label: 'Agent' },
      { key: 'bookingCount', label: 'Bookings', align: 'right', format: 'number' },
      { key: 'totalSalesCents', label: 'Total Sales', align: 'right', format: 'currency', mono: true },
      { key: 'avgBookingValueCents', label: 'Avg Booking', align: 'right', format: 'currency', mono: true },
      { key: 'currency', label: 'Currency' },
    ],
    totalRules: {
      bookingCount: 'sum',
      totalSalesCents: 'sum',
      avgBookingValueCents: 'avg',
    },
    summaryCards: [
      { key: 'totalSalesCents', label: 'Total Sales', format: 'currency' },
      { key: 'bookingCount', label: 'Total Bookings', format: 'number' },
      { key: 'avgBookingValueCents', label: 'Avg Booking Value', format: 'currency' },
    ],
  },

  'sales-by-destination': {
    columns: [
      { key: 'destination', label: 'Destination' },
      { key: 'tripType', label: 'Trip Type' },
      { key: 'bookingCount', label: 'Bookings', align: 'right', format: 'number' },
      { key: 'travelerCount', label: 'Pax', align: 'right', format: 'number' },
      { key: 'totalSalesCents', label: 'Total Sales', align: 'right', format: 'currency', mono: true },
      { key: 'currency', label: 'Currency' },
    ],
    totalRules: {
      bookingCount: 'sum',
      travelerCount: 'sum',
      totalSalesCents: 'sum',
    },
    summaryCards: [
      { key: 'totalSalesCents', label: 'Total Sales', format: 'currency' },
      { key: 'bookingCount', label: 'Total Bookings', format: 'number' },
      { key: 'travelerCount', label: 'Total Pax', format: 'number' },
    ],
  },

  'booked-sales-by-supplier': {
    columns: [
      { key: 'supplierName', label: 'Supplier' },
      { key: 'activityCount', label: 'Bookings', align: 'right', format: 'number' },
      { key: 'totalSalesCents', label: 'Total Sales', align: 'right', format: 'currency', mono: true },
      { key: 'commissionCents', label: 'Commission', align: 'right', format: 'currency', mono: true },
      { key: 'currency', label: 'Currency' },
    ],
    totalRules: {
      activityCount: 'sum',
      totalSalesCents: 'sum',
      commissionCents: 'sum',
    },
    summaryCards: [
      { key: 'totalSalesCents', label: 'Total Sales', format: 'currency' },
      { key: 'commissionCents', label: 'Total Commission', format: 'currency' },
      { key: 'activityCount', label: 'Total Items', format: 'number' },
    ],
  },

  'departed-sales-by-supplier': {
    columns: [
      { key: 'supplierName', label: 'Supplier' },
      { key: 'activityCount', label: 'Bookings', align: 'right', format: 'number' },
      { key: 'totalSalesCents', label: 'Total Sales', align: 'right', format: 'currency', mono: true },
      { key: 'commissionCents', label: 'Commission', align: 'right', format: 'currency', mono: true },
      { key: 'currency', label: 'Currency' },
    ],
    totalRules: {
      activityCount: 'sum',
      totalSalesCents: 'sum',
      commissionCents: 'sum',
    },
    summaryCards: [
      { key: 'totalSalesCents', label: 'Total Sales', format: 'currency' },
      { key: 'commissionCents', label: 'Total Commission', format: 'currency' },
      { key: 'activityCount', label: 'Total Items', format: 'number' },
    ],
  },

  'booking-pipeline': {
    columns: [
      { key: 'status', label: 'Status' },
      { key: 'tripCount', label: 'Trips', align: 'right', format: 'number' },
      { key: 'totalEstimatedCents', label: 'Est. Value', align: 'right', format: 'currency', mono: true },
      { key: 'currency', label: 'Currency' },
    ],
    totalRules: {
      tripCount: 'sum',
      totalEstimatedCents: 'sum',
    },
    summaryCards: [
      { key: 'totalEstimatedCents', label: 'Pipeline Value', format: 'currency' },
      { key: 'tripCount', label: 'Total Trips', format: 'number' },
    ],
  },

  // ── Financial ───────────────────────────────────────────────────────────────

  'commission-aging': {
    columns: [
      { key: 'activityName', label: 'Activity' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'tripName', label: 'Trip' },
      { key: 'agentName', label: 'Agent' },
      { key: 'departureDate', label: 'Departure', format: 'date' },
      { key: 'daysSinceDeparture', label: 'Days Out', align: 'right', format: 'number' },
      { key: 'agingBucket', label: 'Aging' },
      { key: 'expectedCents', label: 'Expected', align: 'right', format: 'currency', mono: true },
      { key: 'receivedCents', label: 'Received', align: 'right', format: 'currency', mono: true },
      { key: 'outstandingCents', label: 'Outstanding', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      expectedCents: 'sum',
      receivedCents: 'sum',
      outstandingCents: 'sum',
    },
    summaryCards: [
      { key: 'outstandingCents', label: 'Total Outstanding', format: 'currency' },
      { key: 'expectedCents', label: 'Total Expected', format: 'currency' },
      { key: 'receivedCents', label: 'Total Received', format: 'currency' },
    ],
  },

  'commission-reconciliation': {
    columns: [
      { key: 'checkNumber', label: 'Check #', mono: true },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'checkDate', label: 'Date', format: 'date' },
      { key: 'status', label: 'Status' },
      { key: 'itemCount', label: 'Items', align: 'right', format: 'number' },
      { key: 'checkAmountCents', label: 'Check Amount', align: 'right', format: 'currency', mono: true },
      { key: 'matchedAmountCents', label: 'Matched', align: 'right', format: 'currency', mono: true },
      { key: 'unmatchedAmountCents', label: 'Unmatched', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      itemCount: 'sum',
      checkAmountCents: 'sum',
      matchedAmountCents: 'sum',
      unmatchedAmountCents: 'sum',
    },
    summaryCards: [
      { key: 'checkAmountCents', label: 'Total Check Amount', format: 'currency' },
      { key: 'matchedAmountCents', label: 'Total Matched', format: 'currency' },
      { key: 'unmatchedAmountCents', label: 'Total Unmatched', format: 'currency' },
    ],
  },

  'payment-schedule': {
    columns: [
      { key: 'tripName', label: 'Trip' },
      { key: 'clientName', label: 'Client' },
      { key: 'agentName', label: 'Agent' },
      { key: 'itemLabel', label: 'Payment' },
      { key: 'dueDate', label: 'Due Date', format: 'date' },
      { key: 'daysUntilDue', label: 'Days Until Due', align: 'right', format: 'number' },
      { key: 'status', label: 'Status' },
      { key: 'amountCents', label: 'Amount', align: 'right', format: 'currency', mono: true },
      { key: 'paidCents', label: 'Paid', align: 'right', format: 'currency', mono: true },
      { key: 'remainingCents', label: 'Remaining', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      amountCents: 'sum',
      paidCents: 'sum',
      remainingCents: 'sum',
    },
    summaryCards: [
      { key: 'amountCents', label: 'Total Due', format: 'currency' },
      { key: 'paidCents', label: 'Total Paid', format: 'currency' },
      { key: 'remainingCents', label: 'Total Remaining', format: 'currency' },
    ],
  },

  'agent-commission-statement': {
    columns: [
      { key: 'activityName', label: 'Activity' },
      { key: 'tripName', label: 'Trip' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'departureDate', label: 'Departure', format: 'date' },
      { key: 'totalSalesCents', label: 'Sales', align: 'right', format: 'currency', mono: true },
      { key: 'commissionRate', label: 'Rate %', align: 'right', format: 'percent' },
      { key: 'grossCommissionCents', label: 'Gross Comm.', align: 'right', format: 'currency', mono: true },
      { key: 'receivedCents', label: 'Received', align: 'right', format: 'currency', mono: true },
      { key: 'paidToAgentCents', label: 'Paid to Agent', align: 'right', format: 'currency', mono: true },
      { key: 'pendingCents', label: 'Pending', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      totalSalesCents: 'sum',
      grossCommissionCents: 'sum',
      receivedCents: 'sum',
      paidToAgentCents: 'sum',
      pendingCents: 'sum',
      commissionRate: 'avg',
    },
    summaryCards: [
      { key: 'grossCommissionCents', label: 'Gross Commission', format: 'currency' },
      { key: 'paidToAgentCents', label: 'Paid to Agent', format: 'currency' },
      { key: 'pendingCents', label: 'Pending', format: 'currency' },
    ],
  },

  // ── Operational ─────────────────────────────────────────────────────────────

  'upcoming-departures': {
    columns: [
      { key: 'tripName', label: 'Trip' },
      { key: 'clientName', label: 'Client' },
      { key: 'agentName', label: 'Agent' },
      { key: 'departureDate', label: 'Departure', format: 'date' },
      { key: 'daysUntilDeparture', label: 'Days Away', align: 'right', format: 'number' },
      { key: 'travelerCount', label: 'Pax', align: 'right', format: 'number' },
      { key: 'paymentStatus', label: 'Payment' },
      { key: 'outstandingCents', label: 'Outstanding', align: 'right', format: 'currency', mono: true },
      { key: 'documentsComplete', label: 'Docs' },
    ],
    totalRules: {
      travelerCount: 'sum',
      outstandingCents: 'sum',
    },
    summaryCards: [
      { key: '_rowCount', label: 'Upcoming Trips', format: 'number' },
      { key: 'travelerCount', label: 'Total Pax', format: 'number' },
      { key: 'outstandingCents', label: 'Total Outstanding', format: 'currency' },
    ],
  },

  // ── Compliance ──────────────────────────────────────────────────────────────

  'ontario-gross-sales': {
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'bookingCount', label: 'Bookings', align: 'right', format: 'number' },
      { key: 'totalSalesCents', label: 'Total Sales', align: 'right', format: 'currency', mono: true },
      { key: 'serviceFeesCents', label: 'Service Fees', align: 'right', format: 'currency', mono: true },
      { key: 'grossSalesCents', label: 'Gross Sales', align: 'right', format: 'currency', mono: true },
      { key: 'currency', label: 'Currency' },
    ],
    totalRules: {
      bookingCount: 'sum',
      totalSalesCents: 'sum',
      serviceFeesCents: 'sum',
      grossSalesCents: 'sum',
    },
    summaryCards: [
      { key: 'grossSalesCents', label: 'Gross Sales', format: 'currency' },
      { key: 'totalSalesCents', label: 'Total Sales', format: 'currency' },
      { key: 'bookingCount', label: 'Total Bookings', format: 'number' },
    ],
  },

  // ── CRM ─────────────────────────────────────────────────────────────────────

  'client-spending': {
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'tripCount', label: 'Trips', align: 'right', format: 'number' },
      { key: 'totalSpendCents', label: 'Total Spend', align: 'right', format: 'currency', mono: true },
      { key: 'avgTripValueCents', label: 'Avg Trip', align: 'right', format: 'currency', mono: true },
      { key: 'firstTripDate', label: 'First Trip', format: 'date' },
      { key: 'lastTripDate', label: 'Last Trip', format: 'date' },
    ],
    totalRules: {
      tripCount: 'sum',
      totalSpendCents: 'sum',
      avgTripValueCents: 'avg',
    },
    summaryCards: [
      { key: '_rowCount', label: 'Total Clients', format: 'number' },
      { key: 'totalSpendCents', label: 'Total Spend', format: 'currency' },
      { key: 'avgTripValueCents', label: 'Avg Trip Value', format: 'currency' },
    ],
  },

  'repeat-clients': {
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'tripCount', label: 'Trips', align: 'right', format: 'number' },
      { key: 'totalSpendCents', label: 'Total Spend', align: 'right', format: 'currency', mono: true },
      { key: 'firstTripDate', label: 'First Trip', format: 'date' },
      { key: 'lastTripDate', label: 'Last Trip', format: 'date' },
      { key: 'avgDaysBetweenTrips', label: 'Avg Days Between', align: 'right', format: 'number' },
    ],
    totalRules: {
      tripCount: 'sum',
      totalSpendCents: 'sum',
      avgDaysBetweenTrips: 'avg',
    },
    summaryCards: [
      { key: '_rowCount', label: 'Repeat Clients', format: 'number' },
      { key: 'totalSpendCents', label: 'Total Spend', format: 'currency' },
      { key: 'avgDaysBetweenTrips', label: 'Avg Days Between', format: 'number' },
    ],
  },

  'dormant-clients': {
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'agentName', label: 'Agent' },
      { key: 'lastTripDate', label: 'Last Trip', format: 'date' },
      { key: 'daysSinceLastTrip', label: 'Days Dormant', align: 'right', format: 'number' },
      { key: 'tripCount', label: 'Trips', align: 'right', format: 'number' },
      { key: 'lifetimeSpendCents', label: 'Lifetime Spend', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      tripCount: 'sum',
      lifetimeSpendCents: 'sum',
      daysSinceLastTrip: 'avg',
    },
    summaryCards: [
      { key: '_rowCount', label: 'Dormant Clients', format: 'number' },
      { key: 'lifetimeSpendCents', label: 'Total Lifetime Spend', format: 'currency' },
      { key: 'daysSinceLastTrip', label: 'Avg Days Dormant', format: 'number' },
    ],
  },

  'passport-expiry': {
    columns: [
      { key: 'travelerName', label: 'Traveler' },
      { key: 'passportNumber', label: 'Passport #', mono: true },
      { key: 'nationality', label: 'Nationality' },
      { key: 'passportExpiry', label: 'Expiry Date', format: 'date' },
      { key: 'daysUntilExpiry', label: 'Days Until Expiry', align: 'right', format: 'number' },
      { key: 'upcomingTripName', label: 'Upcoming Trip' },
      { key: 'upcomingTripDate', label: 'Trip Date', format: 'date' },
    ],
    totalRules: {},
    summaryCards: [
      { key: '_rowCount', label: 'Expiring Passports', format: 'number' },
    ],
  },

  'upcoming-birthdays': {
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'agentName', label: 'Agent' },
      { key: 'birthDate', label: 'Birthday', format: 'date' },
      { key: 'age', label: 'Age', align: 'right', format: 'number' },
      { key: 'daysUntilBirthday', label: 'Days Away', align: 'right', format: 'number' },
    ],
    totalRules: {},
    summaryCards: [
      { key: '_rowCount', label: 'Upcoming Birthdays', format: 'number' },
    ],
  },

  'new-clients': {
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'agentName', label: 'Agent' },
      { key: 'createdAt', label: 'Joined', format: 'date' },
      { key: 'hasTrip', label: 'Has Trip' },
      { key: 'firstTripDate', label: 'First Trip', format: 'date' },
    ],
    totalRules: {},
    summaryCards: [
      { key: '_rowCount', label: 'New Clients', format: 'number' },
    ],
  },

  'client-data-completeness': {
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'completenessScore', label: 'Score %', align: 'right', format: 'percent' },
      { key: 'hasEmail', label: 'Email' },
      { key: 'hasPhone', label: 'Phone' },
      { key: 'hasAddress', label: 'Address' },
      { key: 'hasDob', label: 'DOB' },
      { key: 'hasPassport', label: 'Passport' },
      { key: 'missingFields', label: 'Missing' },
    ],
    totalRules: {
      completenessScore: 'avg',
    },
    summaryCards: [
      { key: '_rowCount', label: 'Total Clients', format: 'number' },
      { key: 'completenessScore', label: 'Avg Completeness', format: 'percent' },
    ],
  },

  'top-clients-revenue': {
    columns: [
      { key: 'clientName', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'tripCount', label: 'Trips', align: 'right', format: 'number' },
      { key: 'totalSpendCents', label: 'Total Spend', align: 'right', format: 'currency', mono: true },
      { key: 'avgTripValueCents', label: 'Avg Trip', align: 'right', format: 'currency', mono: true },
      { key: 'lastTripDate', label: 'Last Trip', format: 'date' },
    ],
    totalRules: {
      tripCount: 'sum',
      totalSpendCents: 'sum',
      avgTripValueCents: 'avg',
    },
    summaryCards: [
      { key: '_rowCount', label: 'Top Clients', format: 'number' },
      { key: 'totalSpendCents', label: 'Total Spend', format: 'currency' },
      { key: 'avgTripValueCents', label: 'Avg Trip Value', format: 'currency' },
    ],
  },

  // ── Insurance ───────────────────────────────────────────────────────────────

  'insurance-penetration': {
    columns: [
      { key: 'period', label: 'Period' },
      { key: 'totalTravelers', label: 'Total Pax', align: 'right', format: 'number' },
      { key: 'coveredTravelers', label: 'Covered', align: 'right', format: 'number' },
      { key: 'ownInsuranceTravelers', label: 'Own Insurance', align: 'right', format: 'number' },
      { key: 'declinedTravelers', label: 'Declined', align: 'right', format: 'number' },
      { key: 'pendingTravelers', label: 'Pending', align: 'right', format: 'number' },
      { key: 'penetrationRate', label: 'Rate %', align: 'right', format: 'percent' },
    ],
    totalRules: {
      totalTravelers: 'sum',
      coveredTravelers: 'sum',
      ownInsuranceTravelers: 'sum',
      declinedTravelers: 'sum',
      pendingTravelers: 'sum',
      penetrationRate: 'avg',
    },
    summaryCards: [
      { key: 'totalTravelers', label: 'Total Travelers', format: 'number' },
      { key: 'coveredTravelers', label: 'Covered', format: 'number' },
      { key: 'penetrationRate', label: 'Avg Penetration Rate', format: 'percent' },
    ],
  },

  'insurance-declines': {
    columns: [
      { key: 'tripName', label: 'Trip' },
      { key: 'travelerName', label: 'Traveler' },
      { key: 'departureDate', label: 'Departure', format: 'date' },
      { key: 'declinedAt', label: 'Declined At', format: 'date' },
      { key: 'declinedReason', label: 'Reason' },
      { key: 'isAcknowledged', label: 'Acknowledged' },
      { key: 'acknowledgedAt', label: 'Acknowledged At', format: 'date' },
    ],
    totalRules: {},
    summaryCards: [
      { key: '_rowCount', label: 'Total Declines', format: 'number' },
    ],
  },

  'insurance-revenue': {
    columns: [
      { key: 'providerName', label: 'Provider' },
      { key: 'packageName', label: 'Package' },
      { key: 'policyType', label: 'Policy Type' },
      { key: 'packageCount', label: 'Policies', align: 'right', format: 'number' },
      { key: 'travelerCount', label: 'Travelers', align: 'right', format: 'number' },
      { key: 'totalPremiumCents', label: 'Total Premium', align: 'right', format: 'currency', mono: true },
      { key: 'totalCoverageCents', label: 'Total Coverage', align: 'right', format: 'currency', mono: true },
    ],
    totalRules: {
      packageCount: 'sum',
      travelerCount: 'sum',
      totalPremiumCents: 'sum',
      totalCoverageCents: 'sum',
    },
    summaryCards: [
      { key: 'totalPremiumCents', label: 'Total Premium', format: 'currency' },
      { key: 'totalCoverageCents', label: 'Total Coverage', format: 'currency' },
      { key: 'travelerCount', label: 'Total Travelers', format: 'number' },
    ],
  },

  'insurance-by-policy-type': {
    columns: [
      { key: 'policyType', label: 'Policy Type' },
      { key: 'packageCount', label: 'Policies', align: 'right', format: 'number' },
      { key: 'travelerCount', label: 'Travelers', align: 'right', format: 'number' },
      { key: 'totalPremiumCents', label: 'Total Premium', align: 'right', format: 'currency', mono: true },
      { key: 'avgPremiumCents', label: 'Avg Premium', align: 'right', format: 'currency', mono: true },
      { key: 'penetrationRate', label: 'Rate %', align: 'right', format: 'percent' },
    ],
    totalRules: {
      packageCount: 'sum',
      travelerCount: 'sum',
      totalPremiumCents: 'sum',
      avgPremiumCents: 'avg',
      penetrationRate: 'avg',
    },
    summaryCards: [
      { key: 'totalPremiumCents', label: 'Total Premium', format: 'currency' },
      { key: 'packageCount', label: 'Total Policies', format: 'number' },
      { key: 'penetrationRate', label: 'Avg Penetration Rate', format: 'percent' },
    ],
  },

  'insurance-unresolved': {
    columns: [
      { key: 'tripName', label: 'Trip' },
      { key: 'travelerName', label: 'Traveler' },
      { key: 'agentName', label: 'Agent' },
      { key: 'departureDate', label: 'Departure', format: 'date' },
      { key: 'daysUntilDeparture', label: 'Days Away', align: 'right', format: 'number' },
      { key: 'status', label: 'Status' },
    ],
    totalRules: {},
    summaryCards: [
      { key: '_rowCount', label: 'Unresolved Cases', format: 'number' },
    ],
  },
}
