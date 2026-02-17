'use client'

import { useMemo } from 'react'
import { CalendarDays, Check, AlertCircle } from 'lucide-react'
import type { ItineraryDayWithActivitiesDto } from '@tailfire/shared-types/api'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { findDayForDate, getDefaultMonthHint } from '@/lib/date-utils'

/**
 * Hook to resolve a selected date to a matching itinerary day.
 * Returns the computed dayId and matched day object.
 */
export function usePendingDayResolution(
  days: ItineraryDayWithActivitiesDto[],
  selectedDate: string | null | undefined
): {
  computedDayId: string | null
  matchedDay: ItineraryDayWithActivitiesDto | null
  dateRange: { minDate: string | undefined; maxDate: string | undefined }
} {
  // Calculate the resolved day from the selected date
  // findDayForDate returns DayMatch { dayId, dayNumber } - we need to find the full day object
  const { dayMatch, fullDay } = useMemo(() => {
    if (!selectedDate || days.length === 0) {
      return { dayMatch: null, fullDay: null }
    }
    const match = findDayForDate(selectedDate, days)
    if (!match) {
      return { dayMatch: null, fullDay: null }
    }
    // Find the full day object from the days array
    const day = days.find(d => d.id === match.dayId) ?? null
    return { dayMatch: match, fullDay: day }
  }, [selectedDate, days])

  // Get date range from days array
  const dateRange = useMemo(() => {
    if (days.length === 0) return { minDate: undefined, maxDate: undefined }
    const datesWithValues = days.filter(d => d.date).map(d => d.date as string).sort()
    return {
      minDate: datesWithValues[0],
      maxDate: datesWithValues[datesWithValues.length - 1],
    }
  }, [days])

  return {
    computedDayId: dayMatch?.dayId ?? null,
    matchedDay: fullDay,
    dateRange,
  }
}

export interface PendingDayPickerProps {
  /** Available itinerary days */
  days: ItineraryDayWithActivitiesDto[]
  /** Currently selected date (ISO string or null) */
  selectedDate: string | null
  /** Callback when date changes */
  onDateChange: (date: string | null) => void
  /** Trip start date for calendar default month hint */
  tripStartDate?: string | null
  /** The resolved day from selectedDate (from usePendingDayResolution hook) */
  matchedDay?: ItineraryDayWithActivitiesDto | null
  /** Date range constraints */
  dateRange?: { minDate: string | undefined; maxDate: string | undefined }
}

/**
 * Shared day picker component for pendingDay mode.
 * Renders a teal-styled date picker with day resolution feedback.
 * Use with usePendingDayResolution hook to compute matchedDay.
 */
export function PendingDayPicker({
  days,
  selectedDate,
  onDateChange,
  tripStartDate,
  matchedDay,
  dateRange,
}: PendingDayPickerProps) {
  // Compute date range if not provided
  const computedDateRange = useMemo(() => {
    if (dateRange) return dateRange
    if (days.length === 0) return { minDate: undefined, maxDate: undefined }
    const datesWithValues = days.filter(d => d.date).map(d => d.date as string).sort()
    return {
      minDate: datesWithValues[0],
      maxDate: datesWithValues[datesWithValues.length - 1],
    }
  }, [dateRange, days])

  // Trip month hint for date picker calendar default
  const tripMonthHint = useMemo(
    () => getDefaultMonthHint(tripStartDate),
    [tripStartDate]
  )

  return (
    <div className="p-4 bg-phoenix-gold-50 border border-phoenix-gold-200 rounded-lg mb-6">
      <div className="flex items-start gap-3">
        <CalendarDays className="h-5 w-5 text-phoenix-gold-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <label className="text-sm font-medium text-ash-900 block mb-2">
            Activity Date *
          </label>
          <DatePickerEnhanced
            value={selectedDate}
            onChange={onDateChange}
            minDate={computedDateRange.minDate}
            maxDate={computedDateRange.maxDate}
            placeholder="Select a date for this activity"
            defaultMonthHint={tripMonthHint}
          />
          {/* Day resolution feedback */}
          {selectedDate && matchedDay && (
            <p className="text-sm text-phoenix-gold-700 mt-2 flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              This activity will be added to <strong>Day {matchedDay.dayNumber}</strong>
            </p>
          )}
          {selectedDate && !matchedDay && (
            <p className="text-sm text-amber-600 mt-2 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              No matching day found for this date. Please select a date within the itinerary range.
            </p>
          )}
          {!selectedDate && (
            <p className="text-xs text-ash-500 mt-1">
              Select a date to determine which day this activity will be assigned to.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
