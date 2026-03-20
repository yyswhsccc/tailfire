/**
 * Transfers Controller
 *
 * API endpoints for transfer search (airport/hotel transfers).
 * Uses Amadeus Transfer Search API.
 */

import {
  Controller,
  Get,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { AmadeusTransfersProvider } from '../amadeus/amadeus-transfers.provider'
import { CredentialResolverService } from '../../../api-credentials/credential-resolver.service'
import {
  ApiProvider,
  TransferSearchResponse,
  TransferLocationType,
} from '@tailfire/shared-types'

@Controller('external-apis/transfers')
export class TransfersController {
  private readonly logger = new Logger(TransfersController.name)

  constructor(
    private readonly amadeusTransfers: AmadeusTransfersProvider,
    private readonly credentialResolver: CredentialResolverService
  ) {}

  /**
   * Search transfer offers
   *
   * GET /external-apis/transfers/search
   */
  @Get('search')
  async searchTransfers(
    @Query('pickupType') pickupType?: TransferLocationType,
    @Query('pickupCode') pickupCode?: string,
    @Query('pickupLat') pickupLat?: string,
    @Query('pickupLng') pickupLng?: string,
    @Query('pickupAddress') pickupAddress?: string,
    @Query('pickupCountryCode') pickupCountryCode?: string,
    @Query('dropoffType') dropoffType?: TransferLocationType,
    @Query('dropoffCode') dropoffCode?: string,
    @Query('dropoffLat') dropoffLat?: string,
    @Query('dropoffLng') dropoffLng?: string,
    @Query('dropoffAddress') dropoffAddress?: string,
    @Query('dropoffCountryCode') dropoffCountryCode?: string,
    @Query('date') date?: string,
    @Query('time') time?: string,
    @Query('passengers') passengers?: string
  ): Promise<TransferSearchResponse> {
    if (!pickupType || !dropoffType || !date || !time) {
      throw new BadRequestException('pickupType, dropoffType, date, and time are required')
    }

    this.logger.log('Transfer search request', { pickupType, pickupCode, pickupLat, pickupLng, pickupAddress, dropoffType, dropoffCode, dropoffLat, dropoffLng, dropoffAddress, date, time, passengers })

    await this.initializeCredentials()

    const response = await this.amadeusTransfers.search({
      pickupType,
      pickupCode,
      pickupLat: pickupLat ? parseFloat(pickupLat) : undefined,
      pickupLng: pickupLng ? parseFloat(pickupLng) : undefined,
      pickupAddress,
      pickupCountryCode,
      dropoffType,
      dropoffCode,
      dropoffLat: dropoffLat ? parseFloat(dropoffLat) : undefined,
      dropoffLng: dropoffLng ? parseFloat(dropoffLng) : undefined,
      dropoffAddress,
      dropoffCountryCode,
      date,
      time,
      passengers: passengers ? parseInt(passengers, 10) : 1,
    })

    if (!response.success) {
      Sentry.captureMessage(`Transfer search failed: ${response.error}`, {
        level: 'warning',
        tags: { service: 'amadeus', operation: 'transfer-search' },
        extra: { pickupType, dropoffType, date, time, error: response.error },
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
      const creds = await this.credentialResolver.resolve(ApiProvider.AMADEUS_TRANSFERS)
      if (creds) {
        await this.amadeusTransfers.setCredentials(creds)
      }
    } catch (error) {
      this.logger.warn('Amadeus credentials not available', { error })
    }
  }
}
