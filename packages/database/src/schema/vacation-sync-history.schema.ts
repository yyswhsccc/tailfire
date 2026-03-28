import { uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const vacationSyncHistory = catalogSchema.table(
  'vacation_sync_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 100 }).default('softvoyage'),
    status: varchar('status', { length: 50 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metrics: jsonb('metrics').$type<{
      gatewaysFound?: number
      gatewaysSynced?: number
      destinationsFound?: number
      destinationsSynced?: number
      hotelsFound?: number
      hotelsInserted?: number
      hotelsUpdated?: number
      hotelsUnchanged?: number
      hotelsSoftDeleted?: number
    }>(),
    errors: jsonb('errors').$type<Array<{ message: string; context?: string }>>(),
  }
)

export type VacationSyncHistoryRecord = typeof vacationSyncHistory.$inferSelect
