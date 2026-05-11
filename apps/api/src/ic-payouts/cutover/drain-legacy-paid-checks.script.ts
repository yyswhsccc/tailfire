#!/usr/bin/env node
/**
 * Legacy paid check drain script (Task 42)
 *
 * Read-only audit of commission_checks rows that may be in-flight when the
 * cutover gate flips. Exports a CSV listing every check_type='paid' row with
 * status IN ('pending','submitted') — these are checks created by the legacy
 * payAgents flow that haven't been reconciled yet.
 *
 * The CSV is the source of truth for the admin reconciliation step in the
 * cutover runbook (see docs/runbooks/ic-payouts-cutover.md, Task 43).
 *
 * Usage (production-built):
 *   node apps/api/dist/ic-payouts/cutover/drain-legacy-paid-checks.script.js \
 *     > /tmp/legacy-paid-drain.csv
 *
 * Usage (local dev):
 *   pnpm --filter @tailfire/api exec tsx \
 *     src/ic-payouts/cutover/drain-legacy-paid-checks.script.ts \
 *     > /tmp/legacy-paid-drain.csv
 *
 * IMPORTANT: This script does NOT modify data. It only SELECTs.
 */

import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../app.module'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { and, eq, inArray } from 'drizzle-orm'

const { commissionChecks } = schema

async function main(): Promise<void> {
  // Bootstrap the DI container (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false, // silence Nest's startup logs so stdout is clean CSV
  })

  try {
    const db = app.get(DatabaseService)

    const rows = await db.client
      .select({
        id: commissionChecks.id,
        agencyId: commissionChecks.agencyId,
        checkNumber: commissionChecks.checkNumber,
        checkType: commissionChecks.checkType,
        checkDate: commissionChecks.checkDate,
        checkAmountCents: commissionChecks.checkAmountCents,
        currency: commissionChecks.currency,
        recipientUserId: commissionChecks.recipientUserId,
        recipientName: commissionChecks.recipientName,
        status: commissionChecks.status,
        source: commissionChecks.source,
        sourceRef: commissionChecks.sourceRef,
        createdBy: commissionChecks.createdBy,
        createdAt: commissionChecks.createdAt,
        updatedAt: commissionChecks.updatedAt,
      })
      .from(commissionChecks)
      .where(
        and(
          eq(commissionChecks.checkType, 'paid'),
          inArray(commissionChecks.status, ['pending', 'submitted']),
        ),
      )

    // CSV header — real DB column names (snake_case)
    const header = [
      'id',
      'agency_id',
      'check_number',
      'check_type',
      'check_date',
      'check_amount_cents',
      'currency',
      'recipient_user_id',
      'recipient_name',
      'status',
      'source',
      'source_ref',
      'created_by',
      'created_at',
      'updated_at',
      'amount_display', // computed convenience column: "currency DD.CC"
    ].join(',')
    process.stdout.write(header + '\n')

    for (const r of rows) {
      const amountDisplay = `${r.currency} ${((r.checkAmountCents ?? 0) / 100).toFixed(2)}`
      const cols = [
        r.id,
        r.agencyId,
        csvEscape(r.checkNumber),
        r.checkType,
        r.checkDate,
        String(r.checkAmountCents),
        r.currency,
        r.recipientUserId ?? '',
        csvEscape(r.recipientName ?? ''),
        r.status,
        csvEscape(r.source ?? ''),
        csvEscape(r.sourceRef ?? ''),
        r.createdBy ?? '',
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ''),
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ''),
        csvEscape(amountDisplay),
      ].join(',')
      process.stdout.write(cols + '\n')
    }

    // Summary to stderr so it doesn't pollute the CSV
    process.stderr.write(
      `\n[drain] Exported ${rows.length} legacy paid check(s) requiring reconciliation.\n`,
    )
  } finally {
    await app.close()
  }
}

/**
 * RFC 4180 CSV escaping.
 * Encloses in double-quotes if the value contains a comma, newline, or quote.
 * Doubles any literal quote characters.
 */
function csvEscape(value: string | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

main().catch((err) => {
  process.stderr.write(
    `[drain] ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
