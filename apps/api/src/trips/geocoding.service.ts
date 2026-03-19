/**
 * Geocoding Service
 *
 * Resolves location names/codes to coordinates.
 * Resolution order:
 * 1. If lat/lng already provided — use them
 * 2. Airport IATA code — call Aerodatabox or use provided coords
 * 3. Cruise port name — query catalog.cruise_ports table
 * 4. Google Places Text Search — fallback
 */

import { Injectable, Logger } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import * as Sentry from '@sentry/nestjs'
import { DatabaseService } from '../db/database.service'
import type { GeoLocation } from '../../../../packages/shared-types/src/api'

interface ResolveLocationInput {
  iataCode?: string
  portName?: string
  address?: string
  name?: string
  lat?: number
  lng?: number
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Resolve a location to a GeoLocation with name + coordinates.
   * Returns null if resolution fails.
   */
  async resolveLocation(input: ResolveLocationInput): Promise<GeoLocation | null> {
    // 1. If coordinates already provided, use them directly
    if (input.lat != null && input.lng != null) {
      // Guard against zero coordinates (null island)
      if (input.lat === 0 && input.lng === 0) {
        return null
      }
      return {
        name: input.name || input.address || `${input.lat}, ${input.lng}`,
        lat: input.lat,
        lng: input.lng,
      }
    }

    // 2. Airport IATA code — query cruise_ports or use a known airport DB
    if (input.iataCode) {
      try {
        const result = await this.resolveAirport(input.iataCode)
        if (result) return result
      } catch (err) {
        this.logger.warn(`Failed to resolve airport ${input.iataCode}: ${err}`)
        Sentry.captureException(err, {
          tags: { service: 'geocoding', source: 'resolve-location' },
          extra: { iataCode: input.iataCode, step: 'airport' },
        })
      }
    }

    // 3. Cruise port name — query catalog.cruise_ports
    if (input.portName) {
      try {
        const result = await this.resolveCruisePort(input.portName)
        if (result) return result
      } catch (err) {
        this.logger.warn(`Failed to resolve cruise port ${input.portName}: ${err}`)
        Sentry.captureException(err, {
          tags: { service: 'geocoding', source: 'resolve-location' },
          extra: { portName: input.portName, step: 'cruise-port' },
        })
      }
    }

    // 4. Google Places Text Search — fallback for addresses/names
    if (input.address || input.name) {
      const query = input.address || input.name!
      try {
        const result = await this.resolveViaGooglePlaces(query)
        if (result) return result
      } catch (err) {
        this.logger.warn(`Failed to resolve via Google Places: ${err}`)
        Sentry.captureException(err, {
          tags: { service: 'geocoding', source: 'resolve-location' },
          extra: { query, step: 'google-places' },
        })
      }
    }

    return null
  }

  /**
   * Resolve airport IATA code to coordinates.
   * Uses raw SQL to query known airports or returns null.
   */
  private async resolveAirport(iataCode: string): Promise<GeoLocation | null> {
    // Try Aerodatabox API if available (via env)
    const apiKey = process.env.AERODATABOX_API_KEY
    if (apiKey) {
      try {
        const response = await fetch(
          `https://aerodatabox.p.rapidapi.com/airports/iata/${iataCode}`,
          {
            headers: {
              'X-RapidAPI-Key': apiKey,
              'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
            },
          }
        )
        if (response.ok) {
          const data = await response.json() as { fullName?: string; municipalityName?: string; location?: { lat?: number; lon?: number } }
          if (data.location?.lat != null && data.location?.lon != null &&
              !(data.location.lat === 0 && data.location.lon === 0)) {
            return {
              name: data.municipalityName || data.fullName || iataCode,
              lat: data.location.lat,
              lng: data.location.lon,
            }
          }
        }
      } catch (err) {
        this.logger.debug(`Aerodatabox lookup failed for ${iataCode}: ${err}`)
        Sentry.captureException(err, {
          tags: { service: 'geocoding', source: 'airport' },
          extra: { iataCode },
        })
      }
    }

    return null
  }

  /**
   * Resolve cruise port name to coordinates from catalog.cruise_ports.
   */
  private async resolveCruisePort(portName: string): Promise<GeoLocation | null> {
    try {
      const results = await this.db.client.execute(
        sql`SELECT name, latitude, longitude FROM catalog.cruise_ports WHERE LOWER(name) = LOWER(${portName}) LIMIT 1`
      ) as unknown as Array<{ name: string; latitude: string; longitude: string }>

      // Handle different return shapes from raw execute
      const rows = Array.isArray(results) ? results : (results as any)?.rows || []
      if (rows.length > 0 && rows[0].latitude && rows[0].longitude) {
        return {
          name: rows[0].name,
          lat: Number(rows[0].latitude),
          lng: Number(rows[0].longitude),
        }
      }
    } catch (err) {
      this.logger.debug(`Cruise port lookup failed for ${portName}: ${err}`)
      Sentry.captureException(err, {
        tags: { service: 'geocoding', source: 'cruise-port' },
        extra: { portName },
      })
    }

    return null
  }

  /**
   * Resolve location via Google Places Text Search API.
   * Uses the same API key as google-places-hotels.provider.ts.
   */
  private async resolveViaGooglePlaces(query: string): Promise<GeoLocation | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (!apiKey) {
      this.logger.debug('GOOGLE_PLACES_API_KEY not configured, skipping Places lookup')
      return null
    }

    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.location',
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: 1,
        }),
      })

      if (!response.ok) {
        const msg = `Google Places API returned ${response.status}: ${response.statusText}`
        this.logger.warn(msg)
        Sentry.captureMessage(msg, {
          level: 'warning',
          tags: { service: 'geocoding', source: 'google-places' },
          extra: { query, status: response.status },
        })
        return null
      }

      const data = await response.json() as {
        places?: Array<{
          displayName?: { text?: string }
          location?: { latitude?: number; longitude?: number }
        }>
      }

      const place = data.places?.[0]
      if (place?.location?.latitude != null && place?.location?.longitude != null &&
          !(place.location.latitude === 0 && place.location.longitude === 0)) {
        return {
          name: place.displayName?.text || query,
          lat: place.location.latitude,
          lng: place.location.longitude,
        }
      }
    } catch (err) {
      this.logger.debug(`Google Places lookup failed for "${query}": ${err}`)
      Sentry.captureException(err, {
        tags: { service: 'geocoding', source: 'google-places' },
        extra: { query },
      })
    }

    return null
  }
}
