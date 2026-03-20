/**
 * Transportation Details Schema
 *
 * Stores component-specific data for transportation activities (car rentals, transfers, trains, etc.).
 * References the base itinerary_activities table for common fields.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  time,
  timestamp,
  integer,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { itineraryActivities } from './activities.schema'

// Type for vehicle features/amenities
export type TransportationFeatures = string[]

// Transportation subtype enum values
export type TransportationSubtype =
  | 'transfer'      // Airport/hotel transfers
  | 'car_rental'    // Car rental
  | 'private_car'   // Private car service
  | 'taxi'          // Taxi/rideshare
  | 'shuttle'       // Shuttle service
  | 'train'         // Rail
  | 'ferry'         // Water transport
  | 'bus'           // Bus/coach
  | 'limousine'     // Limousine service

export const transportationDetails = pgTable('transportation_details', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Reference to base activity
  activityId: uuid('activity_id')
    .notNull()
    .references(() => itineraryActivities.id, { onDelete: 'cascade' })
    .unique(),

  // Transportation type classification
  subtype: varchar('subtype', { length: 50 }), // transfer, car_rental, train, etc.

  // Provider information
  providerName: varchar('provider_name', { length: 255 }),
  providerPhone: varchar('provider_phone', { length: 50 }),
  providerEmail: varchar('provider_email', { length: 255 }),

  // Vehicle details
  vehicleType: varchar('vehicle_type', { length: 100 }), // car, suv, van, bus, etc.
  vehicleModel: varchar('vehicle_model', { length: 100 }),
  vehicleCapacity: integer('vehicle_capacity'),
  licensePlate: varchar('license_plate', { length: 50 }),

  // Pickup details (following flight pattern with separate date/time/timezone)
  pickupDate: date('pickup_date'),
  pickupTime: time('pickup_time'),
  pickupTimezone: varchar('pickup_timezone', { length: 64 }), // IANA timezone
  pickupAddress: text('pickup_address'),
  pickupNotes: text('pickup_notes'),

  // Dropoff details
  dropoffDate: date('dropoff_date'),
  dropoffTime: time('dropoff_time'),
  dropoffTimezone: varchar('dropoff_timezone', { length: 64 }), // IANA timezone
  dropoffAddress: text('dropoff_address'),
  dropoffNotes: text('dropoff_notes'),

  // Driver information (for private transfers)
  driverName: varchar('driver_name', { length: 255 }),
  driverPhone: varchar('driver_phone', { length: 50 }),

  // Car rental specific fields
  rentalPickupLocation: varchar('rental_pickup_location', { length: 255 }),
  rentalDropoffLocation: varchar('rental_dropoff_location', { length: 255 }),
  rentalInsuranceType: varchar('rental_insurance_type', { length: 100 }),
  rentalMileageLimit: varchar('rental_mileage_limit', { length: 100 }),

  // Additional details
  features: jsonb('features').$type<TransportationFeatures>().default([]),
  specialRequests: text('special_requests'),
  flightNumber: varchar('flight_number', { length: 50 }), // For airport transfers
  isRoundTrip: integer('is_round_trip').default(0), // 0 = one way, 1 = round trip

  // Structured pickup location (Google Places + Amadeus)
  pickupName: varchar('pickup_name', { length: 255 }),
  pickupLat: numeric('pickup_lat', { precision: 9, scale: 6 }),
  pickupLng: numeric('pickup_lng', { precision: 10, scale: 6 }),
  pickupPlaceId: varchar('pickup_place_id', { length: 255 }),

  // Structured dropoff location
  dropoffName: varchar('dropoff_name', { length: 255 }),
  dropoffLat: numeric('dropoff_lat', { precision: 9, scale: 6 }),
  dropoffLng: numeric('dropoff_lng', { precision: 10, scale: 6 }),
  dropoffPlaceId: varchar('dropoff_place_id', { length: 255 }),

  // Enhanced car rental fields (Amadeus-aligned)
  rentalCompany: varchar('rental_company', { length: 255 }),
  rentalBookingRef: varchar('rental_booking_ref', { length: 100 }),
  rentalCarClass: varchar('rental_car_class', { length: 50 }),
  rentalFuelPolicy: varchar('rental_fuel_policy', { length: 50 }),

  // Station/terminal for train, ferry, bus
  departureStation: varchar('departure_station', { length: 255 }),
  arrivalStation: varchar('arrival_station', { length: 255 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Relations
export const transportationDetailsRelations = relations(transportationDetails, ({ one }) => ({
  activity: one(itineraryActivities, {
    fields: [transportationDetails.activityId],
    references: [itineraryActivities.id],
  }),
}))

// Type exports for the schema
export type TransportationDetailsInsert = typeof transportationDetails.$inferInsert
export type TransportationDetailsSelect = typeof transportationDetails.$inferSelect
