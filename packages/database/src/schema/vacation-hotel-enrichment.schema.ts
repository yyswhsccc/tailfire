import { uuid, varchar, integer, numeric, timestamp, jsonb, unique } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'

export const vacationHotelEnrichment = pgTable(
  'vacation_hotel_enrichment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hotelId: uuid('hotel_id').notNull(),
    googlePlaceId: varchar('google_place_id', { length: 255 }),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    formattedAddress: varchar('formatted_address', { length: 1000 }),
    googleRating: numeric('google_rating', { precision: 2, scale: 1 }),
    googleReviewCount: integer('google_review_count'),
    tripadvisorRating: numeric('tripadvisor_rating', { precision: 2, scale: 1 }),
    tripadvisorReviewCount: integer('tripadvisor_review_count'),
    tripadvisorLink: varchar('tripadvisor_link', { length: 1000 }),
    website: varchar('website', { length: 1000 }),
    phone: varchar('phone', { length: 100 }),
    photos: jsonb('photos').$type<string[]>(),
    rawData: jsonb('raw_data'),
    enrichedAt: timestamp('enriched_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    hotelIdUnique: unique('vacation_hotel_enrichment_hotel_unique').on(table.hotelId),
  })
)

export type VacationHotelEnrichmentRecord = typeof vacationHotelEnrichment.$inferSelect
export type NewVacationHotelEnrichmentRecord = typeof vacationHotelEnrichment.$inferInsert
