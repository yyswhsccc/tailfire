/**
 * Get current date components in Eastern Time (America/New_York).
 * Handles EST/EDT automatically.
 */
export function getEasternNow(): { year: number; month: number; day: number } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  return {
    year: Number(parts.find(p => p.type === 'year')!.value),
    month: Number(parts.find(p => p.type === 'month')!.value), // 1-indexed (Jan=1)
    day: Number(parts.find(p => p.type === 'day')!.value),
  }
}
