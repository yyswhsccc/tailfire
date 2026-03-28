import { uuid, varchar, integer, boolean, timestamp, jsonb, numeric, unique } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'
import { vacationDestinations } from './vacation-destinations.schema'

export const vacationHotels = catalogSchema.table(
  'vacation_hotels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 50 }).notNull(),
    destinationId: uuid('destination_id').references(() => vacationDestinations.id),
    name: varchar('name', { length: 500 }).notNull(),
    starRating: integer('star_rating'),
    hotelChain: varchar('hotel_chain', { length: 255 }),
    imageUrl: varchar('image_url', { length: 1000 }),
    amenities: jsonb('amenities').$type<Record<string, boolean>>(),
    monarcRating: numeric('monarc_rating', { precision: 3, scale: 2 }),
    monarcReviewCount: integer('monarc_review_count'),
    isActive: boolean('is_active').default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    contentHash: varchar('content_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    providerUnique: unique('vacation_hotels_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationHotel = typeof vacationHotels.$inferSelect
export type NewVacationHotel = typeof vacationHotels.$inferInsert
