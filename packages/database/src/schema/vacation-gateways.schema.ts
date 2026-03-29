import { uuid, varchar, boolean, timestamp, unique } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationGateways = catalogSchema.table(
  'vacation_gateways',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 10 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    airportCode: varchar('airport_code', { length: 4 }).notNull(),
    isActive: boolean('is_active').default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    contentHash: varchar('content_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    providerUnique: unique('vacation_gateways_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationGateway = typeof vacationGateways.$inferSelect
export type NewVacationGateway = typeof vacationGateways.$inferInsert
