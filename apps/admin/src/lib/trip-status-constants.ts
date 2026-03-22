/**
 * Centralized Trip Status Configuration
 * Single source of truth for trip status mappings, labels, and variants
 *
 * Note: Deletion-related constants (DELETABLE_STATUSES, canDeleteTrip) are imported from
 * @tailfire/shared-types to maintain a single source of truth across API and frontend.
 */

// Import shared types from shared-types (using /api path to avoid node:crypto issue)
import { DELETABLE_STATUSES, canDeleteTrip, type TripStatus } from '@tailfire/shared-types/api'

// Re-export for consumers of this module
export { DELETABLE_STATUSES, canDeleteTrip, type TripStatus }

export type TripStatusVariant = 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled' | 'cancelled'

export type KanbanColumnId = 'inbound' | 'planning' | 'active' | 'travelling' | 'travelled'

interface TripStatusConfig {
  status: TripStatus
  label: string
  variant: TripStatusVariant
  columnId?: KanbanColumnId
}

/**
 * Complete trip status configuration
 * Maps each status to its display properties and Kanban column
 */
export const TRIP_STATUS_CONFIG: Record<TripStatus, TripStatusConfig> = {
  inbound: {
    status: 'inbound',
    label: 'Inbound',
    variant: 'inbound',
    columnId: 'inbound',
  },
  planning: {
    status: 'planning',
    label: 'Planning',
    variant: 'planning',
    columnId: 'planning',
  },
  active: {
    status: 'active',
    label: 'Active',
    variant: 'active',
    columnId: 'active',
  },
  travelling: {
    status: 'travelling',
    label: 'Travelling',
    variant: 'travelling',
    columnId: 'travelling',
  },
  travelled: {
    status: 'travelled',
    label: 'Travelled',
    variant: 'travelled',
    columnId: 'travelled',
  },
  cancelled: {
    status: 'cancelled',
    label: 'Cancelled',
    variant: 'cancelled',
    columnId: undefined, // Not shown in main Kanban
  },
} as const

/**
 * Kanban column configuration
 */
export const KANBAN_COLUMNS = [
  { id: 'inbound' as const, title: 'Inbound', statuses: ['inbound' as const] },
  { id: 'planning' as const, title: 'Planning', statuses: ['planning' as const] },
  { id: 'active' as const, title: 'Active', statuses: ['active' as const] },
  { id: 'travelling' as const, title: 'Travelling', statuses: ['travelling' as const] },
  { id: 'travelled' as const, title: 'Travelled', statuses: ['travelled' as const] },
] as const

/**
 * Map column IDs to their primary status
 */
export const COLUMN_TO_STATUS: Record<KanbanColumnId, TripStatus> = {
  inbound: 'inbound',
  planning: 'planning',
  active: 'active',
  travelling: 'travelling',
  travelled: 'travelled',
} as const

/**
 * Map statuses to their Kanban column ID
 */
export const STATUS_TO_COLUMN: Partial<Record<TripStatus, KanbanColumnId>> = {
  inbound: 'inbound',
  planning: 'planning',
  active: 'active',
  travelling: 'travelling',
  travelled: 'travelled',
} as const

// ============================================================================
// TYPED HELPER FUNCTIONS
// ============================================================================

/**
 * Get complete configuration for a trip status
 * @param status - The trip status
 * @returns Typed status configuration with label, variant, and column
 */
export function getStatusConfig(status: TripStatus): TripStatusConfig {
  return TRIP_STATUS_CONFIG[status]
}

/**
 * Get the display label for a trip status
 * @param status - The trip status
 * @returns Human-readable label (e.g., "Inbound", "Planning")
 */
export function getTripStatusLabel(status: TripStatus): string {
  return TRIP_STATUS_CONFIG[status].label
}

/**
 * Get the badge variant for a trip status
 * @param status - The trip status
 * @returns Badge variant for UI rendering
 */
export function getTripStatusVariant(status: TripStatus): TripStatusVariant {
  return TRIP_STATUS_CONFIG[status].variant
}

/**
 * Get the Kanban column ID for a trip status
 * @param status - The trip status
 * @returns Column ID if status belongs to a Kanban column, undefined otherwise
 */
export function getColumnForStatus(status: TripStatus): KanbanColumnId | undefined {
  return TRIP_STATUS_CONFIG[status].columnId
}

/**
 * Get the primary status for a Kanban column
 * @param columnId - The column ID
 * @returns The trip status for that column
 */
export function getStatusForColumn(columnId: KanbanColumnId): TripStatus {
  return COLUMN_TO_STATUS[columnId]
}

/**
 * Check if a status belongs to an active Kanban column
 * @param status - The trip status
 * @returns True if status is shown in main Kanban board
 */
export function isKanbanStatus(status: TripStatus): boolean {
  return TRIP_STATUS_CONFIG[status].columnId !== undefined
}

/**
 * Simple status to label mapping for UI components
 */
export const TRIP_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(TRIP_STATUS_CONFIG).map(([status, config]) => [status, config.label])
)

