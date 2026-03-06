/**
 * Traveler Bookings Schema
 *
 * Per-traveler booking records for activities.
 * Stores individual confirmation numbers, pricing, and booking details
 * when multiple travelers have separate bookings on the same activity
 * (e.g., two passengers on the same cruise with different cabin assignments).
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { itineraryActivities } from './activities.schema'
import { tripTravelers } from './trips.schema'

export const travelerBookings = pgTable(
  'traveler_bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    activityId: uuid('activity_id')
      .notNull()
      .references(() => itineraryActivities.id, { onDelete: 'cascade' }),

    tripTravelerId: uuid('trip_traveler_id')
      .notNull()
      .references(() => tripTravelers.id, { onDelete: 'cascade' }),

    agencyId: uuid('agency_id').notNull(),

    // Booking identity
    confirmationNumber: varchar('confirmation_number', { length: 255 }),
    bookingReference: varchar('booking_reference', { length: 255 }),
    bookingStatus: varchar('booking_status', { length: 100 }).default('confirmed'),
    supplier: varchar('supplier', { length: 255 }),

    // Pricing (this traveler's portion)
    priceCents: integer('price_cents'),
    netPriceCents: integer('net_price_cents'),
    taxesAndFeesCents: integer('taxes_and_fees_cents').default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CAD'),

    // Commission (this traveler's portion)
    commissionCents: integer('commission_cents'),

    // Type-specific details (cabin/seat/room as JSON)
    bookingDetailsJson: jsonb('booking_details_json').default({}),

    // External system tracking (for imports)
    externalBookingId: varchar('external_booking_id', { length: 255 }),
    externalSystem: varchar('external_system', { length: 50 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueActivityTraveler: unique('traveler_bookings_activity_traveler_unique').on(
      table.activityId,
      table.tripTravelerId
    ),
    activityIdx: index('idx_tb_activity').on(table.activityId),
    travelerIdx: index('idx_tb_traveler').on(table.tripTravelerId),
    agencyIdx: index('idx_tb_agency').on(table.agencyId),
  })
)

// Relations
export const travelerBookingsRelations = relations(travelerBookings, ({ one }) => ({
  activity: one(itineraryActivities, {
    fields: [travelerBookings.activityId],
    references: [itineraryActivities.id],
  }),
  tripTraveler: one(tripTravelers, {
    fields: [travelerBookings.tripTravelerId],
    references: [tripTravelers.id],
  }),
}))

// TypeScript types
export type TravelerBooking = typeof travelerBookings.$inferSelect
export type NewTravelerBooking = typeof travelerBookings.$inferInsert
