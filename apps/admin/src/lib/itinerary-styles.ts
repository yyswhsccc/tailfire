/**
 * Shared styling constants for Trip Itinerary components
 *
 * These constants ensure consistent styling across all DnD zones and itinerary UI
 * without the overhead of Card's p-6 padding which is too large for dense layouts.
 */

/**
 * Card aesthetic for dense DnD zones
 * Use this instead of Card for day columns and activity containers
 */
export const ITINERARY_CARD_STYLES =
  'bg-white border border-ash-200 rounded-lg shadow-sm'

/**
 * Column widths for consistent board layout
 */
export const COLUMN_WIDTH = 'w-[248px] min-w-[248px] flex-shrink-0'
export const SUMMARY_COLUMN_WIDTH = 'w-[200px] min-w-[200px] flex-shrink-0'
export const SIDEBAR_WIDTH = 'w-[260px] min-w-[260px] flex-shrink-0'

/**
 * Drop zone styling with transitions
 * Apply DROP_ZONE_BASE to all drop zones, then conditionally add ACTIVE or INACTIVE
 */
export const DROP_ZONE_BASE = 'transition-all duration-200'
export const DROP_ZONE_ACTIVE =
  'bg-phoenix-gold-50 border-2 border-dashed border-phoenix-gold-500'
export const DROP_ZONE_INACTIVE = 'border-2 border-transparent'

/**
 * Focus-visible ring for accessibility
 * Apply to all interactive elements in the itinerary
 */
export const FOCUS_VISIBLE_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phoenix-gold-500 focus-visible:ring-offset-2'

/**
 * Drag overlay enhancement styles
 * Applied to dragged items for better visual feedback
 */
export const DRAG_OVERLAY_STYLES =
  'bg-white border-2 border-phoenix-gold-500 rounded-lg p-3 shadow-lg scale-105 rotate-2'

/**
 * Skeleton loading colors (lightweight)
 */
export const SKELETON_BG = 'bg-ash-100'

/**
 * Minimum height for drop zones
 */
export const DROP_ZONE_MIN_HEIGHT = 'min-h-[360px]'
