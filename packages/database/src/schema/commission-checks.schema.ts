/**
 * Commission Checks Schema
 *
 * Check-based commission system for tracking:
 * - Received checks from suppliers
 * - Paid checks to agents
 * - Reconciled booking items per check
 * - Tax adjustments and corrections
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  decimal,
  date,
  timestamp,
  boolean,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { agencies } from './agencies.schema'
import { suppliers } from './suppliers.schema'
import { userProfiles } from './user-profiles.schema'
import { activityPricing } from './activity-pricing.schema'

// ============================================================================
// ENUMS
// ============================================================================

export const commissionCheckTypeEnum = pgEnum('commission_check_type', ['received', 'paid'])
export const commissionCheckStatusEnum = pgEnum('commission_check_status', [
  'pending',
  'submitted',
  'accepted',
  'cancelled',
])
export const commissionAdjustmentTypeEnum = pgEnum('commission_adjustment_type', [
  'agent',
  'company',
  'backend',
])
export const commissionAdjustmentStatusEnum = pgEnum('commission_adjustment_status', [
  'pending',
  'reconciled',
])

// ============================================================================
// TABLE: commission_checks
// ============================================================================

export const commissionChecks = pgTable('commission_checks', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Tenant scoping
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id),

  // Check details
  checkNumber: varchar('check_number', { length: 255 }).notNull(),
  checkType: commissionCheckTypeEnum('check_type').notNull(),
  checkDate: date('check_date').notNull(),
  checkAmountCents: integer('check_amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('CAD'),

  // Sender (for received checks)
  senderName: varchar('sender_name', { length: 255 }),
  senderSupplierId: uuid('sender_supplier_id').references(() => suppliers.id),

  // Recipient (for paid checks)
  recipientName: varchar('recipient_name', { length: 255 }),
  recipientUserId: uuid('recipient_user_id').references(() => userProfiles.id),

  // Status
  status: commissionCheckStatusEnum('status').notNull().default('pending'),

  // Group check support
  groupCheck: boolean('group_check').notNull().default(false),
  parentCheckId: uuid('parent_check_id'),

  // Additional fields
  payrollId: varchar('payroll_id', { length: 255 }),
  notes: text('notes'),
  source: varchar('source', { length: 100 }).default('manual'),
  sourceRef: varchar('source_ref', { length: 255 }),

  // Reconciliation / accounting
  reconciliationDate: timestamp('reconciliation_date', { withTimezone: true }),
  reconciledBy: uuid('reconciled_by'),
  accountingTransactionId: varchar('accounting_transaction_id', { length: 255 }),
  fileUrl: text('file_url'),
  fileName: varchar('file_name', { length: 255 }),

  // Audit
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// TABLE: commission_check_items
// ============================================================================

export const commissionCheckItems = pgTable(
  'commission_check_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    checkId: uuid('check_id')
      .notNull()
      .references(() => commissionChecks.id, { onDelete: 'cascade' }),

    activityPricingId: uuid('activity_pricing_id')
      .references(() => activityPricing.id),

    // Description for unreconciled items (no matching booking)
    description: varchar('description', { length: 500 }),

    // Commission amounts
    projectedCents: integer('projected_cents'),
    receivedParentCents: integer('received_parent_cents').default(0),
    receivedCents: integer('received_cents').default(0),

    // Tax-on-commission (PR-1 — supplier embeds GST/HST in received_cents)
    embeddedTaxCents: integer('embedded_tax_cents').notNull().default(0),
    embeddedTaxType: varchar('embedded_tax_type', { length: 50 }),
    embeddedTaxRatePercent: decimal('embedded_tax_rate_percent', { precision: 5, scale: 2 }),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueCheckPricing: unique('unique_check_activity_pricing').on(
      table.checkId,
      table.activityPricingId
    ),
  })
)

// ============================================================================
// TABLE: commission_item_settlements
// ============================================================================

export const commissionItemSettlements = pgTable(
  'commission_item_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // PR-1: settlements never delete (reversal-row pattern); RESTRICT both FKs
    // so an accidental hard delete of a parent surfaces loudly instead of
    // silently wiping audit history. Mirrors migration 20260516100400.
    checkItemId: uuid('check_item_id')
      .notNull()
      .references(() => commissionCheckItems.id, { onDelete: 'restrict' }),

    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => userProfiles.id),

    paidCheckId: uuid('paid_check_id')
      .notNull()
      .references(() => commissionChecks.id, { onDelete: 'restrict' }),

    settledAmountCents: integer('settled_amount_cents').notNull(),

    // Reversal pattern (PR-1) — replaces CASCADE DELETE
    isReversal: boolean('is_reversal').notNull().default(false),
    reversesSettlementId: uuid('reverses_settlement_id'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by'),
    reversedReason: text('reversed_reason'),

    // Formula snapshot for forever audit (PR-1)
    computationBreakdown: jsonb('computation_breakdown'),

    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }
)

// ============================================================================
// TABLE: commission_adjustments
// ============================================================================

export const commissionAdjustments = pgTable('commission_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Optional check association
  checkId: uuid('check_id').references(() => commissionChecks.id, { onDelete: 'cascade' }),

  // Tenant scoping
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id),

  // Adjustment details
  description: varchar('description', { length: 500 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  adjustmentType: commissionAdjustmentTypeEnum('adjustment_type').notNull(),

  // Currency (ISO 4217, 3-char; required for multi-currency claim grouping — Phase 2)
  currency: varchar('currency', { length: 3 }).notNull().default('CAD'),

  // Tax fields (fixes TraveleSolutions manual workaround)
  taxType: varchar('tax_type', { length: 50 }),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }),

  // Agent/company association
  agentUserId: uuid('agent_user_id').references(() => userProfiles.id),
  companyName: varchar('company_name', { length: 255 }),

  // PR-1: optional scope to a specific activity_pricing row.
  activityPricingId: uuid('activity_pricing_id').references(() => activityPricing.id, { onDelete: 'set null' }),
  // PR-1: explicit opt-in flag (overrides amount-sign inference).
  isOptional: boolean('is_optional').notNull().default(false),

  // Status
  status: commissionAdjustmentStatusEnum('status').notNull().default('pending'),

  // Source tracking
  source: varchar('source', { length: 100 }).default('manual'),
  sourceRef: varchar('source_ref', { length: 255 }),

  // Audit
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const commissionChecksRelations = relations(commissionChecks, ({ one, many }) => ({
  agency: one(agencies, {
    fields: [commissionChecks.agencyId],
    references: [agencies.id],
  }),
  senderSupplier: one(suppliers, {
    fields: [commissionChecks.senderSupplierId],
    references: [suppliers.id],
  }),
  recipientUser: one(userProfiles, {
    fields: [commissionChecks.recipientUserId],
    references: [userProfiles.id],
  }),
  parentCheck: one(commissionChecks, {
    fields: [commissionChecks.parentCheckId],
    references: [commissionChecks.id],
  }),
  items: many(commissionCheckItems),
  adjustments: many(commissionAdjustments),
  settlements: many(commissionItemSettlements),
}))

export const commissionCheckItemsRelations = relations(commissionCheckItems, ({ one, many }) => ({
  check: one(commissionChecks, {
    fields: [commissionCheckItems.checkId],
    references: [commissionChecks.id],
  }),
  activityPricing: one(activityPricing, {
    fields: [commissionCheckItems.activityPricingId],
    references: [activityPricing.id],
  }),
  settlements: many(commissionItemSettlements),
}))

export const commissionItemSettlementsRelations = relations(commissionItemSettlements, ({ one }) => ({
  checkItem: one(commissionCheckItems, {
    fields: [commissionItemSettlements.checkItemId],
    references: [commissionCheckItems.id],
  }),
  recipientUser: one(userProfiles, {
    fields: [commissionItemSettlements.recipientUserId],
    references: [userProfiles.id],
  }),
  paidCheck: one(commissionChecks, {
    fields: [commissionItemSettlements.paidCheckId],
    references: [commissionChecks.id],
  }),
}))

export const commissionAdjustmentsRelations = relations(commissionAdjustments, ({ one }) => ({
  check: one(commissionChecks, {
    fields: [commissionAdjustments.checkId],
    references: [commissionChecks.id],
  }),
  agency: one(agencies, {
    fields: [commissionAdjustments.agencyId],
    references: [agencies.id],
  }),
  agentUser: one(userProfiles, {
    fields: [commissionAdjustments.agentUserId],
    references: [userProfiles.id],
  }),
}))

// ============================================================================
// TYPESCRIPT TYPES
// ============================================================================

export type CommissionCheck = typeof commissionChecks.$inferSelect
export type NewCommissionCheck = typeof commissionChecks.$inferInsert
export type CommissionCheckType = (typeof commissionCheckTypeEnum.enumValues)[number]
export type CommissionCheckStatus = (typeof commissionCheckStatusEnum.enumValues)[number]

export type CommissionCheckItem = typeof commissionCheckItems.$inferSelect
export type NewCommissionCheckItem = typeof commissionCheckItems.$inferInsert

export type CommissionAdjustment = typeof commissionAdjustments.$inferSelect
export type NewCommissionAdjustment = typeof commissionAdjustments.$inferInsert
export type CommissionAdjustmentType = (typeof commissionAdjustmentTypeEnum.enumValues)[number]
export type CommissionAdjustmentStatus = (typeof commissionAdjustmentStatusEnum.enumValues)[number]

export type CommissionItemSettlement = typeof commissionItemSettlements.$inferSelect
export type NewCommissionItemSettlement = typeof commissionItemSettlements.$inferInsert
