/**
 * IC Disbursements Schema
 *
 * Provider-agnostic payout disbursement system for IC commission payouts.
 * Two tightly-coupled tables:
 *   - ic_disbursements: one disbursement per approved invoice (1:1), tracks payout status
 *     and FX snapshot for T4A Box 020 reporting
 *   - ic_disbursement_attempts: append-only attempt log per disbursement (1:many)
 *
 * Reuses the ic_payout_account_rail enum from ic-payout-accounts.schema.ts.
 * FX snapshot fields (fxRateToCad, cadEquivalent*) are nullable on insert (status='queued')
 * and are populated by DisbursementService.markSent in Task 37.
 */

import {
  pgTable, uuid, varchar, timestamp, bigint, pgEnum, text, integer, jsonb, date, numeric,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { icPayoutAccountRailEnum } from './ic-payout-accounts.schema'
import { icInvoices } from './ic-invoices.schema'
import { userProfiles } from './user-profiles.schema'
import { icPayoutAccounts } from './ic-payout-accounts.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const icDisbursementStatusEnum = pgEnum('ic_disbursement_status', [
  'queued', 'sending', 'sent', 'failed', 'returned', 'cancelled',
])

export const icDisbursementAttemptOutcomeEnum = pgEnum('ic_disbursement_attempt_outcome', [
  'sent', 'failed', 'returned', 'cancelled',
])

// ============================================================================
// TABLE: ic_disbursements
// ============================================================================

export const icDisbursements = pgTable('ic_disbursements', {
  id: uuid('id').primaryKey().defaultRandom(),

  // 1:1 with invoice (UNIQUE enforced via uniqueIndex in migration)
  invoiceId: uuid('invoice_id').notNull().unique().references(() => icInvoices.id),
  userId: uuid('user_id').notNull().references(() => userProfiles.id),

  // Snapshot reference to the payout account used (denormalized for audit)
  payoutAccountId: uuid('payout_account_id').notNull().references(() => icPayoutAccounts.id),

  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),

  provider: varchar('provider', { length: 40 }).notNull(),  // 'manual' | 'vopay' | 'dreampay'
  rail: icPayoutAccountRailEnum('rail').notNull(),

  idempotencyKey: uuid('idempotency_key').notNull().unique(),

  status: icDisbursementStatusEnum('status').notNull().default('queued'),

  // FX snapshot for T4A (all nullable on insert; populated by markSent in Task 37)
  // rate=1.0 for CAD; always populated before status transitions to 'sent'
  fxRateToCad: numeric('fx_rate_to_cad', { precision: 18, scale: 8 }),
  cadEquivalentBaseCents: bigint('cad_equivalent_base_cents', { mode: 'number' }),   // invoice.reportableBase × fxRate → T4A Box 020
  cadEquivalentTaxCents: bigint('cad_equivalent_tax_cents', { mode: 'number' }),     // invoice.tax × fxRate (informational)
  cadEquivalentTotalCents: bigint('cad_equivalent_total_cents', { mode: 'number' }), // total CAD equivalent
  fxRateSource: varchar('fx_rate_source', { length: 40 }),  // 'bank_of_canada' | 'manual'
  fxRateDate: date('fx_rate_date'),

  completedAt: timestamp('completed_at', { withTimezone: true }),  // when status flipped to 'sent'

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// TABLE: ic_disbursement_attempts
// ============================================================================

export const icDisbursementAttempts = pgTable('ic_disbursement_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),

  disbursementId: uuid('disbursement_id').notNull().references(() => icDisbursements.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(),

  provider: varchar('provider', { length: 40 }).notNull(),
  rail: icPayoutAccountRailEnum('rail').notNull(),

  // Nullable while attempt in-progress; populated on completion
  outcome: icDisbursementAttemptOutcomeEnum('outcome'),
  reason: text('reason'),

  // v1: manual payout fields (e-Transfer, Wise, wire)
  manualReference: varchar('manual_reference', { length: 255 }),    // e-Transfer #, Wise tx id, wire ref
  manualProofStoragePath: text('manual_proof_storage_path'),
  manualSentBy: uuid('manual_sent_by'),

  // v2: provider integration fields
  providerTxnId: varchar('provider_txn_id', { length: 255 }),
  providerWebhookPayload: jsonb('provider_webhook_payload'),
  providerFeeCents: bigint('provider_fee_cents', { mode: 'number' }),

  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const icDisbursementsRelations = relations(icDisbursements, ({ one, many }) => ({
  invoice: one(icInvoices, { fields: [icDisbursements.invoiceId], references: [icInvoices.id] }),
  user: one(userProfiles, { fields: [icDisbursements.userId], references: [userProfiles.id] }),
  payoutAccount: one(icPayoutAccounts, { fields: [icDisbursements.payoutAccountId], references: [icPayoutAccounts.id] }),
  attempts: many(icDisbursementAttempts),
}))

export const icDisbursementAttemptsRelations = relations(icDisbursementAttempts, ({ one }) => ({
  disbursement: one(icDisbursements, { fields: [icDisbursementAttempts.disbursementId], references: [icDisbursements.id] }),
}))

// ============================================================================
// TYPESCRIPT TYPES
// ============================================================================

export type IcDisbursement = typeof icDisbursements.$inferSelect
export type NewIcDisbursement = typeof icDisbursements.$inferInsert
export type IcDisbursementAttempt = typeof icDisbursementAttempts.$inferSelect
export type NewIcDisbursementAttempt = typeof icDisbursementAttempts.$inferInsert
export type IcDisbursementStatus = (typeof icDisbursementStatusEnum.enumValues)[number]
export type IcDisbursementAttemptOutcome = (typeof icDisbursementAttemptOutcomeEnum.enumValues)[number]
