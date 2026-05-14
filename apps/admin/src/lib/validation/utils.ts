/**
 * Form Validation Utilities
 *
 * Shared utilities for react-hook-form + Zod validation:
 * - Server error mapping
 * - Scroll to first error
 * - Error object flattening
 */

import { z } from 'zod'
import type { UseFormSetError, FieldValues, Path } from 'react-hook-form'
import type { ServerFieldError } from './types'

// ============================================================================
// Optional http(s) URL field (shared)
// ============================================================================

/**
 * Form-level schema for an optional external URL (e.g. activity referralUrl).
 * Accepts empty string (default form state); otherwise requires a parseable
 * URL whose protocol is http: or https:. Rejects javascript:/data:/file: etc.
 * so unsafe links can never be persisted and rendered as a CTA in the client
 * portal.
 */
export const optionalHttpsUrl = z
  .string()
  .optional()
  .default('')
  .superRefine((v, ctx) => {
    const trimmed = (v ?? '').trim()
    if (trimmed === '') return
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'URL must use http:// or https://',
        })
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must be a valid URL (e.g. https://example.com/book)',
      })
    }
  })


// Re-export types for convenience
export type { ServerFieldError } from './types'

// ============================================================================
// Flatten Errors (handles nested objects and arrays)
// ============================================================================

/**
 * Flattens a nested error object to get all leaf error paths.
 * Handles field arrays and nested objects (e.g., 'lodgingDetails.checkInDate').
 *
 * @param errors - RHF errors object
 * @param prefix - Current path prefix (for recursion)
 * @returns Array of dotted path strings to error fields
 */
export function flattenErrors(
  errors: Record<string, unknown>,
  prefix = ''
): string[] {
  return Object.entries(errors).flatMap(([key, value]) => {
    // Skip internal RHF properties
    if (key === 'ref' || key === 'type') return []

    const fullKey = prefix ? `${prefix}.${key}` : key

    // If this is a leaf error (has 'message' property), return the key
    if (value && typeof value === 'object' && 'message' in value) {
      return [fullKey]
    }

    // Handle arrays (field arrays)
    if (Array.isArray(value)) {
      return value.flatMap((item, index) => {
        if (!item) return []
        return flattenErrors(item as Record<string, unknown>, `${fullKey}.${index}`)
      })
    }

    // Handle nested objects
    if (value && typeof value === 'object') {
      return flattenErrors(value as Record<string, unknown>, fullKey)
    }

    return []
  })
}

// ============================================================================
// Scroll to First Error
// ============================================================================

/**
 * Scrolls to the first field with a validation error.
 * Uses data-field attribute (for Controllers) or name attribute (for register).
 *
 * @param errors - RHF errors object
 */
export function scrollToFirstError(errors: Record<string, unknown>): void {
  const keys = flattenErrors(errors)
  const firstKey = keys[0]

  if (!firstKey) return

  // Try data-field first (for Controller components), then name
  const el = document.querySelector(
    `[data-field="${firstKey}"], [name="${firstKey}"]`
  )

  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Focus the element if it's focusable
    if ('focus' in el && typeof el.focus === 'function') {
      setTimeout(() => (el as HTMLElement).focus(), 300)
    }
  }
}

// ============================================================================
// Map Server Errors to Form
// ============================================================================

/**
 * Maps server-side validation errors to RHF form errors.
 * Supports both flat field names and dotted paths for nested fields.
 *
 * @param errors - Array of server field errors
 * @param setError - RHF setError function
 * @param knownFields - List of valid field names for this form
 */
export function mapServerErrors<T extends FieldValues>(
  errors: ServerFieldError[] | undefined,
  setError: UseFormSetError<T>,
  knownFields: readonly string[]
): void {
  if (!errors?.length) return

  errors.forEach(({ field, message }) => {
    // Check if the exact field is known
    if (knownFields.includes(field)) {
      setError(field as Path<T>, { type: 'server', message })
      return
    }

    // Check if the root field is known (for dotted paths like 'lodgingDetails.checkInDate')
    const rootField = field.split('.')[0]
    if (rootField && knownFields.includes(rootField)) {
      setError(field as Path<T>, { type: 'server', message })
      return
    }

    // Check if a parent path matches (e.g., 'lodgingDetails' for 'lodgingDetails.checkInDate')
    const isNestedOfKnown = knownFields.some(
      (known) => field.startsWith(`${known}.`) || known.startsWith(`${field}.`)
    )
    if (isNestedOfKnown) {
      setError(field as Path<T>, { type: 'server', message })
      return
    }

    // Log unrecognized field for debugging
    console.warn(`[mapServerErrors] Unrecognized field: ${field}`)
  })
}

// ============================================================================
// Extract Error Message
// ============================================================================

/**
 * Extracts error message from a nested error path.
 * Useful for displaying errors in UI.
 *
 * @param errors - RHF errors object
 * @param path - Dotted path to the field (e.g., 'lodgingDetails.checkInDate')
 * @returns Error message or undefined
 */
export function getErrorMessage(
  errors: Record<string, unknown>,
  path: string
): string | undefined {
  const parts = path.split('.')
  let current: unknown = errors

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  if (current && typeof current === 'object' && 'message' in current) {
    return (current as { message: string }).message
  }

  return undefined
}

/**
 * Gets the first validation error message from an errors object.
 * Useful for toast notifications.
 *
 * @param errors - RHF errors object
 * @returns Object with field path and message, or undefined if no errors
 */
export function getFirstError(
  errors: Record<string, unknown>
): { field: string; message: string } | undefined {
  const keys = flattenErrors(errors)
  const firstKey = keys[0]

  if (!firstKey) return undefined

  const message = getErrorMessage(errors, firstKey)
  if (!message) return undefined

  return { field: firstKey, message }
}

/**
 * Formats a field path to a human-readable label.
 * Converts camelCase/dot notation to readable text.
 *
 * @param field - Field path (e.g., 'lodgingDetails.checkInDate')
 * @returns Human-readable label (e.g., 'Check In Date')
 */
export function formatFieldLabel(field: string): string {
  // Take the last segment of the path
  const lastSegment = field.split('.').pop() || field

  // Convert camelCase to spaces and capitalize
  return lastSegment
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}
