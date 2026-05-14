#!/usr/bin/env node
/**
 * Journal monotonicity guard.
 *
 * Why this matters:
 *
 *   drizzle-orm's stock migrator decides whether to apply each migration by
 *   comparing `migration.folderMillis` against
 *   `max(__drizzle_migrations.created_at)` captured once at the start of the
 *   run. If a NEW journal entry has `when` <= that max, Drizzle silently
 *   SKIPS it (it thinks the entry has already been applied). The old
 *   migrate.ts then masked the skip via a reconcile loop — that's what
 *   caused the IC-payouts drift on 2026-05-14.
 *
 *   packages/database/src/migrate.ts no longer masks silent skips (the
 *   reconcile loop is gone, replaced by a strict coverage check). So a
 *   silent skip now fails the deploy loud — but the deploy still fails.
 *   This validator is the upstream guard that catches the problem at PR
 *   time, before it ever reaches a deploy.
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
  console.error('Journal monotonicity violation — drizzle-orm would silently skip these migrations')
  console.error('(folderMillis <= max(__drizzle_migrations.created_at) at deploy time), and the')
  console.error('strict coverage check in packages/database/src/migrate.ts would then fail the deploy:')
  errors.forEach((e) => console.error(`  ${e}`))
  console.error('')
  console.error("Fix: ensure the new entry's `when` value is greater than the largest existing `when`.")
  process.exit(1)
}

console.log(`Journal monotonic for ${entries.length} entries (cutoff idx=${JOURNAL_MONOTONIC_CUTOFF_IDX})`)
