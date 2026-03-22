/**
 * Trip Lifecycle Event Listener
 *
 * Listens for trip lifecycle events and schedules post-trip automations.
 * Triggers thank-you emails and feedback requests after trip completion.
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { addDays } from 'date-fns'
import { AutomationService } from '../automation.service'
import { QUEUES, JOB_TYPES, getPostTripJobId } from '../automation.types'
import type { TripTravelledEvent } from '../../trips/events/trip-travelled.event'

@Injectable()
export class TripLifecycleListener {
  private readonly logger = new Logger(TripLifecycleListener.name)

  constructor(private readonly automationService: AutomationService) {}

  /**
   * Handle trip.travelled event
   * Schedules post-trip thank-you email and feedback request
   */
  @OnEvent('trip.travelled')
  async handleTripTravelled(event: TripTravelledEvent): Promise<void> {
    const { tripId, primaryContactId, agencyId, tripName } = event

    if (!primaryContactId) {
      this.logger.warn(`Trip ${tripId} has no primary contact - skipping post-trip automation`)
      return
    }

    this.logger.log(`Scheduling post-trip automation for trip "${tripName}" (${tripId})`)

    const now = new Date()

    try {
      // Schedule thank-you email for 1 day after completion
      const thankYouDate = addDays(now, 1)
      const thankYouJobId = getPostTripJobId(tripId, 'thank_you')

      await this.automationService.scheduleAt(
        QUEUES.CLIENT_CARE,
        JOB_TYPES.POST_TRIP_THANK_YOU,
        {
          type: JOB_TYPES.POST_TRIP_THANK_YOU,
          tripId,
          contactId: primaryContactId,
          agencyId,
        },
        thankYouDate,
        { jobId: thankYouJobId },
      )

      this.logger.debug(`Scheduled thank-you email for trip ${tripId} at ${thankYouDate.toISOString()}`)
    } catch (error) {
      this.logger.error(`Failed to schedule thank-you email for trip ${tripId}: ${error}`)
    }

    try {
      // Schedule feedback request for 2 days after completion
      const feedbackDate = addDays(now, 2)
      const feedbackJobId = getPostTripJobId(tripId, 'feedback')

      await this.automationService.scheduleAt(
        QUEUES.CLIENT_CARE,
        JOB_TYPES.POST_TRIP_FEEDBACK,
        {
          type: JOB_TYPES.POST_TRIP_FEEDBACK,
          tripId,
          contactId: primaryContactId,
          agencyId,
        },
        feedbackDate,
        { jobId: feedbackJobId },
      )

      this.logger.debug(`Scheduled feedback request for trip ${tripId} at ${feedbackDate.toISOString()}`)
    } catch (error) {
      this.logger.error(`Failed to schedule feedback request for trip ${tripId}: ${error}`)
    }
  }
}
