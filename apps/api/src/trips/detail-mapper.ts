/**
 * Detail Mapper Utilities
 *
 * Shared coercion helpers and build functions for detail services.
 * Preserves existing behavior:
 * - Create: applies coercion (|| null, || [], ? 1 : 0)
 * - Update: passes values as-is when defined (preserves empty strings)
 * - Exception: isRoundTrip always converts boolean↔int even on update
 */

// === Types ===

/** Transform function that takes any value and returns any value */
export type FieldTransform = (value: unknown) => unknown

/** Field map: keys are field names, values are transform functions */
export type FieldMap = Record<string, FieldTransform>

// === Coercion helpers ===

export const coerce = {
  /**
   * Create/Format: converts falsy values to null (current || null behavior)
   * Empty string, 0, false → null
   */
  toNullable: ((value: unknown) => value || null) as FieldTransform,

  /**
   * Lodging: only converts null/undefined to null (current ?? null behavior)
   * Preserves empty string, 0, false
   */
  toNullableStrict: ((value: unknown) => value ?? null) as FieldTransform,

  /**
   * Create/Format: array defaults to empty array
   */
  toArray: ((value: unknown) => (value as unknown[]) || []) as FieldTransform,

  /**
   * Create/Update: boolean to integer (always converts)
   * true → 1, false/null/undefined → 0
   */
  toBoolInt: ((value: unknown) => (value ? 1 : 0)) as FieldTransform,

  /**
   * Format: integer to boolean
   * 1 → true, 0/null → false
   */
  fromBoolInt: ((value: unknown) => value === 1) as FieldTransform,

  /**
   * Update: pass through as-is (preserves empty strings, zeros, etc.)
   */
  identity: ((value: unknown) => value) as FieldTransform,

  /**
   * Format: parse numeric DB string to JS number, null if absent.
   * PostgreSQL numeric columns return as strings via Drizzle.
   */
  toNumber: ((value: unknown) => {
    if (value == null) return null
    const n = Number(value)
    return Number.isNaN(n) ? null : n
  }) as FieldTransform,
}

// === Builder helpers ===

export interface BuildOptions {
  includeUpdatedAt?: boolean // default: true for updates
}

/**
 * Build values object for CREATE - applies transforms to all fields.
 * Does NOT add updatedAt (create path uses database defaults).
 */
export function buildCreateValues<T extends Record<string, unknown>>(
  data: T,
  fieldMap: FieldMap
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, transform] of Object.entries(fieldMap)) {
    result[key] = transform(data[key as keyof T])
  }
  return result
}

/**
 * Build set object for UPDATE - only includes defined fields, uses transforms.
 * Adds updatedAt by default (can be disabled via options).
 */
export function buildUpdateSet<T extends Record<string, unknown>>(
  data: T,
  fieldMap: FieldMap,
  options: BuildOptions = {}
): Record<string, unknown> {
  const { includeUpdatedAt = true } = options
  const result: Record<string, unknown> = {}
  for (const [key, transform] of Object.entries(fieldMap)) {
    if (data[key as keyof T] !== undefined) {
      result[key] = transform(data[key as keyof T])
    }
  }
  if (includeUpdatedAt) {
    result.updatedAt = new Date()
  }
  return result
}

/**
 * Format response - applies transforms to all fields.
 * Note: Missing keys in data → transform receives undefined.
 */
export function formatFields<T extends Record<string, unknown>>(
  data: T,
  fieldMap: FieldMap
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, transform] of Object.entries(fieldMap)) {
    result[key] = transform(data[key as keyof T])
  }
  return result
}
