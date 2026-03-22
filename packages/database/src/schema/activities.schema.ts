/**
 * Itinerary Activities Schema
 *
 * Individual activities within an itinerary day (lodging, flights, tours, dining, etc.)
 */

import { pgTable, pgEnum, uuid, varchar, text, integer, timestamp, decimal, jsonb, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { itineraryDays } from './itinerary-days.schema'
// Note: bookings import is deferred to avoid circular dependency - relation added via bookingsRelations

// Enums
export const activityTypeEnum = pgEnum('activity_type', [
  'lodging',
  'flight',
  'tour',
  'transportation',
  'cruise', // Legacy type - already exists in DB
  'dining',
  'options',
  'custom_cruise',
  'port_info',
  'package', // Package grouping for multiple activities
  'custom_tour', // Catalog tour with departure selection
  'tour_day', // Child activity for each tour day
  'insurance', // Insurance activity (linked to trip_insurance_packages)
])

export const activityProposalStatusEnum = pgEnum('activity_proposal_status', [
  'draft',
  'proposing',
  'approved',
  'cancelled',
])

export const activityBookingStatusEnum = pgEnum('activity_booking_status', [
  'unbooked',
  'booked',
  'cancelled',
])

export const pricingTypeEnum = pgEnum('pricing_type', [
  'per_person',
  'per_room',
  'flat_rate',
  'per_night',
  'total',
])

export const portTypeEnum = pgEnum('port_type', [
  'departure',
  'arrival',
  'sea_day',
  'port_call',
])

// Coordinates type
export type Coordinates = {
  lat: number
  lng: number
}

// Photo type
export type Photo = {
  url: string
  caption?: string
}

export const itineraryActivities = pgTable('itinerary_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable for package activities that float (not tied to a specific day)
  itineraryDayId: uuid('itinerary_day_id').references(() => itineraryDays.id, { onDelete: 'cascade' }),
  // Trip ID for floating packages (packages don't belong to a specific day)
  // Note: FK constraint added via migration to avoid circular reference issues
  tripId: uuid('trip_id'),

  // Agency Association (denormalized for RLS, required)
  agencyId: uuid('agency_id').notNull(),

  // Parent activity reference (for cruise → port_info and package → child relationships)
  // Uses self-referential FK with CASCADE delete
  // Note: CHECK constraint prevents packages from having parents (no nesting)
  parentActivityId: uuid('parent_activity_id'),
  // Note: FK constraint added via migration to avoid circular reference issues

  // Core fields
  activityType: activityTypeEnum('activity_type').notNull(),
  componentType: activityTypeEnum('component_type').notNull(), // Polymorphic discriminator
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sequenceOrder: integer('sequence_order').notNull().default(0),

  // Timing: Store actual moments as timestamptz with explicit timezone string
  // Fallback chain: activity.timezone → trip.timezone → browser timezone
  startDatetime: timestamp('start_datetime', { withTimezone: true }),
  endDatetime: timestamp('end_datetime', { withTimezone: true }),
  timezone: varchar('timezone', { length: 64 }), // IANA timezone identifier (e.g., 'America/New_York')

  // Location
  location: varchar('location', { length: 255 }),
  address: text('address'),
  coordinates: jsonb('coordinates').$type<Coordinates>(),

  // Details
  notes: text('notes'),
  confirmationNumber: varchar('confirmation_number', { length: 100 }),

  // Proposal lifecycle
  proposalStatus: activityProposalStatusEnum('proposal_status').default('draft').notNull(),
  // Supplier booking lifecycle
  bookingStatus: activityBookingStatusEnum('booking_status').default('unbooked').notNull(),
  // Passport verification
  passportVerified: boolean('passport_verified').default(false).notNull(),
  passportVerifiedAt: timestamp('passport_verified_at', { withTimezone: true }),
  passportVerifiedBy: uuid('passport_verified_by'),

  // Booking tracking
  isVisibleInCalendar: boolean('is_visible_in_calendar').default(true).notNull(),
  bookingDate: timestamp('booking_date', { withTimezone: true }),

  // Pricing
  /**
   * @deprecated Use activity_pricing.totalPriceCents instead.
   * This field is kept for backward compatibility but is no longer the authoritative source.
   * All financial calculations should read from the activity_pricing table.
   */
  estimatedCost: decimal('estimated_cost', { precision: 10, scale: 2 }),
  pricingType: pricingTypeEnum('pricing_type'),
  currency: varchar('currency', { length: 3 }).default('USD'),

  // Media (deferred - kept nullable for future photo uploads)
  photos: jsonb('photos').$type<Photo[]>(),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Relations
export const itineraryActivitiesRelations = relations(itineraryActivities, ({ one, many }) => ({
  day: one(itineraryDays, {
    fields: [itineraryActivities.itineraryDayId],
    references: [itineraryDays.id],
  }),
  // Parent activity (for port_info → cruise relationship)
  parentActivity: one(itineraryActivities, {
    fields: [itineraryActivities.parentActivityId],
    references: [itineraryActivities.id],
    relationName: 'parentChild',
  }),
  // Child activities (for cruise → port_info relationship)
  childActivities: many(itineraryActivities, {
    relationName: 'parentChild',
  }),
}))

// TypeScript types
export type ItineraryActivity = typeof itineraryActivities.$inferSelect
export type NewItineraryActivity = typeof itineraryActivities.$inferInsert

// Enum types
export type ActivityType = typeof activityTypeEnum.enumValues[number]
export type ActivityProposalStatus = typeof activityProposalStatusEnum.enumValues[number]
export type ActivityBookingStatus = typeof activityBookingStatusEnum.enumValues[number]
export type PricingType = typeof pricingTypeEnum.enumValues[number]
export type PortType = typeof portTypeEnum.enumValues[number]
