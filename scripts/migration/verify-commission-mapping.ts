/**
 * Post-import verification for TES → TF commission mapping.
 *
 * Run after import-to-tailfire.ts completes. Prints a one-page pass/fail report.
 * Uses psql (no node deps) — works from anywhere with the connection URL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." \
 *     [TEST_AGENT_INITIALS="JL"] \
 *     [ADMIN_FALLBACK_USER_ID="<uuid>"] \
 *     npx tsx verify-commission-mapping.ts
 *
 * Exits 0 if all REQUIRED checks pass, 1 otherwise.
 *
 * PR-4 (Codex round-1) hardening: strict pass/fail on
 *   - placeholder mapping UUIDs (00000000-...)
 *   - missing or inactive mapped user_profiles
 *   - admin-fixture leads still owning trips after import
 *   - zero accepted received check items
 *   - unreconciled commission_tracking rows for imported items
 *   - missing historical paid checks when TES Paid > 0
 *   - zero IC eligibility for the test agent
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
const TEST_AGENT_INITIALS = process.env.TEST_AGENT_INITIALS // optional override
const ADMIN_FALLBACK_USER_ID = process.env.ADMIN_FALLBACK_USER_ID

const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000'

function query(sql: string): string[][] {
  // Pipe SQL via stdin to avoid shell escaping issues with newlines and quotes
  const out = execSync(`psql "${DATABASE_URL}" -t -A -F '|'`, {
    encoding: 'utf-8',
    input: sql,
  })
  return out.split('\n').filter((l) => l.trim()).map((l) => l.split('|'))
}

// REQUIRED = blocks merge / cutover. INFO = visibility only.
type Severity = 'REQUIRED' | 'INFO'
interface Check {
  name: string
  pass: boolean
  detail: string
  severity: Severity
}
interface AgentMapping {
  [initials: string]: { userId: string; fullName: string; email?: string }
}

const checks: Check[] = []
const required = (name: string, pass: boolean, detail: string) =>
  checks.push({ name, pass, detail, severity: 'REQUIRED' })
const info = (name: string, detail: string) =>
  checks.push({ name, pass: true, detail, severity: 'INFO' })

console.log('═══════════════════════════════════════════════════════════════')
console.log('  TES → TF Commission Mapping Verification')
console.log('═══════════════════════════════════════════════════════════════\n')

// ─────────────────────────────────────────────────────────────────────────────
// Load mapping
// ─────────────────────────────────────────────────────────────────────────────

let mapping: AgentMapping = {}
if (existsSync(MAPPING_PATH)) {
  const raw = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'))
  mapping = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith('_')),
  ) as AgentMapping
}
const initialsList = Object.keys(mapping)
const userIds = Object.values(mapping).map((m) => m.userId)

// Check 1: mapping file present + non-empty
required(
  'Agent mapping file present and populated',
  initialsList.length > 0,
  initialsList.length === 0
    ? `Empty or missing: ${MAPPING_PATH}`
    : `${initialsList.length} initials mapped: ${initialsList.join(', ')}`,
)

// Check 2: no placeholder UUIDs
const placeholders = Object.entries(mapping).filter(([, m]) =>
  m.userId === PLACEHOLDER_UUID || /^0{8}-/.test(m.userId),
)
required(
  'No placeholder UUIDs in mapping',
  placeholders.length === 0,
  placeholders.length === 0
    ? 'all mapping userIds are real UUIDs'
    : `placeholders found for: ${placeholders.map(([k]) => k).join(', ')}`,
)

// Check 3: every mapped user exists AND is active in user_profiles
// user_profiles uses `is_active` boolean — there is no deleted_at column.
if (userIds.length > 0) {
  const ids = userIds.map((id) => `'${id}'`).join(',')
  const rows = query(`
    SELECT id, is_active::text
    FROM user_profiles
    WHERE id IN (${ids})
  `).filter((r) => r[0])
  const foundIds = new Set(rows.map((r) => r[0]))
  const missing = userIds.filter((id) => !foundIds.has(id))
  const inactive = rows.filter((r) => r[1] === 'f' || r[1] === 'false').map((r) => r[0])
  required(
    'All mapped agents exist in user_profiles',
    missing.length === 0,
    missing.length === 0
      ? `${foundIds.size}/${userIds.length} mapped userIds found`
      : `MISSING from user_profiles: ${missing.join(', ')}`,
  )
  required(
    'All mapped agents have is_active = true',
    inactive.length === 0,
    inactive.length === 0
      ? `${foundIds.size}/${userIds.length} mapped userIds active`
      : `inactive: ${inactive.join(', ')}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// trip_collaborators distribution
// ─────────────────────────────────────────────────────────────────────────────

const collab = query(`
  SELECT COALESCE(up.email, '<missing>'), up.id, count(*)
  FROM trip_collaborators tc
  LEFT JOIN user_profiles up ON up.id = tc.user_id
  WHERE tc.is_active = true AND tc.role = 'lead'
  GROUP BY up.email, up.id
  ORDER BY count(*) DESC
  LIMIT 30
`)
const totalCollabLeads = collab.reduce((s, r) => s + Number(r[2]), 0)

// Check 4: more than one agent owns trips (not all admin)
required(
  'trip_collaborators distributed across multiple agents',
  collab.length > 1,
  collab.length > 1
    ? `${collab.length} unique LEAD agents across ${totalCollabLeads} active collaborations`
    : `ONLY 1 lead agent owns ${totalCollabLeads} trips — admin-fixture-only state`,
)

// Check 5: admin fallback isn't the dominant lead (>50% of trips)
if (ADMIN_FALLBACK_USER_ID) {
  const adminRow = collab.find((r) => r[1] === ADMIN_FALLBACK_USER_ID)
  const adminLeads = adminRow ? Number(adminRow[2]) : 0
  const adminPct = totalCollabLeads > 0 ? (adminLeads / totalCollabLeads) * 100 : 0
  required(
    'Admin fallback owns < 50% of leads',
    adminPct < 50,
    `admin holds ${adminLeads}/${totalCollabLeads} leads (${adminPct.toFixed(1)}%)`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission checks
// ─────────────────────────────────────────────────────────────────────────────

const checkCounts = query(`
  SELECT check_type, status, currency, count(*)
  FROM commission_checks
  WHERE source = 'travelesolutions'
  GROUP BY check_type, status, currency
  ORDER BY check_type, status, currency
`)
const checkRecvAccepted = checkCounts
  .filter((r) => r[0] === 'received' && r[1] === 'accepted')
  .reduce((s, r) => s + Number(r[3]), 0)
required(
  'Accepted received commission_checks exist',
  checkRecvAccepted > 0,
  checkRecvAccepted > 0
    ? checkCounts.map((r) => `${r[0]}/${r[1]}/${r[2]}: ${r[3]}`).join(', ')
    : 'ZERO accepted received TES checks',
)

// ─────────────────────────────────────────────────────────────────────────────
// Commission check items + reconciliation gate (NEW per Codex)
// ─────────────────────────────────────────────────────────────────────────────

// Codex round-2 fix #2: only items attached to ACCEPTED received checks
// must be reconciled. Items on Pending/Submitted checks represent open
// receivables; reconciling them would misreport state.
const itemReconcileRow = query(`
  SELECT
    COUNT(*)                                        AS items_total,
    COUNT(*) FILTER (WHERE ct.is_reconciled = TRUE) AS items_reconciled,
    COUNT(*) FILTER (WHERE ct.is_reconciled = FALSE OR ct.id IS NULL)
                                                    AS items_unreconciled
  FROM commission_check_items cci
  JOIN commission_checks cc       ON cc.id = cci.check_id
  JOIN activity_pricing ap        ON ap.id = cci.activity_pricing_id
  LEFT JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
  WHERE cc.source = 'travelesolutions'
    AND cc.check_type = 'received'
    AND cc.status = 'accepted'
`)[0]
const itemsTotal = Number(itemReconcileRow?.[0] ?? 0)
const itemsReconciled = Number(itemReconcileRow?.[1] ?? 0)
const itemsUnreconciled = Number(itemReconcileRow?.[2] ?? 0)
required(
  'Imported check items on accepted received checks exist',
  itemsTotal > 0,
  `accepted-received total=${itemsTotal} reconciled=${itemsReconciled} unreconciled=${itemsUnreconciled}`,
)
required(
  'All accepted-received check items have reconciled commission_tracking',
  itemsTotal > 0 && itemsUnreconciled === 0,
  itemsUnreconciled === 0
    ? `${itemsReconciled}/${itemsTotal} reconciled`
    : `${itemsUnreconciled}/${itemsTotal} unreconciled — IC eligibility will skip these`,
)

// ─────────────────────────────────────────────────────────────────────────────
// Historical paid checks (NEW per Codex)
//
// Round-2 fix #3: count expected paid bookings from bookings.json directly
// instead of sniffing warnings.json. Skip the check only when the extracted
// bookings file isn't present (e.g. running against an env where the script
// is being audited remotely).
// ─────────────────────────────────────────────────────────────────────────────

const paidActualRow = query(`
  SELECT COUNT(*) FROM commission_checks
  WHERE source = 'travelesolutions' AND check_type = 'paid'
`)[0]
const paidActual = Number(paidActualRow?.[0] ?? 0)

const bookingsPath = resolve(__dirname, 'data', 'bookings.json')
if (!existsSync(bookingsPath)) {
  info(
    'Historical paid commission_checks (informational — bookings.json missing)',
    `paid checks=${paidActual}, cannot compute expected count without ${bookingsPath}`,
  )
} else {
  let expectedPaid = 0
  try {
    const bookings = JSON.parse(readFileSync(bookingsPath, 'utf-8')) as Array<{
      Commission?: { Paid?: number }
    }>
    expectedPaid = bookings.filter((b) => typeof b.Commission?.Paid === 'number' && b.Commission.Paid > 0).length
  } catch (err) {
    console.error(`  WARN: could not parse bookings.json — ${(err as Error).message}`)
  }
  required(
    'Historical paid commission_checks present (matches TES Commission.Paid > 0 bookings)',
    expectedPaid === 0 || paidActual >= expectedPaid,
    expectedPaid === 0
      ? `no TES bookings had Commission.Paid > 0 — paid checks=${paidActual}`
      : `paid checks=${paidActual} expected≥${expectedPaid}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// commission_adjustments
// ─────────────────────────────────────────────────────────────────────────────

const adj = query(`
  SELECT currency, status, count(*)
  FROM commission_adjustments
  WHERE source = 'travelesolutions'
  GROUP BY currency, status
  ORDER BY currency, status
`)
const adjTotal = adj.reduce((s, r) => s + Number(r[2]), 0)
info(
  'commission_adjustments populated (informational)',
  adjTotal === 0
    ? 'EMPTY (OK only if no TES booking had Commission.Adjustment != 0)'
    : adj.map((r) => `${r[0]}/${r[1]}: ${r[2]}`).join(', '),
)

// ─────────────────────────────────────────────────────────────────────────────
// IC eligibility — REQUIRED to be > 0 for the test agent
//
// Predicate mirrors apps/api/src/ic-payouts/invoices/ic-invoice.service.ts:557
//   - active collaborator
//   - accepted received check
//   - departed trip (status IN travelling, travelled)
//   - commission_tracking.is_reconciled = true
//   - no existing settlement for this (cci, recipient)
// ─────────────────────────────────────────────────────────────────────────────

if (Object.keys(mapping).length > 0) {
  // Pick the test agent: env override > agent with most leads > first mapping
  let sampleAgent = TEST_AGENT_INITIALS && mapping[TEST_AGENT_INITIALS]
    ? mapping[TEST_AGENT_INITIALS]
    : undefined

  if (!sampleAgent) {
    // Pick agent with the most active lead trips (skip admin fallback)
    const topRow = collab.find((r) =>
      r[1] && r[1] !== ADMIN_FALLBACK_USER_ID && userIds.includes(r[1] ?? ''),
    )
    if (topRow) {
      sampleAgent = Object.values(mapping).find((m) => m.userId === topRow[1])
    }
  }

  if (!sampleAgent) sampleAgent = Object.values(mapping)[0]

  const agentLeadsRow = collab.find((r) => r[1] === sampleAgent.userId)
  const agentLeads = agentLeadsRow ? Number(agentLeadsRow[2]) : 0

  if (agentLeads === 0) {
    required(
      `Test agent (${sampleAgent.fullName}) owns at least 1 trip`,
      false,
      `${sampleAgent.userId} owns 0 leads — IC eligibility will be empty`,
    )
  } else {
    const elig = query(`
      SELECT COUNT(*)
      FROM commission_check_items cci
      JOIN commission_checks src_cc ON src_cc.id = cci.check_id
      JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
      JOIN commission_tracking ct ON ct.component_pricing_id = ap.id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days id_day ON id_day.id = ia.itinerary_day_id
      JOIN itineraries i ON i.id = id_day.itinerary_id
      JOIN trips t ON t.id = i.trip_id
      JOIN trip_collaborators tc
        ON tc.trip_id = t.id
        AND tc.user_id = '${sampleAgent.userId}'::uuid
        AND tc.is_active = TRUE
      LEFT JOIN commission_item_settlements existing
        ON existing.check_item_id = cci.id
        AND existing.recipient_user_id = '${sampleAgent.userId}'::uuid
        AND existing.is_reversal = FALSE
        AND existing.reversed_at IS NULL
      WHERE src_cc.check_type = 'received'
        AND src_cc.status = 'accepted'
        AND t.status IN ('travelling', 'travelled')
        AND ct.is_reconciled = TRUE
        AND existing.id IS NULL
    `)
    const n = Number(elig[0]?.[0] ?? 0)
    required(
      `IC eligibility > 0 for test agent (${sampleAgent.fullName})`,
      n > 0,
      n > 0
        ? `${n} eligible items for ${sampleAgent.userId} (${agentLeads} leads)`
        : `0 eligible items — flag flip would prove nothing for this agent`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

console.log('─── Top 10 LEAD agents by trip ownership ───')
for (const r of collab.slice(0, 10)) {
  console.log(`  ${String(r[2]).padStart(4)}  ${r[0]}${r[1] === ADMIN_FALLBACK_USER_ID ? '  ← ADMIN FALLBACK' : ''}`)
}
console.log()

console.log('─── Check results ───')
let requiredFailed = 0
for (const c of checks) {
  const mark = c.pass ? '✓' : '✗'
  const tag = c.severity === 'REQUIRED' ? '[REQ]' : '[INFO]'
  if (!c.pass && c.severity === 'REQUIRED') requiredFailed++
  console.log(`  ${mark} ${tag} ${c.name}`)
  console.log(`         ${c.detail}`)
}
console.log()
console.log(
  requiredFailed === 0
    ? '═══ ALL REQUIRED CHECKS PASSED ═══'
    : `═══ ${requiredFailed} REQUIRED CHECK(S) FAILED — fix before flag flip ═══`,
)

process.exit(requiredFailed === 0 ? 0 : 1)
