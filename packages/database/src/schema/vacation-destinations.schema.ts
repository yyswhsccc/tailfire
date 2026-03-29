import { uuid, varchar, boolean, timestamp, integer, unique } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationDestinations = catalogSchema.table(
  'vacation_destinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 50 }).notNull(),
    name: varchar('name', { length: 500 }).notNull(),
    countryCode: varchar('country_code', { length: 2 }),
    countryName: varchar('country_name', { length: 255 }),
    regionGroup: varchar('region_group', { length: 100 }),
    availableDurations: integer('available_durations').array(),
    isActive: boolean('is_active').default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    contentHash: varchar('content_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    providerUnique: unique('vacation_destinations_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationDestination = typeof vacationDestinations.$inferSelect
export type NewVacationDestination = typeof vacationDestinations.$inferInsert
