/**
 * Booking.com Hotels Provider
 *
 * External API provider for hotel amenity enrichment using Booking.com
 * DataCrawler API via RapidAPI.
 *
 * Features:
 * - Coordinate-based hotel search
 * - Levenshtein distance name matching with 0.7 threshold
 * - Haversine distance filter (500m radius)
 * - Facility extraction and normalization
 * - In-memory caching with composite keys
 * - Rate limiting and graceful degradation
 *
 * @see https://rapidapi.com/DataCrawler/api/booking-com15
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as Sentry from '@sentry/nestjs'
import { BaseExternalApi } from '../../core/base/base-external-api'
import { RateLimiterService } from '../../core/services/rate-limiter.service'
import { MetricsService } from '../../core/services/metrics.service'
import { ExternalApiRegistryService } from '../../core/services/external-api-registry.service'
import {
  ExternalApiConfig,
  ExternalApiResponse,
  ConnectionTestResult,
  ApiCategory,
} from '../../core/interfaces'
import { HotelSearchParams, NormalizedHotelResult } from '@tailfire/shared-types'
import {
  BookingComApiResponse,
  BookingComSearchResponse,
  BookingComHotelSearchResult,
  BookingComHotelDetails,
  BookingComEnrichmentResult,
  BOOKING_COM_FACILITY_MAP,
  PRIORITY_AMENITIES,
} from './booking-com.types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const RAPIDAPI_HOST = 'booking-com15.p.rapidapi.com'
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1`

/**
 * Build provider configuration
 */
function buildBookingComConfig(): ExternalApiConfig {
  return {
    provider: 'booking_com',
    category: ApiCategory.HOTELS,
    baseUrl: BASE_URL,
    rateLimit: {
      requestsPerMinute: parseInt(process.env.BOOKING_COM_RATE_LIMIT_PER_MINUTE || '30', 10),
      requestsPerHour: parseInt(process.env.BOOKING_COM_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: {
      type: 'apiKey',
      headerName: 'x-rapidapi-key',
    },
  }
}

/**
 * Priority for fallback ordering (2 = secondary, enrichment-only)
 */
const PROVIDER_PRIORITY = 2

// ============================================================================
// MATCHING THRESHOLDS
// ============================================================================

/** Minimum Levenshtein similarity for a match (0-1) */
const MIN_NAME_SIMILARITY = 0.7

/** Maximum coordinate distance in km for a match (Booking.com returns regional results) */
const MAX_COORD_DISTANCE_KM = 100

/** Cache TTL in milliseconds (24 hours) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// ============================================================================
// PROVIDER IMPLEMENTATION
// ============================================================================

@Injectable()
export class BookingComHotelsProvider
  extends BaseExternalApi<HotelSearchParams, NormalizedHotelResult>
  implements OnModuleInit
{
  private readonly providerLogger = new Logger(BookingComHotelsProvider.name)

  /**
   * Cache for hotel ID matches
   * Key: composite key of placeId + rounded coordinates
   * Value: { hotelId, expiresAt }
   */
  private matchCache = new Map<string, { hotelId: string; expiresAt: number }>()

  /**
   * Request counter for rate limiting
   */
  private requestCount = 0
  private requestCountResetAt = Date.now() + 3600000 // 1 hour from now

  constructor(
    httpService: HttpService,
    rateLimiter: RateLimiterService,
    metrics: MetricsService,
    private readonly registry: ExternalApiRegistryService
  ) {
    super(buildBookingComConfig(), httpService, rateLimiter, metrics)
  }

  /**
   * Register with the API registry on module initialization
   */
  async onModuleInit(): Promise<void> {
    await this.registry.registerProvider(this, PROVIDER_PRIORITY)
    this.providerLogger.log('BookingComHotelsProvider registered')
  }

  // ============================================================================
  // ENRICHMENT API (PRIMARY USE CASE)
  // ============================================================================

  /**
   * Enrich hotel with amenities from Booking.com
   *
   * @param placeId - Google Places ID for caching
   * @param hotelName - Hotel name for matching
   * @param latitude - Coordinate for matching
   * @param longitude - Coordinate for matching
   * @param checkInDate - Optional YYYY-MM-DD for API (uses real dates when available)
   * @param checkOutDate - Optional YYYY-MM-DD for API
   * @returns Enrichment result with amenities, or empty result on failure
   */
  async enrichWithAmenities(
    placeId: string,
    hotelName: string,
    latitude: number,
    longitude: number,
    checkInDate?: string,
    checkOutDate?: string
  ): Promise<BookingComEnrichmentResult> {
    const emptyResult: BookingComEnrichmentResult = {
      hotelId: '',
      matchScore: 0,
      amenities: [],
    }

    // Validate required params
    if (!placeId || !hotelName || latitude == null || longitude == null) {
      this.providerLogger.debug('Missing required params for enrichment')
      return emptyResult
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      this.providerLogger.debug('Invalid coordinate range')
      return emptyResult
    }

    // Check rate limit
    if (!this.checkAndIncrementRateLimit()) {
      this.providerLogger.warn('Rate limit reached, skipping enrichment')
      return emptyResult
    }

    // Check cache
    const cacheKey = this.buildCacheKey(placeId, latitude, longitude)
    const cached = this.matchCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      this.providerLogger.debug(`Cache hit for ${cacheKey}`)
      return this.getFacilitiesForHotel(cached.hotelId, checkInDate, checkOutDate)
    }

    try {
      // Search by coordinates
      const hotels = await this.searchByCoordinates(latitude, longitude, checkInDate, checkOutDate)

      // Find best match
      const bestMatch = this.findBestMatch(hotelName, latitude, longitude, hotels)
      if (!bestMatch.hotel) {
        this.providerLogger.debug(`No match found for "${hotelName}"`)
        return emptyResult
      }

      // Cache the match
      const hotelId = bestMatch.hotel.hotel_id.toString()
      this.matchCache.set(cacheKey, {
        hotelId,
        expiresAt: Date.now() + CACHE_TTL_MS,
      })

      // Get facilities
      const result = await this.getFacilitiesForHotel(hotelId, checkInDate, checkOutDate)
      result.matchScore = bestMatch.score
      return result
    } catch (error: any) {
      this.providerLogger.error('Enrichment failed', {
        error: error.message,
        hotelName,
        latitude,
        longitude,
      })
      Sentry.captureException(error, {
        tags: { service: 'booking_com', operation: 'enrich-amenities' },
        extra: { hotelName, latitude, longitude, placeId },
      })
      return emptyResult
    }
  }

  // ============================================================================
  // IEXTERNALAPIPROVIDER IMPLEMENTATION (for registry compatibility)
  // ============================================================================

  /**
   * Search is not supported - this provider is enrichment-only
   * Google Places handles primary hotel search
   */
  async search(
    _params: HotelSearchParams
  ): Promise<ExternalApiResponse<NormalizedHotelResult[]>> {
    return {
      success: false,
      error: 'Booking.com provider is enrichment-only. Use Google Places for hotel search.',
      metadata: {
        provider: this.config.provider,
        timestamp: new Date().toISOString(),
      },
    }
  }

  /**
   * Get details is not the primary use case but included for completeness
   */
  async getDetails(
    hotelId: string,
    additionalParams?: Record<string, any>
  ): Promise<ExternalApiResponse<NormalizedHotelResult>> {
    const checkIn = additionalParams?.checkIn
    const checkOut = additionalParams?.checkOut
    const result = await this.getFacilitiesForHotel(hotelId, checkIn, checkOut)

    if (result.amenities.length === 0) {
      return {
        success: false,
        error: 'Failed to get hotel details',
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
        },
      }
    }

    return {
      success: true,
      data: {
        id: hotelId,
        name: '',
        location: { address: '' },
        amenities: result.amenities,
        provider: 'booking_com',
        providers: ['booking_com'],
      },
      metadata: {
        provider: this.config.provider,
        timestamp: new Date().toISOString(),
      },
    }
  }

  validateParams(params: HotelSearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (!params.hotelName && !params.destination) {
      errors.push('Hotel name or destination required')
    }
    return { valid: errors.length === 0, errors }
  }

  transformResponse(_apiData: any): NormalizedHotelResult {
    return {
      id: '',
      name: '',
      location: { address: '' },
      provider: 'booking_com',
      providers: ['booking_com'],
    }
  }

  /**
   * Test connection to Booking.com API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.credentials) {
      return { success: false, message: 'No credentials configured' }
    }

    try {
      // Simple destination search to verify API key
      const response = await firstValueFrom(
        this.httpService.get(`${BASE_URL}/hotels/searchDestination`, {
          params: { query: 'Paris' },
          headers: this.getAuthHeaders(),
          timeout: 10000,
        })
      )

      if (response.data?.status === true || response.data?.data) {
        return {
          success: true,
          message: 'API key valid - Booking.com connection successful',
        }
      }

      return {
        success: false,
        message: 'Unexpected API response format',
      }
    } catch (error: any) {
      const statusCode = error.response?.status
      const message = statusCode === 401 || statusCode === 403
        ? 'Invalid RapidAPI key'
        : error.message || 'Connection test failed'

      Sentry.captureException(error, {
        tags: { service: 'booking_com', operation: 'test-connection' },
        level: 'warning',
      })
      return { success: false, message }
    }
  }

  // ============================================================================
  // PRIVATE METHODS: SEARCH AND MATCHING
  // ============================================================================

  /**
   * Search hotels by coordinates
   */
  private async searchByCoordinates(
    latitude: number,
    longitude: number,
    checkIn?: string,
    checkOut?: string
  ): Promise<BookingComHotelSearchResult[]> {
    const { arrival, departure } = this.getSearchDates(checkIn, checkOut)

    try {
      const response = await firstValueFrom(
        this.httpService.get<BookingComApiResponse<BookingComSearchResponse>>(
          `${BASE_URL}/hotels/searchHotelsByCoordinates`,
          {
            params: {
              latitude,
              longitude,
              arrival_date: arrival,
              departure_date: departure,
              adults: 1,
              room_qty: 1,
              units: 'metric',
              page_number: 1,
              languagecode: 'en-us',
              currency_code: 'USD',
            },
            headers: this.getAuthHeaders(),
            timeout: this.resilience.timeoutMs,
          }
        )
      )

      return response.data?.data?.result || []
    } catch (error: any) {
      this.providerLogger.error('Coordinate search failed', { error: error.message })
      Sentry.captureException(error, {
        tags: { service: 'booking_com', operation: 'search-by-coordinates' },
        extra: { latitude, longitude },
      })
      return []
    }
  }

  /**
   * Find best matching hotel using Levenshtein + Haversine distance
   */
  private findBestMatch(
    targetName: string,
    targetLat: number,
    targetLng: number,
    hotels: BookingComHotelSearchResult[]
  ): { hotel: BookingComHotelSearchResult | null; score: number } {
    if (!hotels.length) {
      return { hotel: null, score: 0 }
    }

    const targetNorm = this.normalizeName(targetName)
    let bestScore = 0
    let bestMatch: BookingComHotelSearchResult | null = null

    for (const hotel of hotels) {
      // Check coordinate distance first (fast filter)
      const distance = this.haversineDistance(
        targetLat,
        targetLng,
        hotel.latitude,
        hotel.longitude
      )

      if (distance > MAX_COORD_DISTANCE_KM) {
        continue
      }

      // Calculate name similarity using multiple strategies
      const hotelNorm = this.normalizeName(hotel.hotel_name || '')
      const similarity = this.calculateNameSimilarity(targetNorm, hotelNorm)

      if (similarity > bestScore && similarity >= MIN_NAME_SIMILARITY) {
        bestScore = similarity
        bestMatch = hotel
      }
    }

    return { hotel: bestMatch, score: bestScore }
  }

  /**
   * Calculate name similarity using multiple strategies:
   * 1. Substring match (if shorter name is contained in longer)
   * 2. Token-based overlap (for partial matches like "Dreams Vista" in "Dreams Vista Cancun Resort")
   * 3. Levenshtein similarity (for typo tolerance)
   */
  private calculateNameSimilarity(a: string, b: string): number {
    if (a === b) return 1
    if (!a.length || !b.length) return 0

    // Strategy 1: Substring match - if one name contains the other
    const shorter = a.length <= b.length ? a : b
    const longer = a.length > b.length ? a : b
    if (longer.includes(shorter)) {
      // Score based on how much of the longer string is covered
      return Math.max(0.85, shorter.length / longer.length)
    }

    // Strategy 2: Token-based overlap
    const tokensA = new Set(a.split(' ').filter(t => t.length > 2))
    const tokensB = new Set(b.split(' ').filter(t => t.length > 2))
    if (tokensA.size > 0 && tokensB.size > 0) {
      let matchCount = 0
      for (const token of tokensA) {
        if (tokensB.has(token)) matchCount++
      }
      const tokenSimilarity = matchCount / Math.min(tokensA.size, tokensB.size)
      if (tokenSimilarity >= 0.7) {
        return tokenSimilarity
      }
    }

    // Strategy 3: Levenshtein for typo tolerance
    return this.levenshteinSimilarity(a, b)
  }

  /**
   * Normalize hotel name for comparison
   * - Lowercase
   * - Remove accents/diacritics
   * - Remove non-alphanumeric except spaces
   * - Collapse whitespace
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '') // Keep alphanumeric + spaces
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Calculate Levenshtein similarity (0-1)
   *
   * Uses dynamic programming to compute edit distance,
   * then normalizes to a similarity score.
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1
    if (!a.length || !b.length) return 0

    // Create DP matrix with proper initialization
    const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
      Array.from({ length: b.length + 1 }, () => 0)
    )

    // Initialize first row and column
    for (let i = 0; i <= a.length; i++) {
      matrix[i]![0] = i
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0]![j] = j
    }

    // Fill matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1, // deletion
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j - 1]! + cost // substitution
        )
      }
    }

    const distance = matrix[a.length]![b.length]!
    return 1 - distance / Math.max(a.length, b.length)
  }

  /**
   * Calculate Haversine distance between two coordinates in km
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371 // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  // ============================================================================
  // PRIVATE METHODS: FACILITIES
  // ============================================================================

  /**
   * Get facilities for a specific hotel ID
   */
  private async getFacilitiesForHotel(
    hotelId: string,
    checkIn?: string,
    checkOut?: string
  ): Promise<BookingComEnrichmentResult> {
    const { arrival, departure } = this.getSearchDates(checkIn, checkOut)

    try {
      const response = await firstValueFrom(
        this.httpService.get<BookingComApiResponse<BookingComHotelDetails>>(
          `${BASE_URL}/hotels/getHotelDetails`,
          {
            params: {
              hotel_id: hotelId,
              arrival_date: arrival,
              departure_date: departure,
              adults: 1,
              room_qty: 1,
              languagecode: 'en-us',
              currency_code: 'USD',
            },
            headers: this.getAuthHeaders(),
            timeout: this.resilience.timeoutMs,
          }
        )
      )

      const hotelData = response.data?.data
      if (!hotelData) {
        return { hotelId, matchScore: 0, amenities: [] }
      }

      // Note: facilities_block.facilities is a flat array of facilities, not groups
      const amenities = this.extractFacilitiesFromBlock(hotelData.facilities_block)

      return {
        hotelId,
        matchScore: 1, // Will be overwritten by caller
        amenities,
        checkInTime: hotelData.checkin?.from,
        checkOutTime: hotelData.checkout?.until,
      }
    } catch (error: any) {
      this.providerLogger.error('Failed to get facilities', {
        hotelId,
        error: error.message,
      })
      Sentry.captureException(error, {
        tags: { service: 'booking_com', operation: 'get-facilities' },
        extra: { hotelId },
      })
      return { hotelId, matchScore: 0, amenities: [] }
    }
  }

  /**
   * Extract and normalize facilities from facilities_block
   *
   * The API returns a structure like:
   * {
   *   "type": "popular",
   *   "name": "Most Popular Facilities",
   *   "facilities": [
   *     { "name": "2 swimming pools", "icon": "pool" },
   *     { "name": "Spa", "icon": "spa" },
   *     { "name": "Free Wifi", "icon": "wifi" }
   *   ]
   * }
   */
  private extractFacilitiesFromBlock(facilitiesBlock: any): string[] {
    const amenitiesSet = new Set<string>()

    // Handle both array format (multiple blocks) and single block format
    const blocks = Array.isArray(facilitiesBlock) ? facilitiesBlock : [facilitiesBlock]

    for (const block of blocks) {
      const facilities = block?.facilities || []
      for (const facility of facilities) {
        const facilityName = (facility.name || '').toLowerCase().trim()

        // Try direct lookup first
        let normalized = BOOKING_COM_FACILITY_MAP[facilityName]

        // If no direct match, try fuzzy matching for common patterns
        if (!normalized) {
          normalized = this.fuzzyMatchFacility(facilityName)
        }

        if (normalized) {
          amenitiesSet.add(normalized)
        }
      }
    }

    // Sort by priority (known important amenities first)
    const result = Array.from(amenitiesSet)
    result.sort((a, b) => {
      const aIdx = PRIORITY_AMENITIES.indexOf(a)
      const bIdx = PRIORITY_AMENITIES.indexOf(b)
      // If both are priority, sort by priority order
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
      // Priority items come first
      if (aIdx >= 0) return -1
      if (bIdx >= 0) return 1
      // Otherwise alphabetical
      return a.localeCompare(b)
    })

    this.providerLogger.debug(`Extracted ${result.length} amenities from facilities_block`, { amenities: result })
    return result
  }

  /**
   * Fuzzy match facility names that aren't exact matches
   * Handles patterns like "2 swimming pools" → "Pool", "24-hour gym" → "Fitness Center"
   */
  private fuzzyMatchFacility(facilityName: string): string | undefined {
    // Pool patterns
    if (facilityName.includes('pool') || facilityName.includes('swimming')) {
      if (facilityName.includes('outdoor')) return 'Outdoor Pool'
      if (facilityName.includes('indoor')) return 'Indoor Pool'
      if (facilityName.includes('heated')) return 'Heated Pool'
      if (facilityName.includes('infinity')) return 'Infinity Pool'
      return 'Pool'
    }

    // WiFi patterns
    if (facilityName.includes('wifi') || facilityName.includes('wi-fi')) {
      if (facilityName.includes('free')) return 'Free WiFi'
      return 'WiFi'
    }

    // Fitness/Gym patterns
    if (facilityName.includes('gym') || facilityName.includes('fitness')) {
      return 'Fitness Center'
    }

    // Spa patterns
    if (facilityName.includes('spa') && !facilityName.includes('parking space')) {
      return 'Spa'
    }

    // Restaurant/Dining patterns
    if (facilityName.includes('restaurant')) return 'Restaurant'
    if (facilityName.includes('bar') && !facilityName.includes('grab')) return 'Bar'
    if (facilityName.includes('room service')) return 'Room Service'
    if (facilityName.includes('breakfast')) {
      if (facilityName.includes('buffet')) return 'Breakfast Buffet'
      return 'Breakfast'
    }

    // Parking patterns
    if (facilityName.includes('parking') || facilityName.includes('garage')) {
      if (facilityName.includes('free')) return 'Free Parking'
      if (facilityName.includes('valet')) return 'Valet Parking'
      return 'Parking'
    }

    // Shuttle patterns
    if (facilityName.includes('shuttle') || facilityName.includes('airport')) {
      if (facilityName.includes('free')) return 'Free Airport Shuttle'
      return 'Airport Shuttle'
    }

    // Front desk patterns
    if (facilityName.includes('front desk') || facilityName.includes('reception')) {
      if (facilityName.includes('24')) return '24-Hour Front Desk'
      return 'Front Desk'
    }

    // Other common amenities
    if (facilityName.includes('concierge')) return 'Concierge'
    if (facilityName.includes('laundry')) return 'Laundry'
    if (facilityName.includes('dry clean')) return 'Dry Cleaning'
    if (facilityName.includes('business cent')) return 'Business Center'
    if (facilityName.includes('air condition')) return 'Air Conditioning'
    if (facilityName.includes('sauna')) return 'Sauna'
    if (facilityName.includes('hot tub') || facilityName.includes('jacuzzi')) return 'Hot Tub'
    if (facilityName.includes('steam room')) return 'Steam Room'
    if (facilityName.includes('massage')) return 'Massage'
    if (facilityName.includes('beach')) {
      if (facilityName.includes('private')) return 'Private Beach'
      if (facilityName.includes('front')) return 'Beachfront'
      return 'Beach Access'
    }
    if (facilityName.includes('pet') || facilityName.includes('dog')) return 'Pet Friendly'
    if (facilityName.includes('wheelchair') || facilityName.includes('accessible') || facilityName.includes('disabled')) return 'Wheelchair Accessible'
    if (facilityName.includes('non-smoking') || facilityName.includes('non smoking')) return 'Non-Smoking Rooms'
    if (facilityName.includes('family room')) return 'Family Rooms'
    if (facilityName.includes('elevator') || facilityName.includes('lift')) return 'Elevator'
    if (facilityName.includes('garden')) return 'Garden'
    if (facilityName.includes('tennis')) return 'Tennis Court'
    if (facilityName.includes('golf')) return 'Golf Course'
    if (facilityName.includes('casino')) return 'Casino'
    if (facilityName.includes('kids') || facilityName.includes("children")) {
      if (facilityName.includes('club')) return 'Kids Club'
      if (facilityName.includes('play')) return 'Playground'
    }
    if (facilityName.includes('balcony')) return 'Balcony'
    if (facilityName.includes('terrace')) return 'Terrace'
    if (facilityName.includes('minibar')) return 'Minibar'
    if (facilityName.includes('safe')) return 'In-Room Safe'

    return undefined
  }

  // ============================================================================
  // PRIVATE METHODS: UTILITIES
  // ============================================================================

  /**
   * Build composite cache key
   * Uses placeId + rounded coordinates for uniqueness
   */
  private buildCacheKey(placeId: string, lat: number, lng: number): string {
    // Round coords to 3 decimal places (~111m precision)
    const roundedLat = Math.round(lat * 1000) / 1000
    const roundedLng = Math.round(lng * 1000) / 1000
    return `${placeId}:${roundedLat}:${roundedLng}`
  }

  /**
   * Get search dates for API
   * Uses actual dates when available, synthetic otherwise
   */
  private getSearchDates(
    checkIn?: string,
    checkOut?: string
  ): { arrival: string; departure: string } {
    if (checkIn && checkOut) {
      return { arrival: checkIn, departure: checkOut }
    }
    // Synthetic dates (tomorrow and day after)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0] ?? ''
    const nextDay = new Date(Date.now() + 172800000).toISOString().split('T')[0] ?? ''
    return { arrival: tomorrow, departure: nextDay }
  }

  /**
   * Get authentication headers for RapidAPI
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'x-rapidapi-key': this.credentials?.rapidApiKey || '',
      'x-rapidapi-host': RAPIDAPI_HOST,
    }
  }

  /**
   * Check and increment rate limit counter
   * Returns true if request is allowed
   */
  private checkAndIncrementRateLimit(): boolean {
    const now = Date.now()

    // Reset counter if hour has passed
    if (now > this.requestCountResetAt) {
      this.requestCount = 0
      this.requestCountResetAt = now + 3600000
    }

    const maxRequests = parseInt(process.env.BOOKING_COM_RATE_LIMIT_PER_HOUR || '100', 10)
    if (this.requestCount >= maxRequests) {
      return false
    }

    this.requestCount++
    return true
  }

  /**
   * Override canMakeRequest for proper access check
   */
  protected canMakeRequest(): boolean {
    return super['canMakeRequest']?.() ?? true
  }
}
