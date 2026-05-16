/**
 * CommissionAuditService — app-only history writer (PR-1)
 *
 * Every commission mutation explicitly calls writeHistory() to record a
 * before/after snapshot. Forever retention; no Postgres triggers (Codex
 * round-2 concession — Phoenix threat model defends against regulators
 * and disputes, not malicious devs with psql access).
 *
 * Direct SQL bypasses are accepted as out-of-scope per CLAUDE.md
 * "scripts/direct SQL bypass" carve-out; the audit guarantee applies to
 * app-mediated mutations only.
 */

import { Injectable } from '@nestjs/common'
import { schema } from '@tailfire/database'
import { DatabaseService } from '../../db/database.service'

// Audit-action vocabulary mirrors CommissionAuditAction in
// packages/database/src/schema/commission-history.schema.ts. Local copy so we
// don't depend on the database barrel re-exporting types directly.
export type CommissionAuditAction =
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

type DrizzleTx = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0]
type DbOrTx = DatabaseService['db'] | DrizzleTx

/**
 * The set of entities we audit. Each kind maps to a dedicated history table
 * with a fixed shape.
 */
export type CommissionAuditKind =
  | 'check'
  | 'check_item'
  | 'settlement'
  | 'adjustment'
  | 'tracking'
  | 'activity_pricing_commission'

export interface CommissionAuditContext<Kind extends CommissionAuditKind> {
  kind: Kind
  entityId: string
  /** Required for all kinds except 'tracking' and 'activity_pricing_commission'. */
  agencyId?: string
  /** check_item history records the parent check_id for fast lookups. */
  parentCheckId?: string
  /** settlement history records check_item_id for fast lookups. */
  checkItemId?: string
  /** tracking history records activity_pricing_id for fast lookups. */
  activityPricingId?: string
  action: CommissionAuditAction
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  changedBy?: string | null
  userAgent?: string | null
  reason?: string | null
}

export interface TripSettingsAuditContext {
  tripId: string
  scope: 'trip' | 'collaborator'
  scopeId: string
  action: CommissionAuditAction
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  changedBy?: string | null
  userAgent?: string | null
  reason?: string | null
}

@Injectable()
export class CommissionAuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Write a single history row for a commission entity. Pass a transaction
   * `tx` to make the audit row commit/rollback atomically with the mutation
   * (strongly recommended for every mutation).
   *
   * Validation: action `reason` is required for these signed transitions:
   *   - check: recalled, cancelled
   *   - tracking: unreconciled
   *   - settlement: reversed
   * The caller is responsible for enforcing the rule (this service trusts
   * the input). Audit rows are themselves immutable — never updated, never
   * deleted (forever retention).
   */
  async writeHistory<Kind extends CommissionAuditKind>(
    ctx: CommissionAuditContext<Kind>,
    tx?: DbOrTx,
  ): Promise<void> {
    const db = tx ?? this.databaseService.db
    const base = {
      entityId: ctx.entityId,
      action: ctx.action,
      beforeData: ctx.beforeData ?? null,
      afterData: ctx.afterData ?? null,
      changedBy: ctx.changedBy ?? null,
      userAgent: ctx.userAgent ?? null,
      reason: ctx.reason ?? null,
    }

    switch (ctx.kind) {
      case 'check': {
        this.requireAgency(ctx)
        await db.insert(schema.commissionCheckHistory).values({
          ...base,
          agencyId: ctx.agencyId!,
        })
        return
      }
      case 'check_item': {
        this.requireAgency(ctx)
        await db.insert(schema.commissionCheckItemHistory).values({
          ...base,
          agencyId: ctx.agencyId!,
          parentCheckId: ctx.parentCheckId ?? null,
        })
        return
      }
      case 'settlement': {
        this.requireAgency(ctx)
        await db.insert(schema.commissionItemSettlementHistory).values({
          ...base,
          agencyId: ctx.agencyId!,
          checkItemId: ctx.checkItemId ?? null,
        })
        return
      }
      case 'adjustment': {
        this.requireAgency(ctx)
        await db.insert(schema.commissionAdjustmentHistory).values({
          ...base,
          agencyId: ctx.agencyId!,
        })
        return
      }
      case 'tracking': {
        await db.insert(schema.commissionTrackingHistory).values({
          ...base,
          activityPricingId: ctx.activityPricingId ?? null,
        })
        return
      }
      case 'activity_pricing_commission': {
        await db.insert(schema.activityPricingCommissionHistory).values(base)
        return
      }
    }
  }

  /**
   * Write a single trip-settings history row. Used by trips.service when
   * commission_fee_rate_override changes and by trip_collaborators mutations
   * (split percentage, agent_split_override, role, is_active).
   */
  async writeTripSettingsHistory(ctx: TripSettingsAuditContext, tx?: DbOrTx): Promise<void> {
    const db = tx ?? this.databaseService.db
    await db.insert(schema.tripSettingsHistory).values({
      tripId: ctx.tripId,
      scope: ctx.scope,
      scopeId: ctx.scopeId,
      action: ctx.action,
      beforeData: ctx.beforeData ?? null,
      afterData: ctx.afterData ?? null,
      changedBy: ctx.changedBy ?? null,
      userAgent: ctx.userAgent ?? null,
      reason: ctx.reason ?? null,
    })
  }

  private requireAgency<Kind extends CommissionAuditKind>(ctx: CommissionAuditContext<Kind>): void {
    if (!ctx.agencyId) {
      throw new Error(
        `CommissionAuditService.writeHistory(${ctx.kind}, ${ctx.entityId}): agencyId is required for audit kind '${ctx.kind}'.`,
      )
    }
  }
}
