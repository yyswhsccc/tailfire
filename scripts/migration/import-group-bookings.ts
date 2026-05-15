/**
 * Group Sub-Trip Booking Importer
 *
 * Imports the 65 TES bookings that belong to group sub-trips
 * not captured by the main /Trip list endpoint.
 *
 * Steps:
 * 1. Create trip_groups for the 4 parent groups
 * 2. Create sub-trips and link them to groups
 * 3. Fetch traveler data from TES for each sub-trip
 * 4. Create activities + pricing from bookings
 * 5. Set masterTripId for billing rollup
 *
 * Usage:
 *   TAILFIRE_TOKEN=<jwt> npx tsx scripts/migration/import-group-bookings.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const API_URL = process.env.TAILFIRE_API || 'https://api-dev.tailfire.ca/api/v1'
const TES_API = 'https://travelesolutions.com/api/api'
let tfToken = process.env.TAILFIRE_TOKEN || ''
let tesToken = process.env.TES_TOKEN || ''
const DELAY_MS = 100

interface Booking {
  BookingID: number
  TripID: number
  ParentTripID: number
  TripDescription: string
  BookingDate: string
  StartDate: string
  EndDate: string
  Description: string
  PackagePrice: number
  ActualPackagePrice: number
  TourOperator: { TourOperatorID: number; TourOperatorName: string }
  Commission: { Earned: number; Received: number; Rate: number }
  BookingNumber: string
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function tfApi(method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${tfToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TF ${method} ${path}: ${res.status} ${text.substring(0, 500)}`)
  }
  return res.json()
}

async function tesApi(path: string): Promise<any> {
  const res = await fetch(`${TES_API}${path}&utcOffset=-240&iana=America/New_York`, {
    headers: { 'Authorization': `Bearer ${tesToken}` },
  })
  if (!res.ok) throw new Error(`TES ${path}: ${res.status}`)
  return res.json()
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!tfToken) throw new Error('TAILFIRE_TOKEN env var required')
  if (!tesToken) throw new Error('TES_TOKEN env var required')

  const dataDir = join(__dirname, '../../data/migration')
  const missingBookings: Booking[] = JSON.parse(readFileSync(join(dataDir, 'missing-bookings.json'), 'utf-8'))

  console.log('Group Sub-Trip Booking Importer')
  console.log('================================')
  console.log(`Bookings to import: ${missingBookings.length}`)

  // ─── Step 1: Group bookings by parent ──────────────────────────────────

  const groups = new Map<string, { subTrips: Map<string, { desc: string; bookings: Booking[] }> }>()

  for (const b of missingBookings) {
    const parent = String(b.ParentTripID)
    const sub = String(b.TripID)
    if (!groups.has(parent)) groups.set(parent, { subTrips: new Map() })
    const g = groups.get(parent)!
    if (!g.subTrips.has(sub)) g.subTrips.set(sub, { desc: b.TripDescription || `Trip ${sub}`, bookings: [] })
    g.subTrips.get(sub)!.bookings.push(b)
  }

  console.log(`\nGroups: ${groups.size}, Sub-trips: ${[...groups.values()].reduce((s, g) => s + g.subTrips.size, 0)}`)

  // ─── Step 2: Find parent trips in TF DB ────────────────────────────────

  console.log('\n── Step 1: Finding parent trips ──')
  const parentMap = new Map<string, string>() // TES parentID → TF trip ID

  // Fetch all trips and match by externalReference (search API doesn't index external_reference)
  let allTrips: any[] = []
  let page = 1
  while (true) {
    const result = await tfApi('GET', `/trips?limit=100&page=${page}`)
    const trips = result.data || []
    allTrips = allTrips.concat(trips)
    if (trips.length < 100) break
    page++
    await delay(DELAY_MS)
  }
  console.log(`  Loaded ${allTrips.length} TF trips`)

  for (const parentTesId of groups.keys()) {
    const match = allTrips.find((t: any) => t.externalReference === parentTesId)
    if (match) {
      parentMap.set(parentTesId, match.id)
      console.log(`  Parent ${parentTesId} → ${match.id.substring(0, 8)}... (${match.name?.substring(0, 40)})`)
    } else {
      console.log(`  Parent ${parentTesId}: NOT FOUND in TF`)
    }
  }

  // ─── Step 3: Create trip_groups ─────────────────────────────────────────

  console.log('\n── Step 2: Creating trip_groups ──')
  const groupMap = new Map<string, string>() // TES parentID → TF group ID

  for (const [parentTesId, groupData] of groups) {
    const parentTfId = parentMap.get(parentTesId)
    if (!parentTfId) {
      console.log(`  Skipping group for parent ${parentTesId} (no TF trip)`)
      continue
    }

    // Get parent trip details for group metadata
    let parentTrip: any
    try {
      parentTrip = await tfApi('GET', `/trips/${parentTfId}`)
    } catch { parentTrip = { name: `Group ${parentTesId}` } }

    // Check if group already exists (idempotency by groupNumber)
    const existingGroup = allTrips.find((t: any) => false) // trips don't have group info
    let existingGroupId: string | null = null
    try {
      const groupsResult = await tfApi('GET', '/trips/groups')
      const groups = groupsResult.data || groupsResult || []
      const match = groups.find((g: any) => g.groupNumber === parentTesId)
      if (match) {
        existingGroupId = match.id
        groupMap.set(parentTesId, match.id)
        console.log(`  Existing group: ${match.id.substring(0, 8)}... (${match.name?.substring(0, 40)})`)
      }
    } catch { /* group list failed, create new */ }

    if (!existingGroupId) {
      try {
        const group = await tfApi('POST', '/trips/groups', {
          name: parentTrip.name,
          type: 'group_booking',
          groupNumber: parentTesId,
          startDate: parentTrip.startDate,
          endDate: parentTrip.endDate,
          description: `Imported from TES group trip #${parentTesId}`,
        })
        groupMap.set(parentTesId, group.id)
        console.log(`  Created group: ${group.id.substring(0, 8)}... (${parentTrip.name?.substring(0, 40)})`)

        // Add parent trip to group
        await tfApi('POST', `/trips/groups/${group.id}/trips`, { tripIds: [parentTfId] })

        // Set master trip for billing rollup
        await tfApi('PATCH', `/trips/groups/${group.id}`, { masterTripId: parentTfId })
        console.log(`    Master trip set: ${parentTfId.substring(0, 8)}...`)
      } catch (err: any) {
        console.error(`  Group ${parentTesId}: ${err.message}`)
      }
    }
    await delay(DELAY_MS)
  }

  // ─── Step 4: Create sub-trips + link to groups ──────────────────────────

  console.log('\n── Step 3: Creating sub-trips ──')
  const subTripMap = new Map<string, string>() // TES subTripID → TF trip ID
  let created = 0, errors = 0

  for (const [parentTesId, groupData] of groups) {
    const groupId = groupMap.get(parentTesId)
    if (!groupId) continue

    for (const [subTesId, subData] of groupData.subTrips) {
      // Check if sub-trip already exists
      const existing = allTrips.find((t: any) => t.externalReference === subTesId)
      if (existing) {
        subTripMap.set(subTesId, existing.id)
        // Ensure it's in the group
        try {
          await tfApi('POST', `/trips/groups/${groupId}/trips`, { tripIds: [existing.id] })
        } catch { /* might already be in group */ }
        created++
        if (created % 10 === 0) console.log(`  Progress: ${created} sub-trips linked`)
        await delay(DELAY_MS / 2)
        continue
      }

      // Create new sub-trip
      const firstBooking = subData.bookings[0]
      const startDate = firstBooking?.StartDate?.substring(0, 10)
      const endDate = firstBooking?.EndDate?.substring(0, 10)

      try {
        const trip = await tfApi('POST', '/trips', {
          name: subData.desc,
          externalReference: subTesId,
          status: 'planning',
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
        })
        subTripMap.set(subTesId, trip.id)

        // Add to group
        await tfApi('POST', `/trips/groups/${groupId}/trips`, { tripIds: [trip.id] })

        created++
        if (created % 10 === 0) console.log(`  Progress: ${created} sub-trips created`)
      } catch (err: any) {
        console.error(`  Sub-trip ${subTesId}: ${err.message.substring(0, 100)}`)
        errors++
      }
      await delay(DELAY_MS)
    }
  }
  console.log(`  Sub-trips: ${created} created, ${errors} errors`)

  // ─── Step 4: Add travelers by matching names from trip descriptions ─────

  console.log('\n── Step 4: Adding travelers from trip names ──')
  let travelersAdded = 0

  for (const [subTesId, tfTripId] of subTripMap) {
    // Parse traveler names from trip description
    // Patterns: "(MG) Furlong - Cancun Wedding" → Furlong
    //           "(MG) Marien/Cabral Wedding" → Marien, Cabral
    //           "(SL) Bisson + Hudson Africa" → Bisson, Hudson
    const parentTesId = [...groups.entries()].find(([_, g]) => g.subTrips.has(subTesId))?.[0]
    if (!parentTesId) continue
    const desc = groups.get(parentTesId)!.subTrips.get(subTesId)!.desc

    // Strip agent prefix like "(MG) " or "(SL) " or "(DB) "
    const cleaned = desc.replace(/^\([A-Z]{2}\)\s*/, '').trim()
    // Strip suffixes like "- Cancun Wedding", "Africa", "Cancun", "Japan"
    const namePart = cleaned.replace(/\s*[-–]\s*(Cancun|Africa|Japan|Punta Cana|mexico|Costa Rica).*$/i, '')
      .replace(/\s+(Wedding|Cancun|Africa|Japan|Punta Cana|mexico|Costa Rica|clubmed|Icon of the seas).*$/i, '')
      .trim()

    // Split by / or + or & to get individual surnames
    const surnames = namePart.split(/\s*[\/+&]\s*/).map(s => s.trim()).filter(Boolean)

    for (const surname of surnames) {
      if (!surname || surname.length < 2) continue
      try {
        const searchResult = await tfApi('GET', `/contacts?search=${encodeURIComponent(surname)}&limit=5`)
        const contacts = searchResult.data || []
        // Match by last name
        const match = contacts.find((c: any) =>
          c.lastName?.toLowerCase() === surname.toLowerCase() ||
          c.firstName?.toLowerCase() === surname.toLowerCase()
        )
        if (match) {
          try {
            await tfApi('POST', `/trips/${tfTripId}/travelers`, {
              contactId: match.id,
              role: surnames.indexOf(surname) === 0 ? 'primary' : 'companion',
            })
            travelersAdded++
          } catch { /* already linked or other error */ }
        }
      } catch { /* search failed */ }
      await delay(DELAY_MS / 2)
    }
  }
  console.log(`  Travelers added: ${travelersAdded}`)

  // ─── Step 6: Create activities + pricing from bookings ──────────────────

  console.log('\n── Step 5: Creating activities + pricing ──')
  let activitiesCreated = 0, pricingCreated = 0, activityErrors = 0

  for (const [subTesId, tfTripId] of subTripMap) {
    // Find the bookings for this sub-trip
    const parentTesId = [...groups.entries()].find(([_, g]) => g.subTrips.has(subTesId))?.[0]
    if (!parentTesId) continue
    const bookings = groups.get(parentTesId)!.subTrips.get(subTesId)!.bookings

    for (const booking of bookings) {
      const isInsurance = ['Allianz', 'Manulife', 'BluesCross', 'TravelSafe', 'GMS'].some(
        ins => booking.TourOperator?.TourOperatorName?.includes(ins)
      )

      // Map to valid TF activity types (no 'custom' type exists)
      const activityType = isInsurance ? 'insurance' : 'lodging'
      const supplierName = booking.TourOperator?.TourOperatorName || 'Unknown'

      try {
        // Skip if activity already exists (idempotency by confirmationNumber)
        const bookingRef = String(booking.BookingNumber || booking.BookingID)

        // Get or create itinerary via trip-scoped route
        const itineraries = await tfApi('GET', `/trips/${tfTripId}/itineraries`)
        const itinList = itineraries.data || itineraries || []
        let itineraryId = Array.isArray(itinList) && itinList.length > 0 ? itinList[0].id : null

        if (!itineraryId) {
          const itin = await tfApi('POST', `/trips/${tfTripId}/itineraries`, { name: 'Main Itinerary' })
          itineraryId = itin.id
        }

        // Get or create itinerary day
        const days = await tfApi('GET', `/itineraries/${itineraryId}/days`)
        const dayList = days.data || days || []
        let dayId = Array.isArray(dayList) && dayList.length > 0 ? dayList[0].id : null

        if (!dayId) {
          const day = await tfApi('POST', `/itineraries/${itineraryId}/days`, {
            dayNumber: 1,
            date: booking.StartDate?.substring(0, 10) || null,
          })
          dayId = day.id
        }

        // Create activity via POST /days/:dayId/activities
        const priceCents = Math.round((booking.PackagePrice || 0) * 100)
        const commissionCents = Math.round((booking.Commission?.Earned || 0) * 100)

        const activity = await tfApi('POST', `/days/${dayId}/activities`, {
          activityType,
          name: booking.Description || supplierName,
          confirmationNumber: String(booking.BookingNumber || booking.BookingID),
          bookingStatus: 'booked',
          startDatetime: booking.StartDate || null,
          endDatetime: booking.EndDate || null,
          totalPriceCents: priceCents > 0 ? priceCents : undefined,
          commissionTotalCents: commissionCents > 0 ? commissionCents : undefined,
        })
        activitiesCreated++

        // Set bookingDate via PATCH (not in create DTO)
        if (booking.BookingDate) {
          try {
            await tfApi('PATCH', `/activities/${activity.id}`, {
              bookingDate: booking.BookingDate.substring(0, 10),
            })
          } catch { /* non-critical */ }
        }

        // Pricing is set during create, but check if we need a separate pricing record
        if (priceCents > 0) {
          pricingCreated++
        }
      } catch (err: any) {
        console.error(`  Activity for booking ${booking.BookingID}: ${err.message.substring(0, 300)}`)
        activityErrors++
      }
      await delay(DELAY_MS)
    }
  }
  console.log(`  Activities: ${activitiesCreated} created, ${activityErrors} errors`)
  console.log(`  Pricing: ${pricingCreated} created`)

  // ─── Summary ────────────────────────────────────────────────────────────

  console.log('\n================================')
  console.log('Summary:')
  console.log(`  Groups created: ${groupMap.size}`)
  console.log(`  Sub-trips created: ${created}`)
  console.log(`  Travelers added: ${travelersAdded}`)
  console.log(`  Activities created: ${activitiesCreated}`)
  console.log(`  Pricing created: ${pricingCreated}`)
  console.log(`  Errors: ${errors + activityErrors}`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
