/**
 * DisbursementService
 *
 * Orchestration layer for IC commission payout disbursements.
 * Owns the disbursement state machine:
 *   queued → sending → sent
 *                    ↘ failed
 *
 * Key invariants:
 *  - enqueue() is idempotent: if a disbursement already exists for an invoice, returns it.
 *  - markSent() is admin-only, transactional, only valid from 'sending'.
 *  - fail() is admin-only, transactional, reverses the invoice reservation,
 *    sets invoice.status='cancelled' (NOT 'rejected' — failure is post-approval).
 *
 * FX snapshot (fxRateToCad, cadEquivalent*) is left NULL on markSent in this task.
 * Task 37 will populate these via FxRateService.getRateOnDate().
 *
 * Notification events are stubbed as TODO comments. Task 39 wires the EventEmitter2 calls.
 */

import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { QUEUES } from '../../automation/automation.types'

const {
  icDisbursements,
  icDisbursementAttempts,
  icInvoices,
  icPayoutAccounts,
  commissionChecks,
} = schema

export type IcDisbursement = typeof icDisbursements.$inferSelect
export type IcDisbursementAttempt = typeof icDisbursementAttempts.$inferSelect
export type IcDisbursementStatus = (typeof schema.icDisbursementStatusEnum.enumValues)[number]
export type IcInvoice = typeof icInvoices.$inferSelect
type Rail = typeof schema.icPayoutAccountRailEnum.enumValues[number]

@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name)

  constructor(
    private readonly db: DatabaseService,
    @InjectQueue(QUEUES.IC_PAYOUT_DISBURSE) private readonly queue: Queue,
  ) {}

  // ============================================================================
  // PUBLIC: enqueue
  // Called from IcInvoiceService.approve AFTER the transaction commits.
  // ============================================================================

  async enqueue(
    invoiceId: string,
    userId: string,
    amountCents: number,
    currency: string,
  ): Promise<IcDisbursement> {
    // 1. Load invoice and validate it's approved
    const [invoice] = await this.db.client
      .select()
      .from(icInvoices)
      .where(eq(icInvoices.id, invoiceId))
      .limit(1)

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`)
    }

    if (invoice.status !== 'approved') {
      throw new BadRequestException(
        `Invoice ${invoiceId} must be in 'approved' status to enqueue a disbursement (current: ${invoice.status})`,
      )
    }

    // 2. Idempotency: return existing disbursement if one already exists for this invoice
    const [existing] = await this.db.client
      .select()
      .from(icDisbursements)
      .where(eq(icDisbursements.invoiceId, invoiceId))
      .limit(1)

    if (existing) {
      this.logger.log(
        `Disbursement already exists for invoice ${invoiceId} (disbursement ${existing.id}, status=${existing.status}). Returning existing.`,
      )
      return existing
    }

    // 3. Look up the IC's default payout account for this currency
    const [account] = await this.db.client
      .select()
      .from(icPayoutAccounts)
      .where(and(
        eq(icPayoutAccounts.userId, userId),
        eq(icPayoutAccounts.currency, currency),
        eq(icPayoutAccounts.isDefaultForCurrency, true),
        eq(icPayoutAccounts.status, 'active'),
      ))
      .limit(1)

    if (!account) {
      throw new BadRequestException(
        `IC has no active default payout account for ${currency}. Cannot enqueue disbursement.`,
      )
    }

    // 4. Generate idempotency key
    const idempotencyKey = crypto.randomUUID()

    // 5. Insert the disbursement row (handle 23505 unique_violation from concurrent enqueue)
    let row: IcDisbursement
    try {
      const [inserted] = await this.db.client
        .insert(icDisbursements)
        .values({
          invoiceId,
          userId,
          payoutAccountId: account.id,
          amountCents,
          currency,
          provider: 'manual',
          rail: account.rail as Rail,
          idempotencyKey,
          status: 'queued',
          // FX fields all NULL — populated by markSent (Task 37)
          fxRateToCad: null,
          cadEquivalentBaseCents: null,
          cadEquivalentTaxCents: null,
          cadEquivalentTotalCents: null,
          fxRateSource: null,
          fxRateDate: null,
          completedAt: null,
        })
        .returning()
      if (!inserted) throw new Error(`Failed to insert disbursement row for invoice ${invoiceId}`)
      row = inserted
    } catch (err: any) {
      if (err?.code === '23505') {
        // Concurrent enqueue won the INSERT race — fetch and return the winning row.
        // Do NOT enqueue a second BullMQ job; the winner already did.
        const [winner] = await this.db.client
          .select()
          .from(icDisbursements)
          .where(eq(icDisbursements.invoiceId, invoiceId))
          .limit(1)
        if (winner) {
          this.logger.log(
            `Concurrent enqueue for invoice ${invoiceId}: returning winner ${winner.id} (idempotencyKey ${winner.idempotencyKey})`,
          )
          return winner
        }
      }
      throw err
    }

    // 6. Enqueue BullMQ job — use idempotency key as jobId to prevent duplicate enqueues
    await this.queue.add(
      'send',
      { disbursementId: row.id, idempotencyKey },
      { jobId: row.idempotencyKey },
    )

    this.logger.log(
      `Disbursement ${row.id} enqueued for invoice ${invoiceId} (account=${account.id}, rail=${account.rail}, currency=${currency})`,
    )

    return row
  }

  // ============================================================================
  // PUBLIC: listForAdmin
  // ============================================================================

  async listForAdmin(agencyId: string, status?: IcDisbursementStatus): Promise<(IcDisbursement & {
    invoiceNumber: string
    icLegalName: string
    payoutAccountMask: string
  })[]> {
    // Join through ic_invoices (agency scope) and ic_payout_accounts (mask) for UI-ready data
    const rows = await this.db.client.execute(sql`
      SELECT
        d.*,
        i.invoice_number AS "invoiceNumber",
        i.ic_legal_name  AS "icLegalName",
        a.details_mask   AS "payoutAccountMask"
      FROM ic_disbursements d
      JOIN ic_invoices       i ON i.id = d.invoice_id
      JOIN ic_payout_accounts a ON a.id = d.payout_account_id
      WHERE i.agency_id = ${agencyId}::uuid
        ${status ? sql`AND d.status = ${status}` : sql``}
      ORDER BY d.created_at DESC
    `)

    return rows as unknown as (IcDisbursement & {
      invoiceNumber: string
      icLegalName: string
      payoutAccountMask: string
    })[]
  }

  // ============================================================================
  // PUBLIC: getDetailForAdmin
  // ============================================================================

  async getDetailForAdmin(
    agencyId: string,
    disbursementId: string,
  ): Promise<IcDisbursement & { invoice: IcInvoice; attempts: IcDisbursementAttempt[] }> {
    const [disbursement] = await this.db.client
      .select()
      .from(icDisbursements)
      .where(eq(icDisbursements.id, disbursementId))
      .limit(1)

    if (!disbursement) {
      throw new NotFoundException(`Disbursement ${disbursementId} not found`)
    }

    // Load and validate invoice belongs to this agency
    const [invoice] = await this.db.client
      .select()
      .from(icInvoices)
      .where(and(
        eq(icInvoices.id, disbursement.invoiceId),
        eq(icInvoices.agencyId, agencyId),
      ))
      .limit(1)

    if (!invoice) {
      throw new NotFoundException(`Disbursement ${disbursementId} not found for this agency`)
    }

    const attempts = await this.db.client
      .select()
      .from(icDisbursementAttempts)
      .where(eq(icDisbursementAttempts.disbursementId, disbursementId))
      .orderBy(icDisbursementAttempts.attemptNumber)

    return { ...disbursement, invoice, attempts }
  }

  // ============================================================================
  // PUBLIC: markSent
  // Admin-only. Atomically sets disbursement to 'sent' from 'sending'.
  // ============================================================================

  async markSent(
    disbursementId: string,
    ref: string,
    proofPath: string | null,
    markedByUserId: string,
  ): Promise<IcDisbursement> {
    return this.db.client.transaction(async (tx) => {
      // 1. Load disbursement and require status='sending'
      const [d] = await tx
        .select()
        .from(icDisbursements)
        .where(eq(icDisbursements.id, disbursementId))
        .limit(1)

      if (!d) {
        throw new NotFoundException(`Disbursement ${disbursementId} not found`)
      }

      if (d.status !== 'sending') {
        throw new BadRequestException(
          `Disbursement ${disbursementId} must be in 'sending' status to mark as sent (current: ${d.status})`,
        )
      }

      const now = new Date()

      // 2. Find the in-progress attempt (outcome IS NULL) or insert a new 'sent' attempt
      const [openAttempt] = await tx
        .select()
        .from(icDisbursementAttempts)
        .where(and(
          eq(icDisbursementAttempts.disbursementId, disbursementId),
          sql`outcome IS NULL`,
        ))
        .limit(1)

      if (openAttempt) {
        // 3a. Update the existing open attempt to 'sent'
        await tx
          .update(icDisbursementAttempts)
          .set({
            outcome: 'sent',
            manualReference: ref,
            manualProofStoragePath: proofPath,
            manualSentBy: markedByUserId,
            completedAt: now,
          })
          .where(eq(icDisbursementAttempts.id, openAttempt.id))
      } else {
        // 3b. No open attempt — insert a new 'sent' attempt
        const nextNumber = await this._getNextAttemptNumberInTx(tx, disbursementId)
        await tx
          .insert(icDisbursementAttempts)
          .values({
            disbursementId,
            attemptNumber: nextNumber,
            provider: d.provider,
            rail: d.rail,
            outcome: 'sent',
            manualReference: ref,
            manualProofStoragePath: proofPath,
            manualSentBy: markedByUserId,
            startedAt: now,
            completedAt: now,
          })
      }

      // 4. Update disbursement: status='sent', completedAt=now
      // Atomic guard: WHERE status='sending' prevents a concurrent markSent from
      // writing after the first already committed (READ COMMITTED race).
      // TODO(Task 37): populate fxRateToCad, cadEquivalentBaseCents, cadEquivalentTaxCents,
      //   cadEquivalentTotalCents, fxRateSource, fxRateDate via FxRateService.getRateOnDate(
      //     d.currency, 'CAD', now
      //   ). If currency is already 'CAD', rate=1.0 and cadEquivalent* = the base amounts.
      const [updated] = await tx
        .update(icDisbursements)
        .set({
          status: 'sent',
          completedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(icDisbursements.id, disbursementId),
          eq(icDisbursements.status, 'sending'),
        ))
        .returning()

      if (!updated) {
        throw new ConflictException(
          `Disbursement ${disbursementId} was already finalized by a concurrent request.`,
        )
      }

      // TODO(Task 39): emit 'ic-payout.disbursement.sent' event with disbursementId, invoiceId, userId

      this.logger.log(
        `Disbursement ${disbursementId} marked sent by ${markedByUserId} (ref=${ref})`,
      )

      return updated
    })
  }

  // ============================================================================
  // PUBLIC: fail
  // Admin-only. Atomically fails a disbursement and reverses the invoice reservation.
  // ============================================================================

  async fail(
    disbursementId: string,
    reason: string,
    failedByUserId: string,
  ): Promise<IcDisbursement> {
    return this.db.client.transaction(async (tx) => {
      // 1. Load disbursement; require status IN ('queued', 'sending')
      const [d] = await tx
        .select()
        .from(icDisbursements)
        .where(eq(icDisbursements.id, disbursementId))
        .limit(1)

      if (!d) {
        throw new NotFoundException(`Disbursement ${disbursementId} not found`)
      }

      if (d.status !== 'queued' && d.status !== 'sending') {
        throw new BadRequestException(
          `Disbursement ${disbursementId} must be in 'queued' or 'sending' status to fail (current: ${d.status})`,
        )
      }

      // Load invoice
      const [invoice] = await tx
        .select()
        .from(icInvoices)
        .where(eq(icInvoices.id, d.invoiceId))
        .limit(1)

      if (!invoice) {
        throw new NotFoundException(`Invoice ${d.invoiceId} not found for disbursement ${disbursementId}`)
      }

      const now = new Date()

      // 2. Atomic transition: disbursement → failed
      // WHERE status IN ('queued','sending') guard prevents two concurrent fail()
      // calls from both writing (READ COMMITTED race). Only one wins the row lock.
      const [updated] = await tx
        .update(icDisbursements)
        .set({ status: 'failed', updatedAt: now })
        .where(and(
          eq(icDisbursements.id, disbursementId),
          inArray(icDisbursements.status, ['queued', 'sending']),
        ))
        .returning()

      if (!updated) {
        throw new ConflictException(
          `Disbursement ${disbursementId} was already finalized by a concurrent request.`,
        )
      }

      // 3. Append a 'failed' attempt (only runs after atomic transition succeeds)
      const nextNumber = await this._getNextAttemptNumberInTx(tx, disbursementId)
      await tx
        .insert(icDisbursementAttempts)
        .values({
          disbursementId,
          attemptNumber: nextNumber,
          provider: d.provider,
          rail: d.rail,
          outcome: 'failed',
          reason,
          manualSentBy: failedByUserId,
          startedAt: now,
          completedAt: now,
        })

      // 4. Reverse the invoice reservation (same pattern as IcInvoiceService.reject)
      if (invoice.reservationCheckId) {
        // 4a. Delete settled commission_item_settlements linked to this reservation
        await tx.execute(sql`
          DELETE FROM commission_item_settlements
          WHERE paid_check_id = ${invoice.reservationCheckId}
        `)

        // 4b. Flip reconciled adjustments back to pending
        await tx.execute(sql`
          UPDATE commission_adjustments
          SET status = 'pending', check_id = NULL, updated_at = now()
          WHERE check_id = ${invoice.reservationCheckId}
            AND status = 'reconciled'
        `)

        // 4c. Cancel the reservation paid check
        await tx
          .update(commissionChecks)
          .set({ status: 'cancelled', updatedAt: now })
          .where(eq(commissionChecks.id, invoice.reservationCheckId))
      }

      // 5. Set invoice.status='cancelled' (NOT 'rejected' — failure is post-approval)
      await tx
        .update(icInvoices)
        .set({ status: 'cancelled', updatedAt: now })
        .where(eq(icInvoices.id, d.invoiceId))

      // TODO(Task 39): emit 'ic-payout.disbursement.failed' event with disbursementId, invoiceId, userId, reason

      this.logger.log(
        `Disbursement ${disbursementId} marked failed by ${failedByUserId}: ${reason}. Invoice ${d.invoiceId} cancelled.`,
      )

      return updated
    })
  }

  // ============================================================================
  // PUBLIC: getNextAttemptNumber (used by processor)
  // ============================================================================

  async getNextAttemptNumber(disbursementId: string): Promise<number> {
    const result: any[] = await this.db.client.execute(sql`
      SELECT COALESCE(MAX(attempt_number), 0) + 1 AS n
      FROM ic_disbursement_attempts
      WHERE disbursement_id = ${disbursementId}::uuid
    `)
    return Number(result[0]?.n ?? 1)
  }

  // ============================================================================
  // PUBLIC: transitionToSending (used by processor — atomic queued → sending)
  // ============================================================================

  async transitionToSending(disbursementId: string): Promise<void> {
    await this.db.client
      .update(icDisbursements)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(and(
        eq(icDisbursements.id, disbursementId),
        eq(icDisbursements.status, 'queued'),
      ))
  }

  // ============================================================================
  // PUBLIC: openAttempt (used by processor)
  // ============================================================================

  async openAttempt(
    disbursementId: string,
    provider: string,
    rail: Rail,
  ): Promise<{ attemptId: string; attemptNumber: number }> {
    const attemptNumber = await this.getNextAttemptNumber(disbursementId)

    const [attempt] = await this.db.client
      .insert(icDisbursementAttempts)
      .values({
        disbursementId,
        attemptNumber,
        provider,
        rail,
        startedAt: new Date(),
        // outcome is NULL — in-progress (populated by markSent or fail)
      })
      .returning()

    if (!attempt) {
      throw new Error(`Failed to insert attempt for disbursement ${disbursementId}`)
    }

    return { attemptId: attempt.id, attemptNumber }
  }

  // ============================================================================
  // PRIVATE: _getNextAttemptNumberInTx
  // Used within transactions where we can't use this.db.client.execute directly.
  // ============================================================================

  private async _getNextAttemptNumberInTx(tx: any, disbursementId: string): Promise<number> {
    const result: any[] = await tx.execute(sql`
      SELECT COALESCE(MAX(attempt_number), 0) + 1 AS n
      FROM ic_disbursement_attempts
      WHERE disbursement_id = ${disbursementId}::uuid
    `)
    return Number(result[0]?.n ?? 1)
  }
}
