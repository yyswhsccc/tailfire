/**
 * Unsplash Service
 *
 * Provides Unsplash API integration with:
 * - CredentialResolverService for Doppler-managed API keys
 * - Rate limiting (500 requests/hour for Unsplash+ subscription)
 * - Simple in-memory cache for search queries
 * - Download tracking (Unsplash API requirement)
 */

import { Injectable, OnModuleInit, Logger, ServiceUnavailableException } from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { ApiProvider } from '@tailfire/shared-types'
import { CredentialResolverService } from '../api-credentials/credential-resolver.service'

// Unsplash API types
export interface UnsplashPhoto {
  id: string
  description: string | null
  alt_description: string | null
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  user: {
    name: string
    username: string
    links: {
      html: string
    }
  }
  links: {
    html: string
    download_location: string
  }
  width: number
  height: number
}

export interface UnsplashSearchResponse {
  total: number
  total_pages: number
  results: UnsplashPhoto[]
}

// Cache entry with TTL
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

// Rate limiting state
interface RateLimitState {
  requestCount: number
  resetTime: number
}

@Injectable()
export class UnsplashService implements OnModuleInit {
  private readonly logger = new Logger(UnsplashService.name)
  private readonly baseUrl = 'https://api.unsplash.com'
  private accessKey: string | null = null

  // Simple in-memory cache (5 minute TTL)
  private cache = new Map<string, CacheEntry<any>>()
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  // Rate limiting (500 requests per hour for Unsplash+ subscription)
  private rateLimit: RateLimitState = {
    requestCount: 0,
    resetTime: Date.now() + 60 * 60 * 1000, // 1 hour from now
  }
  private readonly RATE_LIMIT = 500
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

  constructor(private readonly credentialResolver: CredentialResolverService) {}

  onModuleInit() {
    // Use CredentialResolverService for unified credential loading
    // This follows the same pattern as all other API providers
    if (this.credentialResolver.isAvailable(ApiProvider.UNSPLASH)) {
      // Get credentials synchronously from cache (populated at startup)
      this.credentialResolver
        .resolve(ApiProvider.UNSPLASH)
        .then((creds) => {
          this.accessKey = creds.accessKey as string
          const keyPreview = this.accessKey.substring(0, 8) + '...'
          this.logger.log(`Unsplash API configured successfully (key: ${keyPreview})`)
        })
        .catch((err) => {
          this.logger.error(`Failed to load Unsplash credentials: ${err.message}`)
          Sentry.captureException(err, {
            tags: { service: 'unsplash', operation: 'credential-init' },
          })
        })
    } else {
      this.logger.warn(
        'UNSPLASH_ACCESS_KEY not configured. Stock image features will be unavailable. ' +
          'Configure via Doppler to enable Unsplash integration.'
      )
    }
  }

  /**
   * Check if Unsplash API is available
   */
  isAvailable(): boolean {
    return !!this.accessKey
  }

  /**
   * Search for photos on Unsplash
   *
   * @param query - Search query (e.g., "beach vacation")
   * @param page - Page number (default: 1)
   * @param perPage - Results per page (default: 20, max: 30)
   */
  async searchPhotos(
    query: string,
    page = 1,
    perPage = 20
  ): Promise<UnsplashSearchResponse> {
    this.ensureConfigured()

    // Check cache first
    const cacheKey = `search:${query}:${page}:${perPage}`
    const cached = this.getFromCache<UnsplashSearchResponse>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for search: "${query}" page ${page}`)
      return cached
    }

    // Check rate limit
    this.checkRateLimit()

    // Make API request
    const params = new URLSearchParams({
      query,
      page: String(page),
      per_page: String(Math.min(perPage, 30)), // Unsplash max is 30
      orientation: 'landscape', // Travel photos are usually landscape
    })

    const response = await this.makeRequest<UnsplashSearchResponse>(
      `/search/photos?${params.toString()}`
    )

    // Cache the result
    this.setCache(cacheKey, response)

    return response
  }

  /**
   * Get a single photo by ID
   *
   * @param photoId - Unsplash photo ID
   */
  async getPhoto(photoId: string): Promise<UnsplashPhoto> {
    this.ensureConfigured()

    // Check cache first
    const cacheKey = `photo:${photoId}`
    const cached = this.getFromCache<UnsplashPhoto>(cacheKey)
    if (cached) {
      return cached
    }

    // Check rate limit
    this.checkRateLimit()

    const photo = await this.makeRequest<UnsplashPhoto>(`/photos/${photoId}`)

    // Cache the result
    this.setCache(cacheKey, photo)

    return photo
  }

  /**
   * Trigger download tracking (REQUIRED by Unsplash API guidelines)
   *
   * Must be called when a user selects a photo for use.
   * This doesn't actually download the image, just triggers Unsplash's tracking.
   *
   * @param downloadLocation - The download_location URL from the photo's links
   */
  async triggerDownload(downloadLocation: string): Promise<void> {
    this.ensureConfigured()

    // Check rate limit
    this.checkRateLimit()

    try {
      // The download_location URL already includes the base URL
      // We just need to add our client_id
      const url = new URL(downloadLocation)
      url.searchParams.set('client_id', this.accessKey!)

      const response = await fetch(url.toString())

      if (!response.ok) {
        this.logger.warn(`Failed to trigger download: ${response.status}`)
      } else {
        this.logger.debug('Download tracked successfully')
      }
    } catch (error) {
      // Don't fail the operation if download tracking fails
      this.logger.warn(`Download tracking error: ${error}`)
      Sentry.captureException(error, {
        tags: { service: 'unsplash', operation: 'download-tracking' },
        extra: { downloadLocation },
      })
    }
  }

  /**
   * Download the actual image data from Unsplash
   *
   * @param imageUrl - URL to the image (use urls.regular for good quality)
   * @returns Buffer containing the image data
   */
  async downloadImage(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    // Validate URL is from Unsplash
    const url = new URL(imageUrl)
    if (!url.hostname.includes('unsplash.com') && !url.hostname.includes('images.unsplash.com')) {
      throw new Error('Invalid image URL: must be from Unsplash')
    }

    const response = await fetch(imageUrl)

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    return { buffer, contentType }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureConfigured(): void {
    if (!this.accessKey) {
      throw new ServiceUnavailableException(
        'Unsplash API not configured. Please set UNSPLASH_ACCESS_KEY in environment variables.'
      )
    }
  }

  private checkRateLimit(): void {
    const now = Date.now()

    // Reset counter if window has passed
    if (now >= this.rateLimit.resetTime) {
      this.rateLimit = {
        requestCount: 0,
        resetTime: now + this.RATE_LIMIT_WINDOW_MS,
      }
    }

    // Check if we've exceeded the limit
    if (this.rateLimit.requestCount >= this.RATE_LIMIT) {
      const minutesUntilReset = Math.ceil(
        (this.rateLimit.resetTime - now) / 60000
      )
      throw new ServiceUnavailableException(
        `Unsplash API rate limit exceeded. Please try again in ${minutesUntilReset} minutes.`
      )
    }

    // Increment counter
    this.rateLimit.requestCount++
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Client-ID ${this.accessKey}`,
          'Accept-Version': 'v1',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error(`Unsplash API error: ${response.status} - ${errorText}`)

        // Provide more specific error messages
        if (response.status === 401) {
          throw new ServiceUnavailableException(
            'Unsplash API authentication failed. The API key may be invalid or expired.'
          )
        }
        if (response.status === 403) {
          throw new ServiceUnavailableException(
            'Unsplash API access forbidden. The app may be rate-limited or disabled.'
          )
        }
        throw new ServiceUnavailableException(
          `Unsplash API error: ${response.status}`
        )
      }

      return response.json() as Promise<T>
    } catch (error) {
      // If it's already a NestJS exception, rethrow
      if (error instanceof ServiceUnavailableException) {
        throw error
      }
      // Network errors or other issues
      this.logger.error(`Unsplash API request failed: ${error}`)
      throw new ServiceUnavailableException(
        'Failed to connect to Unsplash API. Please try again later.'
      )
    }
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Check if expired
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    })

    // Clean up old entries periodically (every 100 writes)
    if (this.cache.size > 100) {
      this.cleanupCache()
    }
  }

  private cleanupCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}
