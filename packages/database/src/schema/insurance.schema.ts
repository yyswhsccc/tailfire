/**
 * Insurance Schema
 *
 * Trip insurance packages and per-traveler insurance coverage tracking.
 * Supports multiple compliance states: pending, has_own_insurance, declined, selected_package
 */

import { pgTable, pgEnum, uuid, varchar, text, date, timestamp, integer, boolean, jsonb, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { trips, tripTravelers } from './trips.schema'
import { itineraryActivities } from './activities.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const insurancePolicyTypeEnum = pgEnum('insurance_policy_type', [
  'trip_cancellation',
  'medical',
  'comprehensive',
  'evacuation',
  'baggage',
  'other',
])

export const travelerInsuranceStatusEnum = pgEnum('traveler_insurance_status', [
  'pending',
  'has_own_insurance',
  'declined',
  'selected_package',
])

// ============================================================================
// TABLE: trip_insurance_packages
// ============================================================================

/**
 * Insurance packages available for a trip.
 * Can be manually entered or imported from a catalog/provider.
 */
export const tripInsurancePackages = pgTable('trip_insurance_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),

  // Package identification
  providerName: varchar('provider_name', { length: 255 }).notNull(),
  packageName: varchar('package_name', { length: 255 }).notNull(),
  policyType: insurancePolicyTypeEnum('policy_type').notNull(),

  // Financial details
  coverageAmountCents: integer('coverage_amount_cents'),
  premiumCents: integer('premium_cents').notNull(),
  deductibleCents: integer('deductible_cents'),
  currency: varchar('currency', { length: 3 }).notNull().default('CAD'),

  // Coverage period
  coverageStartDate: date('coverage_start_date'),
  coverageEndDate: date('coverage_end_date'),

  // Extended details (flexible JSON for medical limits, evacuation coverage, etc.)
  coverageDetails: jsonb('coverage_details'),
  termsUrl: text('terms_url'),

  // Link to itinerary activity (for pricing, commission, payment schedules)
  activityId: uuid('activity_id').references(() => itineraryActivities.id, { onDelete: 'set null' }),

  // Source tracking
  isFromCatalog: boolean('is_from_catalog').default(false),

  // Display
  displayOrder: integer('display_order').default(0),
  isActive: boolean('is_active').default(true),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// TABLE: trip_traveler_insurance
// ============================================================================

/**
 * Per-traveler insurance status/selection.
 * Tracks compliance state and stores relevant data based on status.
 *
 * Status-specific required fields (enforced in service layer):
 * - selected_package: selectedPackageId REQUIRED
 * - has_own_insurance: externalPolicyNumber or externalProviderName REQUIRED
 * - declined: acknowledgedAt REQUIRED (compliance)
 */
export const tripTravelerInsurance = pgTable('trip_traveler_insurance', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  tripTravelerId: uuid('trip_traveler_id')
    .notNull()
    .references(() => tripTravelers.id, { onDelete: 'cascade' }),

  // Status
  status: travelerInsuranceStatusEnum('status').notNull().default('pending'),

  // Selected package (when status = 'selected_package')
  selectedPackageId: uuid('selected_package_id').references(() => tripInsurancePackages.id, { onDelete: 'set null' }),

  // External insurance (when status = 'has_own_insurance')
  externalPolicyNumber: varchar('external_policy_number', { length: 100 }),
  externalProviderName: varchar('external_provider_name', { length: 255 }),
  externalCoverageDetails: text('external_coverage_details'),

  // Declined (when status = 'declined')
  declinedReason: text('declined_reason'),
  declinedAt: timestamp('declined_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),

  // Payment tracking (when status = 'selected_package')
  premiumPaidCents: integer('premium_paid_cents'),
  policyNumber: varchar('policy_number', { length: 100 }),

  // Notes
  notes: text('notes'),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // One insurance record per traveler per trip
  uniqueTravelerTrip: unique('trip_traveler_insurance_unique_traveler').on(table.tripId, table.tripTravelerId),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const tripInsurancePackagesRelations = relations(tripInsurancePackages, ({ one, many }) => ({
  trip: one(trips, {
    fields: [tripInsurancePackages.tripId],
    references: [trips.id],
  }),
  activity: one(itineraryActivities, {
    fields: [tripInsurancePackages.activityId],
    references: [itineraryActivities.id],
  }),
  travelerSelections: many(tripTravelerInsurance),
}))

export const tripTravelerInsuranceRelations = relations(tripTravelerInsurance, ({ one }) => ({
  trip: one(trips, {
    fields: [tripTravelerInsurance.tripId],
    references: [trips.id],
  }),
  traveler: one(tripTravelers, {
    fields: [tripTravelerInsurance.tripTravelerId],
    references: [tripTravelers.id],
  }),
  selectedPackage: one(tripInsurancePackages, {
    fields: [tripTravelerInsurance.selectedPackageId],
    references: [tripInsurancePackages.id],
  }),
}))

// ============================================================================
// TYPESCRIPT TYPES
// ============================================================================

export type TripInsurancePackage = typeof tripInsurancePackages.$inferSelect
export type NewTripInsurancePackage = typeof tripInsurancePackages.$inferInsert

export type TripTravelerInsurance = typeof tripTravelerInsurance.$inferSelect
export type NewTripTravelerInsurance = typeof tripTravelerInsurance.$inferInsert

export type InsurancePolicyType = typeof insurancePolicyTypeEnum.enumValues[number]
export type TravelerInsuranceStatus = typeof travelerInsuranceStatusEnum.enumValues[number]
