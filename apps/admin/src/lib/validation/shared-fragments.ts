/**
 * Shared Zod fragments — Step 2 of the refactor roadmap (#358).
 *
 * Activity edit forms (flight/dining/lodging/tour/options/custom-cruise/
 * port-info/package) all duplicate the same booking-detail and pricing
 * fields with subtle drift. PR #355 fixed today's hydration bug at the
 * helper level; this file is the single source of truth for the field
 * shapes, ready to be composed by each form's schema as it migrates to
 * the lifecycle hook.
 *
 * **Composition pattern — prefer .extend() over shape spread:**
 *
 *   // Good — preserves fragment-level refinements when added later
 *   export const flightFormSchema = pricingFragment
 *     .extend(bookingDetailsFragment.shape)
 *     .extend(commissionFragment.shape)
 *     .extend({ itineraryDayId: z.string().min(1), flightDetails: ... })
 *
 *   // Acceptable while fragments have no refinements, but breaks the day
 *   // any fragment grows a .refine() / .superRefine():
 *   export const flightFormSchema = z.object({
 *     ...pricingFragment.shape,
 *     ...bookingDetailsFragment.shape,
 *   })
 *
 * Caught in Codex design review of PR #364.
 *
 * Field-name drift caught while writing this:
 *   - package-form historically used `supplierName` internally and mapped
 *     to `supplier` for the API. That's a migration concern for the
 *     package-form pilot, not this file.
 */
import { z } from 'zod'

/**
 * Shared HTTPS URL validator. Matches the existing pattern used in
 * dining-validation.ts (optional, allows empty string).
 */
export const optionalHttpsUrl = z
  .string()
  .optional()
  .default('')
  .refine(
    (val) => !val || val === '' || /^https?:\/\//.test(val),
    { message: 'Must be a valid http(s) URL' },
  )

/**
 * Booking-details fragment — appears identically in every activity form.
 *
 * Fields here must round-trip cleanly through:
 *   buildInitialPricingState (currency-helpers.ts) → form.reset() → save → API
 *
 * If any field is added to the form here, also add it to
 * buildInitialPricingState so hydration stays in sync. (Today's #351 was
 * exactly this drift.)
 */
export const bookingDetailsFragment = z.object({
  supplier: z.string().optional().default(''),
  termsAndConditions: z.string().optional().default(''),
  cancellationPolicy: z.string().optional().default(''),
  bookingDate: z.string().nullable().optional(),
})

export type BookingDetailsFragment = z.infer<typeof bookingDetailsFragment>

/**
 * Pricing fragment — total/tax/currency/pricing-type/confirmation/referral.
 * Commission fields live in commissionFragment below.
 */
export const pricingFragment = z.object({
  totalPriceCents: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Price cannot be negative'))
    .default(0),
  taxesAndFeesCents: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Taxes cannot be negative'))
    .default(0),
  currency: z.string().default('CAD'),
  pricingType: z
    .enum(['per_person', 'per_room', 'flat_rate', 'per_night'])
    .default('per_person'),
  confirmationNumber: z.string().optional().default(''),
  referralUrl: optionalHttpsUrl,
})

export type PricingFragment = z.infer<typeof pricingFragment>

/**
 * Commission fragment — agent split, expected commission date.
 */
export const commissionFragment = z.object({
  commissionTotalCents: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative())
    .optional()
    .default(0),
  commissionSplitPercentage: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().min(0).max(100))
    .optional()
    .default(0),
  commissionExpectedDate: z.string().nullable().optional(),
})

export type CommissionFragment = z.infer<typeof commissionFragment>
