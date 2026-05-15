/**
 * TES Import Validation Script
 *
 * Validates that imported data matches TES targets for monthly sales and commission.
 * Also performs data integrity checks.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/migration/validate-import.ts
 *   DATABASE_URL="postgres://..." npx tsx scripts/migration/validate-import.ts --data-only  # skip DB, just check extraction data
 */

import * as fs from 'fs'
import * as path from 'path'

const DATA_DIR = path.join(__dirname, '../../data/migration')

// ─── TES Target Numbers ──────────────────────────────────────────────────────
const TES_TARGETS = {
  sales: {
    '2025-12': 24872747, // $248,727.47
    '2026-01': 29812558, // $298,125.58
    '2026-02': 21979951, // $219,799.51
    '2026-03': 5279004,  // $52,790.04
  },
  commission: {
    '2025-12': 921452,   // $9,214.52
    '2026-01': 680681,   // $6,806.81
    '2026-02': 986718,   // $9,867.18
    '2026-03': 0,
  },
  ytdSales2026: 57071513,   // $570,715.13
  ytdCommission2026: 1974786, // $19,747.86 (stored as cents for comparison)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dollarsToCents(val: any): number {
  return Math.round((Number(val) || 0) * 100)
}

function centsToStr(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function monthKey(dateStr: string): string {
  return (dateStr || '').slice(0, 7) // "2026-01"
}

type Result = { name: string; status: 'PASS' | 'FAIL' | 'WARN'; expected?: string; actual?: string; detail?: string }

const results: Result[] = []

function check(name: string, expected: number, actual: number, toleranceCents = 100): void {
  const diff = Math.abs(actual - expected)
  if (diff <= toleranceCents) {
    results.push({ name, status: 'PASS', expected: centsToStr(expected), actual: centsToStr(actual) })
  } else {
    results.push({
      name,
      status: 'FAIL',
      expected: centsToStr(expected),
      actual: centsToStr(actual),
      detail: `off by ${centsToStr(diff)} (${((diff / expected) * 100).toFixed(2)}%)`,
    })
  }
}

// ─── Check 1: Extraction Data Integrity ───────────────────────────────────────

function validateExtractionData(): void {
  console.log('\n═══ CHECK 1: Extraction Data Integrity ═══\n')

  const files = ['trips.json', 'bookings.json', 'contacts.json', 'suppliers.json', 'commission-checks.json', 'payments.json']
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file)
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const count = Array.isArray(data) ? data.length : Object.keys(data).length
      results.push({ name: `File: ${file}`, status: 'PASS', actual: `${count} records` })
    } else {
      results.push({ name: `File: ${file}`, status: 'FAIL', detail: 'File missing' })
    }
  }
}

// ─── Check 2: Booking-Level Monthly Sales (TES parity) ────────────────────────

function validateBookingMonthlySales(): void {
  console.log('\n═══ CHECK 2: Booking-Level Monthly Sales (vs TES) ═══\n')

  const bookingsPath = path.join(DATA_DIR, 'bookings.json')
  if (!fs.existsSync(bookingsPath)) {
    results.push({ name: 'Booking sales', status: 'FAIL', detail: 'bookings.json missing' })
    return
  }

  const bookings = JSON.parse(fs.readFileSync(bookingsPath, 'utf8'))

  // Sum sales by booking month (how TES does it)
  const monthlySales = new Map<string, number>()
  let totalBookings = 0
  let bookingsWithDate = 0
  let bookingsWithPrice = 0

  for (const b of bookings) {
    totalBookings++
    const status = (b.BookingStatus?.StatusName || '').toLowerCase()
    if (status === 'cancelled') continue

    if (b.BookingDate) bookingsWithDate++
    if (b.PackagePrice) bookingsWithPrice++

    const month = monthKey(b.BookingDate)
    const priceCents = dollarsToCents(b.PackagePrice)
    if (month && priceCents) {
      monthlySales.set(month, (monthlySales.get(month) || 0) + priceCents)
    }
  }

  results.push({ name: 'Bookings with BookingDate', status: bookingsWithDate > 0 ? 'PASS' : 'FAIL', actual: `${bookingsWithDate}/${totalBookings}` })
  results.push({ name: 'Bookings with PackagePrice', status: bookingsWithPrice > 0 ? 'PASS' : 'FAIL', actual: `${bookingsWithPrice}/${totalBookings}` })

  // Compare against TES targets
  for (const [month, target] of Object.entries(TES_TARGETS.sales)) {
    const actual = monthlySales.get(month) || 0
    check(`Sales ${month}`, target, actual)
  }

  // YTD 2026
  let ytd2026 = 0
  for (const [month, cents] of monthlySales) {
    if (month.startsWith('2026-')) ytd2026 += cents
  }
  check('YTD 2026 Sales', TES_TARGETS.ytdSales2026, ytd2026)
}

// ─── Check 3: Commission Check Totals ─────────────────────────────────────────

function validateCommissionChecks(): void {
  console.log('\n═══ CHECK 3: Commission Checks (vs TES) ═══\n')

  const checksPath = path.join(DATA_DIR, 'commission-checks.json')
  if (!fs.existsSync(checksPath)) {
    results.push({ name: 'Commission checks', status: 'FAIL', detail: 'commission-checks.json missing' })
    return
  }

  const checks = JSON.parse(fs.readFileSync(checksPath, 'utf8'))

  // Sum commission by check date month (how TES does it)
  const monthlyComm = new Map<string, number>()
  let checksWithTotalReceived = 0
  let checksWithoutTotalReceived = 0

  for (const c of checks) {
    const status = c.CheckStatus?.Name
    if (status !== 'Accepted') continue

    const checkDate = c.CheckDate || c.DateReceived
    const month = monthKey(checkDate)
    const totalReceivedCents = dollarsToCents(c.Commission?.TotalReceived)
    const receivedCents = dollarsToCents(c.Commission?.Received)

    if (c.Commission?.TotalReceived !== undefined) checksWithTotalReceived++
    else checksWithoutTotalReceived++

    const cents = totalReceivedCents || receivedCents
    if (month && cents) {
      monthlyComm.set(month, (monthlyComm.get(month) || 0) + cents)
    }
  }

  results.push({ name: 'Checks with TotalReceived', status: checksWithoutTotalReceived === 0 ? 'PASS' : 'WARN', actual: `${checksWithTotalReceived}/${checksWithTotalReceived + checksWithoutTotalReceived}` })

  for (const [month, target] of Object.entries(TES_TARGETS.commission)) {
    if (target === 0) continue
    const actual = monthlyComm.get(month) || 0
    check(`Commission ${month}`, target, actual)
  }

  let ytdComm2026 = 0
  for (const [month, cents] of monthlyComm) {
    if (month.startsWith('2026-')) ytdComm2026 += cents
  }
  check('YTD 2026 Commission', TES_TARGETS.ytdCommission2026, ytdComm2026)
}

// ─── Check 4: 1:1 Booking→Activity Mapping (ledger check) ────────────────────

function validateLedgerMappings(): void {
  console.log('\n═══ CHECK 4: Ledger Mapping Integrity ═══\n')

  const ledgerPath = path.join(DATA_DIR, 'id-mapping.json')
  if (!fs.existsSync(ledgerPath)) {
    results.push({ name: 'Ledger file', status: 'WARN', detail: 'id-mapping.json missing (pre-import)' })
    return
  }

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  const mappings = ledger.mappings || []

  // Check booking mappings
  const bookingMappings = mappings.filter((m: any) => m.sourceType === 'booking')
  const successfulBookings = bookingMappings.filter((m: any) => m.status === 'created')
  const failedBookings = bookingMappings.filter((m: any) => m.status === 'error')

  results.push({ name: 'Booking mappings', status: failedBookings.length === 0 ? 'PASS' : 'WARN', actual: `${successfulBookings.length} ok, ${failedBookings.length} errors` })

  // Check for duplicate activity IDs (should be 1:1 now)
  const activityIdCounts = new Map<string, number>()
  for (const m of successfulBookings) {
    if (m.tailfireId) {
      activityIdCounts.set(m.tailfireId, (activityIdCounts.get(m.tailfireId) || 0) + 1)
    }
  }

  const duplicates = [...activityIdCounts.entries()].filter(([, count]) => count > 1)
  if (duplicates.length === 0) {
    results.push({ name: '1:1 booking→activity (no duplicates)', status: 'PASS', actual: `${activityIdCounts.size} unique activities` })
  } else {
    results.push({
      name: '1:1 booking→activity (no duplicates)',
      status: 'FAIL',
      actual: `${duplicates.length} activities with multiple bookings`,
      detail: duplicates.slice(0, 5).map(([id, count]) => `${id}: ${count} bookings`).join(', '),
    })
  }

  // Check commission check items
  const checkItems = mappings.filter((m: any) => m.sourceType === 'commissionCheckItem')
  const checkItemSuccess = checkItems.filter((m: any) => m.status === 'created')
  const checkItemErrors = checkItems.filter((m: any) => m.status === 'error')
  if (checkItems.length > 0) {
    results.push({ name: 'Commission check items', status: checkItemErrors.length === 0 ? 'PASS' : 'WARN', actual: `${checkItemSuccess.length} ok, ${checkItemErrors.length} errors` })
  }
}

// ─── Check 5: DB Validation (if DATABASE_URL provided) ────────────────────────

async function validateDatabase(): Promise<void> {
  console.log('\n═══ CHECK 5: Database Validation ═══\n')

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    results.push({ name: 'Database validation', status: 'WARN', detail: 'DATABASE_URL not set — skipping DB checks' })
    return
  }

  // Dynamic import pg
  let pg: any
  try {
    pg = await import('pg')
  } catch {
    results.push({ name: 'Database validation', status: 'WARN', detail: 'pg module not available — skipping DB checks' })
    return
  }

  const client = new pg.default.Client({ connectionString: dbUrl })
  try {
    await client.connect()

    // Monthly sales from DB using the new coalesce logic
    const salesResult = await client.query(`
      SELECT
        to_char(coalesce(ia.booking_date, t.booking_date::date, t.created_at::date), 'YYYY-MM') AS month,
        coalesce(sum(ap.total_price_cents), 0)::bigint AS total_cents
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      JOIN itineraries itin ON itin.id = iday.itinerary_id
      JOIN trips t ON t.id = itin.trip_id
      WHERE t.status IN ('booked', 'in_progress', 'completed')
        AND coalesce(ia.booking_date, t.booking_date::date, t.created_at::date) >= '2025-12-01'
      GROUP BY 1
      ORDER BY 1
    `)

    for (const row of salesResult.rows) {
      const target = (TES_TARGETS.sales as any)[row.month]
      if (target !== undefined) {
        check(`DB Sales ${row.month}`, target, Number(row.total_cents))
      }
    }

    // Monthly commission from DB
    const commResult = await client.query(`
      SELECT
        to_char(cc.check_date, 'YYYY-MM') AS month,
        coalesce(sum(cci.received_cents), 0)::bigint AS total_cents
      FROM commission_check_items cci
      JOIN commission_checks cc ON cc.id = cci.check_id
      JOIN activity_pricing ap ON ap.id = cci.activity_pricing_id
      WHERE cc.check_type = 'received'
        AND cc.status = 'accepted'
        AND cc.check_date >= '2025-12-01'
      GROUP BY 1
      ORDER BY 1
    `)

    for (const row of commResult.rows) {
      const target = (TES_TARGETS.commission as any)[row.month]
      if (target !== undefined) {
        check(`DB Commission ${row.month}`, target, Number(row.total_cents))
      }
    }

    // Check activities have booking_date set
    const dateCheck = await client.query(`
      SELECT
        count(*) FILTER (WHERE ia.booking_date IS NOT NULL) AS with_date,
        count(*) FILTER (WHERE ia.booking_date IS NULL AND ap.total_price_cents > 0) AS without_date,
        count(*) AS total
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
    `)

    const { with_date, without_date, total } = dateCheck.rows[0]
    results.push({
      name: 'Activities with booking_date',
      status: Number(without_date) === 0 ? 'PASS' : 'WARN',
      actual: `${with_date}/${total} have date, ${without_date} priced activities missing date`,
    })

    await client.end()
  } catch (err) {
    results.push({ name: 'Database connection', status: 'FAIL', detail: (err as Error).message })
    try { await client.end() } catch {}
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   TES Import Validation                     ║')
  console.log('╚══════════════════════════════════════════════╝')

  const dataOnly = process.argv.includes('--data-only')

  validateExtractionData()
  validateBookingMonthlySales()
  validateCommissionChecks()
  validateLedgerMappings()

  if (!dataOnly) {
    await validateDatabase()
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║   RESULTS                                   ║')
  console.log('╚══════════════════════════════════════════════╝\n')

  const pass = results.filter(r => r.status === 'PASS')
  const fail = results.filter(r => r.status === 'FAIL')
  const warn = results.filter(r => r.status === 'WARN')

  for (const r of results) {
    const icon = r.status === 'PASS' ? '  PASS' : r.status === 'FAIL' ? '  FAIL' : '  WARN'
    const detail = r.expected
      ? `expected=${r.expected} actual=${r.actual}${r.detail ? ` (${r.detail})` : ''}`
      : r.actual || r.detail || ''
    console.log(`${icon}  ${r.name}: ${detail}`)
  }

  console.log(`\n  Summary: ${pass.length} passed, ${fail.length} failed, ${warn.length} warnings`)

  if (fail.length > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
