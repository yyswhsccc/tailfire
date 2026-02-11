/**
 * Trip Automation Processor
 *
 * Handles scheduled trip status transitions and reminders.
 * All handlers are idempotent - they check current state before making changes.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger, Injectable } from '@nestjs/common'
import { Job } from 'bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, or } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import {
  QUEUES,
  JOB_TYPES,
  type TripStatusTransitionJobData,
  type TripReminderJobData,
  type TripBackfillJobData,
  type TripAutomationJobData,
  getTripTransitionJobId,
} from '../automation.types'
import { AutomationService } from '../automation.service'
import { TripInProgressEvent } from '../../trips/events/trip-in-progress.event'
import { TripCompletedEvent } from '../../trips/events/trip-completed.event'

@Processor(QUEUES.TRIP_AUTOMATION)
@Injectable()
export class TripAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(TripAutomationProcessor.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly automationService: AutomationService,
  ) {
    super()
  }

  async process(job: Job<TripAutomationJobData>): Promise<void> {
    this.logger.log(`Processing job ${job.id} (${job.name})`)

    switch (job.name) {
      case JOB_TYPES.TRIP_STATUS_TRANSITION:
        await this.handleStatusTransition(job as Job<TripStatusTransitionJobData>)
        break

      case JOB_TYPES.TRIP_REMINDER:
        await this.handleReminder(job as Job<TripReminderJobData>)
        break

      case JOB_TYPES.TRIP_BACKFILL:
        await this.handleBackfill(job as Job<TripBackfillJobData>)
        break

      default:
        this.logger.warn(`Unknown job type: ${job.name}`)
    }
  }

  // ============================================================================
  // Status Transition Handler
  // ============================================================================

  /**
   * Handle scheduled status transition
   * IDEMPOTENT: Checks current status before transitioning
   */
  private async handleStatusTransition(job: Job<TripStatusTransitionJobData>): Promise<void> {
    const { tripId, toStatus, reason } = job.data

    // 1. Fetch current trip state
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        status: this.db.schema.trips.status,
        name: this.db.schema.trips.name,
        primaryContactId: this.db.schema.trips.primaryContactId,
        agencyId: this.db.schema.trips.agencyId,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      this.logger.warn(`Trip ${tripId} not found - skipping transition`)
      return
    }

    // 2. Check if transition is still valid (idempotency check)
    if (trip.status === toStatus) {
      this.logger.log(`Trip ${tripId} already in status "${toStatus}" - skipping`)
      return
    }

    // 3. Validate allowed transitions
    // Aligned with TRIP_STATUS_TRANSITIONS in shared-types
    const validTransitions: Record<string, string[]> = {
      booked: ['in_progress', 'completed', 'cancelled'], // completed allowed for same-day trips
      in_progress: ['completed', 'cancelled'],
    }

    const allowed = validTransitions[trip.status]
    if (!allowed || !allowed.includes(toStatus)) {
      this.logger.warn(
        `Invalid transition for trip ${tripId}: ${trip.status} -> ${toStatus} - skipping`
      )
      return
    }

    // 4. Perform the transition
    const now = new Date()
    await this.db.client
      .update(this.db.schema.trips)
      .set({
        status: toStatus,
        statusAutoTransitionedAt: now,
        lastStatusChangeAt: now,
        updatedAt: now,
      })
      .where(eq(this.db.schema.trips.id, tripId))

    this.logger.log(
      `Trip ${tripId} transitioned from "${trip.status}" to "${toStatus}" (${reason})`
    )

    // 5. Emit appropriate event
    if (toStatus === 'in_progress') {
      this.eventEmitter.emit(
        'trip.in_progress',
        new TripInProgressEvent(
          tripId,
          trip.name,
          trip.primaryContactId,
          trip.agencyId,
          true, // isAutoTransition
          trip.startDate,
        )
      )
    } else if (toStatus === 'completed') {
      this.eventEmitter.emit(
        'trip.completed',
        new TripCompletedEvent(
          tripId,
          trip.name,
          trip.primaryContactId,
          trip.agencyId,
          true, // isAutoTransition
          trip.endDate,
        )
      )
    }
  }

  // ============================================================================
  // Reminder Handler
  // ============================================================================

  /**
   * Handle trip reminders
   */
  private async handleReminder(job: Job<TripReminderJobData>): Promise<void> {
    const { tripId, reminderType } = job.data

    // Fetch trip for reminder context
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        status: this.db.schema.trips.status,
        primaryContactId: this.db.schema.trips.primaryContactId,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      this.logger.warn(`Trip ${tripId} not found for reminder`)
      return
    }

    // Skip reminders for cancelled/completed trips
    if (trip.status === 'cancelled' || trip.status === 'completed') {
      this.logger.log(`Trip ${tripId} is ${trip.status} - skipping reminder`)
      return
    }

    this.logger.log(`Processing ${reminderType} reminder for trip ${tripId}`)

    // Emit reminder event for client care system to handle
    this.eventEmitter.emit('trip.reminder', {
      tripId,
      tripName: trip.name,
      reminderType,
      primaryContactId: trip.primaryContactId,
      startDate: trip.startDate,
      endDate: trip.endDate,
    })
  }

  // ============================================================================
  // Backfill Handler
  // ============================================================================

  /**
   * Backfill existing trips with scheduled jobs
   * Called on deployment to ensure all booked/in_progress trips have scheduled transitions
   */
  private async handleBackfill(job: Job<TripBackfillJobData>): Promise<void> {
    const { agencyId } = job.data

    this.logger.log(`Starting trip backfill${agencyId ? ` for agency ${agencyId}` : ''}`)

    const conditions = [
      or(
        eq(this.db.schema.trips.status, 'booked'),
        eq(this.db.schema.trips.status, 'in_progress'),
      ),
    ]

    if (agencyId) {
      conditions.push(eq(this.db.schema.trips.agencyId, agencyId))
    }

    // Find all booked/in_progress trips with dates
    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        status: this.db.schema.trips.status,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
        timezone: this.db.schema.trips.timezone,
      })
      .from(this.db.schema.trips)
      .where(and(...conditions))

    let scheduledCount = 0

    for (const trip of trips) {
      try {
        // Schedule in_progress transition if trip is booked with start date
        if (trip.status === 'booked' && trip.startDate) {
          const inProgressAt = this.automationService.computeLocalMidnight(
            trip.startDate,
            trip.timezone ?? undefined
          )
          const jobId = getTripTransitionJobId(trip.id, 'in_progress')

          if (this.automationService.isInFuture(inProgressAt)) {
            // Future date - schedule at that time
            await this.automationService.scheduleAt(
              QUEUES.TRIP_AUTOMATION,
              JOB_TYPES.TRIP_STATUS_TRANSITION,
              {
                type: JOB_TYPES.TRIP_STATUS_TRANSITION,
                tripId: trip.id,
                toStatus: 'in_progress',
                reason: 'backfill',
              },
              inProgressAt,
              { jobId }
            )
            scheduledCount++
          } else {
            // Past or same-day - schedule immediately (no delay for in_progress)
            await this.automationService.schedule(
              QUEUES.TRIP_AUTOMATION,
              JOB_TYPES.TRIP_STATUS_TRANSITION,
              {
                type: JOB_TYPES.TRIP_STATUS_TRANSITION,
                tripId: trip.id,
                toStatus: 'in_progress',
                reason: 'backfill',
              },
              { jobId, delay: 0 }
            )
            scheduledCount++
          }
        }

        // Schedule completed transition if trip has end date
        if ((trip.status === 'booked' || trip.status === 'in_progress') && trip.endDate) {
          const completedAt = this.automationService.computeDayAfterMidnight(
            trip.endDate,
            trip.timezone ?? undefined
          )
          const jobId = getTripTransitionJobId(trip.id, 'completed')

          if (this.automationService.isInFuture(completedAt)) {
            // Future date - schedule at that time
            await this.automationService.scheduleAt(
              QUEUES.TRIP_AUTOMATION,
              JOB_TYPES.TRIP_STATUS_TRANSITION,
              {
                type: JOB_TYPES.TRIP_STATUS_TRANSITION,
                tripId: trip.id,
                toStatus: 'completed',
                reason: 'backfill',
              },
              completedAt,
              { jobId }
            )
            scheduledCount++
          } else {
            // Past or same-day - schedule with 2s delay to ensure in_progress runs first
            await this.automationService.schedule(
              QUEUES.TRIP_AUTOMATION,
              JOB_TYPES.TRIP_STATUS_TRANSITION,
              {
                type: JOB_TYPES.TRIP_STATUS_TRANSITION,
                tripId: trip.id,
                toStatus: 'completed',
                reason: 'backfill',
              },
              { jobId, delay: 2000 }
            )
            scheduledCount++
          }
        }
      } catch (error) {
        this.logger.error(`Failed to schedule jobs for trip ${trip.id}: ${error}`)
      }
    }

    this.logger.log(
      `Backfill complete: ${scheduledCount} jobs scheduled for ${trips.length} trips`
    )
  }

  // ============================================================================
  // Worker Events
  // ============================================================================

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Job ${job.id} started processing`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.TRIP_AUTOMATION, job.id, 'processing')
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.TRIP_AUTOMATION, job.id, 'completed')
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.TRIP_AUTOMATION, job.id, 'failed', error.message)
    }
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`Worker error: ${error.message}`, error.stack)
  }
}
