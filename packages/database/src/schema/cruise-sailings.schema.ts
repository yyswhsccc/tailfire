/**
 * Cruise Sailings Schema
 *
 * Core table for individual cruise departures/sailings.
 * Links to ship, line, embark/disembark ports, and regions.
 * All prices stored in CAD (canonical currency).
 */

import {
  uuid,
  varchar,
  integer,
  date,
  boolean,
  timestamp,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'
import { cruiseShips } from './cruise-ships.schema'
import { cruiseLines } from './cruise-lines.schema'
import { cruisePorts } from './cruise-ports.schema'

export type SailingMetadata = {
  booking_url?: string
  cruise_code?: string
  itinerary_name?: string
  promo_text?: string
  [key: string]: unknown
}

export const cruiseSailings = catalogSchema.table(
  'cruise_sailings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Provider mapping for external system references
    provider: varchar('provider', { length: 100 }).notNull().default('traveltek'),
    providerIdentifier: varchar('provider_identifier', { length: 100 }).notNull(),

    // FK references
    shipId: uuid('ship_id')
      .notNull()
      .references(() => cruiseShips.id, { onDelete: 'restrict' }),
    cruiseLineId: uuid('cruise_line_id')
      .notNull()
      .references(() => cruiseLines.id, { onDelete: 'restrict' }),
    embarkPortId: uuid('embark_port_id').references(() => cruisePorts.id, { onDelete: 'set null' }),
    disembarkPortId: uuid('disembark_port_id').references(() => cruisePorts.id, {
      onDelete: 'set null',
    }),

    // Sailing details
    name: varchar('name', { length: 500 }).notNull(),
    sailDate: date('sail_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    nights: integer('nights').notNull(),
    seaDays: integer('sea_days'), // Days at sea (no port calls)
    voyageCode: varchar('voyage_code', { length: 50 }), // Cruise line's voyage identifier

    // Market and flight information (from Traveltek)
    marketId: integer('market_id'), // Traveltek market ID
    noFly: boolean('no_fly'), // Is this a no-fly cruise (embark from UK)
    departUk: boolean('depart_uk'), // Does the cruise depart from UK

    // Embark/disembark port names (denormalized for display when port FK is null/stub)
    embarkPortName: varchar('embark_port_name', { length: 255 }),
    disembarkPortName: varchar('disembark_port_name', { length: 255 }),

    // Price summaries - All in CAD (canonical currency)
    // NULL means no prices available for that category
    cheapestInsideCents: integer('cheapest_inside_cents'),
    cheapestOceanviewCents: integer('cheapest_oceanview_cents'),
    cheapestBalconyCents: integer('cheapest_balcony_cents'),
    cheapestSuiteCents: integer('cheapest_suite_cents'),

    // Extensible metadata
    metadata: jsonb('metadata').$type<SailingMetadata>().default({}),

    // Sync tracking
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),

    // Soft delete / active flag
    isActive: boolean('is_active').notNull().default(true),

    // Audit fields
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    // OTA stable URL identifiers
    publicId: varchar('public_id', { length: 20 }),
    slugBase: varchar('slug_base', { length: 255 }),
  },
  (table) => ({
    // Provider uniqueness (one sailing per provider+identifier)
    providerIdentifierUnique: unique('cruise_sailings_provider_identifier_unique').on(
      table.provider,
      table.providerIdentifier
    ),
  })
)

// TypeScript types
export type CruiseSailing = typeof cruiseSailings.$inferSelect
export type NewCruiseSailing = typeof cruiseSailings.$inferInsert
