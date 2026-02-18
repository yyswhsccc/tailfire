/**
 * Spanning Activity Utilities
 *
 * Provides functions to determine if activities span multiple days,
 * calculate which days they cover, and validate date boundaries.
 *
 * Design Principles:
 * - Use day.date (YYYY-MM-DD) for day boundary comparisons (no timezone shift)
 * - Use normalizeToDateString to extract date from datetime strings
 * - Activities without endDatetime or same-day end are NOT spanning
 */

import type { ActivityResponseDto, ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
import { parseISODate, normalizeToDateString, getDaysDifference } from './date-utils'

/**
 * Extended activity type with span information
 */
export interface ActivityWithSpan extends ActivityResponseDto {
  /** Index of the first day column this activity spans (0-based) */
  spanStartIndex: number
  /** Number of day columns this activity spans */
  spanWidth: number
  /** Array of day IDs this activity covers */
  spannedDayIds: string[]
}

/**
 * Result from processing activities for spanning
 */
export interface SpanningActivitiesResult {
  /** Activities that span 2+ days, with span metadata */
  spanningActivities: ActivityWithSpan[]
  /** Map of dayId -> activities that are single-day (non-spanning) */
  dayActivities: Map<string, ActivityResponseDto[]>
  /** Map of parentActivityId -> child activities (e.g., port_info for cruises) */
  childActivitiesByParent: Map<string, ActivityResponseDto[]>
}

/**
 * Extract the date portion (YYYY-MM-DD) from an ISO datetime string
 * Uses UTC to avoid timezone shifting
 */
function getDateFromDatetime(datetime: string | null | undefined): string | null {
  if (!datetime) return null
  // normalizeToDateString handles both YYYY-MM-DD and full datetime strings
  const normalized = normalizeToDateString(datetime, 'UTC')
  return normalized || null
}

/**
 * Check if an activity spans multiple days
 *
 * An activity is considered "spanning" if:
 * 1. It has both startDatetime and endDatetime
 * 2. The end date is at least 1 day after the start date
 * 3. The activity type naturally spans multiple days (lodging, package, tour, cruise)
 *
 * Flights and transportation are never spanning — they are point-in-time events
 * that belong to their departure/pickup day, even if UTC timestamps cross midnight.
 *
 * @param activity - The activity to check
 * @returns true if the activity spans 2+ days
 */
export function isSpanningActivity(activity: ActivityResponseDto): boolean {
  const { startDatetime, endDatetime, activityType } = activity

  // Flights and transportation are never spanning — they sit on their departure day
  const NON_SPANNING_TYPES = ['flight', 'transportation', 'dining']
  if (NON_SPANNING_TYPES.includes(activityType)) {
    return false
  }

  // Must have both start and end
  if (!startDatetime || !endDatetime) {
    return false
  }

  const startDate = getDateFromDatetime(startDatetime)
  const endDate = getDateFromDatetime(endDatetime)

  if (!startDate || !endDate) {
    return false
  }

  // Spanning if end date is after start date
  return endDate > startDate
}

/**
 * Get the array of day IDs that an activity spans
 *
 * @param activity - The activity (must have startDatetime and endDatetime)
 * @param days - Array of itinerary days sorted by dayNumber
 * @returns Array of day IDs the activity covers, or empty if not spanning
 */
export function getSpannedDayIds(
  activity: ActivityResponseDto,
  days: ItineraryDayWithActivitiesDto[]
): string[] {
  const { startDatetime, endDatetime } = activity

  if (!startDatetime || !endDatetime) {
    return []
  }

  const startDate = getDateFromDatetime(startDatetime)
  const endDate = getDateFromDatetime(endDatetime)

  if (!startDate || !endDate) {
    return []
  }

  // Find all days whose date falls within [startDate, endDate]
  const spannedIds: string[] = []

  for (const day of days) {
    if (!day.date) continue

    const dayDate = normalizeToDateString(day.date, 'UTC')
    if (!dayDate) continue

    // Include day if its date is >= start and <= end
    if (dayDate >= startDate && dayDate <= endDate) {
      spannedIds.push(day.id)
    }
  }

  return spannedIds
}

/**
 * Get the column index where a spanning activity starts
 *
 * @param activity - The activity (must have startDatetime)
 * @param days - Array of itinerary days sorted by dayNumber
 * @returns 0-based column index, or -1 if not found
 */
export function getSpanStartIndex(
  activity: ActivityResponseDto,
  days: ItineraryDayWithActivitiesDto[]
): number {
  const { startDatetime } = activity

  if (!startDatetime) {
    return -1
  }

  const startDate = getDateFromDatetime(startDatetime)
  if (!startDate) {
    return -1
  }

  // Find the day index matching the start date
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!
    if (!day.date) continue

    const dayDate = normalizeToDateString(day.date, 'UTC')
    if (dayDate === startDate) {
      return i
    }
  }

  // Start date might be before first day - return 0 (clamp to start)
  const firstDayDate = days[0]?.date ? normalizeToDateString(days[0].date, 'UTC') : null
  if (firstDayDate && startDate < firstDayDate) {
    return 0
  }

  return -1
}

/**
 * Get the number of columns a spanning activity covers
 *
 * @param activity - The activity
 * @param days - Array of itinerary days sorted by dayNumber
 * @returns Number of columns (1 if not spanning or invalid)
 */
export function getSpanWidth(
  activity: ActivityResponseDto,
  days: ItineraryDayWithActivitiesDto[]
): number {
  const spannedIds = getSpannedDayIds(activity, days)
  return Math.max(1, spannedIds.length)
}

/**
 * Validation result for activity dates
 */
export interface DateValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate activity dates against itinerary and trip bounds
 *
 * @param startDatetime - Activity start datetime (ISO string)
 * @param endDatetime - Activity end datetime (ISO string)
 * @param days - Array of itinerary days
 * @param tripStartDate - Trip start date (YYYY-MM-DD)
 * @param tripEndDate - Trip end date (YYYY-MM-DD)
 * @returns Validation result with errors and warnings
 */
export function validateActivityDates(
  startDatetime: string | null | undefined,
  endDatetime: string | null | undefined,
  days: ItineraryDayWithActivitiesDto[],
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined
): DateValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // If no dates provided, nothing to validate
  if (!startDatetime && !endDatetime) {
    return { isValid: true, errors, warnings }
  }

  const startDate = getDateFromDatetime(startDatetime)
  const endDate = getDateFromDatetime(endDatetime)

  // If end datetime is set, start must also be set
  if (endDatetime && !startDatetime) {
    errors.push('End date requires a start date')
  }

  // End must be after or equal to start
  if (startDate && endDate && endDate < startDate) {
    errors.push('End date must be on or after start date')
  }

  // Check against trip bounds
  if (tripStartDate && tripEndDate) {
    const tripStart = normalizeToDateString(tripStartDate, 'UTC')
    const tripEnd = normalizeToDateString(tripEndDate, 'UTC')

    if (tripStart && tripEnd) {
      if (startDate && startDate < tripStart) {
        warnings.push('Start date is before trip start')
      }
      if (startDate && startDate > tripEnd) {
        errors.push('Start date is after trip end')
      }
      if (endDate && endDate > tripEnd) {
        warnings.push('End date extends beyond trip end')
      }
    }
  }

  // Check if start date matches an existing itinerary day
  if (startDate && days.length > 0) {
    const matchingDay = days.find((day) => {
      if (!day.date) return false
      return normalizeToDateString(day.date, 'UTC') === startDate
    })

    if (!matchingDay) {
      warnings.push('Start date does not match any itinerary day')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Process itinerary days to separate spanning and non-spanning activities
 *
 * @param days - Array of itinerary days with their activities
 * @returns Categorized activities with span metadata
 */
export function processSpanningActivities(
  days: ItineraryDayWithActivitiesDto[]
): SpanningActivitiesResult {
  const spanningActivities: ActivityWithSpan[] = []
  const dayActivities = new Map<string, ActivityResponseDto[]>()
  const childActivitiesByParent = new Map<string, ActivityResponseDto[]>()
  const processedSpanningIds = new Set<string>()

  // Initialize dayActivities map for each day
  for (const day of days) {
    dayActivities.set(day.id, [])
  }

  // First pass: collect all activities and identify spanning ones
  for (const day of days) {
    if (!day.activities) continue

    for (const activity of day.activities) {
      // Track child activities (e.g., port_info under cruise)
      if (activity.parentActivityId) {
        const existing = childActivitiesByParent.get(activity.parentActivityId) || []
        existing.push(activity)
        childActivitiesByParent.set(activity.parentActivityId, existing)
      }

      // Check if this is a spanning activity
      if (isSpanningActivity(activity) && !processedSpanningIds.has(activity.id)) {
        processedSpanningIds.add(activity.id)

        const spannedDayIds = getSpannedDayIds(activity, days)
        const spanStartIndex = getSpanStartIndex(activity, days)
        const spanWidth = spannedDayIds.length

        // Only treat as spanning if it actually covers 2+ days
        if (spanWidth >= 2) {
          spanningActivities.push({
            ...activity,
            spanStartIndex,
            spanWidth,
            spannedDayIds,
          })
          continue
        }
      }

      // Not spanning - add to day activities
      // Child activities (e.g., port_info) ARE shown in their respective days, even when parent spans
      // Only skip the parent activity itself if it's spanning (it's rendered in the spanning layer)
      if (!processedSpanningIds.has(activity.id)) {
        const existing = dayActivities.get(day.id) || []
        existing.push(activity)
        dayActivities.set(day.id, existing)
      }
    }
  }

  // Sort spanning activities by start index for consistent rendering
  spanningActivities.sort((a, b) => a.spanStartIndex - b.spanStartIndex)

  return {
    spanningActivities,
    dayActivities,
    childActivitiesByParent,
  }
}

/**
 * Calculate the duration in nights for a spanning activity
 * Useful for display (e.g., "7 Night Cruise")
 *
 * @param activity - Activity with startDatetime and endDatetime
 * @returns Number of nights, or null if not calculable
 */
export function getActivityNights(activity: ActivityResponseDto): number | null {
  const { startDatetime, endDatetime } = activity

  if (!startDatetime || !endDatetime) {
    return null
  }

  const startDate = getDateFromDatetime(startDatetime)
  const endDate = getDateFromDatetime(endDatetime)

  if (!startDate || !endDate) {
    return null
  }

  const start = parseISODate(startDate)
  const end = parseISODate(endDate)

  if (!start || !end) {
    return null
  }

  return getDaysDifference(start, end)
}

/**
 * Check if an activity ID is a spanning activity
 * Utility for components that need to filter out spanning activities
 *
 * @param activityId - The activity ID to check
 * @param spanningActivities - Array of spanning activities
 * @returns true if the activity is in the spanning list
 */
export function isActivitySpanning(
  activityId: string,
  spanningActivities: ActivityWithSpan[]
): boolean {
  return spanningActivities.some((a) => a.id === activityId)
}
