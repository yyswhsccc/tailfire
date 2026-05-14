import { pgTable, uuid, integer, smallint, primaryKey } from 'drizzle-orm/pg-core'

export const icInvoiceNumberSequences = pgTable('ic_invoice_number_sequences', {
  agencyId: uuid('agency_id').notNull(),
  userId: uuid('user_id').notNull(),
  taxYear: smallint('tax_year').notNull(),
  nextSeq: integer('next_seq').notNull().default(1),
}, (t) => ({
  pk: primaryKey({ columns: [t.agencyId, t.userId, t.taxYear] }),
}))

export type IcInvoiceNumberSequence = typeof icInvoiceNumberSequences.$inferSelect
export type NewIcInvoiceNumberSequence = typeof icInvoiceNumberSequences.$inferInsert
