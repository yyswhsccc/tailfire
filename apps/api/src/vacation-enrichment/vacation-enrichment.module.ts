/**
 * Vacation Enrichment Module
 *
 * Provides hotel enrichment via Google Places and TripAdvisor (SerpAPI).
 * Jobs are dispatched to the BullMQ enrichment queue and processed by
 * the centralized enrichment processor.
 */

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HttpModule } from '@nestjs/axios'
import { BullModule } from '@nestjs/bullmq'
import { DatabaseModule } from '../db/database.module'
import { QUEUES } from '../automation/automation.types'
import { VacationEnrichmentController } from './vacation-enrichment.controller'
import {
  EnrichmentDispatcherService,
  SerpApiClientService,
  GooglePlacesEnricherService,
  TripadvisorEnricherService,
} from './services'

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: 30000 }),
    BullModule.registerQueue({ name: QUEUES.ENRICHMENT }),
    DatabaseModule,
  ],
  controllers: [VacationEnrichmentController],
  providers: [
    EnrichmentDispatcherService,
    SerpApiClientService,
    GooglePlacesEnricherService,
    TripadvisorEnricherService,
  ],
  exports: [EnrichmentDispatcherService],
})
export class VacationEnrichmentModule {}
