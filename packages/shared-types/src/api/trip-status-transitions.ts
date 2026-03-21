/**
 * Trip Status Workflow
 *
 * Defines valid status transitions for trips across the entire system.
 * This is the single source of truth for status workflow validation.
 *
 * Used by:
 * - Database trigger: Enforces transitions at DB level
 * - TripsService: Validates transitions before update
 * - Frontend: Shows/hides status change buttons based on valid transitions
 *
 * Status Lifecycle:
 * ┌─────────┐
 * │ Inbound │ ──────────────────────────────┐
 * └─────────┘                               │
 *      │                                    ▼
 *      ▼                             ┌──────────┐
 * ┌──────────┐                       │ Cancelled│ (admin can un-cancel → planning)
 * │ Planning │ ◄─────────────────────┤          │
 * └──────────┘                       └──────────┘
 *      │    ▲                               ▲
 *      ▼    └─── (from cancelled)           │
 * ┌──────────┐                             │
 * │  Active  │ ────────────────────────────┤
 * └──────────┘                             │
 *      │                                   │
 *      ▼                                   │
 * ┌────────────┐                           │
 * │ Travelling │ ──────────────────────────┘
 * └────────────┘
 *      │
 *      ▼
 * ┌───────────┐
 * │ Travelled │ (terminal)
 * └───────────┘
 */

export type TripStatus = 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'

/**
 * Valid status transitions map
 *
 * Key: Current status
 * Value: Array of statuses that can be transitioned to
 *
 * Rules:
 * - Inbound → Planning (assign and begin planning), Cancelled
 * - Planning → Inbound (return to lead queue), Cancelled
 * - Active → Planning (revert), Travelling (trip started), Cancelled
 * - Travelling → Travelled (trip completed), Cancelled (trip cancelled mid-journey)
 * - Travelled → [] (terminal state)
 * - Cancelled → Planning (admin un-cancel)
 */
export const TRIP_STATUS_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  inbound: ['planning', 'cancelled'],
  planning: ['inbound', 'cancelled'],
  active: ['planning', 'travelling', 'cancelled'],
  travelling: ['travelled', 'cancelled'],
  travelled: [], // terminal state
  cancelled: ['planning'] // admin un-cancel
}

/**
 * Check if a status transition is valid
 *
 * @param from - Current trip status
 * @param to - Desired trip status
 * @returns true if transition is allowed, false otherwise
 *
 * @example
 * canTransitionTripStatus('planning', 'active') // true
 * canTransitionTripStatus('travelled', 'active') // false
 * canTransitionTripStatus('active', 'travelling') // true
 */
export function canTransitionTripStatus(from: TripStatus, to: TripStatus): boolean {
  // If status hasn't changed, allow it (no-op update)
  if (from === to) return true

  // Check if transition is in the valid transitions map
  return TRIP_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Get all valid transitions from a given status
 *
 * @param from - Current trip status
 * @returns Array of statuses that can be transitioned to
 *
 * @example
 * getValidTransitions('active') // ['planning', 'travelling', 'cancelled']
 * getValidTransitions('travelled') // []
 */
export function getValidTransitions(from: TripStatus): TripStatus[] {
  return TRIP_STATUS_TRANSITIONS[from] || []
}

/**
 * Get a human-readable error message for an invalid transition
 *
 * @param from - Current trip status
 * @param to - Attempted trip status
 * @returns Error message explaining why the transition is invalid
 *
 * @example
 * getTransitionErrorMessage('travelled', 'active')
 * // "Cannot transition from Travelled to Active. Travelled is a terminal state."
 */
export function getTransitionErrorMessage(from: TripStatus, to: TripStatus): string {
  const fromLabel = formatStatusLabel(from)
  const toLabel = formatStatusLabel(to)

  // Terminal states
  if (from === 'travelled') {
    return `Cannot transition from ${fromLabel} to ${toLabel}. ${fromLabel} is a terminal state.`
  }

  // Get valid transitions for helpful error message
  const validTransitions = getValidTransitions(from)
  if (validTransitions.length === 0) {
    return `Cannot transition from ${fromLabel}. ${fromLabel} is a terminal state.`
  }

  const validLabels = validTransitions.map(formatStatusLabel).join(', ')
  return `Cannot transition from ${fromLabel} to ${toLabel}. Valid transitions: ${validLabels}`
}

/**
 * Format status value to human-readable label
 *
 * @param status - Trip status value
 * @returns Formatted label
 *
 * @example
 * formatStatusLabel('travelling') // "Travelling"
 * formatStatusLabel('planning') // "Planning"
 */
export function formatStatusLabel(status: TripStatus): string {
  const labels: Record<TripStatus, string> = {
    inbound: 'Inbound',
    planning: 'Planning',
    active: 'Active',
    travelling: 'Travelling',
    travelled: 'Travelled',
    cancelled: 'Cancelled'
  }

  return labels[status] || status
}

/**
 * Check if a status is a terminal state (no further transitions allowed)
 *
 * @param status - Trip status to check
 * @returns true if status is terminal (completed or cancelled)
 *
 * @example
 * isTerminalStatus('travelled') // true
 * isTerminalStatus('cancelled') // true
 * isTerminalStatus('active') // false
 */
export function isTerminalStatus(status: TripStatus): boolean {
  return status === 'travelled' || status === 'cancelled'
}

// ============================================================================
// TRIP DELETION
// ============================================================================

/**
 * Statuses that allow trip deletion
 *
 * Only trips in early stages (inbound/planning) can be deleted.
 * Active, travelling, travelled, and cancelled trips cannot be deleted
 * because they may have:
 * - Payment records
 * - Booking confirmations
 * - Audit trail requirements
 * - Legal/compliance implications
 *
 * Used by:
 * - API: TripsService.remove() validates status before deletion
 * - Frontend: Shows delete vs cancel button based on status
 */
export const DELETABLE_STATUSES: readonly TripStatus[] = ['inbound', 'planning'] as const

/**
 * Check if a trip can be deleted based on its status
 *
 * @param status - The trip status (handles null/undefined safely)
 * @returns true if the trip can be deleted
 *
 * @example
 * canDeleteTrip('planning') // true
 * canDeleteTrip('inbound') // true
 * canDeleteTrip('active') // false
 * canDeleteTrip(null) // false
 */
export function canDeleteTrip(status: TripStatus | string | null | undefined): boolean {
  if (!status) return false
  return DELETABLE_STATUSES.includes(status as TripStatus)
}

/**
 * Get a human-readable error message for why a trip cannot be deleted
 *
 * @param status - The trip status
 * @returns Error message explaining why deletion is not allowed
 *
 * @example
 * getDeleteErrorMessage('active')
 * // "Cannot delete a trip that is active, travelling, travelled, or cancelled"
 */
export function getDeleteErrorMessage(status: TripStatus): string {
  if (canDeleteTrip(status)) {
    return '' // No error, deletion is allowed
  }
  return 'Cannot delete a trip that is active, travelling, travelled, or cancelled'
}
