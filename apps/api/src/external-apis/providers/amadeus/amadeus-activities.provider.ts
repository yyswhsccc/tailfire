/**
 * Amadeus Activities Provider
 *
 * External API provider for tours & activities search via Amadeus Tours & Activities API.
 *
 * @see https://developers.amadeus.com/self-service/category/destination-experiences/api-doc/tours-and-activities
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
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
import {
  TourActivitySearchParams,
  NormalizedTourActivity,
} from '@tailfire/shared-types'
import {
  AmadeusActivitiesResponse,
  AmadeusActivityRaw,
} from './amadeus.types'
import { AmadeusAuthService } from './amadeus-auth.service'

function buildConfig(): ExternalApiConfig {
  return {
    provider: 'amadeus_activities',
    category: ApiCategory.ACTIVITIES,
    baseUrl: process.env.AMADEUS_API_URL || 'https://test.api.amadeus.com',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_MINUTE || '60', 10),
      requestsPerHour: parseInt(process.env.AMADEUS_RATE_LIMIT_PER_HOUR || '100', 10),
    },
    authentication: { type: 'bearer' },
  }
}

const PROVIDER_PRIORITY = 1

@Injectable()
export class AmadeusActivitiesProvider
  extends BaseExternalApi<TourActivitySearchParams, NormalizedTourActivity>
  implements OnModuleInit
{
  constructor(
    httpService: HttpService,
    rateLimiter: RateLimiterService,
    metrics: MetricsService,
    private readonly registry: ExternalApiRegistryService,
    private readonly authService: AmadeusAuthService
  ) {
    super(buildConfig(), httpService, rateLimiter, metrics)
  }

  async onModuleInit(): Promise<void> {
    await this.registry.registerProvider(this, PROVIDER_PRIORITY)
  }

  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('No credentials configured for Amadeus Activities')
    }
    const { clientId, clientSecret } = this.credentials as { clientId: string; clientSecret: string }
    return this.authService.getAccessToken(this.config.baseUrl, { clientId, clientSecret })
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string
  ): Promise<ExternalApiResponse<T>> {
    const requestId = `amadeus_activities_${Date.now()}`
    const startTime = Date.now()

    if (!this.canMakeRequest()) {
      return {
        success: false,
        error: this.getCircuitBreakerState() === 'open'
          ? 'Service temporarily unavailable (circuit open)'
          : 'Rate limit exceeded',
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
      }
    }

    try {
      const accessToken = await this.getAccessToken()
      const response = await firstValueFrom(
        this.httpService.get<T>(endpoint, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          timeout: this.resilience.timeoutMs,
        })
      )

      this.logger.log('Amadeus Activities response', { requestId, latencyMs: Date.now() - startTime })

      return {
        success: true,
        data: response.data,
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
      }
    } catch (error: any) {
      const latencyMs = Date.now() - startTime
      this.logger.error('Amadeus Activities API error', {
        requestId,
        latencyMs,
        error: error.message,
        status: error.response?.status,
      })

      Sentry.captureException(error, {
        tags: { service: 'amadeus_activities', operation: 'authenticated-request' },
        extra: { endpoint, requestId, latencyMs, status: error.response?.status },
      })

      const errorDetail = error.response?.data?.errors?.[0]
      const errorMessage = errorDetail
        ? `${errorDetail.title}: ${errorDetail.detail || ''}`
        : error.message

      return {
        success: false,
        error: errorMessage,
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString(), requestId },
      }
    }
  }

  async search(
    params: TourActivitySearchParams
  ): Promise<ExternalApiResponse<NormalizedTourActivity[]>> {
    const validation = this.validateParams(params)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        metadata: { provider: this.config.provider, timestamp: new Date().toISOString() },
      }
    }

    const queryParams = new URLSearchParams({
      latitude: String(params.latitude),
      longitude: String(params.longitude),
    })

    if (params.radius) queryParams.set('radius', String(params.radius))
    if (params.keyword) queryParams.set('keyword', params.keyword)

    const endpoint = `${this.config.baseUrl}/v1/shopping/activities?${queryParams}`
    const response = await this.makeAuthenticatedRequest<AmadeusActivitiesResponse>(endpoint)

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'No activities found', metadata: response.metadata }
    }

    const activities = response.data.data || []
    if (activities.length === 0) {
      return { success: true, data: [], metadata: response.metadata }
    }

    const normalized = activities.map(activity => this.transformResponse(activity))

    return { success: true, data: normalized, metadata: response.metadata }
  }

  async getDetails(
    activityId: string
  ): Promise<ExternalApiResponse<NormalizedTourActivity>> {
    const endpoint = `${this.config.baseUrl}/v1/shopping/activities/${encodeURIComponent(activityId)}`
    const response = await this.makeAuthenticatedRequest<{ data: AmadeusActivityRaw }>(endpoint)

    if (!response.success || !response.data?.data) {
      return {
        success: false,
        error: response.error || 'Activity not found',
        metadata: response.metadata,
      }
    }

    return {
      success: true,
      data: this.transformResponse(response.data.data),
      metadata: response.metadata,
    }
  }

  validateParams(params: TourActivitySearchParams): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (params.latitude === undefined || params.latitude < -90 || params.latitude > 90) {
      errors.push('Valid latitude required (-90 to 90)')
    }
    if (params.longitude === undefined || params.longitude < -180 || params.longitude > 180) {
      errors.push('Valid longitude required (-180 to 180)')
    }
    return { valid: errors.length === 0, errors }
  }

  transformResponse(activity: AmadeusActivityRaw): NormalizedTourActivity {
    return {
      id: activity.id,
      name: activity.name,
      description: activity.shortDescription || activity.description,
      price: activity.price?.amount
        ? {
            currency: activity.price.currencyCode || 'USD',
            amount: activity.price.amount,
          }
        : undefined,
      duration: activity.minimumDuration,
      location: {
        lat: activity.geoCode?.latitude ?? 0,
        lng: activity.geoCode?.longitude ?? 0,
      },
      rating: activity.rating ? parseFloat(activity.rating) : undefined,
      pictures: activity.pictures,
      provider: 'amadeus',
      bookingLink: activity.bookingLink,
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.credentials) {
      return { success: false, message: 'No credentials configured' }
    }
    try {
      await this.getAccessToken()
      return { success: true, message: 'OAuth2 authentication successful' }
    } catch (error: any) {
      return { success: false, message: error.message || 'OAuth2 authentication failed' }
    }
  }

  protected canMakeRequest(): boolean {
    return super['canMakeRequest']?.() ?? true
  }
}
