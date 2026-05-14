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
  return {
    totalPriceCents: component.totalPriceCents || 0,
    taxesAndFeesCents: component.taxesAndFeesCents || 0,
    currency: component.currency || 'CAD',
    commissionTotalCents: component.commissionTotalCents || 0,
    commissionSplitPercentage: component.commissionSplitPercentage ? parseFloat(component.commissionSplitPercentage) : 0,
    commissionExpectedDate: component.commissionExpectedDate || null,
    termsAndConditions: component.termsAndConditions || '',
    cancellationPolicy: component.cancellationPolicy || '',
    confirmationNumber: component.confirmationNumber || '',
    referralUrl: component.referralUrl || '',
    supplier: component.supplier || '',
    pricingBreakdown: component.pricingBreakdownJson ?? null,
  }
}
