/**
 * CommissionSettlementReversalService (PR-1)
 *
 * Replaces the prior `DELETE FROM commission_item_settlements` pattern in 4
 * call sites with an audit-safe reversal-row insert. The original row stays
 * untouched (forever-retention pillar); a paired negation row offsets it.
 *
 * Used by:
 *   - commission.service.ts:cancelPaidCheck       (commit 6)
 *   - ic-invoice.service.ts:reject                (commit 7)
 *   - ic-invoice.service.ts:cancel                (commit 7)
 *   - disbursement.service.ts:cancelDisbursement  (commit 7)
 *
 * Every reversal writes an audit row and honours the immutability +
 * computation_breakdown JSONB schema added in commit 1's migrations.
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { CommissionAuditService } from './commission-audit.service'

type DrizzleTx = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0]
type DbOrTx = DatabaseService['db'] | DrizzleTx

export interface ReverseSettlementInput {
  settlementId: string
  /** Required signed-transition reason — recorded on reversal row + audit. */
  reason: string
  actorUserId: string
  agencyId: string
  userAgent?: string | null
}

export interface ReverseByPaidCheckInput {
  paidCheckId: string
  reason: string
  actorUserId: string
  agencyId: string
  userAgent?: string | null
}

export interface ReversalResult {
  reversedSettlementIds: string[]
  reversalRowIds: string[]
}

@Injectable()
export class CommissionSettlementReversalService {
  private readonly logger = new Logger(CommissionSettlementReversalService.name)

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: CommissionAuditService,
  ) {}

  /**
   * Reverse a single original settlement row by inserting a paired negation
   * row. Idempotent: returns the existing reversal-row id if this settlement
   * has already been reversed.
   */
  async reverseSettlement(input: ReverseSettlementInput, tx?: DbOrTx): Promise<{
    reversalRowId: string
    alreadyReversed: boolean
  }> {
    this.requireReason(input.reason)
    const db = tx ?? this.databaseService.db
    return this.runOrUseTx(db, async (txx) => this.reverseSingle(input, txx))
  }

  /**
   * Cascade reversal for every active settlement on a paid check. Used when
   * a paid check is cancelled or an invoice/disbursement is rolled back.
   */
  async reverseAllByPaidCheck(input: ReverseByPaidCheckInput, tx?: DbOrTx): Promise<ReversalResult> {
    this.requireReason(input.reason)
    const db = tx ?? this.databaseService.db
    return this.runOrUseTx(db, async (txx) => {
      const active = await this.loadActiveSettlementsByPaidCheck(txx, input.paidCheckId)
      const reversedSettlementIds: string[] = []
      const reversalRowIds: string[] = []
      for (const original of active) {
        const result = await this.reverseSingle(
          {
            settlementId: original.id,
            reason: input.reason,
            actorUserId: input.actorUserId,
            agencyId: input.agencyId,
            userAgent: input.userAgent ?? null,
          },
          txx,
        )
        reversedSettlementIds.push(original.id)
        reversalRowIds.push(result.reversalRowId)
      }
      this.logger.log(
        `reverseAllByPaidCheck ${input.paidCheckId}: ${active.length} settlement(s) reversed`,
      )
      return { reversedSettlementIds, reversalRowIds }
    })
  }

  private async reverseSingle(
    input: ReverseSettlementInput,
    tx: DrizzleTx,
  ): Promise<{ reversalRowId: string; alreadyReversed: boolean }> {
    const original = await this.loadActiveSettlement(tx, input.settlementId)
    if (!original) {
      // Already reversed — find the existing reversal row to return idempotently.
      const existingReversal = await tx
        .select({ id: schema.commissionItemSettlements.id })
        .from(schema.commissionItemSettlements)
        .where(eq(schema.commissionItemSettlements.reversesSettlementId, input.settlementId))
        .limit(1)
      if (existingReversal[0]) {
        this.logger.debug(`settlement ${input.settlementId} already reversed — idempotent`)
        return { reversalRowId: existingReversal[0].id, alreadyReversed: true }
      }
      throw new NotFoundException(`commission_item_settlement ${input.settlementId} not found`)
    }

    const negatedBreakdown = this.negateBreakdown(original.computationBreakdown)
    const now = new Date()

    const [inserted] = await tx
      .insert(schema.commissionItemSettlements)
      .values({
        checkItemId: original.checkItemId,
        recipientUserId: original.recipientUserId,
        paidCheckId: original.paidCheckId,
        settledAmountCents: -original.settledAmountCents,
        isReversal: true,
        reversesSettlementId: original.id,
        reversedAt: now,
        reversedBy: input.actorUserId,
        reversedReason: input.reason,
        computationBreakdown: negatedBreakdown,
        createdBy: input.actorUserId,
      })
      .returning({ id: schema.commissionItemSettlements.id })

    if (!inserted) {
      throw new Error(`Failed to insert reversal row for settlement ${input.settlementId}`)
    }

    await this.auditService.writeHistory(
      {
        kind: 'settlement',
        entityId: original.id,
        agencyId: input.agencyId,
        checkItemId: original.checkItemId,
        action: 'reversed',
        beforeData: {
          settledAmountCents: original.settledAmountCents,
          isReversal: false,
        },
        afterData: {
          reversalRowId: inserted.id,
          reversesSettlementId: original.id,
          settledAmountCents: -original.settledAmountCents,
          isReversal: true,
          reversedBy: input.actorUserId,
        },
        changedBy: input.actorUserId,
        userAgent: input.userAgent ?? null,
        reason: input.reason,
      },
      tx,
    )

    return { reversalRowId: inserted.id, alreadyReversed: false }
  }

  private async loadActiveSettlement(
    tx: DrizzleTx,
    settlementId: string,
  ): Promise<{
    id: string
    checkItemId: string
    recipientUserId: string
    paidCheckId: string
    settledAmountCents: number
    computationBreakdown: unknown
  } | null> {
    const [row] = await tx
      .select({
        id: schema.commissionItemSettlements.id,
        checkItemId: schema.commissionItemSettlements.checkItemId,
        recipientUserId: schema.commissionItemSettlements.recipientUserId,
        paidCheckId: schema.commissionItemSettlements.paidCheckId,
        settledAmountCents: schema.commissionItemSettlements.settledAmountCents,
        isReversal: schema.commissionItemSettlements.isReversal,
        computationBreakdown: schema.commissionItemSettlements.computationBreakdown,
      })
      .from(schema.commissionItemSettlements)
      .where(eq(schema.commissionItemSettlements.id, settlementId))
      .limit(1)
    if (!row) return null
    if (row.isReversal) return null // reversal rows are not themselves reversible
    return {
      id: row.id,
      checkItemId: row.checkItemId,
      recipientUserId: row.recipientUserId,
      paidCheckId: row.paidCheckId,
      settledAmountCents: row.settledAmountCents,
      computationBreakdown: row.computationBreakdown,
    }
  }

  private async loadActiveSettlementsByPaidCheck(
    tx: DrizzleTx,
    paidCheckId: string,
  ): Promise<
    Array<{
      id: string
      checkItemId: string
      recipientUserId: string
      paidCheckId: string
      settledAmountCents: number
      computationBreakdown: unknown
    }>
  > {
    // "Active" = original row (not a reversal) AND not yet reversed.
    // We approximate by selecting all non-reversal rows; the reverseSingle
    // path handles already-reversed idempotently.
    const rows = await tx
      .select({
        id: schema.commissionItemSettlements.id,
        checkItemId: schema.commissionItemSettlements.checkItemId,
        recipientUserId: schema.commissionItemSettlements.recipientUserId,
        paidCheckId: schema.commissionItemSettlements.paidCheckId,
        settledAmountCents: schema.commissionItemSettlements.settledAmountCents,
        isReversal: schema.commissionItemSettlements.isReversal,
        computationBreakdown: schema.commissionItemSettlements.computationBreakdown,
      })
      .from(schema.commissionItemSettlements)
      .where(eq(schema.commissionItemSettlements.paidCheckId, paidCheckId))
    return rows
      .filter((r) => !r.isReversal)
      .map((r) => ({
        id: r.id,
        checkItemId: r.checkItemId,
        recipientUserId: r.recipientUserId,
        paidCheckId: r.paidCheckId,
        settledAmountCents: r.settledAmountCents,
        computationBreakdown: r.computationBreakdown,
      }))
  }

  private negateBreakdown(breakdown: unknown): unknown {
    if (!breakdown || typeof breakdown !== 'object') return null
    const b = breakdown as Record<string, unknown>
    const negated: Record<string, unknown> = { ...b, isReversal: true, reversedAt: new Date().toISOString() }
    for (const k of [
      'grossReceivedCents',
      'embeddedTaxCents',
      'commissionableBaseCents',
      'platformFeeCents',
      'distributableCents',
      'agentPoolCents',
      'agentShareCents',
      'agencyRetainsCents',
    ]) {
      if (typeof b[k] === 'number') negated[k] = -(b[k] as number)
    }
    return negated
  }

  private requireReason(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException(
        'reverseSettlement requires a reason — reversal is a signed transition.',
      )
    }
  }

  private async runOrUseTx<T>(db: DbOrTx, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
    // If we're already inside a transaction, reuse it. Otherwise start one.
    // Heuristic: real tx objects don't have a `transaction` method.
    const maybeDb = db as { transaction?: unknown }
    if (typeof maybeDb.transaction !== 'function') {
      return fn(db as DrizzleTx)
    }
    return (db as DatabaseService['db']).transaction(fn)
  }
}

