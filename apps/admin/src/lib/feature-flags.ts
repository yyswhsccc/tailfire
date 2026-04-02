/**
 * Feature Flags Configuration
 *
 * Centralized feature flag management for safe rollout of new features.
 * Feature flags are controlled via environment variables.
 */

export const FEATURE_FLAGS = {
  /**
   * New Booking & Pricing UI
   *
   * Enables the refactored Booking & Pricing tab with:
   * - Invoice type selection (Individual Item vs. Part of Package)
   * - Extended pricing types (including 'total')
   * - Credit Card Authorization & Payment section
   * - Guarantee payment schedule option
   * - Allow partial payments toggle
   *
   * Environment variable: NEXT_PUBLIC_FEATURE_NEW_BOOKING_PRICING
   * Default: false (old UI)
   */
  NEW_BOOKING_PRICING_UI: process.env.NEXT_PUBLIC_FEATURE_NEW_BOOKING_PRICING === 'true',

  /**
   * Vacation Package Library (SoftVoyage/SIREV)
   *
   * Enables the Vacation Package Library page (/library/vacation) and the
   * "Vacation Package" drag item in the itinerary component library.
   * Disabled by default while the SoftVoyage scraper integration is stabilized.
   *
   * NOTE: This does NOT affect the "Package" activity type — Package activities
   * (bundling flights + hotel + transfers) are core functionality and always visible.
   *
   * Environment variable: NEXT_PUBLIC_FEATURE_VACATION_PACKAGES
   * Default: false (hidden)
   */
  VACATION_PACKAGES: process.env.NEXT_PUBLIC_FEATURE_VACATION_PACKAGES === 'true',
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS
