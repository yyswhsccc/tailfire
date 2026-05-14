import { pgTable, varchar, integer, date, text, primaryKey } from 'drizzle-orm/pg-core'

export const taxRates = pgTable('tax_rates', {
  jurisdiction: varchar('jurisdiction', { length: 2 }).notNull(),
  taxType: varchar('tax_type', { length: 10 }).notNull(),
  rateBp: integer('rate_bp').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  source: text('source').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.jurisdiction, t.taxType, t.effectiveFrom] }),
}))

export type TaxRate = typeof taxRates.$inferSelect
export type NewTaxRate = typeof taxRates.$inferInsert
