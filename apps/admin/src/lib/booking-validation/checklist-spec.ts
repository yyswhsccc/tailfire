/**
 * Booking-checklist canonical spec.
 *
 * The API's `/bookings/activities/:id/validate` endpoint returns the SUBSET
 * of required checks that are currently failing. To render a full "X of Y
 * ready" checklist we need the complete catalogue here on the client.
 *
 * Source of truth: apps/api/src/trips/booking-validation.service.ts. Keep
 * the two in sync — if you add or remove a check there, mirror it here.
 *
 * The list is intentionally flat (one entry per error code) so traveler-
 * scoped checks like `TRAVELER_DOB` collapse to a single checklist row
 * even when N travelers each contribute a failure.
 */

export type ChecklistCategory = 'activity' | 'travelers' | 'pricing' | 'confirmation'

export interface ChecklistItemSpec {
  /** Validation error code from the API. */
  code: string
  /** Friendly label shown in the checklist UI. */
  label: string
  /** Optional one-line clarifier shown below the label on failure. */
  hint?: string
  category: ChecklistCategory
  /** True when this check only ever applies to specific activity types (e.g. passport for flights). */
  conditional?: boolean
}

export const BOOKING_CHECKLIST: ChecklistItemSpec[] = [
  // Activity info
  { code: 'SUPPLIER_MISSING', label: 'Supplier identified', category: 'activity' },
  { code: 'START_DATE_MISSING', label: 'Start date & time set', category: 'activity' },
  { code: 'END_DATE_MISSING', label: 'End date & time set', category: 'activity' },
  { code: 'DATE_ORDER_INVALID', label: 'Start is before end', category: 'activity' },
  { code: 'CONFIRMATION_NUMBER_MISSING', label: 'Confirmation number entered', category: 'activity' },

  // Travelers (collapsed; one row per check class regardless of traveler count)
  { code: 'NO_TRAVELERS', label: 'At least one traveler assigned', category: 'travelers' },
  { code: 'TRAVELER_FIRST_NAME', label: 'All travelers have first names', category: 'travelers' },
  { code: 'TRAVELER_LAST_NAME', label: 'All travelers have last names', category: 'travelers' },
  { code: 'TRAVELER_DOB', label: 'All travelers have date of birth', category: 'travelers' },
  { code: 'TRAVELER_ADDRESS', label: 'All travelers have an address', category: 'travelers' },
  {
    code: 'PASSPORT_NUMBER_MISSING',
    label: 'Passport numbers on file (for flights & cruises)',
    category: 'travelers',
    conditional: true,
  },
  {
    code: 'PASSPORT_EXPIRY_MISSING',
    label: 'Passport expiry on file (for flights & cruises)',
    category: 'travelers',
    conditional: true,
  },
  {
    code: 'PASSPORT_EXPIRY_TOO_SOON',
    label: 'Passport valid 6+ months past travel',
    hint: 'Most carriers reject passports expiring within 6 months of travel.',
    category: 'travelers',
    conditional: true,
  },

  // Pricing & payment
  { code: 'PRICE_MISSING', label: 'Total price > 0', category: 'pricing' },
  { code: 'PAYMENT_SCHEDULE_MISSING', label: 'Payment schedule defined', category: 'pricing' },
  { code: 'PAYMENT_ITEMS_MISSING', label: 'At least one expected payment item', category: 'pricing' },
  {
    code: 'PAYMENT_DUE_DATE_MISSING',
    label: 'At least one payment item has a due date',
    category: 'pricing',
  },
  {
    code: 'FINAL_PAYMENT_AFTER_DEPARTURE',
    label: 'Final payment due before departure',
    category: 'pricing',
  },

  // Confirmation / receipts
  {
    code: 'NON_REFUNDABLE_NOT_SET',
    label: 'Non-refundable amount set when flag is on',
    category: 'confirmation',
  },
  {
    code: 'NON_REFUNDABLE_EXCEEDS_DEPOSIT',
    label: 'Non-refundable does not exceed deposit',
    category: 'confirmation',
  },
]

export const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  activity: 'Activity info',
  travelers: 'Travelers',
  pricing: 'Pricing & payment',
  confirmation: 'Confirmation',
}

/**
 * Activity types whose pricing fields live on a dedicated "pricing" tab
 * (vs. mixed-in on the booking tab).
 */
const PRICING_TAB_FORMS = new Set([
  'custom_cruise',
  'dining',
  'options',
  'transportation',
  'port_info',
])

const PRICING_CODES = new Set([
  'SUPPLIER_MISSING',
  'PRICE_MISSING',
  'PAYMENT_SCHEDULE_MISSING',
  'PAYMENT_ITEMS_MISSING',
  'PAYMENT_DUE_DATE_MISSING',
  'CONFIRMATION_NUMBER_MISSING',
  'FINAL_PAYMENT_AFTER_DEPARTURE',
  'NON_REFUNDABLE_NOT_SET',
  'NON_REFUNDABLE_EXCEEDS_DEPOSIT',
  'BOOKING_DATE_MISSING',
])

/**
 * Map a validation error code to the tab the user needs to visit to fix it.
 * Mirrors getTabForError in booking-header-button.tsx; consolidated here so
 * the BookingChecklist can use the same routing without duplicating the rule.
 */
export function getTabForCode(code: string, activityType: string): string {
  if (PRICING_CODES.has(code)) {
    return PRICING_TAB_FORMS.has(activityType) ? 'pricing' : 'booking'
  }
  return 'general'
}

/** Error code → data-field attribute for scroll-to-highlight. */
export const FIELD_MAP_BY_CODE: Record<string, string> = {
  SUPPLIER_MISSING: 'supplier',
  START_DATE_MISSING: 'startDatetime',
  END_DATE_MISSING: 'endDatetime',
  PRICE_MISSING: 'totalPrice',
  CONFIRMATION_NUMBER_MISSING: 'confirmationNumber',
  PAYMENT_SCHEDULE_MISSING: 'paymentSchedule',
  NO_TRAVELERS: 'travelers',
  TRAVELER_FIRST_NAME: 'travelers',
  TRAVELER_LAST_NAME: 'travelers',
  TRAVELER_DOB: 'travelers',
  TRAVELER_ADDRESS: 'travelers',
  PASSPORT_NUMBER_MISSING: 'travelers',
  PASSPORT_EXPIRY_MISSING: 'travelers',
  PASSPORT_EXPIRY_TOO_SOON: 'travelers',
  PAYMENT_ITEMS_MISSING: 'paymentSchedule',
  PAYMENT_DUE_DATE_MISSING: 'paymentSchedule',
  FINAL_PAYMENT_AFTER_DEPARTURE: 'paymentSchedule',
  NON_REFUNDABLE_NOT_SET: 'paymentSchedule',
  NON_REFUNDABLE_EXCEEDS_DEPOSIT: 'paymentSchedule',
}
