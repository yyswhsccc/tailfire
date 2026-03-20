/**
 * Base External API Provider
 *
 * Abstract base class with resilience patterns for external API providers.
 * Includes circuit breaker, retry with exponential backoff, and rate limiting.
 */

import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as Sentry from '@sentry/nestjs'
import {
  ExternalApiConfig,
  RequestOptions,
  ExternalApiResponse,
  ConnectionTestResult,
  IExternalApiProvider,
} from '../interfaces'
import { RateLimiterService } from '../services/rate-limiter.service'
import { MetricsService } from '../services/metrics.service'

/**
 * Resilience configuration for API requests
 */
export interface ResilienceConfig {
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs: number
  /** Maximum retry attempts (default: 2) */
  maxRetries: number
  /** Base delay between retries in milliseconds (default: 1000) */
  retryDelayMs: number
  /** Number of failures before circuit opens (default: 5) */
  circuitBreakerThreshold: number
  /** Time before circuit transitions to half-open in milliseconds (default: 30000) */
  circuitBreakerResetMs: number
}

/**
 * Circuit breaker state
 */
type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Abstract base class for external API providers
 *
 * @typeParam TSearchParams - Type for search parameters
 * @typeParam TSearchResult - Type for search results
 */
@Injectable()
export abstract class BaseExternalApi<TSearchParams, TSearchResult>
  implements IExternalApiProvider<TSearchParams, TSearchResult>
{
  protected readonly logger: Logger
  protected credentials: Record<string, any> | null = null

  // Circuit breaker state (mutable - tracks state transitions)
  private failureCount = 0
  private circuitOpenedAt: number | null = null
  private circuitState: CircuitState = 'closed'

  // Default resilience config (override in subclass if needed)
  protected readonly resilience: ResilienceConfig = {
    timeoutMs: 10000,
    maxRetries: 2,
    retryDelayMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 30000,
  }

  constructor(
    public readonly config: ExternalApiConfig,
    protected readonly httpService: HttpService,
    protected readonly rateLimiter: RateLimiterService,
    protected readonly metrics: MetricsService
  ) {
    this.logger = new Logger(this.constructor.name)
  }

  // ============================================================================
  // ABSTRACT METHODS - Each provider must implement
  // ============================================================================

  /**
   * Search for items using provider-specific parameters
   */
  abstract search(params: TSearchParams): Promise<ExternalApiResponse<TSearchResult[]>>

  /**
   * Get details for a specific item
   */
  abstract getDetails(
    referenceId: string,
    additionalParams?: Record<string, any>
  ): Promise<ExternalApiResponse<TSearchResult>>

  /**
   * Validate search parameters before making request
   */
  abstract validateParams(params: TSearchParams): { valid: boolean; errors: string[] }

  /**
   * Transform raw API response to standardized format
   */
  abstract transformResponse(apiData: any): TSearchResult

  // ============================================================================
  // CREDENTIAL MANAGEMENT
  // ============================================================================

  /**
   * Set credentials for API authentication
   */
  async setCredentials(credentials: Record<string, any>): Promise<void> {
    this.credentials = credentials
  }

  /**
   * Test connection to the external API
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.credentials) {
      return { success: false, message: 'No credentials configured' }
    }
    // Default: just check credentials exist. Override in provider for actual API test.
    return { success: true, message: 'Credentials configured' }
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Check if a request can be made (rate limit + circuit breaker)
   */
  protected canMakeRequest(): boolean {
    // Check circuit breaker first
    if (this.isCircuitOpen()) {
      this.logger.warn(`Circuit breaker OPEN for ${this.config.provider}`)
      return false
    }
    return this.rateLimiter.canMakeRequest(this.config.provider, this.config.rateLimit)
  }

  /**
   * Record a request for rate limiting
   */
  protected recordRequest(): void {
    this.rateLimiter.recordRequest(this.config.provider)
  }

  // ============================================================================
  // HTTP REQUEST WITH RESILIENCE
  // ============================================================================

  /**
   * Make an HTTP request with retry, timeout, and circuit breaker
   *
   * @param endpoint - Full URL to request
   * @param options - Request options
   * @returns Standardized API response
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `${this.config.provider}_${Date.now()}`
    const startTime = Date.now()

    // Log request start
    this.logger.log(`External API request: ${this.config.provider} ${endpoint}`, { requestId })

    // Check rate limit and circuit breaker
    if (!this.canMakeRequest()) {
      const error = this.isCircuitOpen()
        ? 'Service temporarily unavailable (circuit open)'
        : 'Rate limit exceeded'

      this.metrics.recordRequest(this.config.provider, endpoint, 'error')
      return {
        success: false,
        error,
        metadata: {
          provider: this.config.provider,
          timestamp: new Date().toISOString(),
          requestId,
        },
      }
    }

    const headers = this.buildAuthHeaders(options.headers || {})
    let lastError: Error | null = null

    // Retry loop with exponential backoff + jitter
    for (let attempt = 0; attempt <= this.resilience.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay =
            this.resilience.retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500
          this.logger.log(
            `Retry ${attempt}/${this.resilience.maxRetries} for ${this.config.provider} after ${Math.round(delay)}ms`
          )
          await this.sleep(delay)
        }

        const response = await firstValueFrom(
          this.httpService.request<T>({
            url: endpoint,
            method: options.method || 'GET',
            headers,
            data: options.body,
            params: options.params,
            timeout: this.resilience.timeoutMs,
          })
        )

        // Success - record metrics
        const latencyMs = Date.now() - startTime
        this.recordRequest()
        this.recordSuccess()
        this.metrics.recordRequest(this.config.provider, endpoint, 'success')
        this.metrics.recordLatency(this.config.provider, endpoint, latencyMs)
        this.metrics.setRateLimitRemaining(
          this.config.provider,
          this.rateLimiter.getRemainingRequests(this.config.provider, this.config.rateLimit)
        )
        this.metrics.setCircuitBreakerState(this.config.provider, this.getCircuitBreakerState())

        // Log response
        this.logger.log(`External API response: ${this.config.provider}`, {
          requestId,
          latencyMs,
          statusCode: (response as any).status,
          cached: false,
        })

        return {
          success: true,
          data: (response as any).data,
          metadata: {
            provider: this.config.provider,
            timestamp: new Date().toISOString(),
            rateLimitRemaining: this.rateLimiter.getRemainingRequests(
              this.config.provider,
              this.config.rateLimit
            ),
            requestId,
          },
        }
      } catch (error: any) {
        lastError = error
        const latencyMs = Date.now() - startTime

        this.logger.error(`Request failed (attempt ${attempt + 1}): ${error.message}`, {
          provider: this.config.provider,
          endpoint,
          requestId,
          latencyMs,
          statusCode: error.response?.status,
        })

        // SPECIAL HANDLING FOR 429 - extract Retry-After and return immediately
        if (error.response?.status === 429) {
          const retryAfterHeader = error.response.headers?.['retry-after']
          const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 30

          this.logger.warn(`Rate limited by ${this.config.provider}, retry after ${retryAfter}s`)
          this.metrics.recordRequest(this.config.provider, endpoint, 'rate_limited')

          Sentry.captureMessage(`External API rate limited: ${this.config.provider}`, {
            level: 'warning',
            tags: { service: 'external-api', provider: this.config.provider },
            extra: { endpoint, retryAfter, requestId },
          })

          return {
            success: false,
            error: 'Rate limited - too many requests',
            metadata: {
              provider: this.config.provider,
              timestamp: new Date().toISOString(),
              rateLimitRemaining: 0,
              retryAfter, // KEY: Surface this to callers
              requestId,
            },
          }
        }

        // Don't retry on 4xx client errors (429 handled above)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          break
        }
      }
    }

    // All retries exhausted
    const latencyMs = Date.now() - startTime
    this.recordFailure()
    this.metrics.recordRequest(this.config.provider, endpoint, 'error')
    this.metrics.recordLatency(this.config.provider, endpoint, latencyMs)
    this.metrics.setCircuitBreakerState(this.config.provider, this.getCircuitBreakerState())

    this.logger.error(`External API error: ${this.config.provider}`, {
      requestId,
      latencyMs,
      error: this.extractErrorMessage(lastError),
    })

    Sentry.captureException(lastError || new Error(this.extractErrorMessage(lastError)), {
      tags: { service: 'external-api', provider: this.config.provider },
      extra: { endpoint, requestId, latencyMs, retriesExhausted: true },
    })

    return {
      success: false,
      error: this.extractErrorMessage(lastError),
      metadata: {
        provider: this.config.provider,
        timestamp: new Date().toISOString(),
        requestId,
      },
    }
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Build authentication headers based on config
   */
  private buildAuthHeaders(existingHeaders: Record<string, string>): Record<string, string> {
    const headers = { ...existingHeaders }

    if (!this.credentials) {
      this.logger.warn(`No credentials configured for ${this.config.provider}`)
      return headers
    }

    switch (this.config.authentication.type) {
      case 'apiKey': {
        const headerName = this.config.authentication.headerName || 'X-API-Key'
        headers[headerName] = this.credentials.apiKey || this.credentials.rapidApiKey

        // RapidAPI requires host header
        if (headerName.toLowerCase() === 'x-rapidapi-key') {
          headers['x-rapidapi-host'] =
            this.credentials.rapidApiHost || `${this.config.provider}.p.rapidapi.com`
        }
        break
      }

      case 'bearer':
        headers['Authorization'] = `Bearer ${this.credentials.token}`
        break

      case 'basic': {
        const auth = Buffer.from(
          `${this.credentials.username}:${this.credentials.password}`
        ).toString('base64')
        headers['Authorization'] = `Basic ${auth}`
        break
      }
    }

    return headers
  }

  // ============================================================================
  // CIRCUIT BREAKER
  // ============================================================================

  /**
   * Check if circuit breaker is open (blocking requests)
   *
   * State machine: closed -> open -> half-open -> closed
   */
  private isCircuitOpen(): boolean {
    if (this.circuitState === 'closed') {
      return false
    }

    if (this.circuitState === 'open') {
      const elapsed = Date.now() - (this.circuitOpenedAt || 0)
      if (elapsed > this.resilience.circuitBreakerResetMs) {
        // Transition to half-open: allow one probe request
        this.circuitState = 'half-open'
        this.logger.log(
          `Circuit breaker HALF-OPEN for ${this.config.provider} - allowing probe request`
        )
        return false
      }
      return true // Still open
    }

    // half-open: allow the probe request through
    return false
  }

  /**
   * Record a successful request (reset circuit breaker)
   */
  private recordSuccess(): void {
    if (this.circuitState === 'half-open') {
      // Probe succeeded - close the circuit
      this.logger.log(`Circuit breaker CLOSED for ${this.config.provider} - probe succeeded`)
    }
    this.failureCount = 0
    this.circuitOpenedAt = null
    this.circuitState = 'closed'
  }

  /**
   * Record a failed request (may open circuit breaker)
   */
  private recordFailure(): void {
    this.failureCount++

    if (this.circuitState === 'half-open') {
      // Probe failed - reopen the circuit
      this.circuitState = 'open'
      this.circuitOpenedAt = Date.now()
      this.logger.error(`Circuit breaker RE-OPENED for ${this.config.provider} - probe failed`)
      return
    }

    if (this.failureCount >= this.resilience.circuitBreakerThreshold) {
      this.circuitState = 'open'
      this.circuitOpenedAt = Date.now()
      this.logger.error(
        `Circuit breaker OPENED for ${this.config.provider} after ${this.failureCount} failures`
      )
    }
  }

  /**
   * Get current circuit breaker state (for metrics/health checks)
   */
  getCircuitBreakerState(): CircuitState {
    // Update state if needed (e.g., transition from open -> half-open)
    this.isCircuitOpen()
    return this.circuitState
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Extract a human-readable error message
   */
  protected extractErrorMessage(error: any): string {
    if (error?.response?.data?.message) return error.response.data.message
    if (error?.response?.data?.error) return error.response.data.error
    if (error?.message) return error.message
    return 'Unknown error'
  }
}
