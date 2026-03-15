/**
 * Financial System Schema
 *
 * Implements the Financial System MVP:
 * - Currency exchange rates (ExchangeRate-API integration)
 * - Activity traveller splits (per-traveller cost breakdown)
 * - Service fees (Stripe Connect integration)
 * - Agency settings (Stripe account, compliance)
 * - Contact Stripe customers (per connected account)
 * - Stripe webhook events (idempotency)
 * - Trip notifications (split recalculation prompts)
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
import { trips, tripTravelers } from './trips.schema'
import { contacts } from './contacts.schema'
import { itineraryActivities } from './activities.schema'

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Split type for activity cost distribution
 */
export const splitTypeEnum = pgEnum('split_type', ['equal', 'custom'])

/**
 * Service fee recipient type
 */
export const serviceFeeRecipientEnum = pgEnum('service_fee_recipient', [
  'primary_traveller',
  'all_travellers',
])

/**
 * Service fee lifecycle status
 * draft -> sent -> paid -> partially_refunded/refunded
 * Any state can go to cancelled
 */
export const serviceFeeStatusEnum = pgEnum('service_fee_status', [
  'draft',
  'sent',
  'paid',
  'partially_refunded',
  'refunded',
  'cancelled',
])

/**
 * Trip notification types
 */
export const notificationTypeEnum = pgEnum('notification_type', [
  'split_recalculation_needed',
  'payment_received',
  'payment_overdue',
  'refund_processed',
])

/**
 * Notification status
 */
export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'dismissed',
  'acted',
])

/**
 * Stripe account connection status
 */
export const stripeAccountStatusEnum = pgEnum('stripe_account_status', [
  'not_connected',
  'pending',
  'active',
  'restricted',
  'disabled',
])

// ============================================================================
// TABLE: currency_exchange_rates
// ============================================================================

/**
 * Currency exchange rate cache
 * Stores daily rates from ExchangeRate-API for currency conversion
 */
export const currencyExchangeRates = pgTable(
  'currency_exchange_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Currency pair
    fromCurrency: varchar('from_currency', { length: 3 }).notNull(),
    toCurrency: varchar('to_currency', { length: 3 }).notNull(),

    // Rate data
    rate: decimal('rate', { precision: 10, scale: 6 }).notNull(),
    rateDate: date('rate_date').notNull(),

    // Source tracking
    source: varchar('source', { length: 50 }).default('ExchangeRate-API'),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint on currency pair + date
    uniqueCurrencyPairDate: unique('unique_currency_pair_date').on(
      table.fromCurrency,
      table.toCurrency,
      table.rateDate
    ),
  })
)

// ============================================================================
// TABLE: activity_traveller_splits
// ============================================================================

/**
 * Per-traveller cost breakdown for activities
 * Enforces trip consistency and currency matching
 */
export const activityTravellerSplits = pgTable(
  'activity_traveller_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Foreign keys with trip-level validation
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => itineraryActivities.id, { onDelete: 'cascade' }),
    travellerId: uuid('traveller_id')
      .notNull()
      .references(() => tripTravelers.id, { onDelete: 'cascade' }),

    // Split configuration
    splitType: splitTypeEnum('split_type').notNull().default('equal'),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    // Exchange rate snapshot (captured at invoice/payment time)
    exchangeRateToTripCurrency: decimal('exchange_rate_to_trip_currency', {
      precision: 10,
      scale: 6,
    }),
    exchangeRateSnapshotAt: timestamp('exchange_rate_snapshot_at', { withTimezone: true }),

    // Notes
    notes: text('notes'),

    // Audit fields
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => ({
    // Each traveller can only have one split per activity
    uniqueActivityTraveller: unique('unique_activity_traveller').on(
      table.activityId,
      table.travellerId
    ),
  })
)

// ============================================================================
// TABLE: service_fees
// ============================================================================

/**
 * Service fees charged to travellers via Stripe Connect
 */
export const serviceFees = pgTable('service_fees', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Trip association
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),

  // Recipient configuration
  recipientType: serviceFeeRecipientEnum('recipient_type')
    .notNull()
    .default('primary_traveller'),

  // Fee details
  title: varchar('title', { length: 255 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('CAD'),
  dueDate: date('due_date'),
  description: text('description'),

  // Status (server-side enforced transitions)
  status: serviceFeeStatusEnum('status').notNull().default('draft'),

  // Exchange rate (snapshotted at invoice creation)
  exchangeRateToTripCurrency: decimal('exchange_rate_to_trip_currency', {
    precision: 10,
    scale: 6,
  }),
  amountInTripCurrencyCents: integer('amount_in_trip_currency_cents'),

  // Stripe integration
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeHostedInvoiceUrl: text('stripe_hosted_invoice_url'),

  // Refund tracking
  refundedAmountCents: integer('refunded_amount_cents').default(0),
  refundReason: text('refund_reason'),

  // Lifecycle timestamps
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

  // Audit fields
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
})

// ============================================================================
// TABLE: agency_settings
// ============================================================================

/**
 * Agency-level settings for Stripe Connect and compliance
 * One-to-one with agencies table (using agency_id)
 */
export const agencySettings = pgTable(
  'agency_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Agency association (unique)
    agencyId: uuid('agency_id').notNull(),

    // Stripe Connect
    stripeAccountId: varchar('stripe_account_id', { length: 255 }),
    stripeAccountStatus: stripeAccountStatusEnum('stripe_account_status')
      .notNull()
      .default('not_connected'),
    stripeChargesEnabled: boolean('stripe_charges_enabled').default(false),
    stripePayoutsEnabled: boolean('stripe_payouts_enabled').default(false),
    stripeOnboardingCompletedAt: timestamp('stripe_onboarding_completed_at', {
      withTimezone: true,
    }),

    // Compliance settings (jurisdiction-agnostic)
    jurisdictionCode: varchar('jurisdiction_code', { length: 10 }),
    complianceDisclaimerText: text('compliance_disclaimer_text'),
    insuranceWaiverText: text('insurance_waiver_text'),

    // Commission fee (Tailfire technology fee, deducted from net commission before agent split)
    commissionFeeRate: decimal('commission_fee_rate', { precision: 5, scale: 2 }).notNull().default('5.00'),

    // Branding for PDFs
    logoUrl: text('logo_url'),
    primaryColor: varchar('primary_color', { length: 7 }), // Hex color

    // Email Integration Settings
    emailAllowedDomains: jsonb('email_allowed_domains').default([]), // string[] — empty = no restriction
    emailComplianceFooter: text('email_compliance_footer'), // HTML footer for all outbound emails

    // Audit fields
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueAgency: unique('unique_agency_settings').on(table.agencyId),
  })
)

// ============================================================================
// TABLE: contact_stripe_customers
// ============================================================================

/**
 * Stripe customer records per connected account
 * A contact can have different Stripe customer IDs for different agencies
 */
export const contactStripeCustomers = pgTable(
  'contact_stripe_customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Contact association
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),

    // Stripe account association
    stripeAccountId: varchar('stripe_account_id', { length: 255 }).notNull(),

    // Stripe customer ID on the connected account
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull(),

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // One customer per contact per connected account
    uniqueContactAccount: unique('unique_contact_stripe_account').on(
      table.contactId,
      table.stripeAccountId
    ),
  })
)

// ============================================================================
// TABLE: stripe_webhook_events
// ============================================================================

/**
 * Stripe webhook event tracking for idempotency
 * Prevents duplicate processing of the same event
 */
export const stripeWebhookEvents = pgTable(
  'stripe_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Event identification
    eventId: varchar('event_id', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),

    // Connected account (null for platform events)
    stripeAccountId: varchar('stripe_account_id', { length: 255 }),

    // Processing info
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),

    // Raw payload for debugging
    payload: jsonb('payload'),
  },
  (table) => ({
    uniqueEventId: unique('unique_stripe_event').on(table.eventId),
  })
)

// ============================================================================
// TABLE: trip_notifications
// ============================================================================

/**
 * In-app notifications for trip-related events
 * Used to prompt users about split recalculations, payments, etc.
 */
export const tripNotifications = pgTable('trip_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Trip association
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),

  // Notification details
  notificationType: notificationTypeEnum('notification_type').notNull(),
  status: notificationStatusEnum('status').notNull().default('pending'),
  message: text('message').notNull(),

  // Structured metadata for actionable notifications
  metadata: jsonb('metadata').$type<{
    travellerId?: string
    travellerName?: string
    affectedActivityIds?: string[]
    affectedActivityNames?: string[]
    serviceFeeId?: string
    amount?: number
    currency?: string
  }>(),

  // Lifecycle
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  actedAt: timestamp('acted_at', { withTimezone: true }),
})

// ============================================================================
// DRIZZLE RELATIONS
// ============================================================================

export const activityTravellerSplitsRelations = relations(
  activityTravellerSplits,
  ({ one }) => ({
    trip: one(trips, {
      fields: [activityTravellerSplits.tripId],
      references: [trips.id],
    }),
    activity: one(itineraryActivities, {
      fields: [activityTravellerSplits.activityId],
      references: [itineraryActivities.id],
    }),
    traveller: one(tripTravelers, {
      fields: [activityTravellerSplits.travellerId],
      references: [tripTravelers.id],
    }),
  })
)

export const serviceFeesRelations = relations(serviceFees, ({ one }) => ({
  trip: one(trips, {
    fields: [serviceFees.tripId],
    references: [trips.id],
  }),
}))

export const tripNotificationsRelations = relations(tripNotifications, ({ one }) => ({
  trip: one(trips, {
    fields: [tripNotifications.tripId],
    references: [trips.id],
  }),
}))

export const contactStripeCustomersRelations = relations(
  contactStripeCustomers,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [contactStripeCustomers.contactId],
      references: [contacts.id],
    }),
  })
)

// ============================================================================
// TYPESCRIPT TYPES
// ============================================================================

// Currency Exchange Rates
export type CurrencyExchangeRate = typeof currencyExchangeRates.$inferSelect
export type NewCurrencyExchangeRate = typeof currencyExchangeRates.$inferInsert

// Activity Traveller Splits
export type ActivityTravellerSplit = typeof activityTravellerSplits.$inferSelect
export type NewActivityTravellerSplit = typeof activityTravellerSplits.$inferInsert
export type SplitType = (typeof splitTypeEnum.enumValues)[number]

// Service Fees
export type ServiceFee = typeof serviceFees.$inferSelect
export type NewServiceFee = typeof serviceFees.$inferInsert
export type ServiceFeeRecipient = (typeof serviceFeeRecipientEnum.enumValues)[number]
export type ServiceFeeStatus = (typeof serviceFeeStatusEnum.enumValues)[number]

// Agency Settings
export type AgencySettings = typeof agencySettings.$inferSelect
export type NewAgencySettings = typeof agencySettings.$inferInsert
export type StripeAccountStatus = (typeof stripeAccountStatusEnum.enumValues)[number]

// Contact Stripe Customers
export type ContactStripeCustomer = typeof contactStripeCustomers.$inferSelect
export type NewContactStripeCustomer = typeof contactStripeCustomers.$inferInsert

// Stripe Webhook Events
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert

// Trip Notifications
export type TripNotification = typeof tripNotifications.$inferSelect
export type NewTripNotification = typeof tripNotifications.$inferInsert
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number]
export type NotificationStatus = (typeof notificationStatusEnum.enumValues)[number]
