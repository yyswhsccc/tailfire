/**
 * Z-Index Layer Constants
 *
 * Centralized z-index management for consistent stacking contexts.
 * Use these constants instead of hardcoded values to prevent conflicts.
 *
 * Current Usage Audit (as of Phase 1.3):
 * - Radix UI components (popovers, tooltips, dialogs): z-50
 * - Sticky header (top-nav): z-50
 * - Toast notifications: z-[200]
 *
 * Date Picker Strategy:
 * - Default to Radix z-50 (inherited from Popover component)
 * - Only override if pilot testing shows clipping in dialogs
 */

export const Z_INDEX = {
  /**
   * Base layer for sticky headers and navigation
   * Used by: top-nav.tsx
   */
  STICKY_HEADER: 50,

  /**
   * Radix UI default for popovers, tooltips, dropdowns, menus
   * Used by: popover, tooltip, dropdown-menu, menubar, date-picker
   */
  POPOVER: 50,

  /**
   * Dialog overlays and content
   * Used by: dialog, alert-dialog
   */
  DIALOG: 50,

  /**
   * Toast notifications (highest priority)
   * Used by: toast
   */
  TOAST: 200,
} as const

/**
 * Helper to get Tailwind z-index class
 * @example getTailwindZIndex('POPOVER') => 'z-50'
 */
export function getTailwindZIndex(layer: keyof typeof Z_INDEX): string {
  const value = Z_INDEX[layer]
  return `z-[${value}]`
}

/**
 * Type-safe z-index layer names
 */
export type ZIndexLayer = keyof typeof Z_INDEX
