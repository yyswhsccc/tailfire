#!/usr/bin/env node
/**
 * Journal monotonicity guard.
 *
 * Why this matters in two layers:
 *
 *   1. drizzle-orm's stock migrator skipped entries where
 *      `migration.folderMillis <= max(__drizzle_migrations.created_at)`.
 *      We replaced that with a hash-based applier
 *      (packages/database/src/migrate.ts) so OUR runtime no longer relies on
 *      monotonicity for correctness.
 *
 *   2. Even with the new runtime, non-monotonic `when` values make the
 *      journal confusing for humans and trip up any other tooling that
 *      assumes idx order = wall-clock order. We keep this validator to
 *      enforce that invariant for any NEW entry (idx > cutoff).
 *
 * Pre-existing non-monotonic entries (idx ≤ cutoff) are grandfathered.
 *
 * Exits non-zero if a new entry violates either:
 *   - `when` <= running max of all preceding `when` values
 *   - `when` <= the immediately-preceding entry's `when` (idx-strict)
 *
 * Runs on every CI deploy as a pre-migration gate.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const JOURNAL_MONOTONIC_CUTOFF_IDX = 200
const JOURNAL_PATH = path.join(
  __dirname,
  '..',
  'src',
  'migrations',
  'meta',
  '_journal.json',
)

const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8'))
const entries = journal.entries ?? []

const errors = []
let runningMax = 0
let prevWhen = 0
for (const entry of entries) {
  if (entry.idx > JOURNAL_MONOTONIC_CUTOFF_IDX) {
    if (entry.when <= runningMax) {
      errors.push(
        `idx=${entry.idx} (${entry.tag}) when=${entry.when} <= running max ${runningMax}`,
      )
    }
    if (entry.when <= prevWhen) {
      errors.push(
        `idx=${entry.idx} (${entry.tag}) when=${entry.when} <= previous entry's when ${prevWhen}`,
      )
    }
  }
  if (entry.when > runningMax) runningMax = entry.when
  prevWhen = entry.when
}

if (errors.length > 0) {
  console.error('Journal monotonicity violation — the hash-based runtime will still apply these')
  console.error('migrations, but mixing non-monotonic timestamps in NEW entries makes the journal')
  console.error('harder to read and breaks downstream tooling that assumes idx order = wall-clock order:')
  errors.forEach((e) => console.error(`  ${e}`))
  console.error('')
  console.error("Fix: ensure the new entry's `when` value is greater than the largest existing `when`.")
  process.exit(1)
}

console.log(`Journal monotonic for ${entries.length} entries (cutoff idx=${JOURNAL_MONOTONIC_CUTOFF_IDX})`)
