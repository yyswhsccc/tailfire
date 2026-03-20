/**
 * Activities Controller
 *
 * API endpoints for tours & activities search.
 * Uses Amadeus Tours & Activities API.
 */

import {
  Controller,
  Get,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { AmadeusActivitiesProvider } from '../amadeus/amadeus-activities.provider'
import { CredentialResolverService } from '../../../api-credentials/credential-resolver.service'
import { ApiProvider, TourActivitySearchResponse } from '@tailfire/shared-types'

@Controller('external-apis/activities')
export class ActivitiesController {
  private readonly logger = new Logger(ActivitiesController.name)

  constructor(
    private readonly amadeusActivities: AmadeusActivitiesProvider,
    private readonly credentialResolver: CredentialResolverService
  ) {}

  /**
   * Search tours & activities by location
   *
   * GET /external-apis/activities/search
   */
  @Get('search')
  async searchActivities(
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('radius') radius?: string,
    @Query('keyword') keyword?: string
  ): Promise<TourActivitySearchResponse> {
    if (!latitude || !longitude) {
      throw new BadRequestException('latitude and longitude are required')
    }

    this.logger.log('Activities search request', { latitude, longitude, keyword })

    await this.initializeCredentials()

    const response = await this.amadeusActivities.search({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radius: radius ? parseInt(radius, 10) : 20,
      keyword,
    })

    if (!response.success) {
      Sentry.captureMessage(`Activities search failed: ${response.error}`, {
        level: 'warning',
        tags: { service: 'amadeus', operation: 'activities-search' },
        extra: { latitude, longitude, keyword, error: response.error },
      })
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

  private async initializeCredentials(): Promise<void> {
    try {
      const creds = await this.credentialResolver.resolve(ApiProvider.AMADEUS_ACTIVITIES)
      if (creds) {
        await this.amadeusActivities.setCredentials(creds)
      }
    } catch (error) {
      this.logger.warn('Amadeus credentials not available', { error })
    }
  }
}
