'use client'

/**
 * BookingChecklist — live "what's missing before you can book?" widget.
 *
 * Lives at the top of the activity edit form's booking tab. Subscribes to
 * the same /bookings/activities/:id/validate endpoint that the
 * Mark-as-Booked action uses, and renders the full canonical check list
 * with passing / failing state per item.
 *
 * Failing rows are clickable — clicking jumps the user to the right tab
 * (general / booking / pricing) and scroll-highlights the corresponding
 * `data-field` on the page. Same routing rules as BookingHeaderButton.
 *
 * When every check passes, the body collapses to a single green "Ready
 * to book" line; user can still expand it to review.
 *
 * The widget is hidden entirely when the activity is already booked —
 * the BookingHeaderButton renders its own "Booked on X" badge in that
 * state and the checklist would be noise.
 */

import { useMemo, useState } from 'react'
import { Check, CircleAlert, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBookingValidationQuery, type BookingValidationError } from '@/hooks/use-activity-bookings'
import {
  BOOKING_CHECKLIST,
  CATEGORY_LABELS,
  FIELD_MAP_BY_CODE,
  getTabForCode,
  type ChecklistCategory,
} from '@/lib/booking-validation/checklist-spec'

interface BookingChecklistProps {
  activityId: string | null
  activityType: string
  isBooked: boolean
  /** Switch to a specific tab in the parent form. */
  onNavigateToTab?: (tab: string) => void
}

function highlightField(fieldId: string) {
  const el = document.querySelector(`[data-field="${fieldId}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-amber-500')
  setTimeout(() => el.classList.remove('ring-2', 'ring-amber-500'), 5000)
}

export function BookingChecklist({
  activityId,
  activityType,
  isBooked,
  onNavigateToTab,
}: BookingChecklistProps) {
  const { data, isLoading, isFetching } = useBookingValidationQuery(activityId, !isBooked)
  const [expanded, setExpanded] = useState(false)

  const failingCodes = useMemo(() => {
    const set = new Set<string>()
    for (const err of (data?.errors ?? []) as BookingValidationError[]) {
      set.add(err.code)
    }
    return set
  }, [data])

  // Conditional checks (passport*) only count for activity types that
  // require them. We mirror the server policy: flight + custom_cruise.
  // For other types, drop the conditional rows entirely so they don't
  // skew the X/Y ready counter.
  const itemsForActivity = useMemo(() => {
    const passportApplies = activityType === 'flight' || activityType === 'custom_cruise'
    return BOOKING_CHECKLIST.filter((item) =>
      !item.conditional || passportApplies,
    )
  }, [activityType])

  const passingCount = itemsForActivity.filter((i) => !failingCodes.has(i.code)).length
  const total = itemsForActivity.length
  const allReady = data ? data.valid : false

  // Group items by category for the expanded view.
  const grouped = useMemo(() => {
    const map = new Map<ChecklistCategory, typeof itemsForActivity>()
    for (const item of itemsForActivity) {
      const existing = map.get(item.category) ?? []
      existing.push(item)
      map.set(item.category, existing)
    }
    return map
  }, [itemsForActivity])

  if (!activityId) return null
  if (isBooked) return null

  const handleItemClick = (code: string) => {
    onNavigateToTab?.(getTabForCode(code, activityType))
    const field = FIELD_MAP_BY_CODE[code]
    if (field) {
      // Delay so tab switch animation completes first.
      setTimeout(() => highlightField(field), 250)
    }
  }

  return (
    <Card className={cn('border-2', allReady ? 'border-green-500 bg-green-50' : 'border-amber-300 bg-amber-50')}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-amber-700" />
          ) : allReady ? (
            <Check className="h-5 w-5 text-green-700" />
          ) : (
            <CircleAlert className="h-5 w-5 text-amber-700" />
          )}
          <span className={allReady ? 'text-green-900' : 'text-amber-900'}>
            {allReady
              ? 'Ready to book'
              : `Booking checklist — ${passingCount} of ${total} ready`}
          </span>
          {isFetching && !isLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" aria-label="refreshing" />
          )}
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse checklist' : 'Expand checklist'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pb-4 pt-0">
          {(['activity', 'travelers', 'pricing', 'confirmation'] as ChecklistCategory[]).map((cat) => {
            const items = grouped.get(cat) ?? []
            if (items.length === 0) return null
            return (
              <div key={cat} className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  {CATEGORY_LABELS[cat]}
                </div>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const failing = failingCodes.has(item.code)
                    return (
                      <li key={item.code} className="flex items-start gap-2 text-sm">
                        {failing ? (
                          <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                        ) : (
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700" />
                        )}
                        {failing ? (
                          <button
                            type="button"
                            onClick={() => handleItemClick(item.code)}
                            className="text-left text-amber-900 underline decoration-amber-400 decoration-dotted underline-offset-2 hover:text-amber-700"
                          >
                            {item.label}
                            {item.hint && (
                              <span className="block text-xs font-normal text-amber-800/70">
                                {item.hint}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-700 line-through decoration-gray-400">{item.label}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}
