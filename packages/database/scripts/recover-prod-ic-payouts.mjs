#!/usr/bin/env node
/**
 * One-time Prod recovery for the 2026-05-14 IC-payouts silent-no-op drift.
 *
 * WHAT HAPPENED
 * -------------
 * PR #297 (IC Commission Payouts) deployed to Prod on 2026-05-14T18:00:29Z.
 * The deploy log showed "🔧 Reconciled 11 orphaned migration tracking rows"
 * — the OLD migrate.ts had a `reconcile` loop that inserted tracking rows
 * for journal entries whose SQL Drizzle silently skipped. Drizzle skipped
 * them because their `when` values (May 10) were smaller than
 * max(__drizzle_migrations.created_at) on Prod (May 14, set when
 * transportation_legs + referral_url landed first).
 *
 * Result on Prod: 11 tracking rows present but 6 IC tables don't exist.
 *
 * WHY A PURE-DELETE RECOVERY DOESN'T WORK
 * ---------------------------------------
 * If we just DELETE the 11 silent rows and re-run migrate(), Drizzle will
 * STILL skip them — max(created_at) is still 1778767484000 (May 14, from
 * the referral_url row), and the IC migrations all have when < that.
 *
 * THIS SCRIPT
 * -----------
 * For each of the 11 IC migrations, in idx order:
 *   1. If the table already exists, skip — assume the migration ran cleanly.
 *   2. Otherwise:
 *      a. Apply the SQL file content. ALTER TYPE ... ADD VALUE statements
 *         are run autocommit-style; everything else runs in a per-migration
 *         transaction.
 *      b. Ensure a tracking row exists with the correct (hash, created_at).
 *         Replaces any stale silent-no-op row for the same `when`.
 *
 * Idempotent — safe to run every deploy until removed (after Prod has
 * fully recovered, this can be deleted along with its workflow step).
 *
 * USAGE
 * -----
 *   DATABASE_URL=... node packages/database/scripts/recover-prod-ic-payouts.mjs
 *
 * The script lives inside the @tailfire/database workspace so Node's ESM
 * resolution can find the `postgres` package (hoisted into that workspace).
 */

import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
// Script lives in packages/database/scripts/ — migrations are a sibling under src/.
const MIGRATIONS_DIR = resolve(__dirname, '..', 'src', 'migrations')

// Each entry carries a `witness` SQL query whose presence proves the
// migration applied. Returns a boolean. If null, infer from tracking-row
// hash matching the file hash.
const IC_MIGRATIONS = [
  {
    idx: 202,
    tag: '20260509203356_agency_tax_filing_config',
    when: 1778414400002,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='agency_tax_filing_config') AS x`,
  },
  {
    idx: 203,
    tag: '20260509203644_ic_tax_profiles',
    when: 1778414400003,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_tax_profiles') AS x`,
  },
  {
    idx: 204,
    tag: '20260509203902_ic_payout_authorizations',
    when: 1778414400004,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_payout_authorizations') AS x`,
  },
  {
    idx: 205,
    tag: '20260509204100_ic_payout_accounts',
    when: 1778414400005,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_payout_accounts') AS x`,
  },
  {
    idx: 206,
    tag: '20260509210000_ic_audit_entity_types',
    when: 1778414400006,
    // Enum value added by this migration. unnest+text comparison avoids needing
    // the enum to be loaded into the current session.
    witness: (sql) => sql`SELECT EXISTS(
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'activity_entity_type' AND e.enumlabel = 'agency_tax_filing_config'
    ) AS x`,
  },
  {
    idx: 207,
    tag: '20260510220820_commission_adjustments_currency',
    when: 1778414400007,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='commission_adjustments' AND column_name='currency') AS x`,
  },
  {
    idx: 208,
    tag: '20260510221000_tax_rates',
    when: 1778414400008,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='tax_rates') AS x`,
  },
  {
    idx: 209,
    tag: '20260510222000_ic_invoice_number_sequences',
    when: 1778414400009,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_invoice_number_sequences') AS x`,
  },
  {
    idx: 210,
    tag: '20260510223000_ic_invoices',
    when: 1778414400010,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_invoices') AS x`,
  },
  {
    idx: 211,
    tag: '20260511000000_ic_disbursements',
    when: 1778414400011,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ic_disbursements') AS x`,
  },
  {
    idx: 212,
    tag: '20260511010000_fx_rate_snapshots',
    when: 1778414400012,
    witness: (sql) => sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='fx_rate_snapshots') AS x`,
  },
]

function isEnumAddValueMigration(sqlContent) {
  return /ALTER\s+TYPE[\s\S]+ADD\s+VALUE/i.test(sqlContent)
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is required')
    process.exit(1)
  }

  console.log('🔍 IC-payouts recovery — checking which migrations need re-application')
  const sql = postgres(connectionString, { max: 1 })

  try {
    let applied = 0
    let skipped = 0

    for (const mig of IC_MIGRATIONS) {
      const sqlFilePath = join(MIGRATIONS_DIR, `${mig.tag}.sql`)
      const sqlContent = readFileSync(sqlFilePath, 'utf-8')
      const expectedHash = crypto.createHash('sha256').update(sqlContent).digest('hex')

      const witnessRows = await mig.witness(sql)
      const witnessExists = Boolean(witnessRows[0]?.x)

      if (witnessExists) {
        // Schema is correct. Make sure the tracking row also matches the
        // current file hash — if it doesn't, replace it so the post-migrate
        // coverage check in migrate.ts doesn't false-positive a missing
        // entry. This is a no-DDL fix-up for the silent-no-op rows the old
        // reconcile loop wrote.
        const tracked = await sql`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at = ${mig.when}`
        const hasCorrectHash = tracked.some((r) => String(r.hash) === expectedHash)
        if (hasCorrectHash) {
          console.log(`✓  idx=${mig.idx} ${mig.tag} — already applied`)
          skipped++
          continue
        }
        await sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${mig.when}`
        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${expectedHash}, ${mig.when})
        `
        console.log(`✓  idx=${mig.idx} ${mig.tag} — tracking-only fix-up (schema already correct)`)
        skipped++
        continue
      }

      console.log(`→  idx=${mig.idx} ${mig.tag} — applying SQL`)

      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean)

      const needsAutocommit = isEnumAddValueMigration(sqlContent)

      if (needsAutocommit) {
        // ALTER TYPE ADD VALUE forbidden inside a transaction — run statements
        // one at a time with implicit autocommit.
        for (const stmt of statements) {
          await sql.unsafe(stmt)
        }
        // Tracking row update (delete any stale silent-no-op row, then insert).
        await sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${mig.when}`
        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${expectedHash}, ${mig.when})
        `
      } else {
        await sql.begin(async (tx) => {
          for (const stmt of statements) {
            await tx.unsafe(stmt)
          }
          await tx`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${mig.when}`
          await tx`
            INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES (${expectedHash}, ${mig.when})
          `
        })
      }
      applied++
    }

    console.log(`✅ IC-payouts recovery done — applied ${applied}, already-applied ${skipped}`)
  } catch (error) {
    console.error('❌ IC-payouts recovery failed:', error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
