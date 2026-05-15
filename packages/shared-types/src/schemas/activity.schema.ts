/**
 * Activity Schemas
 *
 * Zod schemas for Activity DTOs.
 * Mirrors existing DTO shapes from activities.types.ts.
 */

import { z } from 'zod'
import {
  activityTypeSchema,
  activityProposalStatusSchema,
  activityBookingStatusSchema,
  pricingTypeSchema,
} from './enums.schema'
import { coordinatesSchema, photoSchema } from './common.schema'

const pricingBreakdownItemSchema = z.object({
  label: z.string(),
  priceCents: z.number().int(),
  travelerId: z.string().uuid().optional(),
})

// Accepts null, undefined, empty string, or a parseable http(s) URL. Blocks
// javascript:, data:, file:, etc. — the URL is rendered as a clickable CTA in
// the client portal, so unsafe schemes must be rejected at the API boundary.
// Empty-string-to-null normalization happens in the API layer; this schema is
// kept as `string | null | undefined` so DTO call sites stay backwards-compat.
const httpHttpsUrlSchema = z
  .string()
  .nullable()
  .optional()
  .superRefine((v, ctx) => {
    if (!v) return
    const trimmed = v.trim()
    if (!trimmed) return
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

// =============================================================================
// Create Activity DTO Schema
// =============================================================================

/**
 * Schema for creating a new activity.
 * Matches the existing CreateActivityDto interface.
 */
export const createActivityDtoSchema = z.object({
  tripId: z.string().uuid().nullable().optional(), // Required for floating packages (no itineraryDayId)
  itineraryDayId: z.string().uuid().nullable().optional(), // Nullable for floating packages
  parentActivityId: z.string().uuid().nullable().optional(),
  activityType: activityTypeSchema,
  name: z.string().min(1, 'Activity name is required'),
  description: z.string().nullable().optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),

  // Timing - all nullable/optional
  startDatetime: z.string().nullable().optional(),
  endDatetime: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),

  // Location - all nullable/optional
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  coordinates: coordinatesSchema.nullable().optional(),

  // Details - all nullable/optional
  notes: z.string().nullable().optional(),
  confirmationNumber: z.string().nullable().optional(),
  proposalStatus: activityProposalStatusSchema.optional(),
  bookingStatus: activityBookingStatusSchema.optional(),

  // Optional external "Book this activity" URL — rendered as a CTA in the
  // shared-trip / proposal preview (#302). http(s) only; empty strings
  // normalized to null so unsafe schemes (javascript:, data:) cannot persist.
  referralUrl: httpHttpsUrlSchema,

  // Pricing - all nullable/optional
  pricingType: pricingTypeSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  totalPriceCents: z.number().int().nonnegative().optional(),
  taxesCents: z.number().int().nonnegative().optional(),
  commissionTotalCents: z.number().int().nonnegative().nullable().optional(),
  commissionSplitPercentage: z.number().min(0).max(100).nullable().optional(),

  // Booking detail fields persisted to activity_pricing. Mirrors update schema
  // so the generic /activities create path can accept the same fields the
  // typed component endpoints (POST /flights, /lodgings, …) already accept.
  // Load-bearing for B4 §38 finalize() (cancellationPolicy) and supplier
  // attribution on receivables.
  supplier: z.string().max(255).nullable().optional(),
  cancellationPolicy: z.string().nullable().optional(),
  termsAndConditions: z.string().nullable().optional(),

  // Per-person pricing breakdown
  pricingBreakdownJson: z.array(pricingBreakdownItemSchema).nullable().optional(),

  // Media - nullable/optional
  photos: z.array(photoSchema).nullable().optional(),

  // Package-specific: activities to link immediately after creation
  activityIds: z.array(z.string().uuid()).optional(),

  // Package-specific details. Persisted to package_details row when
  // activityType === 'package'. Ignored for other types.
  packageDetails: z
    .object({
      supplierId: z.string().uuid().nullable().optional(),
      supplierName: z.string().max(255).nullable().optional(),
      paymentStatus: z
        .enum(['unpaid', 'deposit_paid', 'paid', 'refunded', 'partially_refunded'])
        .optional(),
      cancellationPolicy: z.string().nullable().optional(),
      cancellationDeadline: z.string().nullable().optional(),
      termsAndConditions: z.string().nullable().optional(),
      groupBookingNumber: z.string().max(255).nullable().optional(),
    })
    .optional(),
})

export type CreateActivityDto = z.infer<typeof createActivityDtoSchema>

// =============================================================================
// Update Activity DTO Schema
// =============================================================================

/**
 * Schema for updating an activity.
 * All fields optional for PATCH operation.
 */
export const updateActivityDtoSchema = z.object({
  activityType: activityTypeSchema.optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),

  // Timing
  startDatetime: z.string().nullable().optional(),
  endDatetime: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),

  // Location
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  coordinates: coordinatesSchema.nullable().optional(),

  // Details
  notes: z.string().nullable().optional(),
  confirmationNumber: z.string().nullable().optional(),
  proposalStatus: activityProposalStatusSchema.optional(),
  bookingStatus: activityBookingStatusSchema.optional(),
  // #302 — generic external "Book this activity" CTA URL; http(s) only.
  referralUrl: httpHttpsUrlSchema,

  // Update-only fields
  isVisibleInCalendar: z.boolean().optional(),
  bookingDate: z.string().nullable().optional(),

  // Pricing
  pricingType: pricingTypeSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  totalPriceCents: z.number().int().nonnegative().optional(),
  taxesCents: z.number().int().nonnegative().optional(),
  commissionTotalCents: z.number().int().nonnegative().nullable().optional(),
  commissionSplitPercentage: z.number().min(0).max(100).nullable().optional(),

  // Per-person pricing breakdown
  pricingBreakdownJson: z.array(pricingBreakdownItemSchema).nullable().optional(),

  // Media
  photos: z.array(photoSchema).nullable().optional(),

  // Package-specific fields (stored in package_details table)
  supplierName: z.string().max(255).nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  supplier: z.string().max(255).nullable().optional(), // activity_pricing.supplier
  cancellationPolicy: z.string().nullable().optional(),
  cancellationDeadline: z.string().nullable().optional(),
  termsAndConditions: z.string().nullable().optional(),
  groupBookingNumber: z.string().max(255).nullable().optional(),
  paymentStatus: z.string().max(50).nullable().optional(),
})

export type UpdateActivityDto = z.infer<typeof updateActivityDtoSchema>
