/**
 * CommissionReconcileService (PR-1)
 *
 * Manages the is_reconciled gate on commission_tracking. Reconciliation is
 * admin-asserted judgment ("supplier deposit matches this activity"); it's
 * the gate that — together with trip departure — makes a commission eligible
 * for IC Payouts V2.
 *
 * Audit-trail pillar: every reconcile/unreconcile writes a history row via
 * CommissionAuditService atomically with the state change. Unreconcile
 * requires a reason (signed transition).
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { schema } from '@tailfire/database'
import { eq, inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { CommissionAuditService } from './commission-audit.service'

export interface ReconcileInput {
  /** Resolution key: pass commission_tracking.id (preferred) OR activity_pricing_id. */
  trackingId?: string
  activityPricingId?: string
  actorUserId: string
  userAgent?: string | null
  reason?: string | null
}

export interface UnreconcileInput {
  trackingId?: string
  activityPricingId?: string
  actorUserId: string
  userAgent?: string | null
  /** Required — unreconcile is a signed transition. */
  reason: string
}

export interface BulkReconcileInput {
  trackingIds?: string[]
  activityPricingIds?: string[]
  actorUserId: string
  userAgent?: string | null
  reason?: string | null
}

export interface ReconcileResult {
  trackingId: string
  activityPricingId: string
  isReconciled: boolean
  reconciliationDate: Date | null
  reconciledBy: string | null
}

@Injectable()
export class CommissionReconcileService {
  private readonly logger = new Logger(CommissionReconcileService.name)

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: CommissionAuditService,
  ) {}

  async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    return this.toggleReconcile({ ...input, target: true })
  }

  async unreconcile(input: UnreconcileInput): Promise<ReconcileResult> {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new BadRequestException(
        'Unreconcile requires a reason — this is a signed transition recorded in audit history.',
      )
    }
    return this.toggleReconcile({ ...input, target: false })
  }

  async bulkReconcile(input: BulkReconcileInput): Promise<{
    reconciledCount: number
    results: ReconcileResult[]
  }> {
    const rows = await this.loadTrackingRows(input)
    const results: ReconcileResult[] = []

    await this.databaseService.db.transaction(async (tx) => {
      for (const row of rows) {
        // Skip rows already reconciled — idempotent + no spurious audit rows.
        if (row.isReconciled) {
          results.push({
            trackingId: row.id,
            activityPricingId: row.activityPricingId,
            isReconciled: true,
            reconciliationDate: row.reconciliationDate,
            reconciledBy: row.reconciledBy,
          })
          continue
        }
        const updated = await this.applyToggle(tx, row, true, input.actorUserId)
        await this.auditService.writeHistory(
          {
            kind: 'tracking',
            entityId: row.id,
            activityPricingId: row.activityPricingId,
            action: 'reconciled',
            beforeData: { isReconciled: false },
            afterData: { isReconciled: true, reconciledBy: input.actorUserId },
            changedBy: input.actorUserId,
            userAgent: input.userAgent ?? null,
            reason: input.reason ?? null,
          },
          tx,
        )
        results.push(updated)
      }
    })

    return {
      reconciledCount: results.filter((r) => r.isReconciled).length,
      results,
    }
  }

  /**
   * PR-2 list endpoint feed: commission_tracking rows that are awaiting an
   * admin reconciliation decision. Filters:
   *   - trip status IN ('travelling', 'travelled')  ← only post-departure
   *   - commission_tracking.is_reconciled = false
   *   - tenant-scoped via the activity_pricing → activity → ... → trips chain
   * Returns enough display data to render a one-row-per-activity table:
   * trip name, activity description, supplier, expected commission, and
   * received-to-date computed from commission_check_items.
   */
  async listPendingReconciliation(agencyId: string): Promise<Array<{
    trackingId: string
    activityPricingId: string
    tripId: string
    tripRef: string | null
    tripName: string | null
    tripStatus: string
    activityName: string | null
    supplier: string | null
    expectedCommissionCents: number
    receivedCents: number
  }>> {
    const rows: any[] = await this.databaseService.db.execute(sql`
      SELECT
        ct.id                                       AS tracking_id,
        ct.component_pricing_id                     AS activity_pricing_id,
        t.id                                        AS trip_id,
        t.reference_number                          AS trip_ref,
        t.name                                      AS trip_name,
        t.status                                    AS trip_status,
        ia.name                                     AS activity_name,
        ap.supplier                                 AS supplier,
        COALESCE((ct.commission_amount * 100)::int, 0) AS expected_commission_cents,
        COALESCE((SELECT SUM(cci.received_cents)::int
                  FROM commission_check_items cci
                  WHERE cci.activity_pricing_id = ap.id), 0) AS received_cents
      FROM commission_tracking ct
      JOIN activity_pricing ap ON ap.id = ct.component_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days id ON id.id = ia.itinerary_day_id
      JOIN itineraries i ON i.id = id.itinerary_id
      JOIN trips t ON t.id = i.trip_id
      WHERE t.agency_id = ${agencyId}::uuid
        AND t.status IN ('travelling', 'travelled')
        AND ct.is_reconciled = false
      ORDER BY t.start_date DESC NULLS LAST, ia.name ASC
    `)

    return rows.map((r) => ({
      trackingId: r.tracking_id,
      activityPricingId: r.activity_pricing_id,
      tripId: r.trip_id,
      tripRef: r.trip_ref ?? null,
      tripName: r.trip_name ?? null,
      tripStatus: r.trip_status,
      activityName: r.activity_name ?? null,
      supplier: r.supplier ?? null,
      expectedCommissionCents: Number(r.expected_commission_cents),
      receivedCents: Number(r.received_cents),
    }))
  }

  private async toggleReconcile(
    input: (ReconcileInput | UnreconcileInput) & { target: boolean },
  ): Promise<ReconcileResult> {
    const [row] = await this.loadTrackingRows({
      trackingIds: input.trackingId ? [input.trackingId] : undefined,
      activityPricingIds: input.activityPricingId ? [input.activityPricingId] : undefined,
    })
    if (!row) {
      throw new NotFoundException(
        `commission_tracking not found (trackingId=${input.trackingId ?? '-'}, activityPricingId=${input.activityPricingId ?? '-'})`,
      )
    }

    // Idempotent: same target → no-op, no audit row.
    if (row.isReconciled === input.target) {
      this.logger.debug(
        `tracking ${row.id} already is_reconciled=${input.target} — skipping (idempotent)`,
      )
      return {
        trackingId: row.id,
        activityPricingId: row.activityPricingId,
        isReconciled: row.isReconciled,
        reconciliationDate: row.reconciliationDate,
        reconciledBy: row.reconciledBy,
      }
    }

    let result!: ReconcileResult
    await this.databaseService.db.transaction(async (tx) => {
      result = await this.applyToggle(tx, row, input.target, input.actorUserId)
      await this.auditService.writeHistory(
        {
          kind: 'tracking',
          entityId: row.id,
          activityPricingId: row.activityPricingId,
          action: input.target ? 'reconciled' : 'unreconciled',
          beforeData: {
            isReconciled: row.isReconciled,
            reconciliationDate: row.reconciliationDate,
            reconciledBy: row.reconciledBy,
          },
          afterData: {
            isReconciled: result.isReconciled,
            reconciliationDate: result.reconciliationDate,
            reconciledBy: result.reconciledBy,
          },
          changedBy: input.actorUserId,
          userAgent: input.userAgent ?? null,
          reason: input.reason ?? null,
        },
        tx,
      )
    })

    return result
  }

  private async applyToggle(
    tx: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    row: {
      id: string
      activityPricingId: string
      isReconciled: boolean
      reconciliationDate: Date | null
      reconciledBy: string | null
    },
    target: boolean,
    actorUserId: string,
  ): Promise<ReconcileResult> {
    const now = new Date()
    const updates = target
      ? {
          isReconciled: true,
          reconciliationDate: now,
          reconciledBy: actorUserId,
          updatedAt: now,
        }
      : {
          isReconciled: false,
          reconciliationDate: null,
          reconciledBy: null,
          updatedAt: now,
        }

    const [updated] = await tx
      .update(schema.commissionTracking)
      .set(updates)
      .where(eq(schema.commissionTracking.id, row.id))
      .returning({
        id: schema.commissionTracking.id,
        activityPricingId: schema.commissionTracking.activityPricingId,
        isReconciled: schema.commissionTracking.isReconciled,
        reconciliationDate: schema.commissionTracking.reconciliationDate,
        reconciledBy: schema.commissionTracking.reconciledBy,
      })

    if (!updated) {
      throw new NotFoundException(`commission_tracking ${row.id} disappeared during update`)
    }

    return {
      trackingId: updated.id,
      activityPricingId: updated.activityPricingId,
      isReconciled: updated.isReconciled,
      reconciliationDate: updated.reconciliationDate,
      reconciledBy: updated.reconciledBy,
    }
  }

  private async loadTrackingRows(input: {
    trackingIds?: string[]
    activityPricingIds?: string[]
  }): Promise<
    Array<{
      id: string
      activityPricingId: string
      isReconciled: boolean
      reconciliationDate: Date | null
      reconciledBy: string | null
    }>
  > {
    const ids = input.trackingIds?.filter(Boolean) ?? []
    const apIds = input.activityPricingIds?.filter(Boolean) ?? []
    if (ids.length === 0 && apIds.length === 0) {
      throw new BadRequestException('reconcile requires trackingIds or activityPricingIds')
    }
    const select = {
      id: schema.commissionTracking.id,
      activityPricingId: schema.commissionTracking.activityPricingId,
      isReconciled: schema.commissionTracking.isReconciled,
      reconciliationDate: schema.commissionTracking.reconciliationDate,
      reconciledBy: schema.commissionTracking.reconciledBy,
    }
    if (ids.length > 0) {
      return this.databaseService.db
        .select(select)
        .from(schema.commissionTracking)
        .where(inArray(schema.commissionTracking.id, ids))
    }
    return this.databaseService.db
      .select(select)
      .from(schema.commissionTracking)
      .where(inArray(schema.commissionTracking.activityPricingId, apIds))
  }
}
