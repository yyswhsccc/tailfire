/**
 * Pricing Validation Schema
 *
 * Centralized validation rules using Zod for consistency across all pricing sections.
 * Same schema used in parent forms and child components.
 */

import { z } from 'zod'

/**
 * Pricing data schema
 */
/**
 * Per-person/per-unit breakdown item schema
 */
export const pricingBreakdownItemSchema = z.object({
  label: z.string(),
  priceCents: z.number().int().nonnegative(),
  travelerId: z.string().optional(),
})

export type PricingBreakdownItem = z.infer<typeof pricingBreakdownItemSchema>

export const pricingDataSchema = z.object({
  // Invoice and pricing type
  invoiceType: z.enum(['individual_item', 'part_of_package']).default('individual_item'),
  pricingType: z.enum(['per_person', 'per_room', 'flat_rate', 'per_night', 'total']).default('per_person'),

  // Price fields
  totalPriceCents: z.number().int().nonnegative('Total price must be non-negative'),
  taxesAndFeesCents: z.number().int().nonnegative('Taxes & fees must be non-negative').optional(),
  currency: z.string().min(1, 'Currency is required'),

  // Per-person/per-unit breakdown
  pricingBreakdown: z.array(pricingBreakdownItemSchema).nullable().optional(),

  // Commission fields
  commissionTotalCents: z.number().int().nonnegative('Commission total must be non-negative').optional(),
  commissionSplitPercentage: z
    .number()
    .min(0, 'Commission split must be at least 0%')
    .max(100, 'Commission split cannot exceed 100%')
    .optional(),
  commissionExpectedDate: z.string().nullable().optional(),

  // Booking details fields
  termsAndConditions: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  confirmationNumber: z.string().optional(),
  /** #302 — external "Book this activity" CTA URL surfaced in the proposal preview */
  referralUrl: z.string().optional(),
  supplier: z.string().optional(),
}).refine(
  (data) => {
    // Total price must be >= taxes and fees
    if (data.taxesAndFeesCents !== undefined && data.taxesAndFeesCents !== null) {
      return data.totalPriceCents >= data.taxesAndFeesCents
    }
    return true
  },
  {
    message: 'Total price must be greater than or equal to taxes & fees',
    path: ['totalPriceCents'],
  }
)

export type PricingData = z.infer<typeof pricingDataSchema>

/**
 * Validation errors type
 */
export type ValidationErrors = {
  [K in keyof PricingData]?: string
}

/**
 * Validate pricing data and return structured errors
 */
export function validatePricing(data: Partial<PricingData>): ValidationErrors {
  const result = pricingDataSchema.safeParse(data)

  if (result.success) {
    return {}
  }

  const errors: ValidationErrors = {}

  result.error.errors.forEach((err) => {
    const path = err.path[0] as keyof PricingData
    errors[path] = err.message
  })

  return errors
}

/**
 * Check if validation errors exist
 */
export function hasValidationErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0
}
