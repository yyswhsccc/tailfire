/**
 * TraveleSolutions Data Extraction Script
 *
 * Extracts all contacts, trips, bookings, suppliers, and commission data
 * from TraveleSolutions REST API and writes to JSON files.
 *
 * Usage:
 *   TS_TOKEN="eyJ..." npx tsx scripts/migration/extract-travelesolutions.ts
 *
 * Or with username/password auth:
 *   TS_USER="user" TS_PASS="pass" TS_COMPANY="companyshortname" npx tsx scripts/migration/extract-travelesolutions.ts
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

const BASE_URL = 'https://travelesolutions.com/api/api'
const TOKEN_URL = 'https://travelesolutions.com/api/token'
const OUTPUT_DIR = join(__dirname, '../../data/migration') // relative to tailfire-project/scripts/migration/
const PAGE_SIZE = 100
const DELAY_MS = 200 // delay between requests to avoid rate limiting

let authToken: string = ''

// ─── Auth ────────────────────────────────────────────────────────────────────

async function authenticate(): Promise<string> {
  // Option 1: Token passed directly
  if (process.env.TS_TOKEN) {
    console.log('Using provided JWT token')
    return process.env.TS_TOKEN
  }

  // Option 2: Username/password auth
  const user = process.env.TS_USER
  const pass = process.env.TS_PASS
  const company = process.env.TS_COMPANY
  if (!user || !pass || !company) {
    throw new Error(
      'Provide TS_TOKEN or (TS_USER + TS_PASS + TS_COMPANY) environment variables',
    )
  }

  console.log(`Authenticating as ${user}@${company}...`)
  const resp = await fetch(
    `${TOKEN_URL}?utcOffset=-300&iana=America/New_York`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=password&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&client_id=ngAuthApp&companyshortname=${encodeURIComponent(company)}`,
    },
  )

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Auth failed (${resp.status}): ${text}`)
  }

  const data = await resp.json()
  console.log(`Authenticated. Token expires in ${data.expires_in}s`)
  return data.access_token || data.token
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('noCache', Date.now().toString())
  url.searchParams.set('utcOffset', '-300')
  url.searchParams.set('iana', 'America/New_York')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${authToken}` },
  })

  if (resp.status === 401) {
    throw new Error('Token expired. Re-authenticate and retry.')
  }

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API error ${resp.status} on ${path}: ${text.substring(0, 200)}`)
  }

  return resp.json() as Promise<T>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface PaginatedResponse<T> {
  Items: T[]
  CountFiltered: number
  CountUnfiltered: number
  CountCurrent: number
  PageNumber: number
  PageSize: number
}

async function fetchAllPaginated<T>(
  path: string,
  extraParams: Record<string, string | number> = {},
  label: string = path,
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  let total = 0

  while (true) {
    const data = await apiGet<PaginatedResponse<T>>(path, {
      pageNumber: page,
      pageSize: PAGE_SIZE,
      ...extraParams,
    })

    if (page === 1) {
      total = data.CountFiltered
      console.log(`  ${label}: ${total} total records`)
    }

    all.push(...data.Items)
    console.log(`  ${label}: page ${page} (${all.length}/${total})`)

    if (all.length >= total || data.Items.length === 0) break
    page++
    await delay(DELAY_MS)
  }

  return all
}

// ─── Data Types ──────────────────────────────────────────────────────────────

interface TSClient {
  ClientID: { ID: number }
  Contact: {
    Address?: {
      Address1?: string
      City?: string
      State?: string
      ZipCode?: string
      PostalCode?: { Code?: string; Country?: { CountryCode?: string; ISOCountryCode3?: string; CountryName?: string }; Province?: { Name?: string } }
      AddressString?: string
    }
    ContactGender?: { ContactGenderID: number; ContactGenderName: string }
    FirstName: string
    LastName: string
    NickName?: string
    Telephones?: { Primary?: { ContactDetailValue?: { Value?: string } }; Items?: Array<{ ContactDetailValue?: { Value?: string }; ContactDetailID?: number }> }
    EmailAddresses?: { Primary?: { ContactDetailValue?: { Value?: string } }; Items?: Array<{ ContactDetailValue?: { Value?: string }; ContactDetailID?: number }> }
    ContactDetails?: Array<{ ContactDetailID: number; ContactDetailValue: { Value: string; ContactDetailType: { ContactDetailTypeName: string } } }>
  }
  ClientStatus?: { StatusID: number; StatusName: string }
  BirthDate?: string
  Agent?: { UserID: { ID: number }; Contact?: { FirstName: string; LastName: string } }
  TripCount?: number
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
          TripCarrier?: {
            TripCarrierID: number
            SupplierID: number
            Selection?: string
            Title?: string
          }
        }>
        Travelers?: Array<{
          TravelerType?: { TravelerTypeID: number; TravelerTypeName: string }
          Contact?: { FirstName: string; LastName: string }
          ClientID?: { ID: number }
        }>
      }>
      TravelingPackagesLight?: Array<{
        TripCarriers?: Array<{ SupplierType?: string; SupplierSelection?: string }>
      }>
      StartDate?: string
      EndDate?: string
      Detail?: {
        BookingCount: number
        TravelerCount: number
        BookingPaymentAggregate?: { Amount: number; Balance: number; PackagePrice: number }
      }
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
  Agent?: { UserID: { ID: number }; Contact?: { FirstName: string; LastName: string } }
  BookingCategoryType?: { BookingCategoryTypeID: number; BookingCategoryTypeName: string }
  BookingType?: { ID: number; Name: string }
  BookingNumber?: string
  Number?: string
  BookingDate?: string
  TourOperator?: { TourOperatorID: number; TourOperatorName: string }
  Description?: string
  EndDate?: string
  StartDate?: string
  BookingStatus?: { StatusID: number; StatusName: string }
  PackagePrice?: number
  ActualPackagePrice?: number
  Commission?: {
    Earned: number
    Received: number
    ReceivedParent: number
    TotalReceived: number
    Paid: number
    Due: number
    TotalDue: number
    Rate: number
    AdjustmentCount: number
    Adjustment: number
  }
  PaymentsAndItemizations?: unknown
  CreatedDateTimeUTC?: string
}

interface TSTourOperator {
  TourOperatorID: number
  TourOperatorName: string
  TourOperatorOwner: number
  ContactCount: number
  BookingCount: number
  TotalPackagePrice: number
  PrivateLinkCount: number
}

interface TSCommissionCheck {
  CheckID: { ID: number }
  CheckNumber: string
  CheckDate: string
  Commission: {
    BookingCount: number
    Earned: number
    Received: number
    ReceivedParent: number
    TotalReceived: number
    Paid: number
    Due: number
    TotalDue: number
    Rate: number
    CommissionSummary?: string
    AdjustmentCount: number
    Adjustment: number
  }
  CheckToType: number
  CheckStatus: { ID: number; Name: string }
  CheckTo: { ID: number; Name: string }
  CheckFrom: { TourOperatorID: number; TourOperatorName: string }
  ManualReceive: boolean
}

// ─── Extraction Steps ────────────────────────────────────────────────────────

function writeJson(filename: string, data: unknown): void {
  const filepath = join(OUTPUT_DIR, filename)
  writeFileSync(filepath, JSON.stringify(data, null, 2))
  console.log(`  Written: ${filepath}`)
}

function loadCheckpoint(): Record<string, boolean> {
  const path = join(OUTPUT_DIR, '.checkpoint.json')
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }
  return {}
}

function saveCheckpoint(checkpoint: Record<string, boolean>): void {
  writeFileSync(join(OUTPUT_DIR, '.checkpoint.json'), JSON.stringify(checkpoint, null, 2))
}

async function extractClients(): Promise<TSClient[]> {
  console.log('\n── Extracting Clients ──')
  const clients = await fetchAllPaginated<TSClient>(
    '/Client',
    { sortAscending: 'true', sortBy: 'LastName' },
    'Clients',
  )
  writeJson('contacts.json', clients)
  return clients
}

async function extractSuppliers(): Promise<TSTourOperator[]> {
  console.log('\n── Extracting Suppliers (TourOperators) ──')
  const suppliers = await fetchAllPaginated<TSTourOperator>(
    '/TourOperator',
    {},
    'Suppliers',
  )
  writeJson('suppliers.json', suppliers)
  return suppliers
}

async function extractTripsWithBookings(): Promise<{
  trips: TSTrip[]
  bookings: TSBooking[]
}> {
  console.log('\n── Extracting Trips ──')

  // Step 1: Get all trip IDs via list endpoint
  const tripList = await fetchAllPaginated<TSTrip>('/Trip', {}, 'Trip list')

  // Step 2: Fetch full detail for each trip
  console.log(`\n  Fetching ${tripList.length} trip details...`)
  const trips: TSTrip[] = []
  const allBookings: TSBooking[] = []
  let errorCount = 0

  const errors: Array<{ tripId: number; endpoint: string; error: string }> = []

  for (let i = 0; i < tripList.length; i++) {
    const tripId = tripList[i].TripID

    // Fetch trip detail separately from bookings so one failure doesn't drop both
    try {
      const tripDetail = await apiGet<TSTrip>('/Trip', { tripID: tripId })
      trips.push(tripDetail)
    } catch (err) {
      errorCount++
      const msg = (err as Error).message
      console.error(`  ERROR trip detail ${tripId}: ${msg}`)
      errors.push({ tripId, endpoint: '/Trip?tripID=', error: msg })
      trips.push(tripList[i]) // fallback to light version
    }

    await delay(DELAY_MS)

    // Fetch bookings independently
    try {
      const bookings = await fetchAllPaginated<TSBooking>(
        '/Booking',
        { tripID: tripId, sortAscending: 'false', sortBy: 'CreatedDateTimeUTC' },
        `  Trip ${tripId} bookings`,
      )
      allBookings.push(...bookings)
    } catch (err) {
      const msg = (err as Error).message
      console.error(`  ERROR bookings for trip ${tripId}: ${msg}`)
      errors.push({ tripId, endpoint: '/Booking?tripID=', error: msg })
    }

    if ((i + 1) % 50 === 0 || i === tripList.length - 1) {
      console.log(`  Progress: ${i + 1}/${tripList.length} trips`)
    }

    await delay(DELAY_MS)
  }

  if (errors.length > 0) {
    writeJson('extraction-errors.json', errors)
    console.log(`  ⚠ ${errors.length} errors logged to extraction-errors.json`)
  }

  if (errorCount > 0) {
    console.log(`  ⚠ ${errorCount} trip detail fetches failed (light data used as fallback)`)
  }

  writeJson('trips.json', trips)
  writeJson('bookings.json', allBookings)

  return { trips, bookings: allBookings }
}

async function extractPayments(trips: TSTrip[]): Promise<void> {
  console.log('\n── Extracting Booking Payments ──')
  const allPayments: Array<{ tripId: number; payments: unknown }> = []
  const paymentErrors: Array<{ tripId: number; status: string; error: string }> = []

  for (let i = 0; i < trips.length; i++) {
    const tripId = trips[i].TripID
    try {
      const data = await apiGet<unknown>('/Booking/GetBookingPaymentsByTripID', {
        tripID: tripId,
      })
      allPayments.push({ tripId, payments: data })
    } catch (err) {
      const msg = (err as Error).message
      const is404 = msg.includes('404')
      paymentErrors.push({ tripId, status: is404 ? 'no_payments' : 'error', error: msg })
      if (!is404) {
        console.error(`  ERROR payment for trip ${tripId}: ${msg}`)
      }
    }

    if ((i + 1) % 100 === 0 || i === trips.length - 1) {
      console.log(`  Progress: ${i + 1}/${trips.length} trips`)
    }
    await delay(DELAY_MS)
  }

  const realErrors = paymentErrors.filter(e => e.status === 'error')
  console.log(`  Collected payments for ${allPayments.length} trips (${paymentErrors.length} skipped, ${realErrors.length} errors)`)
  writeJson('payments.json', allPayments)
  if (realErrors.length > 0) {
    writeJson('payment-errors.json', realErrors)
  }
}

async function extractCommissionChecks(): Promise<TSCommissionCheck[]> {
  console.log('\n── Extracting Commission Checks ──')
  const checks = await fetchAllPaginated<TSCommissionCheck>(
    '/CheckReceived',
    {},
    'Commission checks',
  )
  writeJson('commission-checks.json', checks)
  return checks
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('TraveleSolutions Data Extraction')
  console.log('================================\n')

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true })

  // Authenticate
  authToken = await authenticate()

  // Verify token works
  try {
    await apiGet('/User/GetAuthenticatedUser')
    console.log('Token verified ✓\n')
  } catch {
    throw new Error('Token verification failed. Ensure the token is valid.')
  }

  const checkpoint = loadCheckpoint()
  const startTime = Date.now()

  // Step 1: Clients
  if (!checkpoint.clients) {
    await extractClients()
    checkpoint.clients = true
    saveCheckpoint(checkpoint)
  } else {
    console.log('\n── Clients: skipped (checkpoint) ──')
  }

  // Step 2: Suppliers
  if (!checkpoint.suppliers) {
    await extractSuppliers()
    checkpoint.suppliers = true
    saveCheckpoint(checkpoint)
  } else {
    console.log('\n── Suppliers: skipped (checkpoint) ──')
  }

  // Step 3: Trips + Bookings
  let trips: TSTrip[] = []
  if (!checkpoint.trips) {
    const result = await extractTripsWithBookings()
    trips = result.trips
    checkpoint.trips = true
    saveCheckpoint(checkpoint)
  } else {
    console.log('\n── Trips: skipped (checkpoint) ──')
    // Load from file for payment extraction
    const tripsPath = join(OUTPUT_DIR, 'trips.json')
    if (existsSync(tripsPath)) {
      trips = JSON.parse(readFileSync(tripsPath, 'utf-8'))
    }
  }

  // Step 3b: Identify group sub-trips missing from /Trip list
  // The /Booking endpoint returns bookings for group sub-trips that aren't in /Trip
  if (!checkpoint.missingBookings) {
    console.log('\n── Identifying missing group sub-trip bookings ──')
    const tripIds = new Set(trips.map(t => String(t.TripID)))
    const allBookings = await fetchAllPaginated<any>('/Booking', {}, 'All bookings')
    const missingBookings = allBookings.filter(b => !tripIds.has(String(b.TripID)))
    if (missingBookings.length > 0) {
      const missingPath = join(OUTPUT_DIR, 'missing-bookings.json')
      writeFileSync(missingPath, JSON.stringify(missingBookings, null, 2))
      console.log(`  Found ${missingBookings.length} bookings on ${new Set(missingBookings.map((b: any) => b.TripID)).size} trips not in /Trip list`)
      console.log(`  Written: ${missingPath}`)
    } else {
      console.log('  No missing bookings found')
    }
    checkpoint.missingBookings = true
    saveCheckpoint(checkpoint)
  } else {
    console.log('\n── Missing bookings: skipped (checkpoint) ──')
  }

  // Step 4: Payments
  if (!checkpoint.payments && trips.length > 0) {
    await extractPayments(trips)
    checkpoint.payments = true
    saveCheckpoint(checkpoint)
  } else {
    console.log('\n── Payments: skipped (checkpoint) ──')
  }

  // Step 5: Commission checks
  if (!checkpoint.commission) {
    await extractCommissionChecks()
    checkpoint.commission = true
    saveCheckpoint(checkpoint)
  } else {
    console.log('\n── Commission: skipped (checkpoint) ──')
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n================================`)
  console.log(`Extraction complete in ${elapsed}s`)
  console.log(`Output: ${OUTPUT_DIR}`)
  console.log(`Files: contacts.json, suppliers.json, trips.json, bookings.json, payments.json, commission-checks.json`)
}

main().catch((err) => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
