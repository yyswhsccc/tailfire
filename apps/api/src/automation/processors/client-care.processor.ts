/**
 * Client Care Processor
 *
 * Handles client care automation jobs like welcome emails, post-trip follow-ups, and birthday messages.
 * Placeholder implementation - full email logic to be added when email templates are ready.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger, Injectable } from '@nestjs/common'
import { Job } from 'bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { AutomationService } from '../automation.service'
import {
  QUEUES,
  type ClientCareJobData,
} from '../automation.types'

@Processor(QUEUES.CLIENT_CARE)
@Injectable()
export class ClientCareProcessor extends WorkerHost {
  private readonly logger = new Logger(ClientCareProcessor.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly automationService: AutomationService,
  ) {
    super()
  }

  async process(job: Job<ClientCareJobData>): Promise<void> {
    const { type, contactId, tripId } = job.data
    this.logger.log(`Processing client care job ${job.id} (${type})`)

    switch (type) {
      case 'client.welcome':
        await this.handleClientWelcome(contactId, tripId)
        break

      case 'client.post_trip':
        await this.handlePostTrip(contactId, tripId!)
        break

      case 'client.birthday':
        await this.handleBirthday(contactId)
        break

      case 'client.follow_up':
        await this.handleFollowUp(contactId, tripId)
        break

      default:
        this.logger.warn(`Unknown client care job type: ${type}`)
    }
  }

  // ============================================================================
  // Welcome Email Handler
  // ============================================================================

  private async handleClientWelcome(contactId: string, tripId?: string): Promise<void> {
    // Fetch contact details
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
        email: this.db.schema.contacts.email,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact) {
      this.logger.warn(`Contact ${contactId} not found for welcome email`)
      return
    }

    if (!contact.email) {
      this.logger.warn(`Contact ${contactId} has no email - skipping welcome`)
      return
    }

    this.logger.log(`Sending welcome email to ${contact.email}`)

    // Emit event for email service to handle
    // TODO: Implement actual email sending when email templates are ready
    this.eventEmitter.emit('client.welcome', {
      contactId,
      email: contact.email,
      firstName: contact.firstName,
      tripId,
    })
  }

  // ============================================================================
  // Post-Trip Follow-up Handler
  // ============================================================================

  private async handlePostTrip(contactId: string, tripId: string): Promise<void> {
    // Fetch contact and trip details
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        email: this.db.schema.contacts.email,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} not found or has no email - skipping post-trip`)
      return
    }

    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        status: this.db.schema.trips.status,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      this.logger.warn(`Trip ${tripId} not found - skipping post-trip email`)
      return
    }

    // Only send if trip is completed
    if (trip.status !== 'completed') {
      this.logger.log(`Trip ${tripId} status is ${trip.status} - skipping post-trip email`)
      return
    }

    this.logger.log(`Sending post-trip follow-up to ${contact.email} for trip "${trip.name}"`)

    // Emit event for email service
    this.eventEmitter.emit('client.post_trip', {
      contactId,
      email: contact.email,
      firstName: contact.firstName,
      tripId,
      tripName: trip.name,
    })
  }

  // ============================================================================
  // Birthday Handler
  // ============================================================================

  private async handleBirthday(contactId: string): Promise<void> {
    // Fetch contact
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        email: this.db.schema.contacts.email,
        dateOfBirth: this.db.schema.contacts.dateOfBirth,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} not found or has no email - skipping birthday`)
      return
    }

    this.logger.log(`Sending birthday greeting to ${contact.email}`)

    // Emit event for email service
    this.eventEmitter.emit('client.birthday', {
      contactId,
      email: contact.email,
      firstName: contact.firstName,
    })
  }

  // ============================================================================
  // Follow-Up Handler
  // ============================================================================

  private async handleFollowUp(contactId: string, tripId?: string): Promise<void> {
    // Fetch contact details
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        email: this.db.schema.contacts.email,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} not found or has no email - skipping follow-up`)
      return
    }

    let tripName: string | undefined
    if (tripId) {
      const [trip] = await this.db.client
        .select({
          name: this.db.schema.trips.name,
        })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)

      tripName = trip?.name
    }

    this.logger.log(`Sending follow-up to ${contact.email}${tripName ? ` for trip "${tripName}"` : ''}`)

    // Emit event for email service
    this.eventEmitter.emit('client.follow_up', {
      contactId,
      email: contact.email,
      firstName: contact.firstName,
      tripId,
      tripName,
    })
  }

  // ============================================================================
  // Worker Events
  // ============================================================================

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Client care job ${job.id} started processing`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.CLIENT_CARE, job.id, 'processing')
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.debug(`Client care job ${job.id} completed`)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.CLIENT_CARE, job.id, 'completed')
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    this.logger.error(`Client care job ${job.id} failed: ${error.message}`, error.stack)
    if (job.id) {
      await this.automationService.updateJobHistory(QUEUES.CLIENT_CARE, job.id, 'failed', error.message)
    }
  }
}
