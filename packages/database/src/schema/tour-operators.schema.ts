/**
 * Tour Operators Schema
 *
 * Lookup table for tour operators/brands.
 * Examples: Globus, Cosmos, Monograms
 */

import { uuid, varchar, timestamp } from 'drizzle-orm/pg-core'
import { catalogSchema } from './catalog.schema'

export const tourOperators = catalogSchema.table('tour_operators', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 100 }).notNull(),
  supplierId: uuid('supplier_id'), // Links to suppliers table (no .references() — matches cruise_lines pattern for FDW)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// TypeScript types
export type TourOperator = typeof tourOperators.$inferSelect
export type NewTourOperator = typeof tourOperators.$inferInsert
