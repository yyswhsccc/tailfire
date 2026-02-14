/**
 * Activity Pricing Schema
 *
 * Pricing, payment schedules, and commission tracking for bookable activities
 */

import { pgTable, pgEnum, uuid, varchar, decimal, text, date, timestamp, integer, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { itineraryActivities } from './activities.schema'

// Reuse pricing type enum from activities
import { pricingTypeEnum } from './activities.schema'

// Payment-related enums
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'cancelled'])
export const commissionStatusEnum = pgEnum('commission_status', ['pending', 'received', 'cancelled'])

// Invoice type enum
export const invoiceTypeEnum = pgEnum('invoice_type', ['individual_item', 'part_of_package'])

// Payment schedule enums
export const scheduleTypeEnum = pgEnum('schedule_type', ['full', 'deposit', 'installments', 'guarantee'])
export const depositTypeEnum = pgEnum('deposit_type', ['percentage', 'fixed_amount'])
export const expectedPaymentStatusEnum = pgEnum('expected_payment_status', [
  'pending',
  'partial',
  'paid',
  'overdue',
])

// Payment transaction enums
export const paymentTransactionTypeEnum = pgEnum('payment_transaction_type', ['payment', 'refund', 'adjustment'])
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'check', 'credit_card', 'bank_transfer', 'stripe', 'other'])

export const activityPricing = pgTable('activity_pricing', {
  id: uuid('id').primaryKey().defaultRandom(),
  activityId: uuid('activity_id')
    .notNull()
    .references(() => itineraryActivities.id, { onDelete: 'cascade' })
    .unique(), // One-to-one relationship

  // Agency Association (denormalized for RLS, required)
  agencyId: uuid('agency_id').notNull(),

  pricingType: pricingTypeEnum('pricing_type').notNull(),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(), // DEPRECATED: Use totalPriceCents for consistency
  currency: varchar('currency', { length: 3 }).notNull().default('CAD'),
  invoiceType: invoiceTypeEnum('invoice_type').notNull().default('individual_item'),

  // Extended pricing fields (added in migration 0019)
  totalPriceCents: integer('total_price_cents'),
  taxesAndFeesCents: integer('taxes_and_fees_cents').default(0),

  // Commission configuration fields (expected values, not actuals)
  commissionTotalCents: integer('commission_total_cents'),
  commissionSplitPercentage: decimal('commission_split_percentage', { precision: 5, scale: 2 }),
  commissionExpectedDate: date('commission_expected_date'),

  confirmationNumber: varchar('confirmation_number', { length: 255 }),
  bookingReference: varchar('booking_reference', { length: 255 }), // Links round-trip flights/activities
  bookingStatus: varchar('booking_status', { length: 100 }),

  // Booking details
  termsAndConditions: text('terms_and_conditions'),
  cancellationPolicy: text('cancellation_policy'),
  supplier: varchar('supplier', { length: 255 }),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const paymentSchedule = pgTable('payment_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  activityPricingId: uuid('activity_pricing_id')
    .notNull()
    .references(() => activityPricing.id, { onDelete: 'cascade' }),

  paymentDate: date('payment_date').notNull(),
  paymentAmount: decimal('payment_amount', { precision: 10, scale: 2 }).notNull(),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  notes: text('notes'),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// NOTE: Uses component_pricing_id in DB (legacy name), mapped to activityPricingId in code
export const commissionTracking = pgTable('commission_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  activityPricingId: uuid('component_pricing_id')
    .notNull()
    .references(() => activityPricing.id, { onDelete: 'cascade' }),

  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }), // Percentage (e.g., 10.00 for 10%)
  commissionAmount: decimal('commission_amount', { precision: 10, scale: 2 }).notNull(),
  commissionStatus: commissionStatusEnum('commission_status').notNull().default('pending'),
  notes: text('notes'),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Payment Schedule Config (1:1 with activity_pricing)
// NOTE: Uses component_pricing_id in DB (legacy name), mapped to activityPricingId in code
export const paymentScheduleConfig = pgTable('payment_schedule_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  activityPricingId: uuid('component_pricing_id')
    .notNull()
    .unique()
    .references(() => activityPricing.id, { onDelete: 'cascade' }),

  // Schedule configuration
  scheduleType: scheduleTypeEnum('schedule_type').notNull().default('full'),
  allowPartialPayments: boolean('allow_partial_payments').default(false),

  // Deposit settings (only used when schedule_type = 'deposit')
  depositType: depositTypeEnum('deposit_type'),
  depositPercentage: decimal('deposit_percentage', { precision: 5, scale: 2 }),
  depositAmountCents: integer('deposit_amount_cents'),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Expected Payment Items (1:many with payment_schedule_config)
export const expectedPaymentItems = pgTable('expected_payment_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentScheduleConfigId: uuid('payment_schedule_config_id')
    .notNull()
    .references(() => paymentScheduleConfig.id, { onDelete: 'cascade' }),

  // Agency Association (denormalized for RLS, required)
  agencyId: uuid('agency_id').notNull(),

  // Item details
  paymentName: varchar('payment_name', { length: 100 }).notNull(),
  expectedAmountCents: integer('expected_amount_cents').notNull(),
  dueDate: date('due_date'),
  status: expectedPaymentStatusEnum('status').notNull().default('pending'),
  sequenceOrder: integer('sequence_order').notNull().default(0),

  // Tracking (for future payment logging)
  paidAmountCents: integer('paid_amount_cents').default(0).notNull(),

  // TICO compliance - lock items once paid to prevent modification
  isLocked: boolean('is_locked').notNull().default(false),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: uuid('locked_by'),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Credit Card Guarantee/Authorization (1:1 with payment_schedule_config when schedule_type = 'guarantee')
export const creditCardGuarantee = pgTable('credit_card_guarantee', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentScheduleConfigId: uuid('payment_schedule_config_id')
    .notNull()
    .unique()
    .references(() => paymentScheduleConfig.id, { onDelete: 'cascade' }),

  // Card details (last 4 digits only for PCI compliance)
  cardHolderName: varchar('card_holder_name', { length: 255 }).notNull(),
  cardLast4: varchar('card_last_4', { length: 4 }).notNull(),

  // Authorization details
  authorizationCode: varchar('authorization_code', { length: 100 }).notNull(),
  authorizationDate: timestamp('authorization_date', { withTimezone: true }).notNull(),
  authorizationAmountCents: integer('authorization_amount_cents').notNull(),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Payment Transactions (1:many with expected_payment_items) - Records actual payments received
export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  expectedPaymentItemId: uuid('expected_payment_item_id')
    .notNull()
    .references(() => expectedPaymentItems.id, { onDelete: 'cascade' }),

  // Agency Association (denormalized for RLS, required)
  agencyId: uuid('agency_id').notNull(),

  // Transaction details
  transactionType: paymentTransactionTypeEnum('transaction_type').notNull(),
  amountCents: integer('amount_cents').notNull(), // CHECK constraint: >= 0 (in migration)
  currency: varchar('currency', { length: 3 }).notNull(), // Must match parent currency
  paymentMethod: paymentMethodEnum('payment_method'),
  referenceNumber: varchar('reference_number', { length: 100 }),
  transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
  notes: text('notes'),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
})

// Relations
export const activityPricingRelations = relations(activityPricing, ({ one, many }) => ({
  activity: one(itineraryActivities, {
    fields: [activityPricing.activityId],
    references: [itineraryActivities.id],
  }),
  paymentSchedule: many(paymentSchedule),
  commissionTracking: many(commissionTracking),
  paymentScheduleConfig: one(paymentScheduleConfig, {
    fields: [activityPricing.id],
    references: [paymentScheduleConfig.activityPricingId],
  }),
}))

export const paymentScheduleRelations = relations(paymentSchedule, ({ one }) => ({
  pricing: one(activityPricing, {
    fields: [paymentSchedule.activityPricingId],
    references: [activityPricing.id],
  }),
}))

export const commissionTrackingRelations = relations(commissionTracking, ({ one }) => ({
  pricing: one(activityPricing, {
    fields: [commissionTracking.activityPricingId],
    references: [activityPricing.id],
  }),
}))

export const paymentScheduleConfigRelations = relations(paymentScheduleConfig, ({ one, many }) => ({
  activityPricing: one(activityPricing, {
    fields: [paymentScheduleConfig.activityPricingId],
    references: [activityPricing.id],
  }),
  expectedPaymentItems: many(expectedPaymentItems),
  creditCardGuarantee: one(creditCardGuarantee, {
    fields: [paymentScheduleConfig.id],
    references: [creditCardGuarantee.paymentScheduleConfigId],
  }),
}))

export const expectedPaymentItemsRelations = relations(expectedPaymentItems, ({ one, many }) => ({
  paymentScheduleConfig: one(paymentScheduleConfig, {
    fields: [expectedPaymentItems.paymentScheduleConfigId],
    references: [paymentScheduleConfig.id],
  }),
  transactions: many(paymentTransactions),
}))

export const creditCardGuaranteeRelations = relations(creditCardGuarantee, ({ one }) => ({
  paymentScheduleConfig: one(paymentScheduleConfig, {
    fields: [creditCardGuarantee.paymentScheduleConfigId],
    references: [paymentScheduleConfig.id],
  }),
}))

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  expectedPaymentItem: one(expectedPaymentItems, {
    fields: [paymentTransactions.expectedPaymentItemId],
    references: [expectedPaymentItems.id],
  }),
}))

// TypeScript types
export type ActivityPricing = typeof activityPricing.$inferSelect
export type NewActivityPricing = typeof activityPricing.$inferInsert

export type PaymentSchedule = typeof paymentSchedule.$inferSelect
export type NewPaymentSchedule = typeof paymentSchedule.$inferInsert
export type PaymentStatus = typeof paymentStatusEnum.enumValues[number]

export type CommissionTracking = typeof commissionTracking.$inferSelect
export type NewCommissionTracking = typeof commissionTracking.$inferInsert
export type CommissionStatus = typeof commissionStatusEnum.enumValues[number]

export type PaymentScheduleConfig = typeof paymentScheduleConfig.$inferSelect
export type NewPaymentScheduleConfig = typeof paymentScheduleConfig.$inferInsert
export type ScheduleType = typeof scheduleTypeEnum.enumValues[number]
export type DepositType = typeof depositTypeEnum.enumValues[number]

export type ExpectedPaymentItem = typeof expectedPaymentItems.$inferSelect
export type NewExpectedPaymentItem = typeof expectedPaymentItems.$inferInsert
export type ExpectedPaymentStatus = typeof expectedPaymentStatusEnum.enumValues[number]

export type CreditCardGuarantee = typeof creditCardGuarantee.$inferSelect
export type NewCreditCardGuarantee = typeof creditCardGuarantee.$inferInsert

export type PaymentTransaction = typeof paymentTransactions.$inferSelect
export type NewPaymentTransaction = typeof paymentTransactions.$inferInsert
export type PaymentTransactionType = typeof paymentTransactionTypeEnum.enumValues[number]
export type PaymentMethod = typeof paymentMethodEnum.enumValues[number]

// Legacy type aliases for backwards compatibility during migration
export type ComponentPricing = ActivityPricing
export type NewComponentPricing = NewActivityPricing
