/**
 * Aerodatabox Provider Module
 *
 * NestJS module for Aerodatabox flight data API integration.
 * Provides flight status lookup, airport FIDS, and flight tracking.
 *
 * Note: HttpModule is provided globally by ExternalApisModule with
 * configured timeout (15s) and maxRedirects (3). Do not import HttpModule
 * here to avoid bypassing the global config.
 */

import { Module } from '@nestjs/common'
import { AerodataboxFlightsProvider } from './aerodatabox-flights.provider'
import { AerodataboxController } from './aerodatabox.controller'
import { ApiCredentialsModule } from '../../../api-credentials/api-credentials.module'

@Module({
  imports: [ApiCredentialsModule],
  controllers: [AerodataboxController],
  providers: [AerodataboxFlightsProvider],
  exports: [AerodataboxFlightsProvider],
})
export class AerodataboxModule {}
