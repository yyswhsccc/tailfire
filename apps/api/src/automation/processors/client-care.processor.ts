/**
 * Client Care Processor
 *
 * Handles client care automation jobs including:
 * - Welcome emails
 * - Post-trip follow-ups (thank you, feedback)
 * - Birthday messages
 * - Payment reminders (TICO-compliant)
 * - Departure reminders
 * - Recurring jobs (birthday scan, overdue payment scan)
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger, Injectable } from '@nestjs/common'
import { Job } from 'bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, or, lte, sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { AutomationService } from '../automation.service'
import { NotificationService } from '../../notifications/notification.service'
import {
  QUEUES,
  type ClientCareJobData,
  type PaymentReminderJobData,
  type DepartureReminderJobData,
  type PostTripJobData,
  type RecurringJobData,
} from '../automation.types'

// Union type for all job data types handled by this processor
type ClientCareJobUnion =
  | ClientCareJobData
  | PaymentReminderJobData
  | DepartureReminderJobData
  | PostTripJobData
  | RecurringJobData

@Processor(QUEUES.CLIENT_CARE)
@Injectable()
export class ClientCareProcessor extends WorkerHost {
  private readonly logger = new Logger(ClientCareProcessor.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly automationService: AutomationService,
    private readonly notificationService: NotificationService,
  ) {
    super()
  }

  async process(job: Job<ClientCareJobUnion>): Promise<void> {
    const { type } = job.data
    this.logger.log(`Processing client care job ${job.id} (${type})`)

    switch (type) {
      case 'client.welcome': {
        const data = job.data as ClientCareJobData
        await this.handleClientWelcome(data.contactId, data.tripId)
        break
      }

      case 'client.post_trip': {
        const data = job.data as ClientCareJobData
        await this.handlePostTrip(data.contactId, data.tripId!)
        break
      }

      case 'client.birthday': {
        const data = job.data as ClientCareJobData
        await this.handleBirthday(data.contactId)
        break
      }

      case 'client.follow_up': {
        const data = job.data as ClientCareJobData
        await this.handleFollowUp(data.contactId, data.tripId)
        break
      }

      // Payment reminders (TICO-compliant)
      case 'payment.reminder': {
        const data = job.data as PaymentReminderJobData
        await this.handlePaymentReminder(data)
        break
      }

      // Departure reminders
      case 'departure.reminder': {
        const data = job.data as DepartureReminderJobData
        await this.handleDepartureReminder(data)
        break
      }

      // Post-trip automation
      case 'post_trip.thank_you': {
        const data = job.data as PostTripJobData
        await this.handlePostTripThankYou(data)
        break
      }

      case 'post_trip.feedback': {
        const data = job.data as PostTripJobData
        await this.handlePostTripFeedback(data)
        break
      }

      // Recurring jobs
      case 'recurring.birthday_check': {
        const data = job.data as RecurringJobData
        await this.handleDailyBirthdayCheck(data.agencyId)
        break
      }

      case 'recurring.overdue_payment_scan': {
        const data = job.data as RecurringJobData
        await this.handleDailyOverduePaymentScan(data.agencyId)
        break
      }

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
  // Payment Reminder Handlers (TICO-compliant)
  // ============================================================================

  private async handlePaymentReminder(data: PaymentReminderJobData): Promise<void> {
    const { expectedPaymentItemId, tripId, contactId, agencyId, reminderType } = data

    // Check if payment is still pending/partial (idempotency check)
    const { expectedPaymentItems, contacts, trips } = this.db.schema
    const [paymentItem] = await this.db.client
      .select()
      .from(expectedPaymentItems)
      .where(eq(expectedPaymentItems.id, expectedPaymentItemId))
      .limit(1)

    if (!paymentItem) {
      this.logger.warn(`Payment item ${expectedPaymentItemId} not found - skipping reminder`)
      return
    }

    // Skip if already paid
    if (paymentItem.status === 'paid') {
      this.logger.log(`Payment ${expectedPaymentItemId} already paid - skipping reminder`)
      return
    }

    // Get contact email
    const [contact] = await this.db.client
      .select({ email: contacts.email, firstName: contacts.firstName })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} has no email - skipping payment reminder`)
      return
    }

    // Get trip name for context
    const [trip] = await this.db.client
      .select({ name: trips.name })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    // Map reminder type to template slug (must match seeded templates)
    const templateSlugMap: Record<string, string> = {
      '7_days_before': 'payment-reminder-7-days-before',
      '3_days_before': 'payment-reminder-3-days-before',
      'due_date': 'payment-reminder-due-date',
      '1_day_overdue': 'payment-reminder-1-day-overdue',
    }

    const templateSlug = templateSlugMap[reminderType] || 'payment-reminder-7-days-before'

    this.logger.log(`Sending ${reminderType} payment reminder to ${contact.email} for payment ${expectedPaymentItemId}`)

    // Send via NotificationService (for contacts, email only)
    await this.notificationService.sendToContact({
      contactId,
      agencyId,
      templateSlug,
      context: {
        agencyId,
        tripId,
        contactId,
        paymentItemId: expectedPaymentItemId,
        customVariables: {
          tripName: trip?.name || '',
          paymentName: paymentItem.paymentName,
          paymentAmount: paymentItem.expectedAmountCents ? (paymentItem.expectedAmountCents / 100).toFixed(2) : '',
          paymentDueDate: paymentItem.dueDate ? new Date(paymentItem.dueDate).toLocaleDateString() : '',
          reminderType,
        },
      },
    })
  }

  // ============================================================================
  // Departure Reminder Handlers
  // ============================================================================

  private async handleDepartureReminder(data: DepartureReminderJobData): Promise<void> {
    const { tripId, contactId, agencyId, daysBeforeDeparture } = data

    // Verify trip still exists and is in booked or in_progress status
    const { trips, contacts } = this.db.schema
    const [trip] = await this.db.client
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    if (!trip) {
      this.logger.warn(`Trip ${tripId} not found - skipping departure reminder`)
      return
    }

    // Skip if trip is cancelled or already completed
    if (trip.status === 'cancelled' || trip.status === 'completed') {
      this.logger.log(`Trip ${tripId} status is ${trip.status} - skipping departure reminder`)
      return
    }

    // Get contact email
    const [contact] = await this.db.client
      .select({ email: contacts.email, firstName: contacts.firstName })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} has no email - skipping departure reminder`)
      return
    }

    // Map days to template slug (1-day uses singular, others use plural)
    const templateSlug = daysBeforeDeparture === 1
      ? 'departure-reminder-1-day'
      : `departure-reminder-${daysBeforeDeparture}-days`

    this.logger.log(`Sending ${daysBeforeDeparture}-day departure reminder to ${contact.email} for trip ${tripId}`)

    await this.notificationService.sendToContact({
      contactId,
      agencyId,
      templateSlug,
      context: {
        agencyId,
        tripId,
        contactId,
        customVariables: {
          tripName: trip.name || '',
          startDate: trip.startDate ? new Date(trip.startDate).toLocaleDateString() : '',
          daysBeforeDeparture: String(daysBeforeDeparture),
        },
      },
    })
  }

  // ============================================================================
  // Post-Trip Automation Handlers
  // ============================================================================

  private async handlePostTripThankYou(data: PostTripJobData): Promise<void> {
    const { tripId, contactId, agencyId } = data

    // Verify trip is completed
    const { trips, contacts } = this.db.schema
    const [trip] = await this.db.client
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    if (!trip || trip.status !== 'completed') {
      this.logger.log(`Trip ${tripId} not completed - skipping thank you email`)
      return
    }

    // Get contact email
    const [contact] = await this.db.client
      .select({ email: contacts.email, firstName: contacts.firstName })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} has no email - skipping thank you email`)
      return
    }

    this.logger.log(`Sending post-trip thank you to ${contact.email} for trip "${trip.name}"`)

    await this.notificationService.sendToContact({
      contactId,
      agencyId,
      templateSlug: 'post-trip-thank-you',
      context: {
        agencyId,
        tripId,
        contactId,
        customVariables: {
          tripName: trip.name || '',
          endDate: trip.endDate ? new Date(trip.endDate).toLocaleDateString() : '',
        },
      },
    })
  }

  private async handlePostTripFeedback(data: PostTripJobData): Promise<void> {
    const { tripId, contactId, agencyId } = data

    // Verify trip is completed
    const { trips, contacts } = this.db.schema
    const [trip] = await this.db.client
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    if (!trip || trip.status !== 'completed') {
      this.logger.log(`Trip ${tripId} not completed - skipping feedback request`)
      return
    }

    // Get contact email
    const [contact] = await this.db.client
      .select({ email: contacts.email, firstName: contacts.firstName })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} has no email - skipping feedback request`)
      return
    }

    this.logger.log(`Sending feedback request to ${contact.email} for trip "${trip.name}"`)

    await this.notificationService.sendToContact({
      contactId,
      agencyId,
      templateSlug: 'post-trip-feedback-request',
      context: {
        agencyId,
        tripId,
        contactId,
        customVariables: {
          tripName: trip.name || '',
          endDate: trip.endDate ? new Date(trip.endDate).toLocaleDateString() : '',
        },
      },
    })
  }

  // ============================================================================
  // Recurring Job Handlers
  // ============================================================================

  private async handleDailyBirthdayCheck(agencyId?: string): Promise<void> {
    const today = new Date()
    const { contacts } = this.db.schema

    // Find all contacts with birthday today
    const condition = sql`
      EXTRACT(MONTH FROM ${contacts.dateOfBirth}) = ${today.getMonth() + 1} AND
      EXTRACT(DAY FROM ${contacts.dateOfBirth}) = ${today.getDate()} AND
      ${contacts.email} IS NOT NULL
    `

    // Add agency filter if provided
    const baseConditions = agencyId
      ? and(condition, eq(contacts.agencyId, agencyId))
      : condition

    const birthdayContacts = await this.db.client
      .select({
        id: contacts.id,
        agencyId: contacts.agencyId,
        email: contacts.email,
        firstName: contacts.firstName,
      })
      .from(contacts)
      .where(baseConditions)

    this.logger.log(`Found ${birthdayContacts.length} contacts with birthday today`)

    // Queue individual birthday email jobs for each contact
    for (const contact of birthdayContacts) {
      if (contact.agencyId) {
        await this.automationService.schedule(
          QUEUES.CLIENT_CARE,
          'client.birthday',
          {
            type: 'client.birthday' as const,
            contactId: contact.id,
            agencyId: contact.agencyId,
          },
          { priority: 10 } // Lower priority than payment reminders
        )
      }
    }
  }

  private async handleDailyOverduePaymentScan(_agencyId?: string): Promise<void> {
    const { expectedPaymentItems } = this.db.schema
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10) // Format as YYYY-MM-DD for date comparison

    // Find all pending/partial payments that are past due
    const overdueItems = await this.db.client
      .select({
        id: expectedPaymentItems.id,
        paymentScheduleConfigId: expectedPaymentItems.paymentScheduleConfigId,
        status: expectedPaymentItems.status,
        dueDate: expectedPaymentItems.dueDate,
      })
      .from(expectedPaymentItems)
      .where(
        and(
          or(
            eq(expectedPaymentItems.status, 'pending'),
            eq(expectedPaymentItems.status, 'partial')
          ),
          lte(expectedPaymentItems.dueDate, todayStr)
        )
      )

    this.logger.log(`Found ${overdueItems.length} overdue payment items`)

    // Update status to overdue and emit events
    for (const item of overdueItems) {
      // Update status
      await this.db.client
        .update(expectedPaymentItems)
        .set({ status: 'overdue' })
        .where(eq(expectedPaymentItems.id, item.id))

      // Emit event for activity logging
      this.eventEmitter.emit('payment.overdue', {
        paymentItemId: item.id,
        paymentScheduleConfigId: item.paymentScheduleConfigId,
        dueDate: item.dueDate,
      })

      this.logger.log(`Marked payment ${item.id} as overdue`)
    }
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
