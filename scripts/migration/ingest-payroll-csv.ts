#!/usr/bin/env tsx
/**
 * Payroll CSV Ingestion (#33 — historical agent commission settlements)
 *
 * Phoenix Voyages tracks per-agent commission payouts OUTSIDE TES (in their
 * payroll system). This script ingests that ground-truth data and creates
 * commission_item_settlements rows in TF via the historical-paid endpoint
 * (POST /commission/checks/historical-paid — see PR #408 / P1.C).
 *
 * Without this backfill, getCommissionDue() at commission.service.ts:656
 * surfaces 100% of historical TES check_items as still-owed to agents.
 *
 * CSV format (header row required, column order flexible, additional
 * columns ignored):
 *
 *   agent_email,booking_id_tes,paid_amount_cents,paid_date,check_reference[,recipient_name]
 *
 *   agent_email          REQUIRED  user_profiles.email of the recipient agent
 *   booking_id_tes       REQUIRED  TES BookingID — looked up via ledger.json
 *   paid_amount_cents    REQUIRED  amount paid for THIS booking (integer, cents)
 *   paid_date            REQUIRED  ISO date YYYY-MM-DD
 *   check_reference      REQUIRED  external check/EFT/payroll reference (used
 *                                  as sourceRef for idempotency; rows sharing
 *                                  the same (agent_email, check_reference) are
 *                                  grouped into ONE paid check with N
 *                                  settlements)
 *   recipient_name       OPTIONAL  display name; falls back to user_profile name
 *
 * Booking → settlement resolution chain:
 *   booking_id_tes → ledger.json (sourceType='booking', sourceId=BookingID)
 *                  → tf_activity_id
 *                  → activity_pricing.id (one per activity)
 *                  → commission_check_items[] (allocated proportionally to
 *                    received_cents when an activity has multiple items)
 *
 * Usage:
 *   DATABASE_URL=...  API_BASE=https://api-dev.tailfire.ca/api/v1  \
 *     SUPABASE_URL=...  SUPABASE_ANON_KEY=...                       \
 *     ADMIN_EMAIL=admin@phoenixvoyages.ca  ADMIN_PASSWORD=...       \
 *     LEDGER_PATH=data/migration/id-mapping.json                    \
 *     CSV_PATH=path/to/payroll.csv                                  \
 *     tsx scripts/migration/ingest-payroll-csv.ts
 *
 *   # Optional dry-run that resolves rows but does not call the API:
 *   DRY_RUN=true  ...
 *
 * Output:
 *   stdout:  per-row resolution status + per-group POST result
 *   /tmp/ingest-payroll-{timestamp}.log:  full per-row report
 *
 * See docs/runbooks/tes-cutover-backfill-plan.md (P5.A item 1 / #33)
 */

import { readFileSync, writeFileSync } from 'node:fs'

interface PayrollRow {
  agent_email: string
  booking_id_tes: string
  paid_amount_cents: number
  paid_date: string
  check_reference: string
  recipient_name?: string
  _row: number
}

interface ResolvedSettlement {
  checkItemId: string
  settledAmountCents: number
}

interface PerCheckGroup {
  agent_email: string
  recipient_user_id: string
  recipient_name: string
  check_reference: string
  paid_date: string
  currency: string
  settlements: ResolvedSettlement[]
  rawTotal: number
}

const env = (k: string, required = true): string => {
  const v = process.env[k]
  if (required && !v) throw new Error(`Missing env var: ${k}`)
  return v ?? ''
}

const API_BASE = env('API_BASE')
const SUPABASE_URL = env('SUPABASE_URL')
const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const ADMIN_EMAIL = env('ADMIN_EMAIL')
const ADMIN_PASSWORD = env('ADMIN_PASSWORD')
const LEDGER_PATH = env('LEDGER_PATH', false) || 'data/migration/id-mapping.json'
const CSV_PATH = env('CSV_PATH')
const DRY_RUN = process.env.DRY_RUN === 'true'

function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]!
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += c }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && content[i + 1] === '\n') i++
        cur.push(field); field = ''
        if (cur.length > 1 || cur[0] !== '') rows.push(cur)
        cur = []
      } else { field += c }
    }
  }
  if (field || cur.length) {
    cur.push(field)
    if (cur.length > 1 || cur[0] !== '') rows.push(cur)
  }
  if (rows.length === 0) return []
  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < header.length; i++) obj[header[i]!] = (r[i] ?? '').trim()
    return obj
  })
}

interface LedgerMapping { sourceType: string; sourceId: number | string; tailfireId: string; status: string }
interface Ledger { mappings: LedgerMapping[] }

function loadLedger(): Map<string, string> {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf-8')) as Ledger
  const m = new Map<string, string>()
  for (const entry of ledger.mappings) {
    if (entry.sourceType === 'booking' && entry.status === 'created' && entry.tailfireId) {
      m.set(String(entry.sourceId), entry.tailfireId)
    }
  }
  return m
}

async function getAdminToken(): Promise<string> {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const body = (await resp.json()) as { access_token?: string; error_description?: string }
  if (!body.access_token) throw new Error(`auth failed: ${body.error_description}`)
  return body.access_token
}

// Supabase REST helpers (same pattern as importer Step 10).
const REST_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
} as const

async function resolveAgentEmailsToUserIds(
  emails: string[]
): Promise<Map<string, { id: string; name: string }>> {
  // PostgREST: in.(<comma-separated>) with quoted strings
  const inClause = emails.map((e) => `"${e.replace(/"/g, '\\"')}"`).join(',')
  const url = `${SUPABASE_URL}/rest/v1/user_profiles?email=in.(${encodeURIComponent(inClause)})&select=id,email,first_name,last_name`
  const resp = await fetch(url, { headers: REST_HEADERS })
  if (!resp.ok) throw new Error(`user_profiles query failed (${resp.status}): ${await resp.text()}`)
  const rows = (await resp.json()) as Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>
  const m = new Map<string, { id: string; name: string }>()
  for (const r of rows) {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
    m.set(r.email.toLowerCase(), { id: r.id, name })
  }
  return m
}

async function resolveActivityToCheckItems(
  tfActivityId: string
): Promise<Array<{ checkItemId: string; receivedCents: number }>> {
  // Two-step lookup since PostgREST joins on filter are awkward:
  //   1. activity_pricing.id where activity_id = X
  //   2. commission_check_items where activity_pricing_id IN (...)
  //      AND embed commission_checks for status='accepted' filter
  const pricingResp = await fetch(
    `${SUPABASE_URL}/rest/v1/activity_pricing?activity_id=eq.${tfActivityId}&select=id`,
    { headers: REST_HEADERS }
  )
  if (!pricingResp.ok) return []
  const pricingRows = (await pricingResp.json()) as Array<{ id: string }>
  if (pricingRows.length === 0) return []
  const pricingIds = pricingRows.map((p) => p.id).join(',')

  const itemsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/commission_check_items?activity_pricing_id=in.(${pricingIds})&select=id,received_cents,check:commission_checks!commission_check_items_check_id_fkey(check_type,status)`,
    { headers: REST_HEADERS }
  )
  if (!itemsResp.ok) return []
  const items = (await itemsResp.json()) as Array<{
    id: string
    received_cents: number
    check: { check_type: string; status: string } | null
  }>
  return items
    .filter((i) => i.check?.check_type === 'received' && i.check?.status === 'accepted')
    .map((i) => ({ checkItemId: i.id, receivedCents: Number(i.received_cents) }))
}

function allocateAcrossCheckItems(
  rowAmountCents: number,
  items: Array<{ checkItemId: string; receivedCents: number }>
): ResolvedSettlement[] {
  if (items.length === 0) return []
  if (items.length === 1) return [{ checkItemId: items[0]!.checkItemId, settledAmountCents: rowAmountCents }]
  const totalReceived = items.reduce((s, i) => s + i.receivedCents, 0)
  if (totalReceived === 0) {
    const each = Math.floor(rowAmountCents / items.length)
    const remainder = rowAmountCents - each * items.length
    return items.map((it, idx) => ({
      checkItemId: it.checkItemId,
      settledAmountCents: idx === 0 ? each + remainder : each,
    }))
  }
  let allocated = 0
  return items.map((it, idx) => {
    const isLast = idx === items.length - 1
    const amount = isLast
      ? rowAmountCents - allocated
      : Math.round((rowAmountCents * it.receivedCents) / totalReceived)
    allocated += amount
    return { checkItemId: it.checkItemId, settledAmountCents: amount }
  })
}

async function postHistoricalPaid(
  apiBase: string,
  token: string,
  payload: object
): Promise<{ status: number; body: any }> {
  const resp = await fetch(`${apiBase}/commission/checks/historical-paid`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await resp.json().catch(() => ({}))
  return { status: resp.status, body }
}

async function main(): Promise<void> {
  console.log(`Loading CSV: ${CSV_PATH}`)
  const csvContent = readFileSync(CSV_PATH, 'utf-8')
  const rawRows = parseCsv(csvContent)
  console.log(`  parsed ${rawRows.length} CSV rows`)

  const REQUIRED_COLS = ['agent_email', 'booking_id_tes', 'paid_amount_cents', 'paid_date', 'check_reference']
  if (rawRows.length === 0) { console.error('No rows in CSV'); process.exit(1) }
  for (const col of REQUIRED_COLS) {
    if (!(col in rawRows[0]!)) { console.error(`Missing required CSV column: ${col}`); process.exit(1) }
  }

  const rows: PayrollRow[] = rawRows
    .map((r, idx) => ({
      agent_email: r.agent_email!.toLowerCase(),
      booking_id_tes: r.booking_id_tes!,
      paid_amount_cents: parseInt(r.paid_amount_cents!, 10),
      paid_date: r.paid_date!,
      check_reference: r.check_reference!,
      recipient_name: r.recipient_name || undefined,
      _row: idx + 2,
    }))
    .filter((r) => r.agent_email && r.booking_id_tes && r.check_reference)

  console.log(`  ${rows.length} rows after required-field filter`)

  console.log(`Loading ledger: ${LEDGER_PATH}`)
  const ledger = loadLedger()
  console.log(`  ${ledger.size} booking → activity mappings`)

  const uniqueEmails = Array.from(new Set(rows.map((r) => r.agent_email)))
  const agentMap = await resolveAgentEmailsToUserIds(uniqueEmails)
  const unresolvedAgents = uniqueEmails.filter((e) => !agentMap.has(e))
  if (unresolvedAgents.length > 0) {
    console.warn(`  WARN: ${unresolvedAgents.length} agent emails not in user_profiles: ${unresolvedAgents.join(', ')}`)
  }
  console.log(`  ${agentMap.size}/${uniqueEmails.length} agent emails resolved`)

  const groups = new Map<string, PerCheckGroup>()
  const reportLines: string[] = []
  let resolved = 0
  let skipped = 0

  for (const row of rows) {
    const agent = agentMap.get(row.agent_email)
    if (!agent) {
      reportLines.push(`SKIP row=${row._row} agent_not_found email=${row.agent_email}`)
      skipped++
      continue
    }
    const tfActivityId = ledger.get(row.booking_id_tes)
    if (!tfActivityId) {
      reportLines.push(`SKIP row=${row._row} no_ledger_mapping booking=${row.booking_id_tes}`)
      skipped++
      continue
    }
    const items = await resolveActivityToCheckItems(tfActivityId)
    if (items.length === 0) {
      reportLines.push(`SKIP row=${row._row} no_check_items activity=${tfActivityId} booking=${row.booking_id_tes}`)
      skipped++
      continue
    }

    const settlements = allocateAcrossCheckItems(row.paid_amount_cents, items)
    const groupKey = `${agent.id}::${row.check_reference}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        agent_email: row.agent_email,
        recipient_user_id: agent.id,
        recipient_name: row.recipient_name || agent.name || row.agent_email,
        check_reference: row.check_reference,
        paid_date: row.paid_date,
        currency: 'CAD',
        settlements: [],
        rawTotal: 0,
      })
    }
    const group = groups.get(groupKey)!
    group.settlements.push(...settlements)
    group.rawTotal += row.paid_amount_cents
    reportLines.push(`OK row=${row._row} agent=${row.agent_email} booking=${row.booking_id_tes} -> ${settlements.length} settlement(s) total=${row.paid_amount_cents}c`)
    resolved++
  }

  console.log(`\nResolution: ${resolved} ok, ${skipped} skipped`)
  console.log(`Grouped into ${groups.size} historical-paid checks`)

  if (DRY_RUN) {
    console.log('\nDRY_RUN — first 3 groups:')
    let i = 0
    for (const g of groups.values()) {
      if (i++ >= 3) break
      console.log(`  ${g.agent_email} :: ${g.check_reference} :: ${g.settlements.length} settlements :: ${g.rawTotal}c total`)
    }
    process.exit(0)
  }

  console.log('\nAuthenticating admin...')
  const token = await getAdminToken()
  console.log('  ok')

  let postedOk = 0
  let posted409 = 0
  let postedErr = 0
  for (const g of groups.values()) {
    // Defensive: dedup settlements within group (last write wins)
    const dedup = new Map<string, number>()
    for (const s of g.settlements) dedup.set(s.checkItemId, s.settledAmountCents)
    const finalSettlements = Array.from(dedup.entries()).map(([checkItemId, settledAmountCents]) => ({
      checkItemId,
      settledAmountCents,
    }))

    const payload = {
      checkNumber: g.check_reference,
      checkDate: g.paid_date,
      currency: g.currency,
      recipientUserId: g.recipient_user_id,
      recipientName: g.recipient_name,
      source: 'phoenix-payroll',
      sourceRef: g.check_reference,
      notes: `Historical agent payout from Phoenix payroll. Agent: ${g.agent_email}. ${finalSettlements.length} settlements; ${g.rawTotal}c declared total.`,
      settlements: finalSettlements,
    }

    const result = await postHistoricalPaid(API_BASE, token, payload)
    if (result.status === 200 || result.status === 201) {
      postedOk++
      reportLines.push(`POST OK group=${g.agent_email}/${g.check_reference} settlementCount=${result.body?.settlementCount} duplicateCount=${result.body?.duplicateCount}`)
    } else if (result.status === 409) {
      posted409++
      reportLines.push(`POST 409 group=${g.agent_email}/${g.check_reference} existingCheckId=${result.body?.existingCheckId}`)
    } else {
      postedErr++
      reportLines.push(`POST FAIL group=${g.agent_email}/${g.check_reference} status=${result.status} body=${JSON.stringify(result.body).slice(0, 200)}`)
    }
  }

  console.log(`\nPOST results: ${postedOk} created, ${posted409} already-existed (409), ${postedErr} errors`)

  const reportPath = `/tmp/ingest-payroll-${Date.now()}.log`
  writeFileSync(reportPath, reportLines.join('\n') + '\n', 'utf-8')
  console.log(`\nReport: ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
