/**
 * ReconcileService
 *
 * Hourly sweep that auto-fails any disbursement stuck in 'sending' for
 * more than 48 hours.
 *
 * "Stuck" means the manual provider returned 'awaiting_manual' but no
 * admin has marked it sent or failed in the 48-hour window. We auto-fail
 * to release the IC's invoice reservation (settlements + adjustments are
 * reverted by DisbursementService.fail) so the IC can re-claim those
 * items in a fresh invoice. An admin notification is emitted.
 *
 * Sentinel UUID (nil UUID '00000000-0000-0000-0000-000000000000') is used
 * as the failedByUserId for system-initiated actions. The manualSentBy
 * column on ic_disbursement_attempts has no FK to user_profiles, so the
 * nil UUID is safe to write and can be filtered in audit queries to
 * identify system-triggered actions.
 *
 * TODO(future): expose POST /ic-payouts/admin/disbursements/reconcile-stuck
 *   to allow admins to trigger a manual on-demand sweep without waiting for
 *   the next hourly cron tick. Inject ReconcileService into the controller
 *   and call sweepStuck() directly.
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq, lt } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { DisbursementService } from './disbursement.service'

// Sentinel UUID for system-initiated actions (used in audit columns).
// '00000000-0000-0000-0000-000000000000' is the canonical "nil UUID" — Postgres accepts it,
// and we can filter for it in audit queries to identify system-triggered actions.
// manualSentBy on ic_disbursement_attempts has no FK to user_profiles, so this is safe.
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

const STUCK_THRESHOLD_HOURS = 48
const STUCK_REASON = `Stuck for ${STUCK_THRESHOLD_HOURS}h — auto-escalated`

export interface ReconcileSweepResult {
  processed: number
  failures: Array<{ id: string; error: string }>
}

@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly disbursements: DisbursementService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'ic-payouts-reconcile-stuck',
    timeZone: 'America/Toronto',
  })
  async scheduledSweep(): Promise<void> {
    const result = await this.sweepStuck()
    if (result.processed > 0 || result.failures.length > 0) {
      this.logger.warn(
        `[ic-payouts] Reconcile sweep auto-failed ${result.processed} stuck disbursement(s) ` +
        `(threshold ${STUCK_THRESHOLD_HOURS}h). Failures: ${result.failures.length}.`,
      )
    } else {
      this.logger.log('[ic-payouts] Reconcile sweep: no stuck disbursements')
    }
  }

  /**
   * Run the stuck-disbursement sweep once and return processing stats.
   *
   * Exported separately from the cron handler so tests + future admin endpoints
   * can invoke it on demand.
   *
   * Semantics:
   *  - Selects all ic_disbursements WHERE status='sending' AND updatedAt < now()-48h
   *  - For each, calls DisbursementService.fail with the standard auto-escalation reason
   *  - Continue-on-error: a failure to auto-fail one row does not prevent others
   *  - Returns { processed, failures } for observability / logging
   */
  async sweepStuck(): Promise<ReconcileSweepResult> {
    const stuck = await this.findStuck()

    const failures: Array<{ id: string; error: string }> = []
    let processed = 0

    for (const row of stuck) {
      // Defensive: a Drizzle select() can theoretically yield a row whose
      // selected fields are undefined if the underlying column reference was
      // unresolved at query-build time. Skip silently — #328.
      if (!row?.id) continue
      try {
        await this.disbursements.fail(row.id, STUCK_REASON, SYSTEM_ACTOR_ID)
        processed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failures.push({ id: row.id, error: msg })
        this.logger.error(
          `[ic-payouts] Reconcile sweep failed to auto-fail disbursement ${row.id}: ${msg}`,
        )
      }
    }

    return { processed, failures }
  }

  /**
   * Finds all disbursements stuck in 'sending' for more than STUCK_THRESHOLD_HOURS.
   * Extracted as a separate method to allow easy spy-based mocking in tests.
   */
  async findStuck(): Promise<Array<{ id: string }>> {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000)
    // Access schema via the DatabaseService getter so resolution happens at
    // call-time (avoids module-load races where a top-level destructure
    // would capture the schema export before circular re-exports finish).
    const { icDisbursements } = this.db.schema

    const rows = await this.db.client
      .select({ id: icDisbursements.id })
      .from(icDisbursements)
      .where(and(
        eq(icDisbursements.status, 'sending'),
        lt(icDisbursements.updatedAt, cutoff),
      ))

    // Filter out any row whose id didn't resolve (paranoid — #328).
    return rows.filter((r): r is { id: string } => Boolean(r?.id))
  }
}
