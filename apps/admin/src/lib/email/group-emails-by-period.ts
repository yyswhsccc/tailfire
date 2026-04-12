import { isToday, isYesterday, isThisWeek, startOfWeek, subWeeks, isAfter } from 'date-fns'
import type { SyncedEmailResponseDto } from '@tailfire/shared-types/api'

type GroupedItem =
  | { type: 'separator'; label: string }
  | { type: 'email'; email: SyncedEmailResponseDto }

export function groupEmailsByPeriod(emails: SyncedEmailResponseDto[]): GroupedItem[] {
  if (emails.length === 0) return []

  const result: GroupedItem[] = []
  let currentGroup = ''

  for (const email of emails) {
    const d = email.date ? new Date(email.date) : null
    const group = d ? getDateGroup(d) : 'Older'

    if (group !== currentGroup) {
      currentGroup = group
      result.push({ type: 'separator', label: group })
    }
    result.push({ type: 'email', email })
  }

  return result
}

function getDateGroup(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'This Week'
  const lastWeekStart = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1)
  if (isAfter(date, lastWeekStart)) return 'Last Week'
  return 'Older'
}
