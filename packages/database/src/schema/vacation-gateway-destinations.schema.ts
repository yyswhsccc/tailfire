import { uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'
import { vacationGateways } from './vacation-gateways.schema'
import { vacationDestinations } from './vacation-destinations.schema'

export const vacationGatewayDestinations = catalogSchema.table(
  'vacation_gateway_destinations',
  {
    gatewayId: uuid('gateway_id').notNull().references(() => vacationGateways.id),
    destinationId: uuid('destination_id').notNull().references(() => vacationDestinations.id),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.gatewayId, table.destinationId] }),
  })
)
