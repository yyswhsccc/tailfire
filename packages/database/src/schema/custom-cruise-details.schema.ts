/**
 * Custom Cruise Details Schema
 *
 * Extended details for cruise bookings with Traveltek-aligned field structure.
 * One-to-one relationship with itinerary_activities.
 */

import { pgTable, uuid, varchar, text, date, time, integer, bigint, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { itineraryActivities } from './activities.schema'
import { cruisePorts } from './cruise-ports.schema'
import { cruiseLines } from './cruise-lines.schema'
import { cruiseShips } from './cruise-ships.schema'
import { cruiseRegions } from './cruise-regions.schema'

// Source type enum values (validated by CHECK constraint in migration)
export const CRUISE_SOURCES = ['traveltek', 'manual'] as const
export type CruiseSource = (typeof CRUISE_SOURCES)[number]

// Cabin category enum values (validated by CHECK constraint in migration)
export const CABIN_CATEGORIES = ['suite', 'balcony', 'oceanview', 'inside'] as const
export type CabinCategory = (typeof CABIN_CATEGORIES)[number]

// Port call structure for JSON
export interface CruisePortCall {
  day: number
  portName: string
  portId?: number
  arriveDate: string
  departDate: string
  arriveTime: string
  departTime: string
  tender?: boolean
  description?: string
  latitude?: string
  longitude?: string
}

export const customCruiseDetails = pgTable('custom_cruise_details', {
  id: uuid('id').primaryKey().defaultRandom(),
  activityId: uuid('activity_id')
    .notNull()
    .references(() => itineraryActivities.id, { onDelete: 'cascade' })
    .unique(), // One-to-one relationship

  // Traveltek Identity
  traveltekCruiseId: text('traveltek_cruise_id'), // codetocruiseid for API reference
  source: varchar('source', { length: 50 }).default('manual'), // 'traveltek' | 'manual'

  // Cruise Line Information
  cruiseLineName: varchar('cruise_line_name', { length: 255 }),
  cruiseLineCode: varchar('cruise_line_code', { length: 50 }),
  cruiseLineId: uuid('cruise_line_id').references(() => cruiseLines.id, { onDelete: 'set null' }),
  shipName: varchar('ship_name', { length: 255 }),
  shipCode: varchar('ship_code', { length: 50 }),
  shipClass: varchar('ship_class', { length: 100 }),
  shipImageUrl: text('ship_image_url'),
  cruiseShipId: uuid('cruise_ship_id').references(() => cruiseShips.id, { onDelete: 'set null' }),

  // Voyage Details
  itineraryName: varchar('itinerary_name', { length: 255 }),
  voyageCode: varchar('voyage_code', { length: 100 }),
  region: varchar('region', { length: 100 }),
  cruiseRegionId: uuid('cruise_region_id').references(() => cruiseRegions.id, { onDelete: 'set null' }),
  nights: integer('nights'), // CHECK constraint in migration: >= 0
  seaDays: integer('sea_days'), // CHECK constraint in migration: >= 0

  // Departure Details
  departurePort: varchar('departure_port', { length: 255 }),
  departurePortId: uuid('departure_port_id').references(() => cruisePorts.id, { onDelete: 'set null' }),
  departureDate: date('departure_date'),
  departureTime: time('departure_time'),
  departureTimezone: varchar('departure_timezone', { length: 100 }),

  // Arrival Details
  arrivalPort: varchar('arrival_port', { length: 255 }),
  arrivalPortId: uuid('arrival_port_id').references(() => cruisePorts.id, { onDelete: 'set null' }),
  arrivalDate: date('arrival_date'),
  arrivalTime: time('arrival_time'),
  arrivalTimezone: varchar('arrival_timezone', { length: 100 }),

  // Cabin Details (Normalized)
  cabinCategory: varchar('cabin_category', { length: 50 }), // CHECK constraint in migration
  cabinCode: varchar('cabin_code', { length: 50 }),
  cabinNumber: varchar('cabin_number', { length: 50 }),
  cabinDeck: varchar('cabin_deck', { length: 50 }),
  cabinLocation: varchar('cabin_location', { length: 100 }),
  cabinImageUrl: text('cabin_image_url'),
  cabinDescription: text('cabin_description'),

  // Booking Information
  bookingNumber: varchar('booking_number', { length: 100 }),
  fareCode: varchar('fare_code', { length: 50 }),
  bookingDeadline: date('booking_deadline'),

  // FusionAPI Booking Confirmation (durable booking facts, not session state)
  fusionBookingRef: varchar('fusion_booking_ref', { length: 100 }),
  fusionBookingStatus: varchar('fusion_booking_status', { length: 50 }),
  fusionBookedAt: timestamp('fusion_booked_at', { withTimezone: true }),
  fusionBookingResponse: jsonb('fusion_booking_response'),

  // JSON Data (Traveltek structures) - service returns [] or {} not null
  portCallsJson: jsonb('port_calls_json').default([]),
  cabinPricingJson: jsonb('cabin_pricing_json').default({}),
  shipContentJson: jsonb('ship_content_json').default({}),

  // Import-specific data
  diningPreferences: jsonb('dining_preferences').default({}),
  selectedExtras: jsonb('selected_extras').default([]),
  selectedPromotions: jsonb('selected_promotions').default({}),

  // Traveltek internal IDs for future re-sync/refresh
  traveltekBookingId: bigint('traveltek_booking_id', { mode: 'number' }),
  traveltekPortfolioId: bigint('traveltek_portfolio_id', { mode: 'number' }),

  // Additional Details
  inclusions: text('inclusions').array(), // What's included
  specialRequests: text('special_requests'),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Relations
export const customCruiseDetailsRelations = relations(customCruiseDetails, ({ one }) => ({
  activity: one(itineraryActivities, {
    fields: [customCruiseDetails.activityId],
    references: [itineraryActivities.id],
  }),
  cruiseLineRef: one(cruiseLines, {
    fields: [customCruiseDetails.cruiseLineId],
    references: [cruiseLines.id],
  }),
  cruiseShipRef: one(cruiseShips, {
    fields: [customCruiseDetails.cruiseShipId],
    references: [cruiseShips.id],
  }),
  cruiseRegionRef: one(cruiseRegions, {
    fields: [customCruiseDetails.cruiseRegionId],
    references: [cruiseRegions.id],
  }),
  departurePortRef: one(cruisePorts, {
    fields: [customCruiseDetails.departurePortId],
    references: [cruisePorts.id],
  }),
  arrivalPortRef: one(cruisePorts, {
    fields: [customCruiseDetails.arrivalPortId],
    references: [cruisePorts.id],
  }),
}))

// TypeScript types
export type CustomCruiseDetails = typeof customCruiseDetails.$inferSelect
export type NewCustomCruiseDetails = typeof customCruiseDetails.$inferInsert
