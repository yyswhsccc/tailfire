/**
 * Activity Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles date coercion and cross-field validation (end time must be after start time).
 */

import { z } from 'zod'
import type { CreateActivityDto, PricingType, ActivityType } from '@tailfire/shared-types/api'
import { parseISODate } from '@/lib/date-utils'

// ============================================================================
// Helper: Validate datetime is not Invalid Date
// ============================================================================

const optionalValidDatetime = z.string()
  .transform((val) => {
    if (!val) return null
    const d = new Date(val)
    return Number.isNaN(d.getTime()) ? null : val
  })
  .nullable()
  .optional()

// ============================================================================
// Main Activity Form Schema
// ============================================================================

export const activityFormSchema = z.object({
  // Core fields
  activityType: z.enum(['lodging', 'flight', 'tour', 'transportation', 'dining', 'options', 'custom_cruise', 'port_info']).default('tour'),
  name: z.string().min(1, 'Activity name is required'),
  description: z.string().optional().default(''),
  location: z.string().optional().default(''),
  address: z.string().optional().default(''),
  confirmationNumber: z.string().optional().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Pricing fields (pricing data managed via activity_pricing table)
  pricingType: z.enum(['per_person', 'per_room', 'flat_rate', 'per_night']).default('per_person'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('USD'),

  // Notes
  notes: z.string().optional().default(''),

  // Date/time fields (stored as ISO strings)
  startDatetime: optionalValidDatetime,
  endDatetime: optionalValidDatetime,
}).refine(
  (data) => {
    // Skip validation if either date is missing
    if (!data.startDatetime || !data.endDatetime) return true
    return new Date(data.endDatetime) > new Date(data.startDatetime)
  },
  {
    message: 'End time must be after start time',
    path: ['endDatetime'],
  }
)

export type ActivityFormData = z.infer<typeof activityFormSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const ACTIVITY_FORM_FIELDS = [
  'activityType',
  'name',
  'description',
  'location',
  'address',
  'confirmationNumber',
  'status',
  'pricingType',
  'currency',
  'notes',
  'startDatetime',
  'endDatetime',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Format a date for datetime-local input (YYYY-MM-DDTHH:mm)
 */
function formatDatetimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Creates default form values, handling server data hydration
 */
export function toActivityDefaults(
  serverData?: Partial<ActivityFormData> | null,
  dayDate?: string | null,
  initialActivityType?: string,
  initialName?: string
): ActivityFormData {
  // Calculate default start datetime (9:00 AM on day date)
  let defaultStartDatetime: string | null = null
  if (dayDate) {
    const date = parseISODate(dayDate)
    if (date) {
      date.setHours(9, 0, 0, 0)
      defaultStartDatetime = formatDatetimeLocal(date)
    }
  }

  // Parse existing datetimes from server
  let startDatetime = serverData?.startDatetime ?? defaultStartDatetime
  if (startDatetime && typeof startDatetime === 'string' && !startDatetime.includes('T')) {
    // Convert date-only string to datetime-local format (uses local midnight via parseISODate)
    const d = parseISODate(startDatetime)
    if (d) {
      startDatetime = formatDatetimeLocal(d)
    }
  }

  let endDatetime = serverData?.endDatetime ?? null
  if (endDatetime && typeof endDatetime === 'string' && !endDatetime.includes('T')) {
    const d = parseISODate(endDatetime)
    if (d) {
      endDatetime = formatDatetimeLocal(d)
    }
  }

  return {
    activityType: (serverData?.activityType ?? initialActivityType ?? 'tour') as ActivityFormData['activityType'],
    name: serverData?.name ?? initialName ?? '',
    description: serverData?.description ?? '',
    location: serverData?.location ?? '',
    address: serverData?.address ?? '',
    confirmationNumber: serverData?.confirmationNumber ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',
    pricingType: serverData?.pricingType ?? 'per_person',
    currency: serverData?.currency ?? 'USD',
    notes: serverData?.notes ?? '',
    startDatetime,
    endDatetime,
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Base activity payload without itineraryDayId.
 * Used when dayId is in the URL path (pendingDay mode).
 */
export type ActivityPayloadWithoutDayId = Omit<CreateActivityDto, 'itineraryDayId'>

/**
 * Maps form data to API payload with proper type conversions.
 *
 * @param data - Form data to convert
 * @param itineraryDayId - Day ID (required for standard mode, optional for pendingDay mode)
 * @param options.omitDayId - If true, exclude itineraryDayId from payload (for pendingDay mode where dayId is in URL)
 */
export function toActivityApiPayload(
  data: ActivityFormData,
  itineraryDayId: string,
  options?: { omitDayId?: boolean }
): CreateActivityDto | ActivityPayloadWithoutDayId {
  const basePayload = {
    activityType: data.activityType as ActivityType,
    name: data.name,
    description: data.description || undefined,
    location: data.location || undefined,
    address: data.address || undefined,
    confirmationNumber: data.confirmationNumber || undefined,
    proposalStatus: data.proposalStatus,
    pricingType: data.pricingType as PricingType,
    currency: data.currency,
    notes: data.notes || undefined,
    startDatetime: data.startDatetime ? new Date(data.startDatetime).toISOString() : undefined,
    endDatetime: data.endDatetime ? new Date(data.endDatetime).toISOString() : undefined,
  }

  // For pendingDay mode, return payload without itineraryDayId (dayId is in URL path)
  if (options?.omitDayId) {
    return basePayload
  }

  // Standard mode: include itineraryDayId in payload
  return {
    itineraryDayId,
    ...basePayload,
  }
}
