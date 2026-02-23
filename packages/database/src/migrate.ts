import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import crypto from 'node:crypto'
import { join, resolve } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'

/**
 * Runs pending database migrations
 *
 * ⚠️ IMPORTANT: This should ONLY be called from apps/api during deployment.
 * Do NOT run migrations from edge functions, frontend, or other environments.
 *
 * @param connectionString - PostgreSQL connection string (requires service role key)
 *
 * @example
 * ```typescript
 * // apps/api/src/db/migrate-on-startup.ts
 * import { runMigrations } from '@tailfire/database'
 *
 * await runMigrations(process.env.DATABASE_URL!)
 * ```
 */
export async function runMigrations(connectionString: string) {
  console.log('🔄 Running database migrations...')

  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)

  try {
    // Try multiple paths to find migrations folder
    // This handles both tsx (source) and built (dist) execution
    const possiblePaths = [
      join(__dirname, '..', 'src', 'migrations'),  // From dist/
      join(__dirname, 'migrations'),               // From src/
      resolve(process.cwd(), 'packages/database/src/migrations'),  // From repo root
      resolve(process.cwd(), '../../packages/database/src/migrations'),  // From apps/api
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
      possiblePaths.forEach(p => console.error(`  - ${p} (exists: ${existsSync(p)})`))
      throw new Error('Migrations folder not found')
    }

    console.log(`📂 Using migrations folder: ${migrationsFolder}`)

    // Log migration status
    const journalPath = join(migrationsFolder, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8'))
    const sqlFiles = readdirSync(migrationsFolder).filter(f => f.endsWith('.sql'))

    console.log(`📋 Journal has ${journal.entries.length} migrations`)
    console.log(`📄 Found ${sqlFiles.length} SQL files`)

    // Check current migration state in database
    const appliedResult = await sql`
      SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations
    `.catch(() => [{ count: 0 }])
    const appliedCount = Number(appliedResult[0]?.count || 0)
    console.log(`✓ Database has ${appliedCount} applied migrations`)

    const pendingCount = journal.entries.length - appliedCount
    if (pendingCount > 0) {
      console.log(`⏳ ${pendingCount} migrations pending...`)
    } else {
      console.log(`✅ All migrations already applied`)
    }

    // Run migrations
    await migrate(db, { migrationsFolder })

    // Reconcile: register any journal entries missing from __drizzle_migrations.
    // This fixes tracking gaps caused by non-monotonic journal timestamps where
    // Drizzle applied the SQL (schema objects exist) but skipped inserting the
    // tracking row because created_at < max(created_at).
    const dbRows = await sql`
      SELECT created_at FROM drizzle.__drizzle_migrations
    `
    const registeredTimestamps = new Set(dbRows.map(r => Number(r.created_at)))

    let reconciled = 0
    for (const entry of journal.entries) {
      if (!registeredTimestamps.has(entry.when)) {
        const sqlFilePath = join(migrationsFolder, `${entry.tag}.sql`)
        if (!existsSync(sqlFilePath)) {
          console.warn(`⚠️ Missing SQL file for journal entry ${entry.idx}: ${entry.tag}`)
          continue
        }
        const sqlContent = readFileSync(sqlFilePath, 'utf-8')
        const hash = crypto.createHash('sha256').update(sqlContent).digest('hex')

        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${entry.when})
        `
        reconciled++
        console.log(`🔧 Reconciled orphaned entry ${entry.idx}: ${entry.tag}`)
      }
    }

    if (reconciled > 0) {
      console.log(`🔧 Reconciled ${reconciled} orphaned migration tracking row(s)`)
    }

    // Verify final state
    const finalResult = await sql`
      SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations
    `
    const finalCount = Number(finalResult[0]?.count || 0)
    const newlyApplied = finalCount - appliedCount - reconciled

    if (newlyApplied > 0) {
      console.log(`✅ Applied ${newlyApplied} new migration(s)`)
    }
    if (reconciled > 0 || newlyApplied > 0) {
      console.log(`✅ Migrations completed (${finalCount} total: ${newlyApplied} new, ${reconciled} reconciled)`)
    } else {
      console.log(`✅ Migrations completed successfully (${finalCount} total)`)
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await sql.end()
  }
}
