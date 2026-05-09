import { pgTable, uuid, varchar, jsonb, date, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'

export const agencyTaxFilingConfig = pgTable('agency_tax_filing_config', {
  agencyId: uuid('agency_id').primaryKey().references(() => agencies.id),
  legalName: varchar('legal_name', { length: 255 }).notNull(),
  payerAccountNumber: varchar('payer_account_number', { length: 20 }).notNull(),
  transmitterNumber: varchar('transmitter_number', { length: 20 }),
  filingAddress: jsonb('filing_address').notNull(),
  filingProvince: varchar('filing_province', { length: 2 }).notNull(),
  filingContactName: varchar('filing_contact_name', { length: 255 }),
  filingContactEmail: varchar('filing_contact_email', { length: 255 }),
  filingContactPhone: varchar('filing_contact_phone', { length: 40 }),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agencyTaxFilingConfigRelations = relations(agencyTaxFilingConfig, ({ one }) => ({
  agency: one(agencies, {
    fields: [agencyTaxFilingConfig.agencyId],
    references: [agencies.id],
  }),
}))

export type AgencyTaxFilingConfig = typeof agencyTaxFilingConfig.$inferSelect
export type NewAgencyTaxFilingConfig = typeof agencyTaxFilingConfig.$inferInsert
