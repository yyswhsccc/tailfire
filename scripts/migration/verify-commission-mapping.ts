/**
 * Post-import verification for TES → TF commission mapping.
 *
 * Run after import-to-tailfire.ts completes. Prints a one-page pass/fail report.
 * Uses psql (no node deps) — works from anywhere with the connection URL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx verify-commission-mapping.ts
 *
 * Exits 0 if all checks pass, 1 otherwise.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const MAPPING_PATH = resolve(__dirname, 'data', 'agent-initials-mapping.json')

function query(sql: string): string[][] {
  // Pipe SQL via stdin to avoid shell escaping issues with newlines and quotes
  const out = execSync(`psql "${DATABASE_URL}" -t -A -F '|'`, {
    encoding: 'utf-8',
    input: sql,
  })
  return out.split('\n').filter(l => l.trim()).map(l => l.split('|'))
}

interface Check { name: string; pass: boolean; detail: string }
interface AgentMapping { [initials: string]: { userId: string; fullName: string; email?: string } }

const checks: Check[] = []

console.log('═══════════════════════════════════════════════════════════════')
console.log('  TES → TF Commission Mapping Verification')
console.log('═══════════════════════════════════════════════════════════════\n')

// Load mapping
let mapping: AgentMapping = {}
if (existsSync(MAPPING_PATH)) {
  const raw = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'))
  mapping = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith('_')),
  ) as AgentMapping
}
const userIds = Object.values(mapping).map(m => m.userId)

// Check 1: All mapped users exist in TF
if (userIds.length === 0) {
  checks.push({ name: 'Agent mapping loaded', pass: false, detail: `No mapping at ${MAPPING_PATH}` })
} else {
  const ids = userIds.map(id => `'${id}'`).join(',')
  const rows = query(`SELECT id FROM user_profiles WHERE id IN (${ids})`)
  checks.push({
    name: 'All mapped agents exist in user_profiles',
    pass: rows.length === userIds.length,
    detail: `${rows.length}/${userIds.length} mapped userIds found`,
  })
}

// Check 2: trip_collaborators distribution
const collab = query(`
  SELECT COALESCE(up.email, '<missing>'), count(*)
  FROM trip_collaborators tc
  LEFT JOIN user_profiles up ON up.id = tc.user_id
  WHERE tc.is_active = true
  GROUP BY up.email
  ORDER BY count(*) DESC
  LIMIT 30
`)
const totalCollab = collab.reduce((s, r) => s + Number(r[1]), 0)
checks.push({
  name: 'trip_collaborators distribution',
  pass: collab.length > 1,
  detail: `${collab.length} unique agents own ${totalCollab} active trip collaborations`,
})

// Check 3: Commission checks populated
const checkCounts = query(`
  SELECT check_type, currency, count(*)
  FROM commission_checks
  GROUP BY check_type, currency
  ORDER BY check_type, currency
`)
checks.push({
  name: 'commission_checks populated',
  pass: checkCounts.some(r => Number(r[2]) > 0),
  detail: checkCounts.map(r => `${r[0]}/${r[1]}: ${r[2]}`).join(', ') || 'EMPTY',
})

// Check 4: commission_adjustments
const adj = query(`
  SELECT currency, status, count(*)
  FROM commission_adjustments
  GROUP BY currency, status
  ORDER BY currency, status
`)
const adjTotal = adj.reduce((s, r) => s + Number(r[2]), 0)
checks.push({
  name: 'commission_adjustments populated',
  pass: true, // Informational — zero is OK if no TES Adjustment > 0
  detail: adjTotal === 0
    ? 'EMPTY (OK if no TES bookings had Commission.Adjustment != 0)'
    : adj.map(r => `${r[0]}/${r[1]}: ${r[2]}`).join(', '),
})

// Check 5: IC eligibility sanity for the agent with the most trips
if (Object.keys(mapping).length > 0) {
  // Pick the agent who owns the most trips (likely JL with 97)
  const topAgentRow = collab.find(r => mapping['JL']?.email && r[0].includes(mapping['JL'].email.split('@')[0]))
    ?? collab[0]
  const topAgentEmail = topAgentRow?.[0]
  const sampleAgent = Object.values(mapping).find(m => m.email && topAgentEmail?.includes(m.email.split('@')[0]))
    ?? Object.values(mapping)[0]

  const elig = query(`
    SELECT count(*)
    FROM commission_check_items cci
    JOIN commission_checks src_cc ON src_cc.id = cci.check_id
    JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
    JOIN itinerary_activities ia ON ia.id = ap.activity_id
    JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
    JOIN itineraries i ON i.id = id_day.itinerary_id
    JOIN trips t ON t.id = i.trip_id
    JOIN trip_collaborators tc
      ON tc.trip_id = t.id AND tc.user_id = '${sampleAgent.userId}'::uuid AND tc.is_active = true
    LEFT JOIN commission_item_settlements existing
      ON existing.check_item_id = cci.id AND existing.recipient_user_id = '${sampleAgent.userId}'::uuid
    WHERE src_cc.check_type = 'received'
      AND src_cc.status = 'accepted'
      AND t.status IN ('travelling', 'travelled')
      AND existing.id IS NULL
  `)
  const n = Number(elig[0]?.[0] ?? 0)
  checks.push({
    name: `IC eligibility query for ${sampleAgent.fullName}`,
    pass: true, // Informational
    detail: `${n} eligible items (0 OK if agent has no travelled trips with received checks)`,
  })
}

// Report
console.log('─── Top 10 agents by trip ownership ───')
for (const r of collab.slice(0, 10)) console.log(`  ${String(r[1]).padStart(4)}  ${r[0]}`)
console.log()

console.log('─── Check results ───')
let failed = 0
for (const c of checks) {
  const mark = c.pass ? '✓' : '✗'
  if (!c.pass) failed++
  console.log(`  ${mark} ${c.name}`)
  console.log(`     ${c.detail}`)
}
console.log()
console.log(failed === 0
  ? '═══ ALL CHECKS PASSED ═══'
  : `═══ ${failed} CHECK(S) FAILED — review before cutover ═══`)

process.exit(failed === 0 ? 0 : 1)
