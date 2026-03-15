/**
 * Trip Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles cross-field date validation based on addDatesLater flag.
 */

import { z } from 'zod'
import type {
  TripResponseDto,
  CreateTripDto,
} from '@tailfire/shared-types/api'

// ============================================================================
// Trip Form Schema
// ============================================================================

export const tripFormSchema = z.object({
  name: z.string().min(1, 'Trip name is required').max(255, 'Trip name too long'),
  tripType: z
    .enum(['leisure', 'business', 'group', 'honeymoon', 'corporate', 'custom'])
    .optional()
    .or(z.literal('')),
  status: z
    .enum(['draft', 'quoted', 'booked', 'in_progress', 'completed', 'cancelled'])
    .default('draft'),
  tags: z.array(z.string()).default([]),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
  addDatesLater: z.boolean().default(false),
  timezone: z.string().optional().or(z.literal('')),
  tripGroupId: z.string().optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  // Cross-field validation: require both dates when addDatesLater is false
  if (!data.addDatesLater) {
    if (!data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date is required',
        path: ['startDate'],
      })
    }
    if (!data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date is required',
        path: ['endDate'],
      })
    }
  }

  // Cross-field validation: endDate must be >= startDate when both exist
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End date must be on or after start date',
          path: ['endDate'],
        })
      }
    }
  }
})

export type TripFormValues = z.infer<typeof tripFormSchema>

// ============================================================================
// Field Names (for error mapping and scrollToFirstError)
// ============================================================================

export const TRIP_FORM_FIELDS = [
  'name',
  'tripType',
  'status',
  'tags',
  'startDate',
  'endDate',
  'addDatesLater',
  'timezone',
  'tripGroupId',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Creates default form values, optionally hydrating from server data.
 * Always returns tags: [] (never undefined).
 */
export function toTripDefaults(trip?: TripResponseDto | null): TripFormValues {
  if (!trip) {
    return {
      name: '',
      tripType: 'leisure',
      status: 'draft',
      tags: [],
      startDate: '',
      endDate: '',
      addDatesLater: false,
      timezone: '',
      tripGroupId: '',
    }
  }

  return {
    name: trip.name ?? '',
    tripType: (trip.tripType as TripFormValues['tripType']) ?? '',
    status: (trip.status as TripFormValues['status']) ?? 'draft',
    tags: trip.tags ?? [],
    startDate: trip.startDate ?? '',
    endDate: trip.endDate ?? '',
    addDatesLater: !trip.startDate && !trip.endDate,
    timezone: trip.timezone ?? '',
    tripGroupId: (trip as any).tripGroupId ?? '',
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Maps form data to API payload.
 * - Strips addDatesLater (form-only field)
 * - Converts empty strings to undefined
 * - Clears dates when addDatesLater is true
 *
 * Returns CreateTripDto which is compatible with UpdateTripDto
 * since all fields except 'name' are optional in both.
 */
export function toTripApiPayload(
  data: TripFormValues
): CreateTripDto {
  return {
    name: data.name,
    tripType: data.tripType || 'leisure',
    status: data.status,
    tags: data.tags.length > 0 ? data.tags : undefined,
    startDate: data.addDatesLater ? undefined : (data.startDate || undefined),
    endDate: data.addDatesLater ? undefined : (data.endDate || undefined),
    timezone: data.timezone || undefined,
    tripGroupId: data.tripGroupId || undefined,
  }
}
