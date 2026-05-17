/**
 * Currency Conversion Helpers
 *
 * Centralized utilities for converting between dollars and cents,
 * preventing floating-point errors and maintaining consistency across all forms.
 */

/**
 * Convert dollars (string or number) to cents (integer)
 * Handles empty strings gracefully by returning 0
 */
export function dollarsToCents(value: string | number): number {
  if (value === '' || value === null || value === undefined) {
    return 0
  }

  const dollars = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(dollars)) {
    return 0
  }

  return Math.round(dollars * 100)
}

/**
 * Convert cents (integer) to dollars (formatted string with 2 decimals)
 */
export function centsToDollars(cents: number): string {
  if (cents === null || cents === undefined || isNaN(cents)) {
    return '0.00'
  }

  return (cents / 100).toFixed(2)
}

/**
 * Format cents as currency with symbol
 */
export function formatCurrency(cents: number, currency: string = 'CAD'): string {
  if (cents === null || cents === undefined || isNaN(cents)) {
    return `${getCurrencySymbol(currency)}0.00`
  }

  const dollars = (cents / 100).toFixed(2)
  return `${getCurrencySymbol(currency)}${dollars}`
}

/**
 * Get currency symbol for a given currency code
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    CAD: '$',
    EUR: '€',
    GBP: '£',
  }

  return symbols[currency] || currency + ' '
}

/**
 * Build initial pricing state from fetched component data
 * Utility to avoid duplication in edit mode loaders
 */
export function buildInitialPricingState(component: any) {
  // #441 / #443: the activity DTO nests pricing fields under `pricing.*`
  // (totalPriceCents, taxesAndFeesCents, commissionTotalCents, currency,
  // pricingType, pricingBreakdownJson, supplier, etc.). Reading them at
  // the top level returned undefined → 0 → form hydration showed $0 even
  // when DB had a price, and the payment-schedule preview submitted
  // $0/$0 deposit rows that the API rightly rejected with "Expected
  // payment items must sum to total. Expected: X, Got: 0".
  //
  // Prefer the nested `pricing` block; fall back to top-level so legacy
  // callers with flat DTOs (e.g. trip-order builders) still work.
  const p = component?.pricing ?? component
  return {
    totalPriceCents: p?.totalPriceCents ?? component?.totalPriceCents ?? 0,
    taxesAndFeesCents: p?.taxesAndFeesCents ?? component?.taxesAndFeesCents ?? 0,
    currency: p?.currency ?? component?.currency ?? 'CAD',
    commissionTotalCents: p?.commissionTotalCents ?? component?.commissionTotalCents ?? 0,
    commissionSplitPercentage: (p?.commissionSplitPercentage ?? component?.commissionSplitPercentage)
      ? parseFloat(p?.commissionSplitPercentage ?? component?.commissionSplitPercentage)
      : 0,
    commissionExpectedDate: p?.commissionExpectedDate ?? component?.commissionExpectedDate ?? null,
    termsAndConditions: p?.termsAndConditions ?? component?.termsAndConditions ?? '',
    cancellationPolicy: p?.cancellationPolicy ?? component?.cancellationPolicy ?? '',
    confirmationNumber: component?.confirmationNumber ?? '',
    referralUrl: component?.referralUrl ?? '',
    supplier: p?.supplier ?? component?.supplier ?? '',
    pricingBreakdown: component?.pricingBreakdownJson ?? p?.pricingBreakdownJson ?? null,
  }
}
