/**
 * FusionAPI Service
 *
 * Low-level HTTP client for Traveltek FusionAPI.
 * Handles request formatting, error parsing, and retries.
 *
 * All endpoints follow the pattern:
 * GET: ?sid={sid}&requestid={token}&{params}
 * POST: requestid header, JSON body
 */

import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { TraveltekAuthService } from './traveltek-auth.service'
import {
  CruiseSearchParams,
  CruiseSearchResult,
  RateCodeParams,
  RateCode,
  CabinGradeParams,
  CabinGrade,
  CabinParams,
  CabinsResponse,
  BasketAddParams,
  BasketAddResult,
  BasketResult,
  BookingRequest,
  BookingResult,
  PastPaxParams,
  PastPaxResult,
  ImportBookingParams,
  FusionApiResponse,
  FusionApiError,
  FusionApiErrorCode,
} from '../types/fusion-api.types'

// Retry configuration
// NOTE: INVALID_SESSION is NOT retryable - retrying with the same sessionKey will fail repeatedly.
// Caller must create a new session instead.
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  retryableCodes: ['TIMEOUT', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE'] as FusionApiErrorCode[],
}

@Injectable()
export class FusionApiService {
  private readonly logger = new Logger(FusionApiService.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: TraveltekAuthService,
  ) {}

  // ============================================================================
  // Step 1: Search Cruises
  // ============================================================================

  async searchCruises(params: CruiseSearchParams): Promise<FusionApiResponse<CruiseSearchResult>> {
    return this.get<CruiseSearchResult>('cruiseresults.pl', params)
  }

  // ============================================================================
  // Step 2: Get Rate Codes (Agency-Tailored)
  // ============================================================================

  async getRateCodes(params: RateCodeParams): Promise<FusionApiResponse<RateCode>> {
    return this.get<RateCode>('cruiseratecodes.pl', params)
  }

  // ============================================================================
  // Step 3: Get Cabin Grades/Categories
  // ============================================================================

  async getCabinGrades(params: CabinGradeParams): Promise<FusionApiResponse<CabinGrade>> {
    return this.get<CabinGrade>('cruisecabingrades.pl', params)
  }

  // ============================================================================
  // Step 4: Get Specific Cabins with Deck Plans
  // ============================================================================

  async getCabins(params: CabinParams): Promise<CabinsResponse> {
    // This endpoint has a special response structure with deck plans in meta
    const response = await this.get<any>('cruisecabins.pl', params)
    return {
      meta: {
        ...response.meta,
        decks: response.meta?.decks || [],
      },
      results: response.results || [],
    }
  }

  // ============================================================================
  // Step 5: Add to Basket (Puts Cabin on Hold)
  // ============================================================================

  async addToBasket(params: BasketAddParams): Promise<BasketAddResult> {
    const response = await this.get<BasketAddResult>('basketadd.pl', params)

    if (!response.results?.[0]) {
      throw new FusionApiError(
        'UNKNOWN_ERROR',
        'No result returned from basket add',
        false,
        response
      )
    }

    return response.results[0]
  }

  // ============================================================================
  // Step 6: Get Basket Contents
  // ============================================================================

  async getBasket(sessionkey: string): Promise<BasketResult> {
    const response = await this.get<any>('basket.pl', { sessionkey })

    return {
      meta: response.meta || {},
      items: response.results || [],
      totalprice: response.meta?.totalprice || 0,
      currency: response.meta?.currency || 'USD',
    }
  }

  /**
   * Remove item from basket
   */
  async removeFromBasket(sessionkey: string, itemkey: string): Promise<void> {
    await this.get<any>('basketremove.pl', { sessionkey, itemkey })
  }

  // ============================================================================
  // Step 7: Create Booking (POST with requestid as HEADER)
  // ============================================================================

  async createBooking(bookingData: BookingRequest): Promise<BookingResult> {
    const token = await this.authService.getAccessToken()
    const sid = this.authService.getSid()
    const apiUrl = this.authService.getApiUrl()

    this.logger.log(`Creating booking with session ${bookingData.sessionkey}`)

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<BookingResult>(
          `${apiUrl}/book.pl?sid=${sid}`,
          bookingData,
          {
            headers: {
              requestid: token,
              'Content-Type': 'application/json',
            },
          }
        )
      )

      if (data.error) {
        throw new FusionApiError(
          'BOOKING_FAILED',
          data.error.message || 'Booking failed',
          false,
          data
        )
      }

      this.logger.log(`Booking created: ${data.bookingreference}`)
      return data
    } catch (error) {
      if (error instanceof FusionApiError) {
        throw error
      }
      throw this.parseError(error)
    }
  }

  // ============================================================================
  // Optional: Lookup Past Passenger Data
  // ============================================================================

  async getPastPassengerData(params: PastPaxParams): Promise<PastPaxResult> {
    const response = await this.get<PastPaxResult>('cruisegetpaxdata.pl', params)

    return response.results?.[0] || { found: false }
  }

  // ============================================================================
  // Import Existing Booking
  // ============================================================================

  async importBooking(params: ImportBookingParams): Promise<FusionApiResponse<Record<string, any>>> {
    return this.get<Record<string, any>>('cruiseimportbooking.pl', {
      lineid: params.lineid,
      bookingreference: params.bookingreference,
      viewonly: params.viewonly ?? 1,
      currency: params.currency ?? 'CAD',
      language: params.language ?? 'en',
    })
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Make a GET request to FusionAPI with retry logic
   */
  private async get<T>(
    endpoint: string,
    params: Record<string, any>,
    attempt: number = 1
  ): Promise<FusionApiResponse<T>> {
    const token = await this.authService.getAccessToken()
    const sid = this.authService.getSid()
    const apiUrl = this.authService.getApiUrl()

    // Build query params, filtering out undefined values
    const queryParams: Record<string, string> = {
      sid,
      requestid: token,
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        queryParams[key] = String(value)
      }
    }

    const url = `${apiUrl}/${endpoint}`

    this.logger.debug(`FusionAPI GET ${endpoint} (attempt ${attempt})`)

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<FusionApiResponse<T>>(url, { params: queryParams })
      )

      // Check for API-level errors in response
      if (data.error) {
        const error = this.parseApiError(data.error)
        if (this.shouldRetry(error, attempt)) {
          return this.retryWithBackoff(() => this.get(endpoint, params, attempt + 1), attempt)
        }
        throw error
      }

      return data
    } catch (error) {
      if (error instanceof FusionApiError) {
        if (this.shouldRetry(error, attempt)) {
          return this.retryWithBackoff(() => this.get(endpoint, params, attempt + 1), attempt)
        }
        throw error
      }

      const parsedError = this.parseError(error)
      if (this.shouldRetry(parsedError, attempt)) {
        return this.retryWithBackoff(() => this.get(endpoint, params, attempt + 1), attempt)
      }
      throw parsedError
    }
  }

  /**
   * Parse API error response into FusionApiError
   */
  private parseApiError(error: { code: string; message: string }): FusionApiError {
    const code = this.mapErrorCode(error.code)
    const isRetryable = RETRY_CONFIG.retryableCodes.includes(code)
    return new FusionApiError(code, error.message, isRetryable, error)
  }

  /**
   * Parse HTTP/network errors into FusionApiError
   */
  private parseError(error: any): FusionApiError {
    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new FusionApiError('TIMEOUT', 'Request timed out', true, error)
    }

    // HTTP status errors
    const status = error.response?.status
    if (status === 401 || status === 403) {
      return new FusionApiError('INVALID_CREDENTIALS', 'Authentication failed', false, error)
    }
    if (status === 429) {
      return new FusionApiError('RATE_LIMIT', 'Rate limit exceeded', true, error)
    }
    if (status >= 500) {
      return new FusionApiError('SERVICE_UNAVAILABLE', 'Service unavailable', true, error)
    }

    // Network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new FusionApiError('SERVICE_UNAVAILABLE', 'Cannot connect to API', true, error)
    }

    // Unknown errors
    return new FusionApiError(
      'UNKNOWN_ERROR',
      error.message || 'Unknown error occurred',
      false,
      error
    )
  }

  /**
   * Map API error codes to our error taxonomy
   */
  private mapErrorCode(code: string): FusionApiErrorCode {
    const codeMap: Record<string, FusionApiErrorCode> = {
      'INVALID_SESSION': 'INVALID_SESSION',
      'SESSION_EXPIRED': 'INVALID_SESSION',
      'CRUISE_NOT_FOUND': 'CRUISE_NOT_AVAILABLE',
      'CABIN_NOT_AVAILABLE': 'CABIN_NOT_AVAILABLE',
      'CABIN_SOLD': 'CABIN_NOT_AVAILABLE',
      'VALIDATION_ERROR': 'VALIDATION_ERROR',
      'INVALID_REQUEST': 'VALIDATION_ERROR',
      'BOOKING_ERROR': 'BOOKING_FAILED',
    }

    return codeMap[code] || 'UNKNOWN_ERROR'
  }

  /**
   * Determine if an error should be retried
   */
  private shouldRetry(error: FusionApiError, attempt: number): boolean {
    return error.isRetryable && attempt < RETRY_CONFIG.maxRetries
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt: number
  ): Promise<T> {
    const delay = Math.min(
      RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt - 1),
      RETRY_CONFIG.maxDelayMs
    )

    // Add jitter (0-2s)
    const jitter = Math.random() * 2000

    this.logger.debug(`Retrying in ${delay + jitter}ms (attempt ${attempt + 1})`)

    await new Promise(resolve => setTimeout(resolve, delay + jitter))
    return fn()
  }
}
