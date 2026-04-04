/**
 * Resolve Airport IATA Codes for Top Destinations
 *
 * Fetches the top 50 destinations (by cruise stop count), searches for the
 * nearest airport via the Amadeus airport lookup API, and stores the result
 * in the destination's `metadata` JSONB column.
 *
 * Usage:
 *   npx tsx scripts/resolve-destination-airports.ts
 *
 * Requires:
 *   - DATABASE_URL in apps/api/.env (loaded via dotenv)
 *   - API running at localhost:3101 (or API_URL env)
 *   - OTA_SERVICE_KEY for the x-ota-service-key header
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { Pool } from 'pg'

// Load env from apps/api/.env
config({ path: resolve(__dirname, '../apps/api/.env') })

const API_URL = process.env.API_URL || 'http://localhost:3101/api/v1'
const OTA_SERVICE_KEY = process.env.OTA_SERVICE_KEY || ''
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found. Ensure apps/api/.env has it set.')
  process.exit(1)
}

if (!OTA_SERVICE_KEY) {
  console.warn('WARNING: OTA_SERVICE_KEY not set. Airport search requests may be rejected.')
}

interface DestinationRow {
  id: string
  name: string
  slug: string
  country_code: string | null
  latitude: string | null
  longitude: string | null
  metadata: Record<string, any> | null
  stop_count: string
}

interface AirportResult {
  code: string
  name: string
  city: string
  country: string
  subType: string
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL })

  try {
    // Get top destinations with lat/lng, ordered by cruise stop count
    const { rows: destinations } = await pool.query<DestinationRow>(`
      SELECT d.id, d.name, d.slug, d.country_code, d.latitude, d.longitude, d.metadata,
             COALESCE((
               SELECT count(*)::text
               FROM destination_ports dp
               JOIN catalog.cruise_sailing_stops css ON css.port_id = dp.port_id
               WHERE dp.destination_id = d.id
             ), '0') as stop_count
      FROM destinations d
      WHERE d.latitude IS NOT NULL AND d.longitude IS NOT NULL
      ORDER BY stop_count::bigint DESC, d.name
      LIMIT 50
    `)

    console.log(`Found ${destinations.length} destinations to resolve\n`)

    let resolved = 0
    let skipped = 0
    let failed = 0

    for (const dest of destinations) {
      // Skip if already resolved
      const metadata = dest.metadata || {}
      if (metadata.airportIata) {
        console.log(`  [skip] ${dest.name} -- already mapped: ${metadata.airportIata}`)
        skipped++
        continue
      }

      // Use the first part of the name (city name before comma) as keyword
      const keyword = dest.name.split(',')[0]!.trim()
      if (keyword.length < 3) {
        console.log(`  [skip] ${dest.name} -- keyword too short: "${keyword}"`)
        skipped++
        continue
      }

      try {
        const url = `${API_URL}/ota/search/airports?keyword=${encodeURIComponent(keyword)}`
        const res = await fetch(url, {
          headers: {
            'x-ota-service-key': OTA_SERVICE_KEY,
          },
        })

        if (!res.ok) {
          console.log(`  [fail] ${dest.name} -- API error: ${res.status} ${res.statusText}`)
          failed++
          // Rate limit even on failure
          await new Promise((r) => setTimeout(r, 1100))
          continue
        }

        const data: AirportResult[] = await res.json()

        // Prefer AIRPORT subType over CITY
        const airports = data.filter(
          (a) => a.subType === 'AIRPORT' || a.subType === 'airport',
        )
        const best = airports.length > 0 ? airports[0]! : data[0]

        if (!best || !best.code) {
          console.log(`  [miss] ${dest.name} -- no airports found for "${keyword}"`)
          failed++
          await new Promise((r) => setTimeout(r, 1100))
          continue
        }

        // Update metadata
        const newMetadata = {
          ...metadata,
          airportIata: best.code,
          airportName: best.name,
          amadeusCityCode: best.city || best.code,
          airportMappedAt: new Date().toISOString(),
        }

        await pool.query(
          `UPDATE destinations SET metadata = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(newMetadata), dest.id],
        )

        console.log(
          `  [done] ${dest.name}, ${dest.country_code || '??'} -> ${best.code} (${best.name})`,
        )
        resolved++
      } catch (err: any) {
        console.log(`  [fail] ${dest.name} -- error: ${err.message}`)
        failed++
      }

      // Rate limit: ~1 request per second (Amadeus free tier is 10/min)
      await new Promise((r) => setTimeout(r, 1100))
    }

    console.log(`\nDone! Resolved: ${resolved}, Skipped: ${skipped}, Failed: ${failed}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
