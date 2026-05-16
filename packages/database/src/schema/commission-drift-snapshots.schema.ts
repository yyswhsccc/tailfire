/**
 * Commission Drift Snapshots Schema (PR-3)
 *
 * Append-only point-in-time row per (agency, currency, recipient) capturing
 * the bucketed reconciliation state of the IC v2 commission pipeline.
 *
 * Locked drift invariant (Codex round-2 plan validation):
 *   committed_payable - in_flight - adjustments_reconciled - settled_active = 0
 * Any non-zero = bug → Sentry fingerprint `commission_drift_${agency_id}_${currency}`.
 *
 * Reversal pair imbalance is a SEPARATE alarm with its own fingerprint.
 *
 * Forever retention. The view v_commission_position aggregates over this
 * table at (agency, currency) grain.
 */

import { boolean, integer, pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core'

export const commissionDriftSnapshots = pgTable(
  'commission_drift_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    recipientUserId: uuid('recipient_user_id').notNull(),

    snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),

    // Alert-formula buckets (all agent-share cents)
    committedPayableCents: integer('committed_payable_cents').notNull().default(0),
    inFlightReconciledUnsettledCents: integer('in_flight_reconciled_unsettled_cents').notNull().default(0),
    settledActiveCents: integer('settled_active_cents').notNull().default(0),
    adjustmentsReconciledCents: integer('adjustments_reconciled_cents').notNull().default(0),
    trueDriftCents: integer('true_drift_cents').notNull().default(0),

    // Integrity bucket (separate alarm)
    settledReversedPairNetCents: integer('settled_reversed_pair_net_cents').notNull().default(0),
    reversalPairImbalance: integer('reversal_pair_imbalance').notNull().default(0),

    // Visibility-only buckets (never enter alert formula)
    unreconciledCommittedCents: integer('unreconciled_committed_cents').notNull().default(0),
    pendingAdjustmentsCents: integer('pending_adjustments_cents').notNull().default(0),
    supplierShortCents: integer('supplier_short_cents').notNull().default(0),
    // PR-3 Commit 5: standalone reconciled adjustments (activity_pricing_id IS NULL)
    // — paid out via IC v2 but not tied to any check_item, so they don't shift drift.
    standaloneReconciledAdjustmentsCents: integer('standalone_reconciled_adjustments_cents').notNull().default(0),

    // Sentry coordination
    sentryAlertFired: boolean('sentry_alert_fired').notNull().default(false),
    sentryEventId: text('sentry_event_id'),
  },
  (table) => ({
    latestIdx: index('idx_commission_drift_snapshots_latest').on(
      table.agencyId,
      table.currency,
      table.snapshotAt,
    ),
    recipientIdx: index('idx_commission_drift_snapshots_recipient').on(
      table.agencyId,
      table.recipientUserId,
      table.snapshotAt,
    ),
  }),
)

export type CommissionDriftSnapshot = typeof commissionDriftSnapshots.$inferSelect
export type NewCommissionDriftSnapshot = typeof commissionDriftSnapshots.$inferInsert
