/**
 * Softvoyage VCO Catalog Client Service
 *
 * HTTP client for the Softvoyage VCO JSON APIs.
 * Fetches gateways, destinations, and hotels — no authentication required.
 *
 * API base: SOFTVOYAGE_VCO_BASE_URL/ajax.cgi
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

// ============================================================================
// TYPES
// ============================================================================

export interface VcoGateway {
  name: string
  airportCode: string
}

export interface VcoDestination {
  name: string
  id: string
  countryCodes: string
  durations: number[]
  isGroup: boolean
}

export interface VcoHotel {
  name: string
  id: string
}

// Raw API response shapes
interface VcoGatewaysResponse {
  gateways: string[]
}

interface VcoDestinationsResponse {
  destinations: string[]
}

interface VcoHotelsResponse {
  hotels: string[]
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class SoftvoyageCatalogClientService {
  private readonly logger = new Logger(SoftvoyageCatalogClientService.name)

  private readonly baseUrl: string
  private readonly codeAg: string
  private readonly alias: string

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.baseUrl = this.configService.get<string>('SOFTVOYAGE_VCO_BASE_URL', '')
    this.codeAg = this.configService.get<string>('SOFTVOYAGE_VCO_CODE_AG', '')
    this.alias = this.configService.get<string>('SOFTVOYAGE_VCO_ALIAS', '')
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Fetch all departure gateways available for vacation packages.
   *
   * API: GET {baseUrl}/ajax.cgi?action=getPackagesGateways&...
   * Response: [{"gateways":["Toronto--xx--YYZ","Montreal--xx--YUL",...]}]
   */
  async fetchGateways(): Promise<VcoGateway[]> {
    const url = `${this.baseUrl}/ajax.cgi`
    const params = {
      action: 'getPackagesGateways',
      code_ag: this.codeAg,
      alias: this.alias,
      language: 'en',
    }

    this.logger.debug(`Fetching gateways from VCO API`)

    const response = await firstValueFrom(
      this.httpService.get<VcoGatewaysResponse[]>(url, { params })
    )

    const data = response.data
    if (!data || data.length === 0 || !data[0]?.gateways) {
      this.logger.warn('VCO gateways response was empty or malformed')
      return []
    }

    const gateways = this.parseGateways(data[0].gateways)
    this.logger.log(`Fetched ${gateways.length} gateways from VCO`)
    return gateways
  }

  /**
   * Fetch destinations available for a given departure gateway.
   *
   * API: GET {baseUrl}/ajax.cgi?action=getPackagesDestinations&gateway_dep={gatewayCode}&...
   * Response: [{"destinations":["CancunString--xx--RestOfData",...]}]
   */
  async fetchDestinations(gatewayCode: string): Promise<VcoDestination[]> {
    const url = `${this.baseUrl}/ajax.cgi`
    const params = {
      action: 'getPackagesDestinations',
      code_ag: this.codeAg,
      alias: this.alias,
      gateway_dep: gatewayCode,
      language: 'en',
    }

    this.logger.debug(`Fetching destinations for gateway ${gatewayCode}`)

    const response = await firstValueFrom(
      this.httpService.get<VcoDestinationsResponse[]>(url, { params })
    )

    const data = response.data
    if (!data || data.length === 0 || !data[0]?.destinations) {
      this.logger.warn(`VCO destinations response was empty or malformed for gateway ${gatewayCode}`)
      return []
    }

    const destinations = this.parseDestinations(data[0].destinations)
    this.logger.log(`Fetched ${destinations.length} destinations for gateway ${gatewayCode}`)
    return destinations
  }

  /**
   * Fetch hotels for a given gateway and destination IDs.
   *
   * API: GET {baseUrl}/ajax.cgi?action=getPackagesHotels&gateway_dep={gatewayCode}&dest_dep={destIds}&...
   * Response: [{"hotels":["Hotel Name--xx--123",...]}]
   */
  async fetchHotels(gatewayCode: string, destIds: string): Promise<VcoHotel[]> {
    const url = `${this.baseUrl}/ajax.cgi`
    const params = {
      action: 'getPackagesHotels',
      code_ag: this.codeAg,
      alias: this.alias,
      gateway_dep: gatewayCode,
      dest_dep: destIds,
      language: 'en',
    }

    this.logger.debug(`Fetching hotels for gateway ${gatewayCode}, dest ${destIds}`)

    const response = await firstValueFrom(
      this.httpService.get<VcoHotelsResponse[]>(url, { params })
    )

    const data = response.data
    if (!data || data.length === 0 || !data[0]?.hotels) {
      this.logger.warn(`VCO hotels response was empty or malformed for gateway ${gatewayCode}, dest ${destIds}`)
      return []
    }

    const hotels = this.parseHotels(data[0].hotels)
    this.logger.log(`Fetched ${hotels.length} hotels for gateway ${gatewayCode}, dest ${destIds}`)
    return hotels
  }

  // ============================================================================
  // PRIVATE PARSING METHODS
  // ============================================================================

  /**
   * Parse raw gateway strings.
   * Format: "City Name--xx--AIRPORT_CODE"
   * Example: "Toronto--xx--YYZ" → { name: "Toronto", airportCode: "YYZ" }
   */
  private parseGateways(raw: string[]): VcoGateway[] {
    const gateways: VcoGateway[] = []

    for (const entry of raw) {
      const parts = entry.split('--xx--')
      if (parts.length < 2) {
        this.logger.debug(`Skipping malformed gateway entry: ${entry}`)
        continue
      }
      const name = parts[0]!.trim()
      const airportCode = parts[1]!.trim()

      if (!name || !airportCode) {
        this.logger.debug(`Skipping gateway entry with missing fields: ${entry}`)
        continue
      }

      gateways.push({ name, airportCode })
    }

    return gateways
  }

  /**
   * Parse raw destination strings.
   *
   * Format: "Name--xx--Name xxxDEST_IDSxxxCOUNTRY_CODES--xx--DURATIONS"
   *
   * Skip separator entries that match pattern: "--xx-- xxx--xx--"
   *
   * Examples:
   *   "Cancun--xx--Cancun xxx101,102xxxMX--xx--7,14"
   *     → Two entries with individual IDs:
   *       { name: "Cancun", id: "101", countryCodes: "MX", durations: [7, 14], isGroup: false }
   *       { name: "Cancun", id: "102", countryCodes: "MX", durations: [7, 14], isGroup: false }
   *   "All Mexico--xx--..."
   *     → isGroup: true (starts with "All ")
   *   "- Beach Resorts--xx--..."
   *     → isGroup: true (starts with "- ")
   *
   * Per spec: providerIdentifier stores individual destination IDs only, not
   * combined/composite strings. Comma-separated IDs are split into separate entries.
   */
  private parseDestinations(raw: string[]): VcoDestination[] {
    const destinations: VcoDestination[] = []

    for (const d of raw) {
      // Skip separator entries (e.g., "--xx-- xxx--xx--") and empty strings
      if (!d.trim() || d.trim().startsWith('--xx--')) continue

      const parts = d.split('--xx--')
      // VCO format: "DisplayName--xx--NameWithIds xxx<IDs>--xx--durations"
      // Example: "Anguilla (Anguilla)--xx--Anguilla (Anguilla) xxx174--xx--5,6,7,8,14"
      // Example: "Bahamas--xx--Bahamas xxx25_188--xx--4,5,6,7,8"
      // Example: "- Nassau--xx--Nassau xxx25--xx--4,5,6,7,8"

      const displayName = (parts[0] ?? '').trim()
      const idsField = (parts[1] ?? '').trim()
      const durField = (parts[2] ?? '').trim()

      if (!displayName) continue

      // Clean display name: remove leading "- " for sub-destinations
      const isSubDest = displayName.startsWith('- ')
      const isGroup = displayName.startsWith('All ')
      const cleanName = isSubDest ? displayName.substring(2).trim() : displayName

      // Extract numeric IDs after "xxx" in the second field
      // "Anguilla (Anguilla) xxx174" → "174"
      // "Bahamas xxx25_188" → "25_188"
      const xxxIdx = idsField.lastIndexOf('xxx')
      const rawIds = xxxIdx >= 0 ? idsField.substring(xxxIdx + 3).trim() : ''

      // Extract country info from parentheses in display name
      // "Anguilla (Anguilla)" → countryCodes = ""  (it's a location, not a code)
      // We don't have real country codes from VCO — leave empty
      const countryCodes = ''

      // Parse durations
      const durations = durField
        ? durField.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n))
        : []

      // Split composite IDs (underscore-separated): "25_188" → ["25", "188"]
      const individualIds = rawIds.split('_').map((s) => s.trim()).filter(Boolean)

      if (individualIds.length === 0) {
        destinations.push({ name: cleanName, id: '', countryCodes, durations, isGroup })
      } else {
        for (const id of individualIds) {
          destinations.push({ name: cleanName, id, countryCodes, durations, isGroup })
        }
      }
    }

    return destinations
  }

  /**
   * Parse raw hotel strings.
   * Format: "Hotel Name--xx--HOTEL_ID"
   * Example: "Riu Palace Las Americas--xx--101" → { name: "Riu Palace Las Americas", id: "101" }
   */
  private parseHotels(raw: string[]): VcoHotel[] {
    const hotels: VcoHotel[] = []

    for (const entry of raw) {
      const parts = entry.split('--xx--')
      if (parts.length < 2) {
        this.logger.debug(`Skipping malformed hotel entry: ${entry}`)
        continue
      }
      const name = parts[0]!.trim()
      const id = parts[1]!.trim()

      if (!name || !id) {
        this.logger.debug(`Skipping hotel entry with missing fields: ${entry}`)
        continue
      }

      hotels.push({ name, id })
    }

    return hotels
  }
}
