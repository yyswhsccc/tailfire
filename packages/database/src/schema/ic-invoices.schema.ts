/**
 * IC Invoices Schema
 *
 * RCTI (Recipient Created Tax Invoice) system for independent contractor commission payouts.
 * Two tightly-coupled tables:
 *   - ic_invoices: one invoice per IC payout event (snapshotted identity, tax calc, status FSM)
 *   - ic_invoice_lines: line items — either a commission check item OR an adjustment (mutually exclusive)
 *
 * The CHECK constraint on ic_invoice_lines enforces line-type discipline:
 *   - 'commission' lines: check_item_id NOT NULL, adjustment_id IS NULL
 *   - 'adjustment' lines: adjustment_id NOT NULL, check_item_id IS NULL
 */

import {
  pgTable, uuid, varchar, jsonb, date, timestamp, integer, bigint, pgEnum, text,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'
import { userProfiles } from './user-profiles.schema'
import { icTaxProfiles } from './ic-tax-profiles.schema'
import { icPayoutAuthorizations } from './ic-payout-authorizations.schema'
import { commissionChecks, commissionCheckItems, commissionAdjustments } from './commission-checks.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const icInvoiceStatusEnum = pgEnum('ic_invoice_status', [
  'draft', 'submitted', 'approved', 'rejected', 'cancelled',
])

export const icInvoiceLineTypeEnum = pgEnum('ic_invoice_line_type', [
  'commission', 'adjustment',
])

// ============================================================================
// TABLE: ic_invoices
// ============================================================================

export const icInvoices = pgTable('ic_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').notNull().references(() => agencies.id),
  userId: uuid('user_id').notNull().references(() => userProfiles.id),

  invoiceNumber: varchar('invoice_number', { length: 40 }).notNull(),
  invoiceDate: date('invoice_date').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),

  // Snapshotted IC identity at time of invoice creation
  // SIN/BN is stored only as a mask here — the encrypted value lives in ic_tax_profiles
  icLegalName: varchar('ic_legal_name', { length: 255 }).notNull(),
  icAddress: jsonb('ic_address').notNull(),
  icDomicileProvince: varchar('ic_domicile_province', { length: 2 }).notNull(),
  icGstHstNumber: varchar('ic_gst_hst_number', { length: 40 }),
  icSinOrBnMask: varchar('ic_sin_or_bn_mask', { length: 20 }),
  icTaxProfileId: uuid('ic_tax_profile_id').notNull().references(() => icTaxProfiles.id),
  rctiAuthorizationId: uuid('rcti_authorization_id').notNull().references(() => icPayoutAuthorizations.id),

  // C1: separate base / tax / total (all in cents)
  reportableBaseCents: bigint('reportable_base_cents', { mode: 'number' }).notNull(),
  taxCents: bigint('tax_cents', { mode: 'number' }).notNull().default(0),
  totalCents: bigint('total_cents', { mode: 'number' }).notNull(),

  // C2: place-of-supply outcome stored for audit trail
  placeOfSupplyJurisdiction: varchar('place_of_supply_jurisdiction', { length: 2 }).notNull(),
  placeOfSupplyRule: varchar('place_of_supply_rule', { length: 40 }).notNull(),
  taxType: varchar('tax_type', { length: 10 }).notNull(),
  taxRateBp: integer('tax_rate_bp').notNull().default(0),

  pdfStoragePath: text('pdf_storage_path'),
  pdfHash: varchar('pdf_hash', { length: 64 }),

  status: icInvoiceStatusEnum('status').notNull().default('draft'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: uuid('approved_by'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectedReason: text('rejected_reason'),

  // C3 reservation: links to internal commission_checks row (type='paid') created on submission
  // Nullable: NULL until invoice transitions to 'submitted'
  reservationCheckId: uuid('reservation_check_id').references(() => commissionChecks.id),

  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// TABLE: ic_invoice_lines
// ============================================================================

export const icInvoiceLines = pgTable('ic_invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => icInvoices.id, { onDelete: 'cascade' }),
  lineType: icInvoiceLineTypeEnum('line_type').notNull(),

  // Exactly one of these must be set (enforced by CHECK constraint in migration):
  //   commission → check_item_id NOT NULL, adjustment_id IS NULL
  //   adjustment → adjustment_id NOT NULL, check_item_id IS NULL
  checkItemId: uuid('check_item_id').references(() => commissionCheckItems.id),
  adjustmentId: uuid('adjustment_id').references(() => commissionAdjustments.id),

  description: varchar('description', { length: 500 }),
  tripRef: varchar('trip_ref', { length: 100 }),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const icInvoicesRelations = relations(icInvoices, ({ one, many }) => ({
  user: one(userProfiles, { fields: [icInvoices.userId], references: [userProfiles.id] }),
  agency: one(agencies, { fields: [icInvoices.agencyId], references: [agencies.id] }),
  taxProfile: one(icTaxProfiles, { fields: [icInvoices.icTaxProfileId], references: [icTaxProfiles.id] }),
  authorization: one(icPayoutAuthorizations, { fields: [icInvoices.rctiAuthorizationId], references: [icPayoutAuthorizations.id] }),
  reservationCheck: one(commissionChecks, { fields: [icInvoices.reservationCheckId], references: [commissionChecks.id] }),
  lines: many(icInvoiceLines),
}))

export const icInvoiceLinesRelations = relations(icInvoiceLines, ({ one }) => ({
  invoice: one(icInvoices, { fields: [icInvoiceLines.invoiceId], references: [icInvoices.id] }),
  checkItem: one(commissionCheckItems, { fields: [icInvoiceLines.checkItemId], references: [commissionCheckItems.id] }),
  adjustment: one(commissionAdjustments, { fields: [icInvoiceLines.adjustmentId], references: [commissionAdjustments.id] }),
}))

// ============================================================================
// TYPESCRIPT TYPES
// ============================================================================

export type IcInvoice = typeof icInvoices.$inferSelect
export type NewIcInvoice = typeof icInvoices.$inferInsert
export type IcInvoiceLine = typeof icInvoiceLines.$inferSelect
export type NewIcInvoiceLine = typeof icInvoiceLines.$inferInsert
export type IcInvoiceStatus = (typeof icInvoiceStatusEnum.enumValues)[number]
export type IcInvoiceLineType = (typeof icInvoiceLineTypeEnum.enumValues)[number]
