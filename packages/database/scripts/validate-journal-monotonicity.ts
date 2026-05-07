#!/usr/bin/env tsx
/**
 * Journal monotonicity guard.
 *
 * drizzle-orm's runtime migrator (pg-core/dialect.js:56) skips entries where
 * `migration.folderMillis <= max(__drizzle_migrations.created_at)`. If a new
 * journal entry's `when` is less than the running max, drizzle silently treats
 * it as "already applied" and never runs it. This was the root cause of #274
 * (3 migrations missed on preview AND prod, off by 1 year).
 *
 * This standalone script runs on every CI deploy as a pre-migration gate.
 * Exits non-zero if a NEW entry (idx > cutoff) has `when` <= running max.
 * Pre-existing non-monotonic entries are grandfathered.
 */

import * as fs from 'fs'
import * as path from 'path'

const JOURNAL_MONOTONIC_CUTOFF_IDX = 200
const JOURNAL_PATH = path.join(
  __dirname,
  '..',
  'src',
  'migrations',
  'meta',
  '_journal.json',
)

interface Entry {
  idx: number
  when: number
  tag: string
}

const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8'))
const entries: Entry[] = journal.entries ?? []

const errors: string[] = []
let runningMax = 0
for (const entry of entries) {
  if (entry.idx > JOURNAL_MONOTONIC_CUTOFF_IDX && entry.when <= runningMax) {
    errors.push(
      `idx=${entry.idx} (${entry.tag}) when=${entry.when} <= running max ${runningMax}`,
    )
  }
  if (entry.when > runningMax) runningMax = entry.when
}

if (errors.length > 0) {
  console.error('❌ Journal monotonicity violation — drizzle would silently skip these migrations:')
  errors.forEach((e) => console.error(`  ${e}`))
  console.error('')
  console.error('Fix: ensure the new entry\'s `when` value is greater than the largest existing `when`.')
  process.exit(1)
}

console.log(`✅ Journal monotonic for ${entries.length} entries (cutoff idx=${JOURNAL_MONOTONIC_CUTOFF_IDX})`)
