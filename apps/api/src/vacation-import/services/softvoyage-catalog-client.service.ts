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
   *     → { name: "Cancun", id: "101,102", countryCodes: "MX", durations: [7, 14], isGroup: false }
   *   "All Mexico--xx--..."
   *     → isGroup: true (starts with "All ")
   *   "- Beach Resorts--xx--..."
   *     → isGroup: true (starts with "- ")
   */
  private parseDestinations(raw: string[]): VcoDestination[] {
    const destinations: VcoDestination[] = []

    for (const d of raw) {
      // Skip separator entries (e.g., "--xx-- xxx--xx--")
      if (d.trim().startsWith('--xx--') || d.trim() === '') {
        continue
      }

      const [displayPart, ...restParts] = d.split('--xx--')
      const rest = restParts.join('--xx--')
      const name = (displayPart ?? '').trim()

      // Skip entries with no name
      if (!name) continue

      // Skip separator-style entries (blank name before first --xx--)
      if (name === '' || (name.startsWith(' ') && name.trim() === '')) continue

      const isGroup = name.startsWith('All ') || name.startsWith('- ')

      // Extract IDs between first pair of xxx markers: xxx<IDS>xxx
      const xxxMatch = rest.match(/xxx(.+?)xxx/)
      const id = xxxMatch ? xxxMatch[1]! : ''

      // Extract country codes: uppercase letters+commas between xxx markers and --xx--
      const ccMatch = rest.match(/xxx([A-Z,]+)--xx--/)
      const countryCodes = ccMatch ? ccMatch[1]! : ''

      // Extract durations after last --xx--: digits and commas
      const durMatch = rest.match(/--xx--([0-9,]+)$/)
      const durationsRaw = durMatch ? durMatch[1]! : ''
      const durations = durationsRaw
        ? durationsRaw.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n))
        : []

      destinations.push({ name, id, countryCodes, durations, isGroup })
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
