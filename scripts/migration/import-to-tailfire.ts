/**
 * TraveleSolutions → Tailfire Import Script
 *
 * Imports extracted TraveleSolutions data into Tailfire via REST API.
 * Steps 1-9: entities (suppliers, contacts, trips, itineraries, activities, pricing, status)
 * Steps 11-14: financials (commission tracking, payment schedules, transactions, commission checks)
 *
 * Usage:
 *   TAILFIRE_TOKEN="..." npx tsx scripts/migration/import-to-tailfire.ts
 *   TAILFIRE_TOKEN="..." npx tsx scripts/migration/import-to-tailfire.ts --dry-run
 *   TAILFIRE_TOKEN="..." npx tsx scripts/migration/import-to-tailfire.ts --step suppliers
 *   TAILFIRE_TOKEN="..." npx tsx scripts/migration/import-to-tailfire.ts --resume
 *
 * Environment:
 *   TAILFIRE_TOKEN  - JWT Bearer token for Tailfire API (required)
 *   TAILFIRE_API    - API base URL (default: http://localhost:3101/api/v1)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = process.env.TAILFIRE_API || 'http://localhost:3101/api/v1'
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const SUPABASE_EMAIL = process.env.SUPABASE_EMAIL || ''
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD || ''
const DATA_DIR = join(__dirname, '../../data/migration')
const LEDGER_PATH = join(DATA_DIR, 'id-mapping.json')
const DELAY_MS = 50 // delay between API calls
const DRY_RUN = process.argv.includes('--dry-run')
const RESUME = process.argv.includes('--resume')
const STEP_ONLY = process.argv.find((a, i) => process.argv[i - 1] === '--step') || null
const TRIP_LIMIT = Number(process.argv.find((a, i) => process.argv[i - 1] === '--limit')) || 0

// ─── Agent Mapping Config ─────────────────────────────────────────────────────
// TES has only 2-3 user accounts. All trips are created by one user on behalf
// of all agents. The real agent is identified by initials in the trip name,
// e.g. "Smith Family Mexico 2026 (SL)" → agent initials "SL".
//
// Config files live in scripts/migration/data/ (sibling to import data dir).
// See data/agent-initials-mapping.json.example for template.

const MAPPING_DATA_DIR = resolve(__dirname, 'data')

const AGENT_MAPPING_PATH = process.env.AGENT_MAPPING_PATH
  || resolve(MAPPING_DATA_DIR, 'agent-initials-mapping.json')
const SUPPLIER_CURRENCY_PATH = process.env.SUPPLIER_CURRENCY_PATH
  || resolve(MAPPING_DATA_DIR, 'supplier-currency-overrides.json')

// Admin user fallback — assigned to trips with no parseable/mapped initials.
// Set ADMIN_FALLBACK_USER_ID to the admin user's UUID in the target TF environment.
const ADMIN_FALLBACK_USER_ID = process.env.ADMIN_FALLBACK_USER_ID || ''

interface AgentMapping {
  [initials: string]: { userId: string; fullName: string; email?: string }
}
interface SupplierCurrencyOverrides {
  [supplierName: string]: 'CAD' | 'USD' | 'EUR' | 'GBP'
}

let agentMapping: AgentMapping = {}
let supplierCurrencyOverrides: SupplierCurrencyOverrides = {}

function loadMappings(): void {
  if (existsSync(AGENT_MAPPING_PATH)) {
    agentMapping = JSON.parse(readFileSync(AGENT_MAPPING_PATH, 'utf-8'))
    console.log(`Loaded ${Object.keys(agentMapping).length} agent initial mappings from ${AGENT_MAPPING_PATH}`)
  } else {
    console.warn(`WARN: Agent mapping not found at ${AGENT_MAPPING_PATH}. All trips will be assigned to admin fallback.`)
  }
  if (existsSync(SUPPLIER_CURRENCY_PATH)) {
    supplierCurrencyOverrides = JSON.parse(readFileSync(SUPPLIER_CURRENCY_PATH, 'utf-8'))
    console.log(`Loaded ${Object.keys(supplierCurrencyOverrides).length} supplier currency overrides`)
  } else {
    console.log('  No supplier currency overrides found — defaulting all to CAD.')
  }
}

// ─── Agent Resolution Helpers ─────────────────────────────────────────────────

/**
 * Parse agent initials from a trip name.
 * Matches the (XX) pattern (2-4 uppercase letters) anywhere in the string.
 * Returns null if no match.
 */
function parseAgentInitials(tripName: string | undefined | null): string | null {
  if (!tripName) return null
  const match = tripName.match(/\(([A-Z]{2,4})\)/)
  return match ? match[1] : null
}

/**
 * Resolve TF userId for a trip from agent initials in the trip name.
 * Falls back to ADMIN_FALLBACK_USER_ID with a warning recorded in the ledger.
 */
function resolveAgentUserId(tripName: string | undefined | null, ledger: Ledger): string {
  const initials = parseAgentInitials(tripName)
  if (initials && agentMapping[initials]) {
    return agentMapping[initials].userId
  }
  if (!ledger.warnings) ledger.warnings = []
  if (initials) {
    console.warn(`  WARN: Initials "${initials}" found in trip "${tripName}" but no mapping. Falling back to admin.`)
    ledger.warnings.push(`Unmapped initials "${initials}" in trip name: ${tripName}`)
  } else {
    ledger.warnings.push(`No initials parseable in trip name: ${tripName}`)
  }
  return ADMIN_FALLBACK_USER_ID
}

/**
 * Detect the settlement currency for a supplier.
 * Cruise lines (Carnival, NCL, etc.) settle in USD; most Canadian suppliers in CAD.
 */
function detectCurrency(supplierName: string | undefined | null): 'CAD' | 'USD' | 'EUR' | 'GBP' {
  if (!supplierName) return 'CAD'
  return supplierCurrencyOverrides[supplierName] ?? 'CAD'
}

let authToken = ''
let tokenObtainedAt = 0
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000 // Refresh every 45 min (before 60 min expiry)

// ─── Token Refresh ──────────────────────────────────────────────────────────

async function refreshToken(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_EMAIL || !SUPABASE_PASSWORD) {
    throw new Error('Cannot refresh token: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_EMAIL, SUPABASE_PASSWORD required')
  }

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: SUPABASE_EMAIL, password: SUPABASE_PASSWORD }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token refresh failed (${resp.status}): ${text}`)
  }

  const data = await resp.json() as { access_token: string }
  authToken = data.access_token
  tokenObtainedAt = Date.now()
  console.log('  Token refreshed ✓')
}

const canAutoRefresh = !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_EMAIL && SUPABASE_PASSWORD)

async function ensureFreshToken(): Promise<void> {
  if (!canAutoRefresh) return // TAILFIRE_TOKEN-only mode, can't refresh
  if (Date.now() - tokenObtainedAt > TOKEN_REFRESH_INTERVAL_MS) {
    await refreshToken()
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface IdMapping {
  sourceType: string
  sourceId: string | number
  tailfireId: string
  status: 'created' | 'skipped' | 'error'
  error?: string
  data?: Record<string, unknown>
}

interface Ledger {
  mappings: IdMapping[]
  completedSteps: string[]
  stats: Record<string, { created: number; skipped: number; errors: number }>
  warnings?: string[]
}

// ─── Source Types (TraveleSolutions) ─────────────────────────────────────────

interface TSClient {
  ClientID: { ID: number }
  Contact: {
    Address?: {
      Address1?: string; City?: string; State?: string; ZipCode?: string
      PostalCode?: { Code?: string; Country?: { CountryCode?: string; ISOCountryCode3?: string; CountryName?: string }; Province?: { Name?: string } }
    }
    ContactGender?: { ContactGenderID: number; ContactGenderName: string }
    FirstName: string; LastName: string; NickName?: string
    Telephones?: { Primary?: { ContactDetailValue?: { Value?: string } }; Items?: Array<{ ContactDetailValue?: { Value?: string } }> }
    EmailAddresses?: { Primary?: { ContactDetailValue?: { Value?: string } }; Items?: Array<{ ContactDetailValue?: { Value?: string } }> }
  }
  ClientStatus?: { StatusID: number; StatusName: string }
  BirthDate?: string
  Agent?: { UserID: { ID: number }; Contact?: { FirstName: string; LastName: string } }
  CreatedDateTimeUTC?: string
}

interface TSTrip {
  TripID: number
  Extended?: {
    Extended?: {
      TripType?: { TripTypeID: number; TripTypeName: string }
      TravelingPackages?: Array<{
        TripTravelingPackageID: number
        TripCarriers?: Array<{
          TripTravelingPackageToTripCarrierID: number
          TripCarrier?: {
            TripCarrierID: number; SupplierID: number; Selection?: string; Title?: string
            SubTitle1?: string; SubTitle2?: string; Detail?: Record<string, unknown>
          }
          TripCarrierType?: { TripCarrierTypeID: number; TripCarrierTypeName: string }
          StartDateTimeLocal?: string; EndDateTimeLocal?: string
          ConfirmationNumber?: string
          MinPricing?: unknown; MaxPricing?: unknown
        }>
      }>
      Clients?: Array<{
        ClientToTripType?: { ClientToTripTypeEnum: number; ClientToTripTypeName: string }
        Client?: { ClientID: { ID: number }; Contact?: { FirstName: string; LastName: string } }
      }>
      StartDate?: string; EndDate?: string
      Detail?: { BookingCount: number; TravelerCount: number }
    }
    TripMainType?: { TripMainTypeID: number; TripMainTypeName: string }
  }
  Agent?: { UserID: { ID: number }; Contact?: { FirstName: string; LastName: string } }
  TripDescription?: string
  TripStatus?: { StatusID: number; StatusName: string }
  CreatedDateTimeUTC?: string
}

interface TSBooking {
  BookingID: number
  TripID: number
  TripDescription?: string
  BookingNumber?: string; Number?: string
  BookingDate?: string
  TourOperator?: { TourOperatorID: number; TourOperatorName: string }
  Description?: string
  StartDate?: string; EndDate?: string
  BookingStatus?: { StatusID: number; StatusName: string }
  PackagePrice?: number; ActualPackagePrice?: number
  Commission?: {
    Earned: number; Received: number; ReceivedParent: number; TotalReceived: number
    Paid: number; Due: number; TotalDue: number; Rate: number
    AdjustmentCount: number; Adjustment: number
  }
  FinalPaymentDate?: string
  BookingCategoryType?: { BookingCategoryTypeID: number; BookingCategoryTypeName: string }
  BookingType?: { ID: number; Name: string }
  CreatedDateTimeUTC?: string
}

interface TSTourOperator {
  TourOperatorID: number; TourOperatorName: string
  BookingCount: number; TotalPackagePrice: number
}

interface TSPaymentTrip {
  tripId: number
  payments: {
    Item1: { Amount: number; Balance: number; ComputedPackagePrice: number; PackagePrice: number; PaymentDate: string; Count: number }
    Item2: Array<{
      BookingID: number
      TripID: number
      PaymentsAndItemizations: {
        Payments: Array<{
          BookingPaymentID: number
          BookingID: number
          Client?: { ClientID: { ID: number }; Contact?: { FirstName: string; LastName: string } }
          BookingPaymentType: { ID: number; Name: string }
          Amount: number
          Balance: number
          PaymentDate: string
          CreatedDateTimeUTC: string
        }>
      }
    }>
  }
}

interface TSCommissionCheck {
  CheckID: { ID: number }
  CheckNumber: string
  CheckDate: string
  Commission: {
    BookingCount: number; Earned: number; Received: number; ReceivedParent: number
    TotalReceived: number; Paid: number; Due: number; TotalDue: number
    Rate: number; CommissionSummary: string; AdjustmentCount: number; Adjustment: number
  }
  CheckStatus: { ID: number; Name: string }
  CheckToType: number
  CheckTo: { ID: number; Name: string }
  CheckFrom: { TourOperatorID: number; TourOperatorName: string }
  CreatedBy: { ID: number }
  AcceptedBy?: { ID: number }
  ManualReceive: boolean
  Included: boolean
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

function loadLedger(): Ledger {
  if (RESUME && existsSync(LEDGER_PATH)) {
    return JSON.parse(readFileSync(LEDGER_PATH, 'utf-8'))
  }
  return { mappings: [], completedSteps: [], stats: {} }
}

function saveLedger(ledger: Ledger): void {
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2))
}

function findMapping(ledger: Ledger, sourceType: string, sourceId: string | number): IdMapping | undefined {
  return ledger.mappings.find(m => m.sourceType === sourceType && String(m.sourceId) === String(sourceId))
}

function addMapping(ledger: Ledger, mapping: IdMapping): void {
  ledger.mappings.push(mapping)
  const key = mapping.sourceType
  if (!ledger.stats[key]) ledger.stats[key] = { created: 0, skipped: 0, errors: 0 }
  ledger.stats[key][mapping.status === 'created' ? 'created' : mapping.status === 'skipped' ? 'skipped' : 'errors']++
}

function validateStepCompleteness(
  ledger: Ledger,
  stepName: string,
  sourceType: string,
  expectedCount: number,
): void {
  const mappings = ledger.mappings.filter(m => m.sourceType === sourceType)
  const created = mappings.filter(m => m.status === 'created').length
  const errors = mappings.filter(m => m.status === 'error').length
  const skipped = mappings.filter(m => m.status === 'skipped').length
  const total = created + errors + skipped

  if (total < expectedCount) {
    const missing = expectedCount - total
    console.warn(`  ⚠️  ${stepName}: ${missing} items not processed (${total}/${expectedCount}). NOT marking step complete.`)
    return
  }

  if (errors > 0) {
    console.warn(`  ⚠️  ${stepName}: ${errors} errors (${created} created, ${skipped} skipped). Marking complete but errors need attention.`)
  }

  ledger.completedSteps.push(stepName)
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] POST ${path}`, JSON.stringify(body).substring(0, 200))
    return { id: `dry-run-${Date.now()}` } as T
  }

  await ensureFreshToken()
  let resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  // Retry once on 401 with fresh token (only if auto-refresh is available)
  if (resp.status === 401 && canAutoRefresh) {
    await refreshToken()
    resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`POST ${path} failed (${resp.status}): ${text.substring(0, 500)}`)
  }

  return resp.json() as Promise<T>
}

async function apiPatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] PATCH ${path}`, JSON.stringify(body).substring(0, 200))
    return {} as T
  }

  await ensureFreshToken()
  let resp = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  // Retry once on 401 with fresh token (only if auto-refresh is available)
  if (resp.status === 401 && canAutoRefresh) {
    await refreshToken()
    resp = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`PATCH ${path} failed (${resp.status}): ${text.substring(0, 500)}`)
  }

  return resp.json() as Promise<T>
}

async function apiGet<T>(path: string): Promise<T> {
  await ensureFreshToken()
  let resp = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  })

  // Retry once on 401 with fresh token (only if auto-refresh is available)
  if (resp.status === 401 && canAutoRefresh) {
    await refreshToken()
    resp = await fetch(`${API_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    })
  }

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GET ${path} failed (${resp.status}): ${text.substring(0, 300)}`)
  }
  return resp.json() as Promise<T>
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Data Loading ────────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(DATA_DIR, filename)
  if (!existsSync(path)) {
    throw new Error(`Missing data file: ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf-8'))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFlightSelection(selection?: string): {
  airline?: string; flightNumber?: string
  departureCode?: string; arrivalCode?: string
  departureTime?: string; arrivalTime?: string
} {
  if (!selection) return {}
  // Format: "Air Canada · AC8002 · 6:00 AM - 6:46 AM · Ottawa (YOW) - Montreal (YUL)"
  const parts = selection.split(' · ')
  const result: Record<string, string> = {}
  if (parts.length >= 1) result.airline = parts[0].trim()
  if (parts.length >= 2) result.flightNumber = parts[1].trim()
  if (parts.length >= 4) {
    // Parse airports: "Ottawa (YOW) - Montreal (YUL)"
    const airports = parts[3]
    const depMatch = airports.match(/\(([A-Z]{3})\)/)
    const arrMatch = airports.match(/-[^(]*\(([A-Z]{3})\)/)
    if (depMatch) result.departureCode = depMatch[1]
    if (arrMatch) result.arrivalCode = arrMatch[1]
  }
  if (parts.length >= 3) {
    // Parse times: "6:00 AM - 6:46 AM"
    const times = parts[2].split(' - ')
    if (times.length >= 1) result.departureTime = times[0].trim()
    if (times.length >= 2) result.arrivalTime = times[1].trim()
  }
  return result
}

function mapCarrierTypeToActivityType(typeName?: string): string {
  switch (typeName) {
    case 'Cruise': return 'custom_cruise'
    case 'Flight': return 'flight'
    case 'Resort/ Hotel': return 'lodging'
    case 'Activity': return 'tour'
    case 'Car Rental': return 'transportation'
    case 'Tour': return 'custom_tour'
    case 'Rail': return 'transportation'
    default: return 'tour'
  }
}

// ─── Insurance Detection Helpers ─────────────────────────────────────────────

const INSURANCE_OPERATORS = ['allianz', 'manulife', 'blue cross', 'travelsafe']

function isInsuranceOperator(operatorName?: string): boolean {
  if (!operatorName) return false
  const lower = operatorName.toLowerCase()
  return INSURANCE_OPERATORS.some(op => lower.includes(op))
}

function inferPolicyType(description?: string): string {
  if (!description) return 'other'
  const lower = description.toLowerCase()
  if (lower.includes('cancel') || lower.includes('interrupt') || lower.includes('ppp')) return 'trip_cancellation'
  if (lower.includes('medical') || lower.includes('health')) return 'medical'
  if (lower.includes('comprehensive') || lower.includes('all-in') || lower.includes('multi') || lower.includes('annual') || lower.includes('family')) return 'comprehensive'
  if (lower.includes('evacuation') || lower.includes('emergency')) return 'evacuation'
  if (lower.includes('baggage') || lower.includes('luggage')) return 'baggage'
  return 'other'
}

function mapTripStatus(statusName?: string, _startDate?: string, _endDate?: string): { initial: string; final: string } {
  // With the new lifecycle model, trips are created as 'planning'.
  // The TripLifecycleService backfill endpoint handles date-driven
  // transitions (planning→active→travelling→travelled) based on
  // booking state and trip dates.
  // Only 'cancelled' needs explicit handling here.
  switch (statusName) {
    case 'Cancelled':
      return { initial: 'planning', final: 'cancelled' }
    default:
      // All other statuses: create as planning, let backfill handle promotion
      return { initial: 'planning', final: 'planning' }
  }
}

function extractCountryCode(contact: TSClient['Contact']): string | undefined {
  const code = contact.Address?.PostalCode?.Country?.ISOCountryCode3
  if (code && code.length === 3) return code
  return undefined
}

function dollarsToCents(dollars?: number): number | undefined {
  if (dollars === undefined || dollars === null) return undefined
  return Math.round(dollars * 100)
}

function normalizeName(name: string | undefined): string | undefined {
  if (!name) return undefined

  // Only normalize if the name appears to be ALL CAPS or all lowercase
  // Leave mixed-case names alone (they were likely entered correctly)
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name

  return name
    .toLowerCase()
    .split(/(?<=[-' ])/)  // Split keeping delimiters attached (e.g. "St-" stays together)
    .map(segment => {
      // Capitalize first letter of each segment
      const capitalized = segment.charAt(0).toUpperCase() + segment.slice(1)

      // Handle Mc/Mac prefixes (only for last-name-like segments without delimiters)
      if (/^Mc[a-z]/.test(capitalized)) {
        return 'Mc' + capitalized.charAt(2).toUpperCase() + capitalized.slice(3)
      }
      if (/^Mac[a-z]/.test(capitalized) && capitalized.length > 4) {
        return 'Mac' + capitalized.charAt(3).toUpperCase() + capitalized.slice(4)
      }

      return capitalized
    })
    .join('')
}

// ─── Step 1: Suppliers ───────────────────────────────────────────────────────

async function importSuppliers(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('suppliers') && RESUME) {
    console.log('  Suppliers: skipped (completed)')
    return
  }

  console.log('\n── Step 1: Importing Suppliers ──')
  const suppliers = loadJson<TSTourOperator[]>('suppliers.json')

  for (const s of suppliers) {
    const existing = findMapping(ledger, 'supplier', s.TourOperatorID)
    if (existing && existing.status !== 'error') { continue }
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    try {
      const result = await apiPost<{ id: string }>('/suppliers', {
        name: s.TourOperatorName,
        isActive: true,
        notes: `Imported from TraveleSolutions. TourOperatorID: ${s.TourOperatorID}. BookingCount: ${s.BookingCount}. TotalPackagePrice: $${s.TotalPackagePrice}`,
      })
      addMapping(ledger, { sourceType: 'supplier', sourceId: s.TourOperatorID, tailfireId: result.id, status: 'created' })
      await delay(DELAY_MS)
    } catch (err) {
      addMapping(ledger, { sourceType: 'supplier', sourceId: s.TourOperatorID, tailfireId: '', status: 'error', error: (err as Error).message })
      console.error(`  ERROR supplier ${s.TourOperatorID} (${s.TourOperatorName}): ${(err as Error).message}`)
    }
  }

  validateStepCompleteness(ledger, 'suppliers', 'supplier', suppliers.length)
  saveLedger(ledger)
  console.log(`  Suppliers: ${ledger.stats.supplier?.created || 0} created, ${ledger.stats.supplier?.errors || 0} errors`)
}

// ─── Step 2: Contacts ────────────────────────────────────────────────────────

async function importContacts(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('contacts') && RESUME) {
    console.log('  Contacts: skipped (completed)')
    return
  }

  console.log('\n── Step 2: Importing Contacts ──')
  const contacts = loadJson<TSClient[]>('contacts.json')

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const sourceId = c.ClientID.ID
    const existing = findMapping(ledger, 'contact', sourceId)
    if (existing && existing.status !== 'error') { continue }
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    const contact = c.Contact
    const email = contact.EmailAddresses?.Primary?.ContactDetailValue?.Value
      || contact.EmailAddresses?.Items?.[0]?.ContactDetailValue?.Value
    const phone = contact.Telephones?.Primary?.ContactDetailValue?.Value
      || contact.Telephones?.Items?.[0]?.ContactDetailValue?.Value

    try {
      const body: Record<string, unknown> = {
        firstName: normalizeName(contact.FirstName),
        lastName: normalizeName(contact.LastName),
        preferredName: normalizeName(contact.NickName),
        email: email || undefined,
        phone: phone || undefined,
        dateOfBirth: c.BirthDate ? c.BirthDate.split('T')[0] : undefined,
        gender: contact.ContactGender?.ContactGenderName || undefined,
        addressLine1: contact.Address?.Address1 || undefined,
        city: contact.Address?.City || undefined,
        province: contact.Address?.State || contact.Address?.PostalCode?.Province?.Name || undefined,
        postalCode: contact.Address?.ZipCode || contact.Address?.PostalCode?.Code || undefined,
        country: extractCountryCode(contact),
        // contactType left as default 'lead' — bulk promoted to 'client' after import
        // (DB constraint requires became_client_at when contact_type='client')
        timezone: 'America/Toronto',
      }

      // Remove undefined values
      for (const key of Object.keys(body)) {
        if (body[key] === undefined) delete body[key]
      }

      const result = await apiPost<{ id: string }>('/contacts', body)
      addMapping(ledger, { sourceType: 'contact', sourceId, tailfireId: result.id, status: 'created' })

      if ((i + 1) % 100 === 0) {
        console.log(`  Progress: ${i + 1}/${contacts.length}`)
        saveLedger(ledger)
      }
      await delay(DELAY_MS)
    } catch (err) {
      addMapping(ledger, { sourceType: 'contact', sourceId, tailfireId: '', status: 'error', error: (err as Error).message })
      console.error(`  ERROR contact ${sourceId}: ${(err as Error).message}`)
    }
  }

  validateStepCompleteness(ledger, 'contacts', 'contact', contacts.length)
  saveLedger(ledger)
  console.log(`  Contacts: ${ledger.stats.contact?.created || 0} created, ${ledger.stats.contact?.errors || 0} errors`)
}

// ─── Step 3-13: Trips (with itineraries, activities, pricing, status) ────────

async function importTrips(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('trips') && RESUME) {
    console.log('  Trips: skipped (completed)')
    return
  }

  console.log('\n── Steps 3-13: Importing Trips ──')
  const trips = loadJson<TSTrip[]>('trips.json')
  const bookings = loadJson<TSBooking[]>('bookings.json')
  const suppliers = loadJson<TSTourOperator[]>('suppliers.json')

  // Build supplier name map for cruise line lookup
  const supplierNameMap = new Map<number, string>()
  for (const s of suppliers) {
    supplierNameMap.set(s.TourOperatorID, s.TourOperatorName)
  }

  // Index bookings by trip
  const bookingsByTrip: Record<number, TSBooking[]> = {}
  for (const b of bookings) {
    if (!bookingsByTrip[b.TripID]) bookingsByTrip[b.TripID] = []
    bookingsByTrip[b.TripID].push(b)
  }

  const tripCount = TRIP_LIMIT > 0 ? Math.min(TRIP_LIMIT, trips.length) : trips.length
  for (let i = 0; i < tripCount; i++) {
    const trip = trips[i]
    const tripId = trip.TripID
    const existing = findMapping(ledger, 'trip', tripId)
    if (existing && existing.status === 'created') { continue }
    // If previously errored, remove old error mapping and retry
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    const ext = trip.Extended?.Extended
    const startDate = ext?.StartDate?.split('T')[0]
    const endDate = ext?.EndDate?.split('T')[0]
    const statusMap = mapTripStatus(trip.TripStatus?.StatusName, startDate, endDate)
    const tripType = ext?.TripType?.TripTypeName

    try {
      // ── Step 3: Create trip ──

      const tripBody: Record<string, unknown> = {
        name: trip.TripDescription || `Trip ${tripId}`,
        tripType: 'leisure',
        status: 'planning',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        bookingDate: trip.CreatedDateTimeUTC?.split('T')[0] || undefined,
        externalReference: String(tripId),
        currency: 'CAD',
        timezone: 'America/Toronto',
        customFields: {
          sourceTripType: tripType || 'Unknown',
          sourceId: tripId,
          sourceStatus: trip.TripStatus?.StatusName,
          sourceAgent: trip.Agent?.Contact ? `${trip.Agent.Contact.FirstName} ${trip.Agent.Contact.LastName}` : undefined,
        },
      }

      for (const key of Object.keys(tripBody)) {
        if (tripBody[key] === undefined) delete tripBody[key]
      }

      const tripResult = await apiPost<{ id: string }>('/trips', tripBody)
      const tfTripId = tripResult.id
      addMapping(ledger, { sourceType: 'trip', sourceId: tripId, tailfireId: tfTripId, status: 'created' })
      await delay(DELAY_MS)

      // ── Step 3a: Assign trip owner / collaborator from initials ──
      // TES trips are all created by a placeholder user. Resolve the real agent
      // from the (XX) initials suffix in the trip name and set them as owner.
      // PATCH /trips/:id/owner also upserts the trip_collaborators lead row.
      const agentUserId = resolveAgentUserId(trip.TripDescription, ledger)
      if (agentUserId) {
        try {
          await apiPatch(`/trips/${tfTripId}/owner`, { ownerId: agentUserId })
          await delay(DELAY_MS)
        } catch (err) {
          const msg = (err as Error).message
          console.warn(`  WARN: Could not assign owner ${agentUserId} to trip ${tfTripId}: ${msg}`)
        }
      } else {
        console.warn(`  WARN: ADMIN_FALLBACK_USER_ID not set — trip ${tfTripId} will have no owner. Set env var.`)
      }

      // ── Step 3b: Trip tags (must use dedicated endpoint) ──
      if (tripType) {
        try {
          await apiPost(`/trips/${tfTripId}/tags`, { name: tripType, category: 'trip-type' })
          await delay(DELAY_MS)
        } catch (err) {
          // 409 = tag already exists globally, but still gets associated — non-fatal
          if (!(err as Error).message.includes('409')) {
            console.warn(`  WARN: tag "${tripType}" on trip ${tripId}: ${(err as Error).message}`)
          }
        }
      }

      // ── Step 4: Trip travelers ──
      const clients = ext?.Clients || []
      let primaryContactId: string | undefined

      for (const client of clients) {
        const clientId = client.Client?.ClientID?.ID
        if (!clientId) continue

        const contactMapping = findMapping(ledger, 'contact', clientId)
        if (!contactMapping?.tailfireId) {
          console.warn(`  WARN: Trip ${tripId} references client ${clientId} not in ledger`)
          continue
        }

        const isPrimary = client.ClientToTripType?.ClientToTripTypeEnum === 1 && !primaryContactId
        if (isPrimary) primaryContactId = contactMapping.tailfireId

        try {
          const travelerResp = await apiPost<{ id: string }>(`/trips/${tfTripId}/travelers`, {
            contactId: contactMapping.tailfireId,
            role: isPrimary ? 'primary_contact' : 'full_access',
            isPrimaryTraveler: isPrimary,
            travelerType: 'adult',
          })
          addMapping(ledger, {
            sourceType: 'tripTraveler',
            sourceId: clientId,
            tailfireId: travelerResp.id,
            status: 'created',
            data: { tripId, tfTripId, firstName: client.Client?.Contact?.FirstName, lastName: client.Client?.Contact?.LastName },
          })
          await delay(DELAY_MS)
        } catch (err) {
          console.error(`  WARN: traveler ${clientId} on trip ${tripId}: ${(err as Error).message}`)
        }
      }

      // Set primary contact on trip if found
      if (primaryContactId) {
        try {
          await apiPatch(`/trips/${tfTripId}`, { primaryContactId })
        } catch { /* non-critical */ }
      }

      // ── Step 5: Create itinerary ──
      let itineraryId: string | undefined
      try {
        const itinResult = await apiPost<{ id: string }>(`/trips/${tfTripId}/itineraries`, {
          name: trip.TripDescription || `Itinerary`,
          status: 'approved',
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        })
        itineraryId = itinResult.id
        await delay(DELAY_MS)
      } catch (err) {
        console.error(`  ERROR itinerary for trip ${tripId}: ${(err as Error).message}`)
      }

      // ── Step 6: Create itinerary days on-demand per activity date ──
      // Instead of creating days for the entire trip date range (which creates hundreds
      // of empty days for long trips), we create days only for dates that have activities.
      const dayByDate = new Map<string, string>() // date string → day ID

      async function getOrCreateDay(dateStr?: string): Promise<string | undefined> {
        if (!itineraryId) return undefined
        const date = dateStr?.split('T')[0] || startDate
        if (!date) return undefined

        // Check cache first
        const cached = dayByDate.get(date)
        if (cached) return cached

        try {
          const result = await apiPost<{ id: string }>(`/itineraries/${itineraryId}/days/find-or-create-by-date`, {
            date,
          })
          dayByDate.set(date, result.id)
          await delay(DELAY_MS)
          return result.id
        } catch (err) {
          console.error(`  ERROR creating day for ${date} on trip ${tripId}: ${(err as Error).message}`)
          return undefined
        }
      }

      // ── Step 7: Create activities from carriers ──
      const carriers: Array<{
        wrapper: Record<string, unknown>
        activityId?: string
        supplierId?: number
        confirmationNumber?: string
        startDate?: string
        packageId?: number
      }> = []

      const pkgs = ext?.TravelingPackages || []
      for (const pkg of pkgs) {
        for (const carrier of pkg.TripCarriers || []) {
          const tc = carrier.TripCarrier
          if (!tc) continue

          const typeName = carrier.TripCarrierType?.TripCarrierTypeName
          const activityType = mapCarrierTypeToActivityType(typeName)
          const targetDayId = await getOrCreateDay(carrier.StartDateTimeLocal)

          if (!targetDayId) continue

          const activityName = tc.Title || tc.Selection?.split(' · ')[0] || `${typeName || 'Activity'}`

          try {
            let result: { id: string }

            if (activityType === 'flight') {
              const flight = parseFlightSelection(tc.Selection)
              result = await apiPost<{ id: string }>('/activities/flights', {
                itineraryDayId: targetDayId,
                name: activityName,
                componentType: 'flight',
                startDatetime: carrier.StartDateTimeLocal || undefined,
                endDatetime: carrier.EndDateTimeLocal || undefined,
                confirmationNumber: carrier.ConfirmationNumber || undefined,
                timezone: 'America/Toronto',
                flightDetails: {
                  airline: flight.airline || undefined,
                  flightNumber: flight.flightNumber || undefined,
                  departureAirportCode: flight.departureCode || undefined,
                  arrivalAirportCode: flight.arrivalCode || undefined,
                },
              })
            } else if (activityType === 'lodging') {
              const detail = tc.Detail as Record<string, unknown> | undefined
              // Address can be string or object — normalize to string
              let addressStr: string | undefined
              if (detail?.Address) {
                if (typeof detail.Address === 'string') {
                  addressStr = detail.Address
                } else if (typeof detail.Address === 'object') {
                  const addr = detail.Address as Record<string, unknown>
                  const parts = [addr.Address1, addr.Address2, addr.City].filter(Boolean)
                  const country = (addr.PostalCode as Record<string, unknown>)?.Country as Record<string, unknown> | undefined
                  if (country?.CountryName) parts.push(country.CountryName as string)
                  addressStr = parts.join(', ')
                }
              }
              result = await apiPost<{ id: string }>('/activities/lodging', {
                itineraryDayId: targetDayId,
                name: activityName,
                componentType: 'lodging',
                startDatetime: carrier.StartDateTimeLocal || undefined,
                endDatetime: carrier.EndDateTimeLocal || undefined,
                confirmationNumber: carrier.ConfirmationNumber || undefined,
                timezone: 'America/Toronto',
                lodgingDetails: {
                  propertyName: (detail?.PropertyName as string) || activityName,
                  address: addressStr,
                  checkInDate: carrier.StartDateTimeLocal?.split('T')[0] || undefined,
                  checkOutDate: carrier.EndDateTimeLocal?.split('T')[0] || undefined,
                },
              })
            } else if (activityType === 'custom_cruise') {
              const detail = tc.Detail as Record<string, unknown> | undefined
              const ship = detail?.Ship as Record<string, unknown> | undefined
              const offer = detail?.SupplierOffer as Record<string, unknown> | undefined
              result = await apiPost<{ id: string }>('/activities/custom-cruise', {
                itineraryDayId: targetDayId,
                name: activityName,
                componentType: 'custom_cruise',
                startDatetime: carrier.StartDateTimeLocal || undefined,
                endDatetime: carrier.EndDateTimeLocal || undefined,
                confirmationNumber: carrier.ConfirmationNumber || undefined,
                timezone: 'America/Toronto',
                customCruiseDetails: {
                  cruiseLineName: supplierNameMap.get(tc.SupplierID) || undefined,
                  shipName: (ship as Record<string, unknown>)?.ShipName as string || undefined,
                  itineraryName: (offer as Record<string, unknown>)?.Title as string || activityName,
                  nights: (offer as Record<string, unknown>)?.NumberOfNights as number || undefined,
                  departureDate: carrier.StartDateTimeLocal?.split('T')[0] || undefined,
                  arrivalDate: carrier.EndDateTimeLocal?.split('T')[0] || undefined,
                  source: 'manual',
                },
              })
            } else if (activityType === 'transportation') {
              result = await apiPost<{ id: string }>('/activities/transportation', {
                itineraryDayId: targetDayId,
                name: activityName,
                componentType: 'transportation',
                startDatetime: carrier.StartDateTimeLocal || undefined,
                endDatetime: carrier.EndDateTimeLocal || undefined,
                confirmationNumber: carrier.ConfirmationNumber || undefined,
                timezone: 'America/Toronto',
                transportationDetails: {
                  subtype: typeName === 'Car Rental' ? 'car_rental' : 'transfer',
                },
              })
            } else {
              // Non-typed activity (tour, custom_tour, etc.) — use generic endpoint with activityType
              result = await apiPost<{ id: string }>(`/days/${targetDayId}/activities`, {
                name: activityName,
                activityType: activityType,
                startDatetime: carrier.StartDateTimeLocal || undefined,
                endDatetime: carrier.EndDateTimeLocal || undefined,
                confirmationNumber: carrier.ConfirmationNumber || undefined,
                timezone: 'America/Toronto',
              })
            }

            carriers.push({
              wrapper: carrier as any,
              activityId: result.id,
              supplierId: tc.SupplierID,
              confirmationNumber: carrier.ConfirmationNumber || undefined,
              startDate: carrier.StartDateTimeLocal?.split('T')[0],
              packageId: pkg.TripTravelingPackageID,
            })
            addMapping(ledger, {
              sourceType: 'activity',
              sourceId: `${tripId}-carrier-${tc.TripCarrierID}`,
              tailfireId: result.id,
              status: 'created',
              data: { tripId, carrierType: typeName, supplierId: tc.SupplierID },
            })
            await delay(DELAY_MS)
          } catch (err) {
            console.error(`  ERROR activity on trip ${tripId} (${typeName}): ${(err as Error).message}`)
            addMapping(ledger, {
              sourceType: 'activity',
              sourceId: `${tripId}-carrier-${tc.TripCarrierID}`,
              tailfireId: '',
              status: 'error',
              error: (err as Error).message,
            })
          }
        }
      }

      // ── Step 7b: Detect and create package activities ──
      const packageActivityIds = new Map<string, string>() // child activityId → package activityId
      const tripBookings = bookingsByTrip[tripId] || []
      const activeBookings = tripBookings.filter(b => b.BookingStatus?.StatusName !== 'Cancelled')
      // Exclude insurance bookings from package detection — they don't represent the package booking
      const activeNonInsuranceBookings = activeBookings.filter(b => !isInsuranceOperator(b.TourOperator?.TourOperatorName))

      for (const pkg of pkgs) {
        const pkgCarriers = carriers.filter(c => c.packageId === pkg.TripTravelingPackageID && c.activityId)
        // Package vacation: multiple carriers in this package AND exactly 1 active non-insurance booking on the trip
        // Skip if multiple TES packages have carriers (ambiguous — can't determine which package the booking covers)
        const otherPkgsWithCarriers = pkgs.filter(p =>
          p.TripTravelingPackageID !== pkg.TripTravelingPackageID &&
          carriers.some(c => c.packageId === p.TripTravelingPackageID && c.activityId)
        )
        if (pkgCarriers.length > 1 && activeNonInsuranceBookings.length === 1 && otherPkgsWithCarriers.length === 0) {
          try {
            const supplierName = activeNonInsuranceBookings[0].TourOperator?.TourOperatorName || 'Tour Operator'
            // Use earliest carrier's day for the package (departure day)
            const earliestCarrier = pkgCarriers.reduce((a, b) =>
              (a.startDate || '') <= (b.startDate || '') ? a : b
            )
            const packageDayId = await getOrCreateDay(earliestCarrier.startDate || startDate)

            if (!packageDayId) {
              console.warn(`  WARN: no day for package on trip ${tripId}`)
              continue
            }

            const pkgResult = await apiPost<{ id: string }>('/activities', {
              activityType: 'package',
              componentType: 'package',
              itineraryDayId: packageDayId,
              name: `${supplierName} Package`,
              activityIds: pkgCarriers.map(c => c.activityId!),
            })
            for (const c of pkgCarriers) {
              packageActivityIds.set(c.activityId!, pkgResult.id)
            }
            addMapping(ledger, {
              sourceType: 'activity',
              sourceId: `${tripId}-package-${pkg.TripTravelingPackageID}`,
              tailfireId: pkgResult.id,
              status: 'created',
              data: { tripId, type: 'package', childCount: pkgCarriers.length },
            })
            await delay(DELAY_MS)
          } catch (err) {
            console.error(`  ERROR creating package for trip ${tripId}: ${(err as Error).message}`)
          }
        }
      }

      // ── Step 8: Activity pricing from bookings ──

      // Track insurance bookings for Step 8c
      const insuranceMatches: Array<{ booking: TSBooking; activityId: string; dayId: string }> = []

      // Track which carrier activities have already been claimed by a booking (1:1 mapping)
      const claimedActivities = new Set<string>()

      for (const booking of tripBookings) {
        const bookingNum = booking.BookingNumber || booking.Number || String(booking.BookingID)
        const priceCents = dollarsToCents(booking.PackagePrice)
        const commissionCents = dollarsToCents(booking.Commission?.Earned)

        // Match booking to carrier activity using multi-signal scoring
        let matchedActivityId: string | undefined
        const bStart = booking.StartDate?.split('T')[0]
        const bConfirm = (booking.BookingNumber || booking.Number || '').trim()
        const bSupplierId = booking.TourOperator?.TourOperatorID

        let bestScore = 0
        for (const c of carriers) {
          if (!c.activityId) continue
          let score = 0

          // Confirmation number match (strongest signal)
          if (bConfirm && c.confirmationNumber && bConfirm === c.confirmationNumber) {
            score += 10
          }

          // Supplier ID match
          if (bSupplierId && c.supplierId && bSupplierId === c.supplierId) {
            score += 5
          }

          // Start date match
          if (bStart && c.startDate && bStart === c.startDate) {
            score += 3
          }

          if (score > bestScore) {
            bestScore = score
            matchedActivityId = c.activityId
          }
        }

        // Insurance detection — MUST run BEFORE weak fallback and package-parent redirect
        const isInsurance = isInsuranceOperator(booking.TourOperator?.TourOperatorName)

        // Only accept match with at least 2 signals (score >= 5), or fallback
        // For insurance bookings: skip weak fallback to avoid hijacking unrelated carrier activities
        if (bestScore < 5) {
          if (isInsurance) {
            // Insurance bookings require strong match only — force standalone creation otherwise
            matchedActivityId = undefined
          } else if (carriers.length === 1 && carriers[0].activityId) {
            // Single carrier — always match
            matchedActivityId = carriers[0].activityId
          } else if (carriers.length > 0) {
            // Multiple carriers, no strong match — match to first carrier with same start date,
            // or first carrier overall (e.g. consolidator booking covering multiple legs)
            const dateMatch = carriers.find(c => c.activityId && bStart && c.startDate === bStart)
            matchedActivityId = dateMatch?.activityId || carriers.find(c => c.activityId)?.activityId
          } else {
            matchedActivityId = undefined
          }
        }

        if (isInsurance && matchedActivityId) {
          // Skip package redirect for insurance bookings
        } else if (!isInsurance && matchedActivityId && packageActivityIds.has(matchedActivityId)) {
          // If matched activity is a child of a package, route pricing to the package parent
          matchedActivityId = packageActivityIds.get(matchedActivityId)!
        }

        // Each TES booking maps 1:1 to its own activity — if already claimed, create standalone
        if (matchedActivityId && claimedActivities.has(matchedActivityId)) {
          matchedActivityId = undefined
        }

        if (!matchedActivityId) {
          // Create standalone activity for unmatched/claimed booking — place on correct day
          const bookingDayId = await getOrCreateDay(booking.StartDate)
          if (!bookingDayId) {
            console.warn(`  WARN: no day created for booking ${bookingNum} on trip ${tripId}`)
          }
          try {
            const activityType = isInsurance ? 'insurance' : 'tour'
            const genResult = await apiPost<{ id: string }>(`/days/${bookingDayId}/activities`, {
              name: booking.Description || `Booking ${bookingNum}`,
              activityType,
              description: `Supplier: ${booking.TourOperator?.TourOperatorName || 'Unknown'}`,
              confirmationNumber: bookingNum,
              timezone: 'America/Toronto',
              startDatetime: booking.StartDate || undefined,
              endDatetime: booking.EndDate || undefined,
            })
            matchedActivityId = genResult.id
            await delay(DELAY_MS)
          } catch (err) {
            console.error(`  ERROR generic activity for booking ${booking.BookingID}: ${(err as Error).message}`)
          }
        }

        // Track insurance matches after final matchedActivityId is resolved (avoid duplicates)
        if (isInsurance && matchedActivityId) {
          const bookingDayId = await getOrCreateDay(booking.StartDate)
          insuranceMatches.push({ booking, activityId: matchedActivityId, dayId: bookingDayId || '' })
        }

        // PATCH price + bookingDate for this booking's activity (1:1, no accumulation)
        // TES PackagePrice = GROSS (selling price to client). Commission is included, not additive.
        const grossPriceCents = priceCents
        if (matchedActivityId && priceCents) {
          claimedActivities.add(matchedActivityId)
          try {
            await apiPatch(`/activities/${matchedActivityId}`, {
              totalPriceCents: grossPriceCents,
              netPriceCents: priceCents,
              currency: 'CAD',
              confirmationNumber: bookingNum || undefined,
              commissionTotalCents: commissionCents || undefined,
              bookingDate: booking.BookingDate?.split('T')[0] || undefined,
            })
            await delay(DELAY_MS)
          } catch (err) {
            console.error(`  WARN: pricing on activity ${matchedActivityId}: ${(err as Error).message}`)
          }
          // Set activity as approved and booked (canonical lifecycle fields)
          try {
            await apiPatch(`/activities/${matchedActivityId}`, {
              proposalStatus: 'approved',
              bookingStatus: 'booked',
            })
          } catch { /* ignore — status is not critical for import */ }
        } else if (matchedActivityId) {
          claimedActivities.add(matchedActivityId)
        }

        addMapping(ledger, {
          sourceType: 'booking',
          sourceId: booking.BookingID,
          tailfireId: matchedActivityId || '',
          status: matchedActivityId ? 'created' : 'error',
          data: {
            tripId,
            supplierName: booking.TourOperator?.TourOperatorName,
            priceCents,
            commissionCents,
          },
        })
      }

      // ── Step 8b: Per-traveler bookings ──
      // Build map of TES ClientID → Tailfire tripTravelerId from ledger
      const tripTravelerMap = new Map<number, { tailfireId: string; firstName: string; lastName: string }>()
      for (const m of ledger.mappings) {
        if (m.sourceType === 'tripTraveler' && m.status === 'created' && m.data?.tfTripId === tfTripId) {
          tripTravelerMap.set(Number(m.sourceId), {
            tailfireId: m.tailfireId,
            firstName: String(m.data?.firstName || ''),
            lastName: String(m.data?.lastName || ''),
          })
        }
      }

      if (tripTravelerMap.size > 0) {
        for (const booking of tripBookings) {
          const bookingStatus = booking.BookingStatus?.StatusName?.toLowerCase() || ''
          if (bookingStatus === 'cancelled') continue

          const bookingMapping = findMapping(ledger, 'booking', booking.BookingID)
          const matchedActivityId = bookingMapping?.tailfireId
          if (!matchedActivityId) continue

          const bookingNum = booking.BookingNumber || booking.Number || String(booking.BookingID)
          const priceCents = dollarsToCents(booking.PackagePrice)
          const commissionCents = dollarsToCents(booking.Commission?.Earned)
          const desc = (booking.Description || '').toLowerCase()

          // Match booking to traveler via name in description
          let matchedTravelerId: string | undefined
          for (const [clientId, traveler] of tripTravelerMap) {
            const lastName = traveler.lastName.toLowerCase()
            const firstName = traveler.firstName.toLowerCase()
            if (lastName && desc.includes(lastName)) {
              matchedTravelerId = traveler.tailfireId
              break
            }
            if (firstName && desc.includes(firstName)) {
              matchedTravelerId = traveler.tailfireId
              break
            }
          }

          // Fallback: if only one traveler, assign all bookings to them
          if (!matchedTravelerId && tripTravelerMap.size === 1) {
            matchedTravelerId = tripTravelerMap.values().next().value!.tailfireId
          }

          if (!matchedTravelerId) {
            console.warn(`  WARN: Could not match booking ${bookingNum} (desc="${booking.Description}") to a traveler`)
            continue
          }

          try {
            const tbResp = await apiPost<{ id: string }>(`/activities/${matchedActivityId}/traveler-bookings`, {
              tripTravelerId: matchedTravelerId,
              confirmationNumber: bookingNum,
              priceCents: priceCents || undefined,
              commissionCents: commissionCents || undefined,
              supplier: booking.TourOperator?.TourOperatorName || undefined,
              currency: 'CAD',
              bookingStatus: 'confirmed',
              externalBookingId: String(booking.BookingID),
              externalSystem: 'travelesolutions',
            })
            addMapping(ledger, {
              sourceType: 'travelerBooking',
              sourceId: booking.BookingID,
              tailfireId: tbResp.id,
              status: 'created',
              data: { activityId: matchedActivityId, tripTravelerId: matchedTravelerId },
            })
            await delay(DELAY_MS)
          } catch (err) {
            // Unique constraint violation = already exists, skip
            const msg = (err as Error).message
            if (msg.includes('409') || msg.includes('unique') || msg.includes('duplicate')) {
              console.log(`  SKIP: traveler booking already exists for booking ${bookingNum}`)
            } else {
              console.error(`  WARN: traveler booking for ${bookingNum}: ${msg}`)
            }
          }
        }
      }

      // ── Step 8c: Insurance entity creation ──
      if (insuranceMatches.length > 0) {
        // Fetch travelers for this trip (needed for traveler insurance records)
        let tripTravelers: Array<{ id: string }> = []
        try {
          // API returns TripTravelerResponseDto[] (array directly, not wrapped)
          tripTravelers = await apiGet<Array<{ id: string }>>(`/trips/${tfTripId}/travelers`)
        } catch (err) {
          console.error(`  WARN: could not fetch travelers for trip ${tfTripId}: ${(err as Error).message}`)
        }

        // Fetch existing traveler insurance records to handle upsert
        let existingTravelerInsurance: Array<{ id: string; tripTravelerId: string; status: string; selectedPackageId: string | null }> = []
        try {
          const tiResp = await apiGet<{ travelers: Array<{ id: string; tripTravelerId: string; status: string; selectedPackageId: string | null }> }>(`/trips/${tfTripId}/insurance/travelers`)
          existingTravelerInsurance = tiResp.travelers || []
        } catch (err) {
          // May 404 if no records exist yet — that's fine
        }

        for (const { booking, activityId, dayId } of insuranceMatches) {
          const bookingSourceId = `${tripId}-insurance-${booking.BookingID}`

          // Idempotency check — if package already created, reuse its ID but still process travelers
          const existingMapping = findMapping(ledger, 'insurancePackage', bookingSourceId)
          let insurancePkgId: string | null = existingMapping?.status === 'created' ? existingMapping.tailfireId : null

          try {
            if (!insurancePkgId) {
              // 1. PATCH activity type to 'insurance' (may have been created as 'tour' in Step 7)
              try {
                await apiPatch(`/activities/${activityId}`, { activityType: 'insurance' })
                await delay(DELAY_MS)
              } catch (err) {
                // May fail if already insurance type — that's ok
                const msg = (err as Error).message
                if (!msg.includes('already') && !msg.includes('insurance')) {
                  console.warn(`  WARN: PATCH activity type for ${activityId}: ${msg}`)
                }
              }

              // 2. Create trip_insurance_package linked to activity
              const providerName = booking.TourOperator?.TourOperatorName || 'Insurance Provider'
              const policyType = inferPolicyType(booking.Description)
              const premiumCents = Math.round((booking.PackagePrice || 0) * 100)

              try {
                const pkgResult = await apiPost<{ id: string }>(`/trips/${tfTripId}/insurance/packages`, {
                  activityId,
                  providerName,
                  packageName: booking.Description || `${providerName} - ${policyType}`,
                  policyType,
                  premiumCents,
                  coverageStartDate: booking.StartDate?.split('T')[0] || null,
                  coverageEndDate: booking.EndDate?.split('T')[0] || null,
                  currency: 'CAD',
                })
                insurancePkgId = pkgResult.id
              } catch (err) {
                // Handle conflict (409) — package may exist in DB but mapping was lost
                const msg = (err as Error).message
                if (msg.includes('409') || msg.includes('unique') || msg.includes('duplicate')) {
                  console.log(`  SKIP: insurance package already exists for activity ${activityId}, fetching existing...`)
                  try {
                    const existingPkgs = await apiGet<{ packages: Array<{ id: string; activityId: string | null }> }>(`/trips/${tfTripId}/insurance/packages`)
                    const match = existingPkgs.packages.find(p => p.activityId === activityId)
                    if (match) insurancePkgId = match.id
                  } catch { /* fallthrough — will be logged below */ }
                }
                if (!insurancePkgId) throw err
              }

              addMapping(ledger, {
                sourceType: 'insurancePackage',
                sourceId: bookingSourceId,
                tailfireId: insurancePkgId,
                status: 'created',
                data: { tripId, activityId, providerName: booking.TourOperator?.TourOperatorName || 'Insurance Provider', policyType: inferPolicyType(booking.Description) },
              })
              await delay(DELAY_MS)
            }

            // 3. Create trip_traveler_insurance records (upsert pattern)
            for (const traveler of tripTravelers) {
              const existing = existingTravelerInsurance.find(e => e.tripTravelerId === traveler.id)
              const tiSourceId = `${tripId}-ti-${booking.BookingID}-${traveler.id}`

              // Idempotency for traveler insurance
              const existingTiMapping = findMapping(ledger, 'travelerInsurance', tiSourceId)
              if (existingTiMapping && existingTiMapping.status === 'created') continue

              try {
                if (existing) {
                  // Traveler already has insurance record — update if currently pending
                  if (existing.status === 'pending') {
                    await apiPatch(`/trips/${tfTripId}/insurance/travelers/${existing.id}`, {
                      status: 'selected_package',
                      selectedPackageId: insurancePkgId,
                    })
                    // Update in-memory cache so subsequent bookings see updated status
                    existing.status = 'selected_package'
                    existing.selectedPackageId = insurancePkgId
                    addMapping(ledger, {
                      sourceType: 'travelerInsurance',
                      sourceId: tiSourceId,
                      tailfireId: existing.id,
                      status: 'created',
                      data: { tripId, travelerId: traveler.id, action: 'updated' },
                    })
                  } else {
                    // Already selected_package or declined — skip
                    addMapping(ledger, {
                      sourceType: 'travelerInsurance',
                      sourceId: tiSourceId,
                      tailfireId: existing.id,
                      status: 'skipped',
                      data: { tripId, travelerId: traveler.id, existingStatus: existing.status },
                    })
                  }
                } else {
                  // Create new traveler insurance record
                  const tiResult = await apiPost<{ id: string }>(`/trips/${tfTripId}/insurance/travelers`, {
                    tripTravelerId: traveler.id,
                    status: 'selected_package',
                    selectedPackageId: insurancePkgId,
                  })
                  addMapping(ledger, {
                    sourceType: 'travelerInsurance',
                    sourceId: tiSourceId,
                    tailfireId: tiResult.id,
                    status: 'created',
                    data: { tripId, travelerId: traveler.id },
                  })
                  // Add to existing list for subsequent insurance bookings on same trip
                  existingTravelerInsurance.push({
                    id: tiResult.id,
                    tripTravelerId: traveler.id,
                    status: 'selected_package',
                    selectedPackageId: insurancePkgId,
                  })
                }
                await delay(DELAY_MS)
              } catch (err) {
                const msg = (err as Error).message
                if (msg.includes('409') || msg.includes('unique') || msg.includes('duplicate')) {
                  addMapping(ledger, {
                    sourceType: 'travelerInsurance',
                    sourceId: tiSourceId,
                    tailfireId: '',
                    status: 'skipped',
                    data: { tripId, travelerId: traveler.id, reason: 'duplicate' },
                  })
                } else {
                  console.error(`  WARN: traveler insurance for ${traveler.id}: ${msg}`)
                  addMapping(ledger, {
                    sourceType: 'travelerInsurance',
                    sourceId: tiSourceId,
                    tailfireId: '',
                    status: 'error',
                    error: msg,
                  })
                }
              }
            }
          } catch (err) {
            console.error(`  ERROR insurance package for booking ${booking.BookingID}: ${(err as Error).message}`)
            addMapping(ledger, {
              sourceType: 'insurancePackage',
              sourceId: bookingSourceId,
              tailfireId: '',
              status: 'error',
              error: (err as Error).message,
            })
          }
        }

        if (insuranceMatches.length > 0) {
          console.log(`  Insurance: ${insuranceMatches.length} bookings → packages + traveler records`)
        }
        saveLedger(ledger)
      }

      // ── Step 9: Cancel trips that were cancelled in TES ──
      // Non-cancelled trips stay as 'planning' — the lifecycle backfill
      // endpoint (called after all trips are imported) handles promotion
      // to active/travelling/travelled based on booking state and dates.
      if (statusMap.final === 'cancelled' && !DRY_RUN) {
        try {
          await apiPost(`/trips/${tfTripId}/cancel`, { reason: 'Imported as cancelled from TraveleSolutions' })
          await delay(DELAY_MS)
        } catch (err) {
          console.error(`  WARN: cancel trip ${tripId}: ${(err as Error).message}`)
        }
      }

      if ((i + 1) % 25 === 0 || i === trips.length - 1) {
        console.log(`  Progress: ${i + 1}/${trips.length} trips`)
        saveLedger(ledger)
      }
    } catch (err) {
      addMapping(ledger, { sourceType: 'trip', sourceId: tripId, tailfireId: '', status: 'error', error: (err as Error).message })
      console.error(`  ERROR trip ${tripId}: ${(err as Error).message}`)
    }
  }

  validateStepCompleteness(ledger, 'trips', 'trip', tripCount)
  saveLedger(ledger)
  console.log(`  Trips: ${ledger.stats.trip?.created || 0} created, ${ledger.stats.trip?.errors || 0} errors`)
  console.log(`  Activities: ${ledger.stats.activity?.created || 0} created, ${ledger.stats.activity?.errors || 0} errors`)
  console.log(`  Bookings: ${ledger.stats.booking?.created || 0} mapped, ${ledger.stats.booking?.errors || 0} unmatched`)
}

// ─── Step 8c-retrofit: Insurance entities for already-imported trips ──────────

async function retrofitInsurance(ledger: Ledger): Promise<void> {
  const bookingsRaw = readFileSync(join(DATA_DIR, 'bookings.json'), 'utf-8')
  const bookings: TSBooking[] = JSON.parse(bookingsRaw)

  // Find insurance bookings that are already mapped but lack insurance entities
  const insuranceBookings = bookings.filter(b =>
    isInsuranceOperator(b.TourOperator?.TourOperatorName)
  )

  console.log(`  Insurance bookings in data: ${insuranceBookings.length}`)

  // Group by trip
  const byTrip = new Map<number, typeof insuranceBookings>()
  for (const b of insuranceBookings) {
    const group = byTrip.get(b.TripID) || []
    group.push(b)
    byTrip.set(b.TripID, group)
  }

  let pkgsCreated = 0, travelersCreated = 0, travelersUpdated = 0, skipped = 0

  for (const [tripId, tripInsuranceBookings] of byTrip) {
    const tripMapping = findMapping(ledger, 'trip', tripId)
    if (!tripMapping?.tailfireId) {
      console.log(`  SKIP trip ${tripId}: not imported yet`)
      skipped += tripInsuranceBookings.length
      continue
    }
    const tfTripId = tripMapping.tailfireId

    // Build insuranceMatches from booking mappings
    const insuranceMatches: Array<{ booking: TSBooking; activityId: string; dayId: string }> = []
    for (const booking of tripInsuranceBookings) {
      const bookingMapping = findMapping(ledger, 'booking', booking.BookingID)
      if (bookingMapping?.tailfireId) {
        insuranceMatches.push({ booking, activityId: bookingMapping.tailfireId, dayId: '' })
      } else {
        console.log(`  SKIP booking ${booking.BookingID}: no activity mapping`)
        skipped++
      }
    }

    if (insuranceMatches.length === 0) continue

    // Fetch travelers for this trip
    let tripTravelers: Array<{ id: string }> = []
    try {
      tripTravelers = await apiGet<Array<{ id: string }>>(`/trips/${tfTripId}/travelers`)
    } catch (err) {
      console.error(`  WARN: could not fetch travelers for trip ${tfTripId}: ${(err as Error).message}`)
    }

    // Fetch existing traveler insurance records
    let existingTravelerInsurance: Array<{ id: string; tripTravelerId: string; status: string; selectedPackageId: string | null }> = []
    try {
      const tiResp = await apiGet<{ travelers: Array<{ id: string; tripTravelerId: string; status: string; selectedPackageId: string | null }> }>(`/trips/${tfTripId}/insurance/travelers`)
      existingTravelerInsurance = tiResp.travelers || []
    } catch (err) {
      // May 404 if no records — fine
    }

    for (const { booking, activityId } of insuranceMatches) {
      const bookingSourceId = `${tripId}-insurance-${booking.BookingID}`

      // Idempotency — if package already created, reuse ID but still process travelers
      const existingPkgMapping = findMapping(ledger, 'insurancePackage', bookingSourceId)
      let insurancePkgId: string | null = existingPkgMapping?.status === 'created' ? existingPkgMapping.tailfireId : null

      try {
        if (!insurancePkgId) {
          // 1. PATCH activity type to 'insurance'
          try {
            await apiPatch(`/activities/${activityId}`, { activityType: 'insurance' })
            await delay(DELAY_MS)
          } catch (err) {
            const msg = (err as Error).message
            if (!msg.includes('already') && !msg.includes('insurance')) {
              console.warn(`  WARN: PATCH activity type for ${activityId}: ${msg}`)
            }
          }

          // 2. Create trip_insurance_package
          const providerName = booking.TourOperator?.TourOperatorName || 'Insurance Provider'
          const policyType = inferPolicyType(booking.Description)
          const premiumCents = Math.round((booking.PackagePrice || 0) * 100)

          try {
            const pkgResult = await apiPost<{ id: string }>(`/trips/${tfTripId}/insurance/packages`, {
              activityId,
              providerName,
              packageName: booking.Description || `${providerName} - ${policyType}`,
              policyType,
              premiumCents,
              coverageStartDate: booking.StartDate?.split('T')[0] || null,
              coverageEndDate: booking.EndDate?.split('T')[0] || null,
              currency: 'CAD',
            })
            insurancePkgId = pkgResult.id
          } catch (err) {
            const msg = (err as Error).message
            // Activity already linked to another package (unique index) — retry without activityId
            if (msg.includes('409') || msg.includes('unique') || msg.includes('duplicate') || msg.includes('500')) {
              console.log(`  Activity ${activityId} already linked to a package — creating unlinked package for booking ${booking.BookingID}`)
              try {
                const pkgResult2 = await apiPost<{ id: string }>(`/trips/${tfTripId}/insurance/packages`, {
                  providerName,
                  packageName: booking.Description || `${providerName} - ${policyType}`,
                  policyType,
                  premiumCents,
                  coverageStartDate: booking.StartDate?.split('T')[0] || null,
                  coverageEndDate: booking.EndDate?.split('T')[0] || null,
                  currency: 'CAD',
                })
                insurancePkgId = pkgResult2.id
              } catch (err2) {
                console.error(`  ERROR creating unlinked package: ${(err2 as Error).message}`)
              }
            }
            if (!insurancePkgId) throw err
          }

          addMapping(ledger, {
            sourceType: 'insurancePackage',
            sourceId: bookingSourceId,
            tailfireId: insurancePkgId,
            status: 'created',
            data: { tripId, activityId: insurancePkgId ? activityId : null, providerName, policyType },
          })
          pkgsCreated++
          await delay(DELAY_MS)
        }

        // 3. Create trip_traveler_insurance records (upsert pattern)
        for (const traveler of tripTravelers) {
          const existing = existingTravelerInsurance.find(e => e.tripTravelerId === traveler.id)
          const tiSourceId = `${tripId}-ti-${booking.BookingID}-${traveler.id}`

          const existingTiMapping = findMapping(ledger, 'travelerInsurance', tiSourceId)
          if (existingTiMapping && existingTiMapping.status === 'created') continue

          try {
            if (existing) {
              if (existing.status === 'pending') {
                await apiPatch(`/trips/${tfTripId}/insurance/travelers/${existing.id}`, {
                  status: 'selected_package',
                  selectedPackageId: insurancePkgId,
                })
                existing.status = 'selected_package'
                existing.selectedPackageId = insurancePkgId
                addMapping(ledger, {
                  sourceType: 'travelerInsurance',
                  sourceId: tiSourceId,
                  tailfireId: existing.id,
                  status: 'created',
                  data: { tripId, travelerId: traveler.id, action: 'updated' },
                })
                travelersUpdated++
              } else {
                addMapping(ledger, {
                  sourceType: 'travelerInsurance',
                  sourceId: tiSourceId,
                  tailfireId: existing.id,
                  status: 'skipped',
                  data: { tripId, travelerId: traveler.id, existingStatus: existing.status },
                })
              }
            } else {
              const tiResult = await apiPost<{ id: string }>(`/trips/${tfTripId}/insurance/travelers`, {
                tripTravelerId: traveler.id,
                status: 'selected_package',
                selectedPackageId: insurancePkgId,
              })
              addMapping(ledger, {
                sourceType: 'travelerInsurance',
                sourceId: tiSourceId,
                tailfireId: tiResult.id,
                status: 'created',
                data: { tripId, travelerId: traveler.id },
              })
              existingTravelerInsurance.push({
                id: tiResult.id,
                tripTravelerId: traveler.id,
                status: 'selected_package',
                selectedPackageId: insurancePkgId,
              })
              travelersCreated++
            }
            await delay(DELAY_MS)
          } catch (err) {
            const msg = (err as Error).message
            if (msg.includes('409') || msg.includes('unique') || msg.includes('duplicate')) {
              addMapping(ledger, {
                sourceType: 'travelerInsurance',
                sourceId: tiSourceId,
                tailfireId: '',
                status: 'skipped',
                data: { tripId, travelerId: traveler.id, reason: 'duplicate' },
              })
            } else {
              console.error(`  WARN: traveler insurance for ${traveler.id}: ${msg}`)
            }
          }
        }
      } catch (err) {
        console.error(`  ERROR insurance package for booking ${booking.BookingID}: ${(err as Error).message}`)
        addMapping(ledger, {
          sourceType: 'insurancePackage',
          sourceId: bookingSourceId,
          tailfireId: '',
          status: 'error',
          error: (err as Error).message,
        })
      }
    }

    saveLedger(ledger)
  }

  console.log(`  Insurance retrofit: ${pkgsCreated} packages, ${travelersCreated} traveler records created, ${travelersUpdated} updated, ${skipped} skipped`)
}

// ─── Step 10: Supplier Links ──────────────────────────────────────────────────

async function importSupplierLinks(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('supplierLinks') && RESUME) {
    console.log('  Supplier Links: skipped (completed)')
    return
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('  Supplier Links: skipped (no SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)')
    return
  }

  console.log('\n── Step 10: Linking Suppliers to Activities ──')

  // Build supplier ID map: TeS TourOperatorID → Tailfire supplier UUID
  const supplierMap = new Map<string, string>()
  for (const m of ledger.mappings) {
    if (m.sourceType === 'supplier' && m.status === 'created') {
      supplierMap.set(String(m.sourceId), m.tailfireId)
    }
  }

  // Collect activity → supplier pairs from booking mappings
  // The booking's TourOperator.TourOperatorID matches the supplier import's sourceId
  const bookings = loadJson<TSBooking[]>('bookings.json')
  const bookingTourOpMap = new Map<number, number>() // BookingID → TourOperatorID
  for (const b of bookings) {
    if (b.TourOperator?.TourOperatorID) {
      bookingTourOpMap.set(b.BookingID, b.TourOperator.TourOperatorID)
    }
  }

  const links: Array<{ activity_id: string; supplier_id: string; primary_supplier: boolean }> = []
  const seen = new Set<string>() // Prevent duplicate activity-supplier pairs
  for (const m of ledger.mappings) {
    if (m.sourceType === 'booking' && m.status === 'created' && m.tailfireId) {
      const tourOpId = bookingTourOpMap.get(m.sourceId as number)
      if (!tourOpId) continue
      const tfSupplierId = supplierMap.get(String(tourOpId))
      if (!tfSupplierId) continue
      const key = `${m.tailfireId}:${tfSupplierId}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ activity_id: m.tailfireId, supplier_id: tfSupplierId, primary_supplier: true })
    }
  }

  if (links.length === 0) {
    console.log('  No activity-supplier links to create')
    ledger.completedSteps.push('supplierLinks')
    saveLedger(ledger)
    return
  }

  console.log(`  Found ${links.length} activity-supplier links to create`)

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would insert ${links.length} activity_suppliers rows`)
    ledger.completedSteps.push('supplierLinks')
    saveLedger(ledger)
    return
  }

  let inserted = 0

  // Batch insert via Supabase PostgREST in chunks of 100
  const BATCH_SIZE = 100
  for (let i = 0; i < links.length; i += BATCH_SIZE) {
    const batch = links.slice(i, i + BATCH_SIZE)

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/activity_suppliers`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(batch),
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`PostgREST insert failed (${resp.status}): ${text.substring(0, 500)}`)
    }

    inserted += batch.length

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= links.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, links.length)}/${links.length} processed`)
    }
  }

  ledger.completedSteps.push('supplierLinks')
  saveLedger(ledger)
  console.log(`  Supplier Links: ${inserted} inserted`)
}

// ─── Step 11: Commission Tracking ─────────────────────────────────────────────

async function importCommissionTracking(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('commission') && RESUME) {
    console.log('  Commission: skipped (completed)')
    return
  }

  console.log('\n── Step 11: Importing Commission Tracking ──')
  const bookings = loadJson<TSBooking[]>('bookings.json')

  // In-memory cache: activityId → activityPricingId (avoids redundant GETs)
  const activityPricingCache: Map<string, string> = new Map()

  // Rebuild cache from ledger (supports resume)
  for (const m of ledger.mappings) {
    if (m.sourceType === 'activityPricing' && m.status === 'created') {
      activityPricingCache.set(m.data?.activityId as string, m.tailfireId)
    }
  }

  let created = 0
  let skipped = 0
  let errors = 0

  // Phase A: Resolve activityPricingId for each booking and store in ledger
  // Phase B: Aggregate commission per activityPricingId (avoids upsert overwrite for multi-booking)

  interface CommAccum {
    earnedCents: number; receivedCents: number; paidCents: number
    adjustmentCents: number; receivedParentCents: number
    rate: number; rateCount: number // for simple average
    sourceBookingRefs: string[]
    bookingIds: number[]
  }
  const commByPricingId: Map<string, CommAccum> = new Map()

  for (let i = 0; i < bookings.length; i++) {
    const booking = bookings[i]
    const existing = findMapping(ledger, 'commission', booking.BookingID)
    if (existing && existing.status !== 'error') { skipped++; continue }
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    // Get activityId from booking mapping (set in Step 8)
    const bookingMapping = findMapping(ledger, 'booking', booking.BookingID)
    if (!bookingMapping?.tailfireId) {
      addMapping(ledger, { sourceType: 'commission', sourceId: booking.BookingID, tailfireId: '', status: 'skipped' })
      skipped++
      continue
    }

    const activityId = bookingMapping.tailfireId

    try {
      // Get activityPricingId (from cache or API)
      let activityPricingId = activityPricingCache.get(activityId)
      if (!activityPricingId) {
        const activity = await apiGet<{ activityPricingId?: string | null }>(`/activities/${activityId}`)
        activityPricingId = activity.activityPricingId || undefined
        if (activityPricingId) {
          activityPricingCache.set(activityId, activityPricingId)
        }
        await delay(DELAY_MS)
      }

      if (!activityPricingId) {
        addMapping(ledger, { sourceType: 'commission', sourceId: booking.BookingID, tailfireId: '', status: 'skipped' })
        skipped++
        continue
      }

      // Store activityPricing mapping for Steps 12-13 (if not already stored)
      if (!findMapping(ledger, 'activityPricing', booking.BookingID)) {
        addMapping(ledger, {
          sourceType: 'activityPricing',
          sourceId: booking.BookingID,
          tailfireId: activityPricingId,
          status: 'created',
          data: { activityId },
        })
      }

      const commission = booking.Commission
      if (!commission || commission.Earned <= 0) {
        addMapping(ledger, { sourceType: 'commission', sourceId: booking.BookingID, tailfireId: activityPricingId, status: 'skipped' })
        skipped++
        continue
      }

      // Accumulate commission per activityPricingId
      const prev = commByPricingId.get(activityPricingId) || {
        earnedCents: 0, receivedCents: 0, paidCents: 0,
        adjustmentCents: 0, receivedParentCents: 0,
        rate: 0, rateCount: 0,
        sourceBookingRefs: [], bookingIds: [],
      }
      prev.earnedCents += dollarsToCents(commission.Earned) || 0
      prev.receivedCents += dollarsToCents(commission.TotalReceived) || 0
      prev.paidCents += dollarsToCents(commission.Paid) || 0
      prev.adjustmentCents += dollarsToCents(commission.Adjustment) || 0
      prev.receivedParentCents += dollarsToCents(commission.ReceivedParent) || 0
      if (commission.Rate > 0) { prev.rate += commission.Rate; prev.rateCount++ }
      prev.sourceBookingRefs.push(String(booking.BookingID))
      prev.bookingIds.push(booking.BookingID)
      commByPricingId.set(activityPricingId, prev)
    } catch (err) {
      addMapping(ledger, { sourceType: 'commission', sourceId: booking.BookingID, tailfireId: '', status: 'error', error: (err as Error).message })
      console.error(`  ERROR commission booking ${booking.BookingID}: ${(err as Error).message}`)
      errors++
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  Resolving: ${i + 1}/${bookings.length}`)
    }
  }

  // Phase B: POST/PATCH aggregated commission per activityPricingId
  console.log(`  ${commByPricingId.size} activity pricings with commission to import`)
  let commIdx = 0
  for (const [activityPricingId, accum] of commByPricingId) {
    commIdx++
    try {
      const commBody: Record<string, unknown> = {
        grossCommissionCents: accum.earnedCents,
        source: 'travelesolutions',
        sourceBookingRef: accum.sourceBookingRefs.join(', '),
      }
      if (accum.rateCount > 0) {
        commBody.commissionRate = accum.rate / accum.rateCount // simple average
      }

      await apiPost(`/activities/${activityPricingId}/commission`, commBody)
      await delay(DELAY_MS)

      // PATCH with received amounts if any
      if (accum.receivedCents > 0) {
        const patchBody: Record<string, unknown> = {
          receivedCents: accum.receivedCents,
          commissionStatus: 'received',
        }
        if (accum.paidCents > 0) patchBody.paidCents = accum.paidCents
        if (accum.adjustmentCents !== 0) patchBody.adjustmentCents = accum.adjustmentCents
        if (accum.receivedParentCents > 0) patchBody.receivedParentCents = accum.receivedParentCents

        await apiPatch(`/activities/${activityPricingId}/commission`, patchBody)
        await delay(DELAY_MS)
      }

      // Mark all bookings in this group as created
      for (const bookingId of accum.bookingIds) {
        addMapping(ledger, { sourceType: 'commission', sourceId: bookingId, tailfireId: activityPricingId, status: 'created' })
        created++
      }
    } catch (err) {
      for (const bookingId of accum.bookingIds) {
        addMapping(ledger, { sourceType: 'commission', sourceId: bookingId, tailfireId: '', status: 'error', error: (err as Error).message })
        errors++
      }
      console.error(`  ERROR commission pricing ${activityPricingId}: ${(err as Error).message}`)
    }

    if (commIdx % 25 === 0) {
      console.log(`  Progress: ${commIdx}/${commByPricingId.size}`)
      saveLedger(ledger)
    }
  }

  validateStepCompleteness(ledger, 'commission', 'commission', bookings.length)
  saveLedger(ledger)
  console.log(`  Commission: ${created} created, ${skipped} skipped, ${errors} errors`)
}

// ─── Step 12: Payment Schedules ───────────────────────────────────────────────

async function importPaymentSchedules(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('paymentSchedules') && RESUME) {
    console.log('  Payment Schedules: skipped (completed)')
    return
  }

  console.log('\n── Step 12: Importing Payment Schedules ──')
  const bookings = loadJson<TSBooking[]>('bookings.json')
  const trips = loadJson<TSTrip[]>('trips.json')

  // Build cancelled trip set for filtering
  const cancelledTripIds = new Set<number>()
  for (const t of trips) {
    if (t.TripStatus?.StatusName === 'Cancelled') {
      cancelledTripIds.add(t.TripID)
    }
  }

  // Track which activityPricingIds already have a schedule (one schedule per pricing enforced by API)
  const scheduleByPricingId: Map<string, string> = new Map() // activityPricingId → configId

  // Rebuild from ledger (supports resume)
  for (const m of ledger.mappings) {
    if (m.sourceType === 'paymentSchedule' && m.status === 'created' && m.data?.activityPricingId && m.data?.configId) {
      scheduleByPricingId.set(m.data.activityPricingId as string, m.data.configId as string)
    }
  }

  let created = 0
  let skipped = 0
  let errors = 0

  // Pre-group eligible bookings by activityPricingId so we can create
  // schedules with ALL items at once (API validates sum(items) == totalPriceCents on create)
  const bookingsByPricingId: Map<string, TSBooking[]> = new Map()
  const skippedBookingIds: Set<number> = new Set()

  for (const booking of bookings) {
    const existing = findMapping(ledger, 'paymentSchedule', booking.BookingID)
    if (existing && existing.status !== 'error') { skipped++; skippedBookingIds.add(booking.BookingID); continue }
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    // Skip cancelled bookings/trips
    if (booking.BookingStatus?.StatusName === 'Cancelled' || cancelledTripIds.has(booking.TripID)) {
      addMapping(ledger, { sourceType: 'paymentSchedule', sourceId: booking.BookingID, tailfireId: '', status: 'skipped' })
      skipped++; skippedBookingIds.add(booking.BookingID)
      continue
    }

    const priceCents = dollarsToCents(booking.PackagePrice)
    if (!priceCents || priceCents <= 0) {
      addMapping(ledger, { sourceType: 'paymentSchedule', sourceId: booking.BookingID, tailfireId: '', status: 'skipped' })
      skipped++; skippedBookingIds.add(booking.BookingID)
      continue
    }

    let pricingMapping = findMapping(ledger, 'activityPricing', booking.BookingID)

    // If Step 11 didn't create the activityPricing mapping (e.g. commission step was skipped),
    // resolve it directly from the activity API — same approach as Step 11 Phase A.
    if (!pricingMapping?.tailfireId) {
      const bookingMapping = findMapping(ledger, 'booking', booking.BookingID)
      if (bookingMapping?.tailfireId) {
        try {
          const activity = await apiGet<{ activityPricingId?: string | null }>(`/activities/${bookingMapping.tailfireId}`)
          const apid = activity?.activityPricingId
          if (apid) {
            addMapping(ledger, {
              sourceType: 'activityPricing',
              sourceId: booking.BookingID,
              tailfireId: apid,
              status: 'created',
              data: { activityId: bookingMapping.tailfireId },
            })
            pricingMapping = findMapping(ledger, 'activityPricing', booking.BookingID)
            await delay(DELAY_MS)
          }
        } catch { /* ignore — will skip below */ }
      }
    }

    if (!pricingMapping?.tailfireId) {
      addMapping(ledger, { sourceType: 'paymentSchedule', sourceId: booking.BookingID, tailfireId: '', status: 'skipped' })
      skipped++; skippedBookingIds.add(booking.BookingID)
      continue
    }

    const activityPricingId = pricingMapping.tailfireId
    const group = bookingsByPricingId.get(activityPricingId) || []
    group.push(booking)
    bookingsByPricingId.set(activityPricingId, group)
  }

  console.log(`  ${bookingsByPricingId.size} unique activity pricings to process (${skipped} bookings skipped)`)

  // Create one schedule per activityPricingId with ALL items at once
  let groupIdx = 0
  for (const [activityPricingId, groupBookings] of bookingsByPricingId) {
    groupIdx++

    // Skip if schedule already exists (resume support)
    const existingConfigId = scheduleByPricingId.get(activityPricingId)
    if (existingConfigId) {
      // Schedule exists — just need to add any missing items for new bookings
      for (const booking of groupBookings) {
        const netCents = dollarsToCents(booking.PackagePrice) || 0
        const commCents = dollarsToCents(booking.Commission?.Earned) || 0
        const grossCents = netCents // PackagePrice is gross (commission is included, not additive)
        const dueDate = booking.FinalPaymentDate?.split('T')[0] || null
        try {
          const itemResult = await apiPost<{ id: string }>(`/payment-schedules/${existingConfigId}/expected-payment-items`, {
            paymentName: groupBookings.length > 1 ? `Payment - Booking ${booking.BookingID}` : 'Full Payment',
            expectedAmountCents: grossCents,
            dueDate,
            sequenceOrder: groupBookings.indexOf(booking),
          })
          addMapping(ledger, { sourceType: 'paymentSchedule', sourceId: booking.BookingID, tailfireId: itemResult.id, status: 'created', data: { configId: existingConfigId, activityPricingId } })
          created++
          await delay(DELAY_MS)
        } catch (err) {
          addMapping(ledger, { sourceType: 'paymentSchedule', sourceId: booking.BookingID, tailfireId: '', status: 'error', error: (err as Error).message, data: { activityPricingId } })
          console.error(`  ERROR adding payment item booking ${booking.BookingID}: ${(err as Error).message}`)
          errors++
        }
      }
      continue
    }

    try {
      // Fetch actual pricing total from API to ensure items sum correctly
      let pricingTotalCents: number | null = null
      try {
        // Look up the activity ID from ledger to fetch pricing total
        const pricingMap = ledger.mappings.find(m => m.sourceType === 'activityPricing' && m.tailfireId === activityPricingId)
        const actId = pricingMap?.data?.activityId as string | undefined
        if (actId) {
          const activity = await apiGet<{ pricing?: { totalPriceCents?: number } }>(`/activities/${actId}`)
          pricingTotalCents = activity?.pricing?.totalPriceCents ?? null
        }
      } catch { /* ignore — will use booking prices */ }

      // Build ALL expected payment items for this activity in one create call
      // Use PackagePrice (gross/selling price) for expected amounts to match totalPriceCents
      const rawItems = groupBookings.map((booking, idx) => {
        const netCents = dollarsToCents(booking.PackagePrice) || 0
        return {
          paymentName: groupBookings.length > 1 ? `Payment - Booking ${booking.BookingID}` : 'Full Payment',
          expectedAmountCents: netCents,
          dueDate: booking.FinalPaymentDate?.split('T')[0] || null,
          sequenceOrder: idx,
        }
      })

      // Adjust amounts if they don't sum to pricing total (package pricing edge case)
      const rawSum = rawItems.reduce((s, i) => s + i.expectedAmountCents, 0)
      let items = rawItems
      if (pricingTotalCents && rawSum !== pricingTotalCents) {
        if (rawItems.length === 1) {
          // Single item — just use the pricing total
          items = [{ ...rawItems[0], expectedAmountCents: pricingTotalCents }]
        } else {
          // Multiple items — scale proportionally and adjust rounding on last item
          const scale = pricingTotalCents / rawSum
          items = rawItems.map((item, idx) => ({
            ...item,
            expectedAmountCents: idx < rawItems.length - 1
              ? Math.round(item.expectedAmountCents * scale)
              : 0, // placeholder
          }))
          const allocated = items.slice(0, -1).reduce((s, i) => s + i.expectedAmountCents, 0)
          items[items.length - 1].expectedAmountCents = pricingTotalCents - allocated
        }
      }

      let configId: string | undefined
      let returnedItems: Array<{ id: string }> = []

      try {
        const result = await apiPost<{ id: string; expectedPaymentItems?: Array<{ id: string }> }>('/payment-schedules', {
          activityPricingId,
          scheduleType: groupBookings.length > 1 ? 'installments' : 'full',
          expectedPaymentItems: items,
        })
        configId = result.id
        returnedItems = result.expectedPaymentItems || []
      } catch (schedErr) {
        // If schedule already exists (e.g. auto-created by package), fetch existing and add items individually
        const msg = (schedErr as Error).message || ''
        if (msg.includes('already exists') || msg.includes('conflict') || msg.includes('409')) {
          console.log(`  Payment schedule already exists for activityPricingId ${activityPricingId}, fetching existing...`)
          const existing = await apiGet<{ id: string } | null>(`/payment-schedules/activity-pricing/${activityPricingId}`)
          configId = existing?.id
          if (configId) {
            // Add items individually to existing schedule
            for (const item of items) {
              try {
                const itemResult = await apiPost<{ id: string }>(`/payment-schedules/${configId}/expected-payment-items`, item)
                returnedItems.push(itemResult)
                await delay(DELAY_MS)
              } catch (itemErr) {
                console.error(`  WARN: adding item to existing schedule ${configId}: ${(itemErr as Error).message}`)
                returnedItems.push({ id: '' })
              }
            }
          }
        } else {
          throw schedErr
        }
      }

      if (configId) scheduleByPricingId.set(activityPricingId, configId)

      for (let j = 0; j < groupBookings.length; j++) {
        const booking = groupBookings[j]
        const itemId = returnedItems[j]?.id || ''
        addMapping(ledger, {
          sourceType: 'paymentSchedule',
          sourceId: booking.BookingID,
          tailfireId: itemId,
          status: itemId ? 'created' : 'error',
          data: { configId, activityPricingId },
          error: itemId ? undefined : 'No expectedPaymentItemId returned',
        })
        if (itemId) created++
        else errors++
      }
      await delay(DELAY_MS)
    } catch (err) {
      for (const booking of groupBookings) {
        addMapping(ledger, { sourceType: 'paymentSchedule', sourceId: booking.BookingID, tailfireId: '', status: 'error', error: (err as Error).message, data: { activityPricingId } })
        errors++
      }
      console.error(`  ERROR payment schedule for pricing ${activityPricingId}: ${(err as Error).message}`)
    }

    if (groupIdx % 25 === 0) {
      console.log(`  Progress: ${groupIdx}/${bookingsByPricingId.size} pricings`)
      saveLedger(ledger)
    }
  }

  validateStepCompleteness(ledger, 'paymentSchedules', 'paymentSchedule', bookings.length)
  saveLedger(ledger)
  console.log(`  Payment Schedules: ${created} created, ${skipped} skipped, ${errors} errors`)
}

// ─── Step 13: Payment Transactions ────────────────────────────────────────────

async function importPaymentTransactions(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('paymentTransactions') && RESUME) {
    console.log('  Payment Transactions: skipped (completed)')
    return
  }

  console.log('\n── Step 13: Importing Payment Transactions ──')
  const paymentTrips = loadJson<TSPaymentTrip[]>('payments.json')
  const tripsForTx = loadJson<TSTrip[]>('trips.json')

  // Build cancelled trip set for filtering
  const cancelledTripIdsForTx = new Set<number>()
  for (const t of tripsForTx) {
    if (t.TripStatus?.StatusName === 'Cancelled') {
      cancelledTripIdsForTx.add(t.TripID)
    }
  }

  // Build cancelled booking set for filtering
  const cancelledBookingIds = new Set<number>()
  const bookingsForTx = loadJson<TSBooking[]>('bookings.json')
  for (const b of bookingsForTx) {
    if (b.BookingStatus?.StatusName === 'Cancelled') {
      cancelledBookingIds.add(b.BookingID)
    }
  }

  // Rebuild expectedPaymentItemId lookup from ledger
  const paymentItemCache: Map<number, string> = new Map()
  const skippedScheduleBookings: Set<number> = new Set()
  for (const m of ledger.mappings) {
    if (m.sourceType === 'paymentSchedule' && m.status === 'created' && m.tailfireId) {
      paymentItemCache.set(Number(m.sourceId), m.tailfireId)
    }
    if (m.sourceType === 'paymentSchedule' && m.status === 'skipped') {
      skippedScheduleBookings.add(Number(m.sourceId))
    }
  }

  let created = 0
  let skipped = 0
  let errors = 0
  let totalProcessed = 0

  for (const tripEntry of paymentTrips) {
    // Skip cancelled trips entirely
    if (cancelledTripIdsForTx.has(tripEntry.tripId)) continue

    for (const bookingEntry of tripEntry.payments.Item2) {
      // Skip cancelled bookings
      if (cancelledBookingIds.has(bookingEntry.BookingID)) continue

      const payments = bookingEntry.PaymentsAndItemizations?.Payments || []

      for (const payment of payments) {
        totalProcessed++
        const paymentId = payment.BookingPaymentID

        // Skip payments for cancelled bookings
        if (cancelledBookingIds.has(payment.BookingID)) {
          skipped++
          continue
        }

        const existing = findMapping(ledger, 'paymentTransaction', paymentId)
        if (existing && existing.status !== 'error') { skipped++; continue }
        if (existing && existing.status === 'error') {
          const idx = ledger.mappings.indexOf(existing)
          if (idx >= 0) ledger.mappings.splice(idx, 1)
        }

        // Look up expectedPaymentItemId from Step 12
        const expectedPaymentItemId = paymentItemCache.get(payment.BookingID)
        if (!expectedPaymentItemId) {
          // If the booking's payment schedule was skipped (cancelled/zero-price), skip the transaction too
          if (skippedScheduleBookings.has(payment.BookingID)) {
            addMapping(ledger, { sourceType: 'paymentTransaction', sourceId: paymentId, tailfireId: '', status: 'skipped' })
            skipped++
            continue
          }
          // Otherwise mark as error so it can be retried if Step 12 is re-run
          addMapping(ledger, { sourceType: 'paymentTransaction', sourceId: paymentId, tailfireId: '', status: 'error', error: 'Missing expectedPaymentItemId for BookingID ' + payment.BookingID })
          errors++
          continue
        }

        // Optionally resolve client contact
        let contactId: string | null = null
        const clientId = payment.Client?.ClientID?.ID
        if (clientId) {
          const contactMapping = findMapping(ledger, 'contact', clientId)
          if (contactMapping?.tailfireId) {
            contactId = contactMapping.tailfireId
          }
        }

        try {
          const typeName = payment.BookingPaymentType?.Name || 'Payment'

          // Handle negative amounts as refunds (API rejects negative amountCents)
          const isNegative = payment.Amount < 0
          const transactionType = isNegative ? 'refund' : 'payment'
          const amountCents = Math.round(Math.abs(payment.Amount) * 100)

          const result = await apiPost<{ id: string }>('/payment-schedules/transactions', {
            expectedPaymentItemId,
            transactionType,
            amountCents,
            currency: 'CAD',
            transactionDate: payment.PaymentDate,
            notes: `TeS BookingPaymentID: ${paymentId}. Type: ${typeName}`,
            contactId,
          })

          addMapping(ledger, { sourceType: 'paymentTransaction', sourceId: paymentId, tailfireId: result.id, status: 'created' })
          created++
          await delay(DELAY_MS)
        } catch (err) {
          addMapping(ledger, { sourceType: 'paymentTransaction', sourceId: paymentId, tailfireId: '', status: 'error', error: (err as Error).message })
          console.error(`  ERROR payment transaction ${paymentId}: ${(err as Error).message}`)
          errors++
        }

        if (totalProcessed % 25 === 0) {
          console.log(`  Progress: ${totalProcessed} payments processed`)
          saveLedger(ledger)
        }
      }
    }
  }

  // Fallback: For bookings that have a payment schedule (from Step 12) but NO
  // payment transactions from payments.json, create a single "fully paid" transaction
  // using the booking's PackagePrice. This handles stale/empty TES payment extractions.
  const bookingsWithTxIds = new Set<number>()
  for (const tripEntry of paymentTrips) {
    for (const be of tripEntry.payments.Item2) {
      const payments = be.PaymentsAndItemizations?.Payments || []
      for (const p of payments) {
        bookingsWithTxIds.add(p.BookingID)
      }
    }
  }

  let fallbackCreated = 0
  for (const [bookingId, epiId] of paymentItemCache) {
    // Skip bookings that already have transactions from payments.json
    if (bookingsWithTxIds.has(bookingId)) continue
    // Skip if we already created a fallback transaction
    const existingTx = findMapping(ledger, 'paymentTransaction', `fallback-${bookingId}`)
    if (existingTx && existingTx.status !== 'error') continue

    // Find the booking to get price and date
    const booking = bookingsForTx.find(b => b.BookingID === bookingId)
    if (!booking) continue
    if (cancelledBookingIds.has(bookingId)) continue

    const netCents = dollarsToCents(booking.PackagePrice)
    if (!netCents || netCents <= 0) continue
    const commCents = dollarsToCents(booking.Commission?.Earned) || 0
    const grossCents = netCents + commCents || netCents

    const bookingDate = booking.StartDate?.split('T')[0] || booking.CreatedDateTimeUTC?.split('T')[0] || new Date().toISOString().split('T')[0]

    try {
      const result = await apiPost<{ id: string }>('/payment-schedules/transactions', {
        expectedPaymentItemId: epiId,
        transactionType: 'payment',
        amountCents: grossCents,
        currency: 'CAD',
        transactionDate: `${bookingDate}T12:00:00.000Z`,
        notes: `TES import fallback — fully paid (BookingID: ${bookingId})`,
      })
      addMapping(ledger, { sourceType: 'paymentTransaction', sourceId: `fallback-${bookingId}`, tailfireId: result.id, status: 'created' })
      fallbackCreated++
      await delay(DELAY_MS)
    } catch (err) {
      addMapping(ledger, { sourceType: 'paymentTransaction', sourceId: `fallback-${bookingId}`, tailfireId: '', status: 'error', error: (err as Error).message })
      console.error(`  WARN fallback tx for booking ${bookingId}: ${(err as Error).message}`)
    }
  }

  if (fallbackCreated > 0) {
    console.log(`  Fallback transactions: ${fallbackCreated} created for bookings missing from payments.json`)
  }

  ledger.completedSteps.push('paymentTransactions')
  saveLedger(ledger)
  console.log(`  Payment Transactions: ${created} created (+ ${fallbackCreated} fallback), ${skipped} skipped, ${errors} errors`)
}

// ─── Step 14: Commission Checks ───────────────────────────────────────────────

async function importCommissionChecks(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('commissionChecks') && RESUME) {
    console.log('  Commission Checks: skipped (completed)')
    return
  }

  console.log('\n── Step 14: Importing Commission Checks ──')
  const checks = loadJson<TSCommissionCheck[]>('commission-checks.json')

  let created = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i]
    const checkId = check.CheckID.ID
    const existing = findMapping(ledger, 'commissionCheck', checkId)
    if (existing && existing.status !== 'error') { skipped++; continue }
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    // Map supplier
    let senderSupplierId: string | undefined
    if (check.CheckFrom?.TourOperatorID) {
      const supplierMapping = findMapping(ledger, 'supplier', check.CheckFrom.TourOperatorID)
      if (supplierMapping?.tailfireId) {
        senderSupplierId = supplierMapping.tailfireId
      }
    }

    try {
      // Use TotalReceived (full amount including adjustments), fallback to Paid
      const checkAmount = check.Commission.TotalReceived || check.Commission.Paid || 0
      const currency = detectCurrency(check.CheckFrom?.TourOperatorName)

      const body: Record<string, unknown> = {
        checkNumber: check.CheckNumber,
        checkType: 'received',
        checkDate: check.CheckDate.split('T')[0],
        checkAmountCents: dollarsToCents(checkAmount) || 0,
        currency,
        senderName: check.CheckFrom?.TourOperatorName,
        senderSupplierId: senderSupplierId || undefined,
        source: 'travelesolutions',
        sourceRef: String(checkId),
        notes: check.Commission.CommissionSummary || undefined,
      }

      // Remove undefined values
      for (const key of Object.keys(body)) {
        if (body[key] === undefined) delete body[key]
      }

      const result = await apiPost<{ id: string }>('/commission/checks', body)
      const tfCheckId = result.id
      await delay(DELAY_MS)

      // Transition status
      const statusName = check.CheckStatus?.Name
      if (statusName === 'Accepted') {
        // pending → submitted → accepted
        await apiPatch(`/commission/checks/${tfCheckId}`, { status: 'submitted' })
        await delay(DELAY_MS)
        await apiPost(`/commission/checks/${tfCheckId}/accept`, {})
        await delay(DELAY_MS)
      } else if (statusName === 'Submitted') {
        // pending → submitted
        await apiPatch(`/commission/checks/${tfCheckId}`, { status: 'submitted' })
        await delay(DELAY_MS)
      }
      // "Pending" — leave as-is (default)

      addMapping(ledger, { sourceType: 'commissionCheck', sourceId: checkId, tailfireId: tfCheckId, status: 'created' })
      created++
    } catch (err) {
      addMapping(ledger, { sourceType: 'commissionCheck', sourceId: checkId, tailfireId: '', status: 'error', error: (err as Error).message })
      console.error(`  ERROR commission check ${checkId} (${check.CheckNumber}): ${(err as Error).message}`)
      errors++
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  Progress: ${i + 1}/${checks.length}`)
      saveLedger(ledger)
    }
  }

  validateStepCompleteness(ledger, 'commissionChecks', 'commissionCheck', checks.length)
  saveLedger(ledger)
  console.log(`  Commission Checks: ${created} created, ${skipped} skipped, ${errors} errors`)
}

// ─── Step 14b: Paid Commission Checks (historical agent settlements) ──────────
//
// TES `booking.Commission.Paid` represents amounts already settled from supplier
// to the agency and then paid out to the agent. These don't appear in the
// commission-checks.json export (those are supplier→agency "received" checks).
// We import them as separate check rows with checkType='paid', status='accepted'
// to preserve the pre-cutover settlement history for IC payouts reconciliation.

async function importPaidCommissionChecks(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('paidCommissionChecks') && RESUME) {
    console.log('  Paid Commission Checks: skipped (completed)')
    return
  }

  console.log('\n── Step 14b: Importing Paid Commission Checks ──')
  const bookings = loadJson<TSBooking[]>('bookings.json')

  let created = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < bookings.length; i++) {
    const booking = bookings[i]
    if (!booking.Commission?.Paid || booking.Commission.Paid <= 0) {
      skipped++
      continue
    }

    const sourceId = `paid-${booking.BookingID}`
    const existing = findMapping(ledger, 'paidCheck', sourceId)
    if (existing && existing.status !== 'error') { skipped++; continue }
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    const agentUserId = resolveAgentUserId(booking.TripDescription, ledger)
    if (!agentUserId) {
      console.warn(`  WARN: No agent for booking ${booking.BookingID} and ADMIN_FALLBACK_USER_ID not set; skipping paid check`)
      skipped++
      continue
    }

    const currency = detectCurrency(booking.TourOperator?.TourOperatorName)
    const paidCents = dollarsToCents(booking.Commission.Paid) || 0
    const supplierName = booking.TourOperator?.TourOperatorName ?? 'unknown supplier'
    const initialsKey = parseAgentInitials(booking.TripDescription) || ''
    const agentFullName = agentMapping[initialsKey]?.fullName ?? 'Historical TES Agent'

    try {
      const result = await apiPost<{ id: string }>('/commission/checks', {
        checkNumber: `TES-PAID-${booking.BookingID}`,
        checkType: 'paid',
        checkDate: (booking.StartDate || booking.BookingDate || '').split('T')[0] || new Date().toISOString().split('T')[0],
        checkAmountCents: paidCents,
        currency,
        recipientUserId: agentUserId,
        recipientName: agentFullName,
        source: 'travelesolutions',
        sourceRef: String(booking.BookingID),
        notes: `Historical paid commission for booking #${booking.BookingID} (${supplierName}). Imported as accepted — TES is source of truth for pre-cutover settlements.`,
      })

      // Transition to accepted: pending → submitted → accepted
      await apiPatch(`/commission/checks/${result.id}`, { status: 'submitted' })
      await delay(DELAY_MS)
      await apiPost(`/commission/checks/${result.id}/accept`, {})
      await delay(DELAY_MS)

      addMapping(ledger, { sourceType: 'paidCheck', sourceId, tailfireId: result.id, status: 'created' })
      created++
    } catch (err) {
      addMapping(ledger, { sourceType: 'paidCheck', sourceId, tailfireId: '', status: 'error', error: (err as Error).message })
      errors++
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Paid checks progress: ${i + 1}/${bookings.length}`)
      saveLedger(ledger)
    }
  }

  ledger.completedSteps.push('paidCommissionChecks')
  saveLedger(ledger)
  console.log(`  Paid Commission Checks: ${created} created, ${skipped} skipped, ${errors} errors`)
}

// ─── Step 14c: Commission Adjustments ────────────────────────────────────────
//
// TES `booking.Commission.Adjustment` captures non-standard commission changes
// (e.g. overrides, manual edits). We import them as commission_adjustments
// with adjustmentType='agent' and status='pending' so the finance team can
// review and apply/reject each one post-import.
//
// Endpoint: POST /commission/adjustments (CommissionAdjustmentsController)
// Adjustment types: 'agent' | 'company' | 'backend'

async function importCommissionAdjustments(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('commissionAdjustments') && RESUME) {
    console.log('  Commission Adjustments: skipped (completed)')
    return
  }

  console.log('\n── Step 14c: Importing Commission Adjustments ──')
  const bookings = loadJson<TSBooking[]>('bookings.json')

  let created = 0
  let skipped = 0
  let errors = 0
  let endpointMissing = false

  for (let i = 0; i < bookings.length; i++) {
    const booking = bookings[i]
    if (!booking.Commission?.Adjustment || booking.Commission.Adjustment === 0) {
      skipped++
      continue
    }

    const sourceId = `adj-${booking.BookingID}`
    const existing = findMapping(ledger, 'adjustment', sourceId)
    if (existing && existing.status !== 'error') { skipped++; continue }
    if (existing && existing.status === 'error') {
      const idx = ledger.mappings.indexOf(existing)
      if (idx >= 0) ledger.mappings.splice(idx, 1)
    }

    const agentUserId = resolveAgentUserId(booking.TripDescription, ledger)
    if (!agentUserId) {
      skipped++
      continue
    }

    const currency = detectCurrency(booking.TourOperator?.TourOperatorName)
    const adjustmentCents = dollarsToCents(booking.Commission.Adjustment) || 0
    const supplierName = booking.TourOperator?.TourOperatorName ?? 'unknown supplier'

    try {
      const result = await apiPost<{ id: string }>('/commission/adjustments', {
        agentUserId,
        amountCents: adjustmentCents,
        currency,
        description: `TES adjustment for booking #${booking.BookingID} (${supplierName})`,
        adjustmentType: 'agent',
        source: 'travelesolutions',
        sourceRef: String(booking.BookingID),
      })
      addMapping(ledger, { sourceType: 'adjustment', sourceId, tailfireId: result.id, status: 'created' })
      created++
      await delay(DELAY_MS)
    } catch (err) {
      const msg = (err as Error).message
      // Graceful degradation: if the endpoint doesn't exist, log once and skip remaining
      if (msg.includes('404') || msg.includes('Cannot POST')) {
        if (!endpointMissing) {
          console.warn(`  WARN: /commission/adjustments endpoint returned 404 — endpoint may not exist in this build.`)
          console.warn(`        Remaining adjustments will be skipped. Add endpoint or import manually.`)
          endpointMissing = true
        }
        addMapping(ledger, { sourceType: 'adjustment', sourceId, tailfireId: '', status: 'error', error: msg })
        errors++
        continue
      }
      addMapping(ledger, { sourceType: 'adjustment', sourceId, tailfireId: '', status: 'error', error: msg })
      errors++
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Adjustments progress: ${i + 1}/${bookings.length}`)
      saveLedger(ledger)
    }
  }

  ledger.completedSteps.push('commissionAdjustments')
  saveLedger(ledger)
  console.log(`  Commission Adjustments: ${created} created, ${skipped} skipped, ${errors} errors`)
  if (endpointMissing) {
    console.warn(`  ACTION REQUIRED: /commission/adjustments endpoint missing. Review warnings.json after import.`)
  }
}

// ─── Step 15: Commission Check Items & Tracking Reconciliation ───────────────

async function reconcileCommissionCheckItems(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('commissionCheckItems') && RESUME) {
    console.log('  Commission Check Items: skipped (completed)')
    return
  }

  console.log('\n── Step 15: Reconciling Commission Check Items ──')
  const checks = loadJson<TSCommissionCheck[]>('commission-checks.json')
  const bookings = loadJson<TSBooking[]>('bookings.json')

  // Phase A: Build supplier → bookings mapping (only bookings with commission earned)
  const bookingsBySupplier = new Map<number, TSBooking[]>()
  for (const b of bookings) {
    const opId = b.TourOperator?.TourOperatorID
    if (!opId || !b.Commission || b.Commission.Earned <= 0) continue
    if (!bookingsBySupplier.has(opId)) bookingsBySupplier.set(opId, [])
    bookingsBySupplier.get(opId)!.push(b)
  }

  // Sort each supplier's bookings by date (oldest first) for chronological assignment
  for (const [, supplierBookings] of bookingsBySupplier) {
    supplierBookings.sort((a, b) => {
      const da = a.BookingDate || a.StartDate || ''
      const db = b.BookingDate || b.StartDate || ''
      return da.localeCompare(db)
    })
  }

  // Sort checks by supplier then date for deterministic assignment
  const sortedChecks = [...checks].sort((a, b) => {
    const sidA = a.CheckFrom.TourOperatorID
    const sidB = b.CheckFrom.TourOperatorID
    if (sidA !== sidB) return sidA - sidB
    return (a.CheckDate || '').localeCompare(b.CheckDate || '')
  })

  // Track assigned bookings per supplier
  const assignedBookings = new Set<number>()
  let itemsCreated = 0
  let itemsSkipped = 0
  let itemErrors = 0
  const activityPricingIdsToMarkReceived: Array<{ activityPricingId: string; receivedCents: number }> = []

  // Phase B: For each check, assign bookings and create check items
  for (const check of sortedChecks) {
    const checkId = check.CheckID.ID
    const tfCheck = findMapping(ledger, 'commissionCheck', checkId)
    if (!tfCheck?.tailfireId) continue // check wasn't imported

    const supplierId = check.CheckFrom.TourOperatorID
    const supplierBookings = bookingsBySupplier.get(supplierId) || []
    const bookingCount = check.Commission.BookingCount || 0
    if (bookingCount <= 0) continue

    // Only mark as received if the check was actually accepted
    const isAccepted = check.CheckStatus?.Name === 'Accepted'

    // Find unassigned bookings for this supplier
    const availableBookings = supplierBookings.filter(b => !assignedBookings.has(b.BookingID))
    const toAssign = availableBookings.slice(0, bookingCount)

    // Calculate per-booking received amount proportionally
    const totalCheckReceivedCents = dollarsToCents(check.Commission.TotalReceived) || dollarsToCents(check.Commission.Received) || 0
    const totalEarnedCents = toAssign.reduce((sum, b) => sum + (dollarsToCents(b.Commission?.Earned) || 0), 0)

    for (const booking of toAssign) {
      assignedBookings.add(booking.BookingID)

      // Find activityPricing mapping for this booking
      const pricingMapping = findMapping(ledger, 'activityPricing', booking.BookingID)
      if (!pricingMapping?.tailfireId) continue

      // Check if check item already exists in ledger
      const itemSourceId = `${checkId}-${booking.BookingID}`
      const existingItem = findMapping(ledger, 'commissionCheckItem', itemSourceId)
      if (existingItem && existingItem.status !== 'error') { itemsSkipped++; continue }
      if (existingItem && existingItem.status === 'error') {
        const idx = ledger.mappings.indexOf(existingItem)
        if (idx >= 0) ledger.mappings.splice(idx, 1)
      }

      // Proportional split of received amount
      const earnedCents = dollarsToCents(booking.Commission?.Earned) || 0
      const receivedCents = totalEarnedCents > 0
        ? Math.round(totalCheckReceivedCents * earnedCents / totalEarnedCents)
        : 0

      try {
        const result = await apiPost<{ id: string }>(`/commission/checks/${tfCheck.tailfireId}/items`, {
          activityPricingId: pricingMapping.tailfireId,
          projectedCents: earnedCents,
          receivedCents,
        })
        addMapping(ledger, {
          sourceType: 'commissionCheckItem',
          sourceId: itemSourceId,
          tailfireId: result.id,
          status: 'created',
          data: { checkId: tfCheck.tailfireId, activityPricingId: pricingMapping.tailfireId },
        })
        // Only mark as received if check is accepted — don't prematurely recognize pending/submitted checks
        if (receivedCents > 0 && isAccepted) {
          activityPricingIdsToMarkReceived.push({ activityPricingId: pricingMapping.tailfireId, receivedCents })
        }
        itemsCreated++
        await delay(DELAY_MS)
      } catch (err) {
        addMapping(ledger, {
          sourceType: 'commissionCheckItem',
          sourceId: itemSourceId,
          tailfireId: '',
          status: 'error',
          error: (err as Error).message,
        })
        itemErrors++
      }
    }

    if (itemsCreated % 50 === 0 && itemsCreated > 0) {
      console.log(`  Check items progress: ${itemsCreated} created`)
      saveLedger(ledger)
    }
  }

  saveLedger(ledger)
  console.log(`  Commission Check Items: ${itemsCreated} created, ${itemsSkipped} skipped, ${itemErrors} errors`)

  // Phase C: Update commission tracking records to 'received' for reconciled bookings
  console.log(`  Updating ${activityPricingIdsToMarkReceived.length} commission tracking records to received...`)
  let trackingUpdated = 0
  let trackingErrors = 0

  for (const { activityPricingId, receivedCents } of activityPricingIdsToMarkReceived) {
    try {
      await apiPatch(`/activities/${activityPricingId}/commission`, {
        commissionStatus: 'received',
        receivedCents,
      })
      trackingUpdated++
      await delay(DELAY_MS)
    } catch (err) {
      // Commission tracking may not exist for some activity pricings — skip
      trackingErrors++
    }

    if ((trackingUpdated + trackingErrors) % 50 === 0) {
      console.log(`  Tracking update progress: ${trackingUpdated} updated, ${trackingErrors} errors`)
    }
  }

  console.log(`  Commission Tracking Updates: ${trackingUpdated} updated to received, ${trackingErrors} errors`)

  ledger.completedSteps.push('commissionCheckItems')
  saveLedger(ledger)
}

// ─── Post-Import: Draft Status Fixup ──────────────────────────────────────────

async function runLifecycleBackfill(ledger: Ledger): Promise<void> {
  if (ledger.completedSteps.includes('draftFixup') && RESUME) {
    console.log('  Lifecycle backfill: skipped (completed)')
    return
  }

  console.log('\n── Post-Import: Running lifecycle backfill ──')
  console.log('  Calling POST /trips/backfill-lifecycle to evaluate all trips...')

  if (!DRY_RUN) {
    const MAX_RETRIES = 3
    let success = false

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          const waitSec = attempt * 5
          console.log(`  Retry ${attempt}/${MAX_RETRIES} after ${waitSec}s...`)
          await delay(waitSec * 1000)
        }

        const result = await apiPost<{ evaluated: number; promoted: number; demoted: number; dateTransitions: number }>(
          '/trips/backfill-lifecycle', {}
        )
        console.log(`  Lifecycle backfill complete:`)
        console.log(`    Evaluated: ${result.evaluated}`)
        console.log(`    Promoted to active: ${result.promoted}`)
        console.log(`    Demoted to planning: ${result.demoted}`)
        console.log(`    Date transitions (travelling/travelled): ${result.dateTransitions}`)
        success = true
        break
      } catch (err) {
        console.error(`  ERROR (attempt ${attempt}/${MAX_RETRIES}): ${(err as Error).message}`)
      }
    }

    if (!success) {
      console.error('  ⚠️  Lifecycle backfill failed after all retries.')
      console.error('  Run manually: POST /trips/backfill-lifecycle or use direct SQL backfill.')
    }
  } else {
    console.log('  DRY RUN — skipping lifecycle backfill')
  }

  ledger.completedSteps.push('draftFixup')
  saveLedger(ledger)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('TraveleSolutions → Tailfire Import')
  console.log('===================================')
  if (DRY_RUN) console.log('DRY RUN MODE — no data will be written\n')
  if (RESUME) console.log('RESUME MODE — skipping completed steps\n')

  // Token setup: use provided token or obtain fresh one via Supabase auth
  authToken = process.env.TAILFIRE_TOKEN || ''
  if (!authToken && SUPABASE_URL && SUPABASE_EMAIL) {
    await refreshToken()
  } else if (!authToken && !DRY_RUN) {
    throw new Error('Either TAILFIRE_TOKEN or SUPABASE_URL+SUPABASE_EMAIL+SUPABASE_PASSWORD required')
  }
  tokenObtainedAt = Date.now()

  // Load agent mapping and supplier currency config
  loadMappings()
  if (!ADMIN_FALLBACK_USER_ID && !DRY_RUN) {
    console.warn('WARN: ADMIN_FALLBACK_USER_ID not set. Trips with no initials will have no owner assigned.')
    console.warn('      Set env var to the admin user UUID in the target TF environment.')
  }

  // Verify token works
  if (!DRY_RUN) {
    try {
      await apiGet('/contacts?limit=1')
      console.log('Token verified ✓\n')
    } catch (err) {
      throw new Error(`Token verification failed: ${(err as Error).message}`)
    }
  }

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    throw new Error(`Data directory not found: ${DATA_DIR}`)
  }

  const ledger = loadLedger()
  const startTime = Date.now()

  const steps: Record<string, () => Promise<void>> = {
    suppliers: () => importSuppliers(ledger),
    contacts: () => importContacts(ledger),
    trips: () => importTrips(ledger),
    insurance: () => retrofitInsurance(ledger),
    supplierLinks: () => importSupplierLinks(ledger),
    commission: () => importCommissionTracking(ledger),
    paymentSchedules: () => importPaymentSchedules(ledger),
    paymentTransactions: () => importPaymentTransactions(ledger),
    commissionChecks: () => importCommissionChecks(ledger),
    paidCommissionChecks: () => importPaidCommissionChecks(ledger),
    commissionAdjustments: () => importCommissionAdjustments(ledger),
    commissionCheckItems: () => reconcileCommissionCheckItems(ledger),
    draftFixup: () => runLifecycleBackfill(ledger),
  }

  if (STEP_ONLY) {
    if (steps[STEP_ONLY]) {
      await steps[STEP_ONLY]()
    } else {
      throw new Error(`Unknown step: ${STEP_ONLY}. Available: ${Object.keys(steps).join(', ')}`)
    }
  } else {
    for (const [name, fn] of Object.entries(steps)) {
      await fn()
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n===================================`)
  console.log(`Import complete in ${elapsed}s`)
  console.log(`Ledger: ${LEDGER_PATH}`)
  console.log('\nSummary:')
  for (const [type, stats] of Object.entries(ledger.stats)) {
    console.log(`  ${type}: ${stats.created} created, ${stats.skipped} skipped, ${stats.errors} errors`)
  }

  // Emit warnings summary — trips with no/unmapped initials need manual agent assignment
  if (ledger.warnings && ledger.warnings.length > 0) {
    console.warn(`\nWARN: ${ledger.warnings.length} agent-mapping warnings recorded (trips assigned to admin fallback).`)
    console.warn(`      Review warnings.json for the complete list — manual owner reassignment may be needed.`)
    const warningsPath = join(DATA_DIR, 'warnings.json')
    writeFileSync(warningsPath, JSON.stringify(ledger.warnings, null, 2))
    console.log(`Warnings: ${warningsPath}`)
  }

  // Write import report
  const reportPath = join(DATA_DIR, 'import-report.json')
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    elapsed: `${elapsed}s`,
    stats: ledger.stats,
    completedSteps: ledger.completedSteps,
    totalMappings: ledger.mappings.length,
    warningCount: (ledger.warnings ?? []).length,
    errors: ledger.mappings.filter(m => m.status === 'error').map(m => ({
      type: m.sourceType,
      sourceId: m.sourceId,
      error: m.error,
    })),
  }, null, 2))
  console.log(`Report: ${reportPath}`)
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
