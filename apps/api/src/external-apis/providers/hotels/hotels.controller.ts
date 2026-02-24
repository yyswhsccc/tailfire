/**
 * Hotels Controller
 *
 * API endpoints for hotel search and lookup functionality.
 * Composes Google Places (primary) and Amadeus Hotels (fallback) providers.
 *
 * Features:
 * - Hotel search by destination or name
 * - Hotel lookup for auto-fill (lodging form)
 * - Provider composition: Google Places metadata + Amadeus pricing
 * - Force provider override via query param
 * - Fallback when primary fails
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { createHash } from 'crypto'
import { firstValueFrom } from 'rxjs'
import { GooglePlacesHotelsProvider } from '../google-places/google-places-hotels.provider'
import { AmadeusHotelsProvider } from '../amadeus/amadeus-hotels.provider'
import { BookingComHotelsProvider } from '../booking-com/booking-com-hotels.provider'
import { ApiCredentialsService } from '../../../api-credentials/api-credentials.service'
import { CredentialResolverService } from '../../../api-credentials/credential-resolver.service'
import { ActivityMediaService, ExternalUrlAttribution } from '../../../trips/activity-media.service'
import { StorageService } from '../../../trips/storage.service'
import { ApiProvider } from '@tailfire/shared-types'
import { MediaType, ComponentEntityType } from '@tailfire/database'
import {
  HotelSearchParams,
  NormalizedHotelResult,
  HotelSearchResponse,
  HotelProvider,
} from '@tailfire/shared-types'

/**
 * DTO for importing Google Places photos to an activity
 */
interface ImportPhotosDto {
  activityId: string
  entityType?: ComponentEntityType
  photos: Array<{
    photoReference: string  // Google Places photo reference (e.g., "places/xxx/photos/yyy")
    attribution?: string
    maxWidthPx?: number
  }>
  hotelName?: string  // For caption generation
}

@Controller('external-apis/hotels')
export class HotelsController {
  private readonly logger = new Logger(HotelsController.name)

  constructor(
    private readonly googlePlaces: GooglePlacesHotelsProvider,
    private readonly amadeus: AmadeusHotelsProvider,
    private readonly bookingCom: BookingComHotelsProvider,
    private readonly credentialsService: ApiCredentialsService,
    private readonly credentialResolver: CredentialResolverService,
    private readonly httpService: HttpService,
    private readonly mediaService: ActivityMediaService,
    private readonly storageService: StorageService
  ) {}

  /**
   * Search hotels by destination or coordinates
   *
   * Provider priority:
   * 1. If `provider` query param specified, use that provider only
   * 2. Otherwise, try Google Places first
   * 3. If Google Places fails or returns no results, try Amadeus
   * 4. If dates provided, merge Amadeus pricing into Google Places results
   */
  @Get('search')
  async searchHotels(
    @Query('destination') destination?: string,
    @Query('hotelName') hotelName?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('radius') radius?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('adults') adults?: string,
    @Query('cityCode') cityCode?: string,
    @Query('provider') provider?: 'google_places' | 'amadeus'
  ): Promise<HotelSearchResponse> {
    const params: HotelSearchParams = {
      destination,
      hotelName,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      radius: radius ? parseInt(radius, 10) : undefined,
      checkIn,
      checkOut,
      adults: adults ? parseInt(adults, 10) : undefined,
      cityCode,
      provider,
    }

    // Validate minimum params
    if (!destination && !hotelName && !cityCode && (params.latitude === undefined || params.longitude === undefined)) {
      throw new BadRequestException(
        'At least one of destination, hotelName, cityCode, or coordinates is required'
      )
    }

    this.logger.log('Hotel search request', { params })

    // Initialize credentials for both providers
    await this.initializeProviderCredentials()

    // If specific provider requested, use only that one
    if (provider === 'amadeus') {
      return this.searchWithAmadeus(params)
    }
    if (provider === 'google_places') {
      return this.searchWithGooglePlaces(params)
    }

    // Default flow: Google Places first, then fallback/merge
    return this.searchWithComposition(params)
  }

  /**
   * Lookup hotel by name (autocomplete for lodging form)
   *
   * Uses Google Places primarily for better name matching and photos.
   */
  @Get('lookup')
  async lookupHotel(
    @Query('name') name: string,
    @Query('destination') destination?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('adults') adults?: string
  ): Promise<HotelSearchResponse> {
    if (!name || name.length < 3) {
      throw new BadRequestException('Hotel name must be at least 3 characters')
    }

    this.logger.log('Hotel lookup request', { name, destination, checkIn, checkOut, adults })

    await this.initializeProviderCredentials()

    const params: HotelSearchParams = {
      hotelName: name,
      destination,
    }

    // Use Google Places for lookup (better for name matching)
    const response = await this.googlePlaces.search(params)

    if (!response.success) {
      // Try Amadeus as fallback
      this.logger.warn('Google Places lookup failed, trying Amadeus', {
        error: response.error,
      })

      // Amadeus needs cityCode - if we have destination, try to search anyway
      if (destination) {
        const amadeusParams: HotelSearchParams = {
          ...params,
          // For Amadeus, we'd need a cityCode - this is a limitation
        }
        const amadeusResponse = await this.amadeus.search(amadeusParams)

        if (amadeusResponse.success && amadeusResponse.data?.length) {
          return {
            results: amadeusResponse.data,
            provider: 'amadeus',
            usedFallback: true,
          }
        }
      }

      return {
        results: [],
        provider: 'google_places',
        warning: response.error,
      }
    }

    const googleResults = response.data || []

    // If dates provided and we have results, enrich top results with Amadeus pricing
    if (checkIn && checkOut && googleResults.length > 0) {
      // Validate dates: checkOut must be after checkIn
      if (checkOut <= checkIn) {
        this.logger.warn('Invalid date range for lookup enrichment, skipping pricing', { checkIn, checkOut })
        return { results: googleResults, provider: 'google_places' }
      }

      // Use first result's coordinates for Amadeus geocode search
      const topResult = googleResults[0]
      if (topResult?.location?.latitude && topResult?.location?.longitude) {
        const enrichParams: HotelSearchParams = {
          ...params,
          checkIn,
          checkOut,
          adults: adults ? parseInt(adults, 10) : undefined,
          latitude: topResult.location.latitude,
          longitude: topResult.location.longitude,
          radius: 5000, // 5km to reduce mismatches
        }

        // Only merge for top 3 results to reduce Amadeus API calls
        const limitedResults = googleResults.slice(0, 3)
        const remainingResults = googleResults.slice(3)

        try {
          const merged = await this.mergeWithAmadeusPricing(limitedResults, enrichParams)
          return {
            ...merged,
            results: [...merged.results, ...remainingResults],
          }
        } catch (error) {
          this.logger.warn('Amadeus pricing merge failed for lookup, returning Google results', { error })
        }
      }
    }

    return {
      results: googleResults,
      provider: 'google_places',
    }
  }

  /**
   * Get detailed hotel information by ID
   *
   * Supports both Google Places IDs and Amadeus hotel IDs.
   */
  @Get(':id')
  async getHotelDetails(
    @Param('id') id: string,
    @Query('provider') provider?: 'google_places' | 'amadeus',
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('adults') adults?: string
  ): Promise<NormalizedHotelResult> {
    if (!id) {
      throw new BadRequestException('Hotel ID is required')
    }

    this.logger.log('Hotel details request', { id, provider })

    await this.initializeProviderCredentials()

    // Determine provider based on ID format or explicit param
    const useGoogle = provider === 'google_places' || (!provider && id.startsWith('ChI'))
    const additionalParams = {
      checkIn,
      checkOut,
      adults: adults ? parseInt(adults, 10) : undefined,
    }

    if (useGoogle) {
      const response = await this.googlePlaces.getDetails(id)
      if (!response.success || !response.data) {
        throw new NotFoundException(response.error || 'Hotel not found')
      }
      return response.data
    }

    // Amadeus
    const response = await this.amadeus.getDetails(id, additionalParams)
    if (!response.success || !response.data) {
      throw new NotFoundException(response.error || 'Hotel not found')
    }
    return response.data
  }

  /**
   * Enrich hotel with amenities from Booking.com
   *
   * Uses Booking.com DataCrawler API to fetch rich amenity data
   * (WiFi, Pool, Spa, Gym, etc.) that Google Places doesn't provide.
   *
   * GET /external-apis/hotels/:placeId/enrich
   *
   * Query params:
   * - name: Hotel name for matching (required)
   * - latitude: Coordinate for matching (required)
   * - longitude: Coordinate for matching (required)
   * - checkIn: Check-in date YYYY-MM-DD (optional)
   * - checkOut: Check-out date YYYY-MM-DD (optional)
   *
   * Returns { amenities: string[], matchScore?: number, checkInTime?, checkOutTime? }
   */
  @Get(':placeId/enrich')
  async enrichHotelAmenities(
    @Param('placeId') placeId: string,
    @Query('name') hotelName?: string,
    @Query('latitude') latitudeStr?: string,
    @Query('longitude') longitudeStr?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string
  ): Promise<{
    amenities: string[]
    matchScore?: number
    checkInTime?: string
    checkOutTime?: string
  }> {
    // Empty result for graceful degradation
    const emptyResult = { amenities: [] }

    // Validate required params
    if (!placeId || !hotelName) {
      this.logger.debug('Enrichment skipped: missing placeId or hotelName')
      return emptyResult
    }

    // Parse and validate coordinates
    const latitude = latitudeStr ? parseFloat(latitudeStr) : undefined
    const longitude = longitudeStr ? parseFloat(longitudeStr) : undefined

    if (latitude == null || longitude == null) {
      this.logger.debug('Enrichment skipped: missing coordinates')
      return emptyResult
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      this.logger.debug('Enrichment skipped: invalid coordinate range')
      return emptyResult
    }

    // Sanitize hotel name (prevent injection, max 200 chars)
    const sanitizedName = hotelName.slice(0, 200).trim()
    if (!sanitizedName) {
      this.logger.debug('Enrichment skipped: empty hotel name after sanitization')
      return emptyResult
    }

    // Initialize Booking.com credentials
    try {
      const bookingCreds = await this.credentialsService.getDecryptedCredentials(
        ApiProvider.BOOKING_COM
      )
      if (!bookingCreds) {
        this.logger.debug('Enrichment skipped: Booking.com credentials not configured')
        return emptyResult
      }
      await this.bookingCom.setCredentials(bookingCreds)
    } catch (error) {
      this.logger.debug('Enrichment skipped: failed to get Booking.com credentials')
      return emptyResult
    }

    // Call enrichment provider
    try {
      const result = await this.bookingCom.enrichWithAmenities(
        placeId,
        sanitizedName,
        latitude,
        longitude,
        checkIn,
        checkOut
      )

      return {
        amenities: result.amenities,
        matchScore: result.matchScore > 0 ? result.matchScore : undefined,
        checkInTime: result.checkInTime,
        checkOutTime: result.checkOutTime,
      }
    } catch (error) {
      this.logger.error('Hotel enrichment failed', { error, placeId, hotelName })
      return emptyResult
    }
  }

  /**
   * Import Google Places photos to an activity
   *
   * Downloads photos from Google Places API (requires API key authentication)
   * and uploads them to R2 storage, creating activity media records.
   *
   * POST /external-apis/hotels/photos/import
   * Body: { activityId, entityType?, photos: [{ photoReference, attribution?, maxWidthPx? }], hotelName? }
   */
  @Post('photos/import')
  async importPhotos(@Body() body: ImportPhotosDto): Promise<{
    imported: number
    failed: number
    media: Array<{ id: string; fileUrl: string; fileName: string }>
  }> {
    // Validate required fields
    if (!body.activityId) {
      throw new BadRequestException('activityId is required')
    }
    if (!body.photos || body.photos.length === 0) {
      throw new BadRequestException('At least one photo is required')
    }

    const entityType = body.entityType || 'accommodation'

    // Validate activity exists
    const activityExists = await this.mediaService.activityExists(body.activityId, entityType)
    if (!activityExists) {
      throw new NotFoundException(`Activity not found: ${body.activityId} (type: ${entityType})`)
    }

    // Check if storage is available
    if (!this.storageService.isMediaAvailable()) {
      throw new BadRequestException(
        'Media storage service not configured. Please ensure R2_MEDIA_BUCKET and R2_MEDIA_PUBLIC_URL environment variables are set.'
      )
    }

    // Get Google Places API key from env (Doppler)
    await this.initializeProviderCredentials()
    const googleCreds = await this.credentialResolver.resolve(ApiProvider.GOOGLE_PLACES).catch(() => null)
    if (!googleCreds?.apiKey) {
      throw new BadRequestException('Google Places API credentials not configured')
    }

    this.logger.log(`Importing ${body.photos.length} photos for activity ${body.activityId}`)

    const imported: Array<{ id: string; fileUrl: string; fileName: string }> = []
    let failed = 0

    for (let i = 0; i < body.photos.length; i++) {
      const photo = body.photos[i]
      if (!photo) continue

      try {
        // Build Google Places photo URL
        const maxWidth = photo.maxWidthPx || 800
        const photoUrl = `https://places.googleapis.com/v1/${photo.photoReference}/media?maxWidthPx=${maxWidth}&key=${googleCreds.apiKey}`

        this.logger.debug(`Downloading photo ${i + 1}: ${photo.photoReference}`)

        // Download the photo
        const response = await firstValueFrom(
          this.httpService.get(photoUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
          })
        )

        const buffer = Buffer.from(response.data)
        const contentType = response.headers['content-type'] || 'image/jpeg'

        // Generate filename using hash of photoReference to avoid exceeding 255 char limit
        // Include index in hash input to ensure uniqueness even for same photoReference in batch
        const photoHash = createHash('md5').update(`${photo.photoReference}-${i}`).digest('hex')
        const extension = contentType.includes('png') ? 'png' : 'jpg'
        const fileName = `google-places-${photoHash}.${extension}`

        // Upload to R2
        const folder = `media/${body.activityId}`
        const { url: fileUrl } = await this.storageService.uploadMediaFile(
          buffer,
          folder,
          fileName,
          contentType
        )

        // Build attribution
        const attribution: ExternalUrlAttribution = {
          source: 'google_places',
          sourceUrl: `https://maps.google.com/`,
          photographerName: photo.attribution || null,
        }

        // Create media record
        const media = await this.mediaService.create({
          activityId: body.activityId,
          entityType,
          mediaType: 'image' as MediaType,
          fileUrl,
          fileName,
          fileSize: buffer.length,
          caption: body.hotelName ? `${body.hotelName} - Photo ${i + 1}` : null,
          attribution,
        })

        imported.push({
          id: media.id,
          fileUrl: media.fileUrl,
          fileName: media.fileName,
        })

        this.logger.debug(`Successfully imported photo ${i + 1}: ${media.id}`)
      } catch (error: any) {
        failed++
        // Detailed error logging for axios errors
        if (error.response) {
          // The request was made and the server responded with a status code
          this.logger.error(
            `Failed to import photo ${i + 1}: HTTP ${error.response.status} - ${error.response.statusText}`,
            { data: error.response.data?.toString?.()?.slice(0, 500) }
          )
        } else if (error.request) {
          // The request was made but no response was received
          this.logger.error(
            `Failed to import photo ${i + 1}: No response received - ${error.message}`,
            { code: error.code }
          )
        } else {
          // Something happened in setting up the request
          this.logger.error(
            `Failed to import photo ${i + 1}: ${error.message || error}`,
            { stack: error.stack?.slice(0, 500) }
          )
        }
      }
    }

    this.logger.log(`Photo import complete: ${imported.length} imported, ${failed} failed`)

    return {
      imported: imported.length,
      failed,
      media: imported,
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Initialize credentials for both providers
   */
  private async initializeProviderCredentials(): Promise<void> {
    try {
      // Get Google Places credentials from env (Doppler)
      const googleCreds = await this.credentialResolver.resolve(ApiProvider.GOOGLE_PLACES)
      if (googleCreds) {
        await this.googlePlaces.setCredentials(googleCreds)
      }
    } catch (error) {
      this.logger.warn('Google Places credentials not available', { error })
    }

    try {
      // Get Amadeus credentials from env (Doppler)
      const amadeusCreds = await this.credentialResolver.resolve(ApiProvider.AMADEUS_HOTELS)
      if (amadeusCreds) {
        await this.amadeus.setCredentials(amadeusCreds)
      }
    } catch (error) {
      this.logger.warn('Amadeus credentials not available', { error })
    }
  }

  /**
   * Search with Google Places only
   */
  private async searchWithGooglePlaces(params: HotelSearchParams): Promise<HotelSearchResponse> {
    const response = await this.googlePlaces.search(params)

    if (!response.success) {
      return {
        results: [],
        provider: 'google_places',
        warning: response.error,
      }
    }

    return {
      results: response.data || [],
      provider: 'google_places',
    }
  }

  /**
   * Search with Amadeus only
   */
  private async searchWithAmadeus(params: HotelSearchParams): Promise<HotelSearchResponse> {
    const response = await this.amadeus.search(params)

    if (!response.success) {
      return {
        results: [],
        provider: 'amadeus',
        warning: response.error,
      }
    }

    return {
      results: response.data || [],
      provider: 'amadeus',
    }
  }

  /**
   * Search with provider composition (Google Places + Amadeus pricing)
   */
  private async searchWithComposition(params: HotelSearchParams): Promise<HotelSearchResponse> {
    // Try Google Places first
    const googleResponse = await this.googlePlaces.search(params)

    if (!googleResponse.success || !googleResponse.data?.length) {
      // Fallback to Amadeus
      this.logger.log('Google Places returned no results, trying Amadeus')

      const amadeusResponse = await this.amadeus.search(params)

      if (!amadeusResponse.success || !amadeusResponse.data?.length) {
        return {
          results: [],
          provider: 'google_places',
          usedFallback: true,
          warning: googleResponse.error || 'No hotels found',
        }
      }

      return {
        results: amadeusResponse.data,
        provider: 'amadeus',
        usedFallback: true,
      }
    }

    // If we have check-in/out dates, try to get Amadeus pricing
    if (params.checkIn && params.checkOut && params.cityCode) {
      return this.mergeWithAmadeusPricing(googleResponse.data, params)
    }

    return {
      results: googleResponse.data,
      provider: 'google_places',
    }
  }

  /**
   * Merge Google Places results with Amadeus pricing
   */
  private async mergeWithAmadeusPricing(
    googleResults: NormalizedHotelResult[],
    params: HotelSearchParams
  ): Promise<HotelSearchResponse> {
    try {
      const amadeusResponse = await this.amadeus.search(params)

      if (!amadeusResponse.success || !amadeusResponse.data?.length) {
        // Return Google results without pricing
        return {
          results: googleResults,
          provider: 'google_places',
          warning: 'Pricing data unavailable',
        }
      }

      // Create a map of Amadeus hotels by name (fuzzy matching)
      const amadeusMap = new Map<string, NormalizedHotelResult>()
      for (const hotel of amadeusResponse.data) {
        const normalizedName = hotel.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        amadeusMap.set(normalizedName, hotel)
      }

      // Merge pricing into Google results
      const mergedResults = googleResults.map(googleHotel => {
        const normalizedName = googleHotel.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const amadeusHotel = amadeusMap.get(normalizedName)

        if (amadeusHotel?.offers) {
          return {
            ...googleHotel,
            hotelId: amadeusHotel.hotelId,
            offers: amadeusHotel.offers,
            provider: 'merged' as const,
            providers: ['google_places', 'amadeus'] as HotelProvider[],
          }
        }

        return googleHotel
      })

      return {
        results: mergedResults,
        provider: 'merged',
      }
    } catch (error) {
      this.logger.warn('Failed to merge Amadeus pricing', { error })

      return {
        results: googleResults,
        provider: 'google_places',
        warning: 'Pricing merge failed',
      }
    }
  }
}
