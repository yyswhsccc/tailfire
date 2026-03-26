export function formatPrice(cents: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100)
}

export function calculateSavings(original: number, current: number): number {
  return Math.round(((original - current) / original) * 100)
}
