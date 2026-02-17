import type { SidebarSection } from '@/components/layout/detail-sidebar'
import { getActivityTypeMetadata, filterItineraryActivities } from '@/lib/activity-constants'
import { parseISODate } from '@/lib/date-utils'
import type { ItineraryDayResponseDto, ActivityResponseDto } from '@tailfire/shared-types/api'

/**
 * Build sidebar sections for activity navigation
 * Groups activities by day, sorted by dayNumber/date
 * Uses activity metadata for icons and labels
 */
export function buildActivityNavSidebar(
  tripId: string,
  daysWithActivities: (ItineraryDayResponseDto & { activities?: ActivityResponseDto[] })[] | undefined,
  currentActivityId?: string
): SidebarSection[] {
  // Return empty if no data
  if (!daysWithActivities || daysWithActivities.length === 0) {
    return []
  }

  // Sort days by dayNumber, fallback to date
  const sortedDays = [...daysWithActivities].sort((a, b) => {
    // Prefer dayNumber if available
    if (a.dayNumber != null && b.dayNumber != null) {
      return a.dayNumber - b.dayNumber
    }
    // Fallback to date comparison (use parseISODate for TZ-safe parsing)
    if (a.date && b.date) {
      const dateA = parseISODate(a.date)
      const dateB = parseISODate(b.date)
      if (dateA && dateB) {
        return dateA.getTime() - dateB.getTime()
      }
    }
    // Handle null cases
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })

  // Filter to only days with activities
  const daysWithContent = sortedDays.filter(
    (day) => day.activities && day.activities.length > 0
  )

  // Build sections - each day is a section
  return daysWithContent.map((day) => {
    // Format section title (use parseISODate for TZ-safe parsing)
    let title = `Day ${day.dayNumber || '?'}`
    if (day.date) {
      const date = parseISODate(day.date)
      if (date) {
        const formatted = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
        title = `${title} • ${formatted}`
      }
    }

    // Build items from activities (filter out packages - they belong in Bookings tab)
    const items = filterItineraryActivities(day.activities).map((activity) => {
        const metadata = getActivityTypeMetadata(activity.activityType)

        return {
          name: activity.name || metadata.defaultName,
          href: `/trips/${tripId}/activities/${activity.id}/edit`,
          icon: metadata.icon,
          isActive: currentActivityId === activity.id,
        }
      })

    return {
      title,
      items,
    }
  })
}
