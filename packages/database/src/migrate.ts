import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { join, resolve } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'

/**
 * Runs pending database migrations.
 *
 * ⚠️ IMPORTANT: This should ONLY be called from apps/api during deployment.
 *
 * Known Drizzle fragility (and why we no longer mask it):
 * -------------------------------------------------------
 * `drizzle-orm/postgres-js/migrator` decides whether to apply each migration
 * by comparing `migration.folderMillis` against the single value
 * `max(__drizzle_migrations.created_at)` captured ONCE at the start of the
 * run. That logic breaks across out-of-order merges:
 *
 *   1. Branch A ships migration X with when=1000.
 *   2. Branch B (cut earlier) ships migration Y with when=500.
 *   3. After A deploys, max(created_at) = 1000.
 *   4. When B deploys, Drizzle sees Y.folderMillis (500) < 1000 and
 *      silently SKIPS Y, even though Y's hash is not in the tracking table.
 *
 * We hit this on 2026-05-14 with PR #297: the IC-payouts migrations
 * (idx 202-212, when = May 10) got silently skipped on Prod because
 * transportation_legs + referral_url (idx 213-214, when = May 14) had
 * already been applied via an earlier deploy.
 *
 * The OLD migrate.ts had a `reconcile` loop here that inserted tracking
 * rows for any journal entry not yet tracked, WITHOUT running the SQL.
 * That masked the silent skip and produced the production drift on
 * 2026-05-14 (6 IC tables missing from Prod, tracking table lying about it).
 *
 * What this version does:
 * -----------------------
 * - Still uses Drizzle's stock `migrate()` for the actual application.
 * - Removed the silent reconcile loop entirely.
 * - Added a strict coverage check after `migrate()`: every journal entry's
 *   `when` MUST appear at least once in tracking, else throws with a list.
 *   A future silent-skip will FAIL the deploy loud instead of corrupting.
 * - Kept the harmless ghost-row cleanup for tracking rows whose `created_at`
 *   no longer matches any journal entry (post-renumber housekeeping).
 *
 * Recovery for already-drifted environments:
 * ------------------------------------------
 * The Prod IC-payouts drift from 2026-05-14 needs
 * packages/database/scripts/recover-prod-ic-payouts.mjs to run BEFORE this.
 * That script applies the 11 missing SQL files directly and writes correct
 * tracking rows. Wired into .github/workflows/deploy-prod.yml as a
 * pre-migration step.
 *
 * Future prevention:
 * ------------------
 * packages/database/scripts/validate-journal-monotonicity.mjs is a CI gate
 * that enforces NEW journal entries always have `when` greater than every
 * previous entry, so this scenario can't happen for fresh migrations.
 *
 * @param connectionString - PostgreSQL connection string (session mode — DDL)
 */
export async function runMigrations(connectionString: string) {
  console.log('🔄 Running database migrations...')

  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)

  try {
    // Locate migrations folder (handles both src/ and dist/ execution)
    const possiblePaths = [
      join(__dirname, '..', 'src', 'migrations'),
      join(__dirname, 'migrations'),
      resolve(process.cwd(), 'packages/database/src/migrations'),
      resolve(process.cwd(), '../../packages/database/src/migrations'),
    ]

    let migrationsFolder: string | null = null
    for (const path of possiblePaths) {
      if (existsSync(path) && existsSync(join(path, 'meta', '_journal.json'))) {
        migrationsFolder = path
        break
      }
    }
    if (!migrationsFolder) {
      console.error('❌ Could not find migrations folder. Tried paths:')
      possiblePaths.forEach((p) => console.error(`  - ${p} (exists: ${existsSync(p)})`))
      throw new Error('Migrations folder not found')
    }
    console.log(`📂 Using migrations folder: ${migrationsFolder}`)

    const journalPath = join(migrationsFolder, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
      entries: Array<{ idx: number; when: number; tag: string; breakpoints?: boolean }>
    }

    const sqlFiles = readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql'))
    console.log(`📋 Journal has ${journal.entries.length} migrations`)
    console.log(`📄 Found ${sqlFiles.length} SQL files`)

    // Pre-migration count
    const preResult = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`.catch(
      () => [{ n: 0 }],
    )
    const preCount = Number(preResult[0]?.n ?? 0)
    console.log(`✓ Database has ${preCount} applied migrations`)
    const expectedPending = journal.entries.length - preCount
    if (expectedPending > 0) {
      console.log(`⏳ ${expectedPending} migration(s) pending`)
    } else {
      console.log('✅ All migrations already applied')
    }

    // Hand off to Drizzle's stock migrator. It will iterate journal entries
    // and apply any whose folderMillis > max(__drizzle_migrations.created_at).
    // Known fragility documented at the top of this file.
    await migrate(db, { migrationsFolder })

    // Remove ghost rows — tracking rows whose created_at has no matching
    // journal entry. These accumulate when journal entries get renumbered
    // during merges. Safe to delete: by definition they don't correspond to
    // any current migration. The strict count check below requires this
    // cleanup to pass.
    const journalTimestamps = new Set(journal.entries.map((e) => Number(e.when)))
    const trackedNow = await sql`SELECT id, created_at FROM drizzle.__drizzle_migrations`
    let ghostsRemoved = 0
    for (const row of trackedNow) {
      if (!journalTimestamps.has(Number(row.created_at))) {
        await sql`DELETE FROM drizzle.__drizzle_migrations WHERE id = ${row.id}`
        ghostsRemoved++
        console.log(`🧹 Removed ghost tracking row id=${row.id} (created_at=${row.created_at})`)
      }
    }
    if (ghostsRemoved > 0) {
      console.log(`🧹 Removed ${ghostsRemoved} ghost tracking row(s)`)
    }

    // Strict post-migration invariant. The old `reconcile` loop that lived
    // here silently inserted tracking rows for migrations Drizzle skipped,
    // producing the IC-payouts drift on 2026-05-14. Refusing to declare
    // success on a coverage gap makes any future skip visible immediately.
    //
    // Coverage check: every journal entry's `when` must appear AT LEAST once
    // in the tracking table. We allow harmless duplicate rows (some legacy
    // migrations carry both a legacy filename-style and a proper-hash row
    // for the same `created_at`).
    const trackedRows = await sql`SELECT created_at FROM drizzle.__drizzle_migrations`
    const tracked = new Set(trackedRows.map((r) => Number(r.created_at)))
    const missing = journal.entries.filter((e) => !tracked.has(Number(e.when)))

    if (missing.length > 0) {
      throw new Error(
        `Migration coverage gap after apply: ${missing.length} journal entr${missing.length === 1 ? 'y' : 'ies'} not in tracking table.\n` +
          `Drizzle silently skipped (likely the folderMillis < max(created_at) bug):\n` +
          missing.map((e) => `  - idx=${e.idx} ${e.tag} when=${e.when}`).join('\n') +
          `\n\nUsually caused by a journal entry with \`when\` <= max(__drizzle_migrations.created_at) ` +
          `at the start of this deploy. See packages/database/src/migrate.ts for context.`,
      )
    }

    const postCount = trackedRows.length
    const applied = postCount - preCount
    console.log(
      `✅ Migrations completed — applied ${applied}, ${postCount} total tracking rows (${journal.entries.length} journal entries covered)`,
    )
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await sql.end()
  }
}
