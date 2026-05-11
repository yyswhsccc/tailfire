/**
 * FX Rate Snapshots
 *
 * Daily Bank of Canada rates cached locally for T4A CAD-equivalent calculation.
 * One row per (rate_date, from_currency, to_currency). Composite primary key.
 *
 * Populated by:
 *   1. Scheduled cron in FxRateService (weekday 16:30 ET, after BoC publishes ~16:00 ET)
 *   2. On-demand fetch by FxRateService.getRateOnDate when an admin marks a disbursement
 *      sent on a date that hasn't been snapshotted yet (e.g., weekend backfill).
 *
 * Source: https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json
 */

import { pgTable, varchar, date, numeric, timestamp, primaryKey } from 'drizzle-orm/pg-core'

export const fxRateSnapshots = pgTable('fx_rate_snapshots', {
  rateDate: date('rate_date').notNull(),
  fromCurrency: varchar('from_currency', { length: 3 }).notNull(),
  toCurrency: varchar('to_currency', { length: 3 }).notNull(),
  rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
  source: varchar('source', { length: 40 }).notNull().default('bank_of_canada'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.rateDate, table.fromCurrency, table.toCurrency] }),
}))

export type FxRateSnapshot = typeof fxRateSnapshots.$inferSelect
export type NewFxRateSnapshot = typeof fxRateSnapshots.$inferInsert
