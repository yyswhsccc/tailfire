import { uuid, varchar, numeric, boolean, primaryKey } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { destinations } from './destinations.schema'

export const destinationVacationDestinations = pgTable(
  'destination_vacation_destinations',
  {
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'cascade' }),
    vacationDestinationId: uuid('vacation_destination_id').notNull(),
    matchMethod: varchar('match_method', { length: 50 }).notNull(),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull().default('1.0'),
    isPrimary: boolean('is_primary').notNull().default(true),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.destinationId, table.vacationDestinationId] }),
  })
)
