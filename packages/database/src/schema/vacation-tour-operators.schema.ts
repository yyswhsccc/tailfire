import { uuid, varchar, boolean, unique } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationTourOperators = catalogSchema.table(
  'vacation_tour_operators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).notNull().default('softvoyage'),
    providerIdentifier: varchar('provider_identifier', { length: 50 }).notNull(),
    code: varchar('code', { length: 10 }).notNull(),
    name: varchar('name', { length: 255 }),
    supplierId: uuid('supplier_id'),
    isActive: boolean('is_active').default(true),
  },
  (table) => ({
    providerUnique: unique('vacation_tour_operators_provider_unique').on(table.provider, table.providerIdentifier),
  })
)

export type VacationTourOperator = typeof vacationTourOperators.$inferSelect
export type NewVacationTourOperator = typeof vacationTourOperators.$inferInsert
