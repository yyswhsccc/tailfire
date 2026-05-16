/**
 * Commission History Tables (PR-1)
 *
 * Forever-retention per-entity audit log. Written via app-only
 * CommissionAuditService.writeHistory(...) — NO Postgres triggers.
 *
 * Standard shape per table:
 *   entity_id     — the row being audited
 *   action        — 'created' | 'updated' | 'recalled' | 'reconciled' | etc.
 *   before_data   — JSONB snapshot pre-change (null on insert)
 *   after_data    — JSONB snapshot post-change (null on hard delete)
 *   changed_by    — actor (user_profiles.id; nullable for system actions)
 *   user_agent    — optional client identifier (NOT IP per Phoenix threat model)
 *   reason        — required for signed transitions
 *   changed_at    — server timestamp
 */

import { jsonb, pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core'

export const commissionCheckHistory = pgTable(
  'commission_check_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').notNull(),
    agencyId: uuid('agency_id').notNull(),
    action: varchar('action', { length: 40 }).notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    changedBy: uuid('changed_by'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('idx_commission_check_history_entity').on(table.entityId, table.changedAt),
    agencyIdx: index('idx_commission_check_history_agency').on(table.agencyId, table.changedAt),
  }),
)

export const commissionCheckItemHistory = pgTable(
  'commission_check_item_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').notNull(),
    agencyId: uuid('agency_id').notNull(),
    parentCheckId: uuid('parent_check_id'),
    action: varchar('action', { length: 40 }).notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    changedBy: uuid('changed_by'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('idx_commission_check_item_history_entity').on(table.entityId, table.changedAt),
    checkIdx: index('idx_commission_check_item_history_check').on(table.parentCheckId, table.changedAt),
  }),
)

export const commissionItemSettlementHistory = pgTable(
  'commission_item_settlement_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').notNull(),
    agencyId: uuid('agency_id').notNull(),
    checkItemId: uuid('check_item_id'),
    action: varchar('action', { length: 40 }).notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    changedBy: uuid('changed_by'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('idx_commission_item_settlement_history_entity').on(table.entityId, table.changedAt),
    itemIdx: index('idx_commission_item_settlement_history_item').on(table.checkItemId, table.changedAt),
  }),
)

export const commissionAdjustmentHistory = pgTable(
  'commission_adjustment_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').notNull(),
    agencyId: uuid('agency_id').notNull(),
    action: varchar('action', { length: 40 }).notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    changedBy: uuid('changed_by'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('idx_commission_adjustment_history_entity').on(table.entityId, table.changedAt),
    agencyIdx: index('idx_commission_adjustment_history_agency').on(table.agencyId, table.changedAt),
  }),
)

export const commissionTrackingHistory = pgTable(
  'commission_tracking_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').notNull(),
    activityPricingId: uuid('activity_pricing_id'),
    action: varchar('action', { length: 40 }).notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    changedBy: uuid('changed_by'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('idx_commission_tracking_history_entity').on(table.entityId, table.changedAt),
    activityIdx: index('idx_commission_tracking_history_activity').on(table.activityPricingId, table.changedAt),
  }),
)

export const activityPricingCommissionHistory = pgTable(
  'activity_pricing_commission_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 40 }).notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    changedBy: uuid('changed_by'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('idx_activity_pricing_commission_history_entity').on(table.entityId, table.changedAt),
  }),
)

/**
 * Discriminator on `scope`:
 *   'trip'         → scopeId = trips.id, captures trips.commission_fee_rate_override changes
 *   'collaborator' → scopeId = trip_collaborators.id, captures commission_percentage /
 *                    agent_split_override / role / is_active changes
 */
export const tripSettingsHistory = pgTable(
  'trip_settings_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull(),
    scope: varchar('scope', { length: 20 }).notNull(),
    scopeId: uuid('scope_id').notNull(),
    action: varchar('action', { length: 40 }).notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    changedBy: uuid('changed_by'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tripIdx: index('idx_trip_settings_history_trip').on(table.tripId, table.changedAt),
    scopeIdx: index('idx_trip_settings_history_scope').on(table.scope, table.scopeId, table.changedAt),
  }),
)

export type CommissionCheckHistory = typeof commissionCheckHistory.$inferSelect
export type NewCommissionCheckHistory = typeof commissionCheckHistory.$inferInsert
export type CommissionCheckItemHistory = typeof commissionCheckItemHistory.$inferSelect
export type NewCommissionCheckItemHistory = typeof commissionCheckItemHistory.$inferInsert
export type CommissionItemSettlementHistory = typeof commissionItemSettlementHistory.$inferSelect
export type NewCommissionItemSettlementHistory = typeof commissionItemSettlementHistory.$inferInsert
export type CommissionAdjustmentHistory = typeof commissionAdjustmentHistory.$inferSelect
export type NewCommissionAdjustmentHistory = typeof commissionAdjustmentHistory.$inferInsert
export type CommissionTrackingHistory = typeof commissionTrackingHistory.$inferSelect
export type NewCommissionTrackingHistory = typeof commissionTrackingHistory.$inferInsert
export type ActivityPricingCommissionHistory = typeof activityPricingCommissionHistory.$inferSelect
export type NewActivityPricingCommissionHistory = typeof activityPricingCommissionHistory.$inferInsert
export type TripSettingsHistory = typeof tripSettingsHistory.$inferSelect
export type NewTripSettingsHistory = typeof tripSettingsHistory.$inferInsert

export type CommissionHistoryAction =
  | 'created'
  | 'updated'
  | 'accepted'
  | 'recalled'
  | 'cancelled'
  | 'reconciled'
  | 'unreconciled'
  | 'reversed'
  | 'settled'
  | 'opt_in'
  | 'opt_out'

export type CommissionAuditScope = 'trip' | 'collaborator'
