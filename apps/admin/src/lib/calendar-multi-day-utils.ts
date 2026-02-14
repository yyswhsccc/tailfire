import { parseISO, isSameDay, format } from 'date-fns'
import type { CalendarEvent } from '@tailfire/shared-types/api'

// ============================================================================
// TYPES
// ============================================================================

export interface MultiDaySegment {
  event: CalendarEvent
  startCol: number // 0-6
  colSpan: number // 1-7
  isStart: boolean // event starts this week
  isEnd: boolean // event ends this week
  lane: number // vertical slot (0-based)
}

export interface WeekMultiDayLayout {
  segments: MultiDaySegment[]
  laneCount: number // capped at MAX_LANES
  overflowCount: number // events that didn't fit in lanes
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_LANES = 3

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Returns true if the event is an allDay event with a different end date from start.
 * Only allDay events become spanning bars to avoid converting timed events.
 */
export function isMultiDayEvent(event: CalendarEvent): boolean {
  if (!event.allDay || !event.end) return false
  const start = parseISO(event.start)
  const end = parseISO(event.end)
  // Guard against malformed data where end is before start
  if (end < start) return false
  return !isSameDay(start, end)
}

/**
 * For each week in the calendar grid, compute which multi-day events overlap it,
 * clamp to week boundaries, and return segments with lane assignments.
 *
 * End dates are treated as inclusive (a trip ending on Friday shows through Friday).
 */
export function computeMultiDaySegments(
  events: CalendarEvent[],
  weeks: Date[][]
): WeekMultiDayLayout[] {
  const multiDayEvents = events.filter(isMultiDayEvent)

  return weeks.map((week) => {
    const firstDay = week[0]
    const lastDay = week[week.length - 1]
    if (!firstDay || !lastDay) return { segments: [], laneCount: 0, overflowCount: 0 }
    const weekStartKey = format(firstDay, 'yyyy-MM-dd')
    const weekEndKey = format(lastDay, 'yyyy-MM-dd')

    const segments: Omit<MultiDaySegment, 'lane'>[] = []

    for (const event of multiDayEvents) {
      const eventStartKey = format(parseISO(event.start), 'yyyy-MM-dd')
      const eventEndKey = format(parseISO(event.end!), 'yyyy-MM-dd')

      // Check overlap: event must start on or before week end, and end on or after week start
      if (eventStartKey > weekEndKey || eventEndKey < weekStartKey) continue

      // Clamp to week boundaries
      const clampedStartKey = eventStartKey < weekStartKey ? weekStartKey : eventStartKey
      const clampedEndKey = eventEndKey > weekEndKey ? weekEndKey : eventEndKey

      // Find column indices
      const startCol = week.findIndex(
        (d) => format(d, 'yyyy-MM-dd') === clampedStartKey
      )
      const endCol = week.findIndex(
        (d) => format(d, 'yyyy-MM-dd') === clampedEndKey
      )

      if (startCol === -1 || endCol === -1) continue

      segments.push({
        event,
        startCol,
        colSpan: endCol - startCol + 1,
        isStart: eventStartKey === clampedStartKey,
        isEnd: eventEndKey === clampedEndKey,
      })
    }

    return assignLanes(segments)
  })
}

/**
 * Greedy lane packing: sort by startCol, then colSpan desc (wider first),
 * then event.id for deterministic tiebreaker. Assign each segment to the
 * lowest lane with no column overlap. Cap at MAX_LANES - excess events
 * count toward overflow.
 */
function assignLanes(
  segments: Omit<MultiDaySegment, 'lane'>[]
): WeekMultiDayLayout {
  // Sort: leftmost first, then widest first, then by id for determinism
  const sorted = [...segments].sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol
    if (a.colSpan !== b.colSpan) return b.colSpan - a.colSpan
    return a.event.id.localeCompare(b.event.id)
  })

  const assignedSegments: MultiDaySegment[] = []
  let overflowCount = 0
  // Track occupied columns per lane: laneOccupied[lane] = set of occupied column indices
  const laneOccupied: Set<number>[] = []

  for (const segment of sorted) {
    const cols = new Set<number>()
    for (let c = segment.startCol; c < segment.startCol + segment.colSpan; c++) {
      cols.add(c)
    }

    // Find lowest lane with no overlap
    let assignedLane = -1
    for (let lane = 0; lane < MAX_LANES; lane++) {
      if (!laneOccupied[lane]) {
        laneOccupied[lane] = new Set()
      }
      const laneSet = laneOccupied[lane]!
      const hasOverlap = [...cols].some((c) => laneSet.has(c))
      if (!hasOverlap) {
        assignedLane = lane
        break
      }
    }

    if (assignedLane === -1) {
      overflowCount++
      continue
    }

    // Mark columns as occupied
    const assignedSet = laneOccupied[assignedLane]!
    for (const c of cols) {
      assignedSet.add(c)
    }

    assignedSegments.push({ ...segment, lane: assignedLane })
  }

  const laneCount = Math.min(
    MAX_LANES,
    assignedSegments.length > 0
      ? Math.max(...assignedSegments.map((s) => s.lane)) + 1
      : 0
  )

  return { segments: assignedSegments, laneCount, overflowCount }
}
