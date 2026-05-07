#!/usr/bin/env tsx
/**
 * Migration Validation Script
 *
 * Validates migration file naming conventions and detects duplicates.
 * Does NOT check against Supabase migrations table (that's the source of truth for applied state).
 * Run as part of CI or before deployments.
 */

import * as fs from 'fs'
import * as path from 'path'

const MIGRATIONS_DIR = path.join(__dirname, '../src/migrations')

// New migrations must use timestamp format
const TIMESTAMP_PATTERN = /^\d{14}_[a-z][a-z0-9_]*\.sql$/
// Legacy migrations (grandfathered) use sequential format
const LEGACY_PATTERN = /^\d{4}_[a-z][a-z0-9_]*\.sql$/

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function validateMigrations(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Get local migration files (exclude _archive directory and subdirectories)
  const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  const files = entries
    .filter(e => e.isFile() && e.name.endsWith('.sql') && !e.name.startsWith('_'))
    .map(e => e.name)
    .sort()

  for (const file of files) {
    const isTimestamp = TIMESTAMP_PATTERN.test(file)
    const isLegacy = LEGACY_PATTERN.test(file)

    if (!isTimestamp && !isLegacy) {
      errors.push(`Invalid naming: ${file} - must match YYYYMMDDHHMMSS_name.sql or NNNN_name.sql`)
    }

    // Check for duplicate prefixes (e.g., two files starting with "0015_")
    const prefix = file.match(/^(\d+)/)?.[1]
    if (prefix) {
      const duplicates = files.filter(f => f.startsWith(prefix + '_') && f !== file)
      if (duplicates.length > 0) {
        errors.push(`Duplicate prefix ${prefix}: ${file} conflicts with ${duplicates.join(', ')}`)
      }
    }
  }

  // Verify chronological ordering for timestamp migrations
  const timestamps = files
    .filter(f => TIMESTAMP_PATTERN.test(f))
    .map(f => ({ file: f, ts: f.substring(0, 14) }))
    .sort((a, b) => a.ts.localeCompare(b.ts))

  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i].ts <= timestamps[i-1].ts) {
      warnings.push(`Out of order: ${timestamps[i].file} should come after ${timestamps[i-1].file}`)
    }
  }

  // -------------------------------------------------------------------------
  // Catalog DDL guard enforcement
  //
  // New migrations that touch the catalog schema MUST include an environment
  // guard (pg_class.relkind check) to avoid breaking FDW on Dev/Preview.
  //
  // Grandfathered: migrations with timestamp <= 20260203051450
  // Exempt: files with "_fdw" in the name (FDW setup/restore migrations)
  // -------------------------------------------------------------------------
  const CATALOG_DDL_PATTERNS = [
    /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?catalog\./i,
    /ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?catalog\./i,
    /DROP\s+TABLE\s+(IF\s+EXISTS\s+)?catalog\./i,
  ]
  const GUARD_PATTERNS = [
    /relkind/i,
    /pg_class/i,
  ]
  const CATALOG_GRANDFATHER_CUTOFF = '20260203051450'

  for (const file of files) {
    // Only enforce on timestamp-format migrations after the cutoff
    const tsMatch = file.match(/^(\d{14})_/)
    if (!tsMatch) continue
    if (tsMatch[1] <= CATALOG_GRANDFATHER_CUTOFF) continue

    // Exempt FDW setup/restore migrations
    if (file.includes('_fdw')) continue

    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    const hasCatalogDDL = CATALOG_DDL_PATTERNS.some(p => p.test(content))
    if (!hasCatalogDDL) continue

    const hasGuard = GUARD_PATTERNS.every(p => p.test(content))
    if (!hasGuard) {
      errors.push(
        `Unguarded catalog DDL: ${file} — ` +
        `migrations that CREATE/ALTER/DROP catalog.* tables must include a ` +
        `pg_class.relkind environment guard. See MIGRATIONS.md > "Catalog Schema (FDW-Protected)".`
      )
    }
  }

  // -------------------------------------------------------------------------
  // Journal `when` monotonicity guard.
  //
  // drizzle-orm's runtime migrator (pg-core/dialect.js) skips entries where
  // `migration.folderMillis <= max(__drizzle_migrations.created_at)`. If a
  // journal entry's `when` is earlier than an already-applied entry's `when`,
  // it gets silently filtered out and reported as "already applied" — the bug
  // that caused #274 (3 missed migrations on preview AND prod, off by 1 year).
  //
  // Enforce that NEW journal entries (idx > grandfather cutoff) are strictly
  // greater than the running max-when. Pre-existing non-monotonic entries are
  // grandfathered because they were applied successfully on all environments.
  // -------------------------------------------------------------------------
  const JOURNAL_MONOTONIC_CUTOFF_IDX = 200 // entries with idx > 200 must be strictly increasing
  const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta', '_journal.json')
  if (fs.existsSync(JOURNAL_PATH)) {
    try {
      const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8'))
      const entries: Array<{ idx: number; when: number; tag: string }> = journal.entries ?? []
      let runningMax = 0
      for (const entry of entries) {
        if (entry.idx > JOURNAL_MONOTONIC_CUTOFF_IDX && entry.when <= runningMax) {
          errors.push(
            `Journal monotonicity: idx=${entry.idx} (${entry.tag}) when=${entry.when} ` +
            `is not strictly greater than running max ${runningMax}. ` +
            `Drizzle's migrator filters by max(created_at) — non-monotonic entries can be silently skipped.`
          )
        }
        if (entry.when > runningMax) runningMax = entry.when
      }
    } catch (e) {
      errors.push(`Failed to parse _journal.json: ${(e as Error).message}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

// Main
const result = validateMigrations()
console.log('Migration Validation Results:')
console.log('============================')

if (result.errors.length > 0) {
  console.log('\nERRORS:')
  result.errors.forEach(e => console.log(`  ${e}`))
}

if (result.warnings.length > 0) {
  console.log('\nWARNINGS:')
  result.warnings.forEach(w => console.log(`  ${w}`))
}

if (result.valid) {
  console.log('\nAll migrations valid')
  process.exit(0)
} else {
  console.log('\nValidation failed')
  process.exit(1)
}
