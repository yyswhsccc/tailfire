/**
 * Enrichment Dispatcher Service
 *
 * Dispatches vacation hotel enrichment jobs to the BullMQ enrichment queue.
 * Deduplicates by hotelId so each hotel is only enriched once.
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QUEUES, JOB_TYPES } from '../../automation/automation.types'
import type { VacationHotelEnrichmentJobData } from '../../automation/automation.types'

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class EnrichmentDispatcherService {
  private readonly logger = new Logger(EnrichmentDispatcherService.name)

  constructor(
    @InjectQueue(QUEUES.ENRICHMENT) private readonly queue: Queue,
  ) {}

  /**
   * Dispatch an enrichment job for a vacation hotel.
   *
   * Uses a deterministic job ID (`vacation-enrich-{hotelId}`) so that
   * duplicate dispatches for the same hotel are silently deduplicated.
   *
   * @param hotelId - Softvoyage hotel ID
   * @param hotelName - hotel display name
   * @param destination - destination label (e.g. "Riviera Maya, Mexico")
   * @returns the job ID if created, or null if a job already exists for this hotel
   */
  async dispatchEnrichment(
    hotelId: string,
    hotelName: string,
    destination: string,
  ): Promise<string | null> {
    const jobId = `vacation-enrich-${hotelId}`

    // Check if a job with this ID already exists (any state)
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      this.logger.debug(`Enrichment job already exists for hotel ${hotelId} (${hotelName})`)
      return null
    }

    const data: VacationHotelEnrichmentJobData = {
      hotelId,
      hotelName,
      destination,
    }

    const job = await this.queue.add(JOB_TYPES.VACATION_HOTEL_ENRICHMENT, data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    })

    this.logger.debug(
      `Dispatched enrichment job ${job.id} for hotel ${hotelId} (${hotelName}) — ${destination}`,
    )

    return job.id ?? jobId
  }
}
