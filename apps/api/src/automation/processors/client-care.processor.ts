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
import { eq, and, or, lte, gte, sql, inArray, isNotNull, ne } from 'drizzle-orm'
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

/** Escape HTML special characters to prevent markup breakage in email templates */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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
        if (!data.agencyId) {
          this.logger.warn(`Birthday job for contact ${data.contactId} missing agencyId - skipping`)
          break
        }
        await this.handleBirthday(data.contactId, data.agencyId)
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

      case 'recurring.task_assignment_digest': {
        await this.handleTaskAssignmentDigest()
        break
      }

      case 'recurring.task_due_reminder': {
        await this.handleTaskDueReminder()
        break
      }

      default:
        this.logger.warn(`Unknown client care job type: ${type}`)
    }
  }

  // ============================================================================
  // Welcome Email Handler
  // ============================================================================

  private async handleClientWelcome(contactId: string, _tripId?: string): Promise<void> {
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

    // TODO: Implement actual email sending when email templates are ready
    // The 'client-welcome' template needs to be created first
    this.logger.warn(`Welcome email for contact ${contactId} skipped - template not yet implemented`)

    // When ready, use:
    // await this.notificationService.sendToContact({
    //   contactId,
    //   agencyId,
    //   templateSlug: 'client-welcome',
    //   context: { agencyId, contactId, tripId, customVariables: {} },
    // })
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

  private async handleBirthday(contactId: string, agencyId: string): Promise<void> {
    // Fetch contact
    const { contacts } = this.db.schema
    const [contact] = await this.db.client
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        email: contacts.email,
        dateOfBirth: contacts.dateOfBirth,
      })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)

    if (!contact?.email) {
      this.logger.warn(`Contact ${contactId} not found or has no email - skipping birthday`)
      return
    }

    this.logger.log(`Sending birthday greeting to ${contact.email}`)

    // Send birthday email via NotificationService
    await this.notificationService.sendToContact({
      contactId,
      agencyId,
      templateSlug: 'client-birthday',
      context: {
        agencyId,
        contactId,
        customVariables: {},
      },
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

    // TODO: Implement actual email sending when email templates are ready
    // The 'client-follow-up' template needs to be created first
    this.logger.warn(`Follow-up email for contact ${contactId}${tripName ? ` (trip: ${tripName})` : ''} skipped - template not yet implemented`)

    // When ready, use:
    // await this.notificationService.sendToContact({
    //   contactId,
    //   agencyId,
    //   templateSlug: 'client-follow-up',
    //   context: { agencyId, contactId, tripId, customVariables: { tripName } },
    // })
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

    // Get trip name and status for context
    const [trip] = await this.db.client
      .select({ name: trips.name, status: trips.status })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    // Skip reminders for cancelled trips
    if (trip?.status === 'cancelled') {
      this.logger.log(`Skipping payment reminder for cancelled trip ${tripId}`)
      return
    }

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
  // Task Assignment Digest Handler
  // ============================================================================

  private async handleTaskAssignmentDigest(): Promise<void> {
    const { taskNotificationPending, tasks, contacts } = this.db.schema

    // Get pending assignment/removal notifications only (not due_reminder markers)
    const pendingRows = await this.db.client
      .select({
        id: taskNotificationPending.id,
        agencyId: taskNotificationPending.agencyId,
        taskId: taskNotificationPending.taskId,
        contactId: taskNotificationPending.contactId,
        eventType: taskNotificationPending.eventType,
      })
      .from(taskNotificationPending)
      .where(inArray(taskNotificationPending.eventType, ['assigned', 'removed']))

    if (pendingRows.length === 0) {
      this.logger.debug('No pending task assignment notifications')
      return
    }

    // Group by contact
    const byContact = new Map<string, typeof pendingRows>()
    for (const row of pendingRows) {
      const existing = byContact.get(row.contactId) || []
      existing.push(row)
      byContact.set(row.contactId, existing)
    }

    this.logger.log(`Processing task assignment digest for ${byContact.size} contacts`)

    for (const [contactId, rows] of byContact) {
      try {
        // Get contact email
        const [contact] = await this.db.client
          .select({ email: contacts.email, firstName: contacts.firstName })
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1)

        if (!contact?.email) {
          this.logger.warn(`Contact ${contactId} has no email - skipping task digest`)
          // Still delete the pending rows to avoid re-processing
          await this.db.client
            .delete(taskNotificationPending)
            .where(inArray(taskNotificationPending.id, rows.map((r) => r.id)))
          continue
        }

        // Fetch task details for each pending row
        const taskIds = [...new Set(rows.map((r) => r.taskId))]
        const taskDetails = await this.db.client
          .select({
            id: tasks.id,
            title: tasks.title,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))

        const taskMap = new Map(taskDetails.map((t) => [t.id, t]))

        // Separate into assigned and removed
        const assignedTasks: Array<{ title: string; dueDate: string }> = []
        const removedTasks: Array<{ title: string; dueDate: string }> = []

        for (const row of rows) {
          const task = taskMap.get(row.taskId)
          const entry = {
            title: escapeHtml(task?.title || 'Unknown task'),
            dueDate: task?.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date',
          }
          if (row.eventType === 'assigned') {
            assignedTasks.push(entry)
          } else {
            removedTasks.push(entry)
          }
        }

        // Pre-build HTML and text strings for the template
        // (VariableResolverService only supports simple {{variable}} substitution, not loops)
        const assignedTasksHtml = assignedTasks.length > 0
          ? `<h3 style="margin:0 0 12px;font-size:16px;color:#16a34a;">New Assignments</h3>
<table width="100%" cellpadding="8" cellspacing="0" style="margin-bottom:24px;border:1px solid #e4e4e7;border-radius:4px;">
<tr style="background-color:#f4f4f5;">
<th style="text-align:left;font-size:13px;color:#52525b;border-bottom:1px solid #e4e4e7;">Task</th>
<th style="text-align:left;font-size:13px;color:#52525b;border-bottom:1px solid #e4e4e7;">Due Date</th>
</tr>
${assignedTasks.map((t) => `<tr><td style="font-size:14px;color:#27272a;border-bottom:1px solid #f4f4f5;">${t.title}</td><td style="font-size:14px;color:#71717a;border-bottom:1px solid #f4f4f5;">${t.dueDate}</td></tr>`).join('\n')}
</table>`
          : ''

        const removedTasksHtml = removedTasks.length > 0
          ? `<h3 style="margin:0 0 12px;font-size:16px;color:#dc2626;">Removed Assignments</h3>
<table width="100%" cellpadding="8" cellspacing="0" style="margin-bottom:24px;border:1px solid #e4e4e7;border-radius:4px;">
<tr style="background-color:#f4f4f5;">
<th style="text-align:left;font-size:13px;color:#52525b;border-bottom:1px solid #e4e4e7;">Task</th>
<th style="text-align:left;font-size:13px;color:#52525b;border-bottom:1px solid #e4e4e7;">Due Date</th>
</tr>
${removedTasks.map((t) => `<tr><td style="font-size:14px;color:#27272a;border-bottom:1px solid #f4f4f5;">${t.title}</td><td style="font-size:14px;color:#71717a;border-bottom:1px solid #f4f4f5;">${t.dueDate}</td></tr>`).join('\n')}
</table>`
          : ''

        const assignedTasksText = assignedTasks.length > 0
          ? `NEW ASSIGNMENTS:\n${assignedTasks.map((t) => `- ${t.title} (Due: ${t.dueDate})`).join('\n')}`
          : ''

        const removedTasksText = removedTasks.length > 0
          ? `REMOVED ASSIGNMENTS:\n${removedTasks.map((t) => `- ${t.title} (Due: ${t.dueDate})`).join('\n')}`
          : ''

        // Use the agencyId from the first row (all rows for a contact should share the same agency)
        const agencyId = rows[0]!.agencyId

        // Send digest email
        await this.notificationService.sendToContact({
          contactId,
          agencyId,
          templateSlug: 'task-assignment-digest',
          context: {
            agencyId,
            contactId,
            customVariables: {
              assigned_tasks_html: assignedTasksHtml,
              assigned_tasks_text: assignedTasksText,
              removed_tasks_html: removedTasksHtml,
              removed_tasks_text: removedTasksText,
            },
          },
        })

        this.logger.log(`Sent task assignment digest to contact ${contactId} (${assignedTasks.length} assigned, ${removedTasks.length} removed)`)

        // Delete processed pending rows
        await this.db.client
          .delete(taskNotificationPending)
          .where(inArray(taskNotificationPending.id, rows.map((r) => r.id)))
      } catch (error) {
        this.logger.error(`Failed to send task digest to contact ${contactId}: ${error}`)
        // Don't delete rows on failure — they'll be retried next hour
      }
    }
  }

  /**
   * Task Due Reminder Handler
   *
   * Sends individual reminder emails to contacts 24 hours before their assigned tasks are due.
   * Uses task_notification_pending with event_type='due_reminder' to track sent reminders
   * and prevent duplicate sends. These rows are never deleted by the digest handler.
   */
  private async handleTaskDueReminder(): Promise<void> {
    const { tasks, taskNotificationPending, contacts } = this.db.schema

    const now = new Date()
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const todayStr = now.toISOString().split('T')[0]!
    const in24HoursStr = in24Hours.toISOString().split('T')[0]!

    // Find contact-assigned tasks due within the next 24 hours that are not completed/cancelled
    // Checks both dueDate (date-only) and dueAt (timestamp) fields
    const dueTasks = await this.db.client
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        dueAt: tasks.dueAt,
        assigneeContactId: tasks.assigneeContactId,
        agencyId: tasks.agencyId,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeType, 'contact'),
          isNotNull(tasks.assigneeContactId),
          or(
            // Tasks with dueDate (date-only) due today or tomorrow
            and(
              isNotNull(tasks.dueDate),
              lte(tasks.dueDate, in24HoursStr),
              gte(tasks.dueDate, todayStr),
            ),
            // Tasks with dueAt (timestamp) due within the next 24 hours
            and(
              isNotNull(tasks.dueAt),
              lte(tasks.dueAt, in24Hours),
              gte(tasks.dueAt, now),
            ),
          ),
          ne(tasks.status, 'completed'),
          ne(tasks.status, 'cancelled'),
          eq(tasks.isDeleted, false),
        )
      )

    if (dueTasks.length === 0) {
      this.logger.debug('No tasks due within 24 hours for contact reminder')
      return
    }

    // Check which tasks already have a due_reminder sent
    const taskIds = dueTasks.map((t) => t.id)
    const existingReminders = await this.db.client
      .select({ taskId: taskNotificationPending.taskId })
      .from(taskNotificationPending)
      .where(
        and(
          inArray(taskNotificationPending.taskId, taskIds),
          eq(taskNotificationPending.eventType, 'due_reminder'),
        )
      )
    const alreadySent = new Set(existingReminders.map((r) => r.taskId))

    const tasksToRemind = dueTasks.filter((t) => !alreadySent.has(t.id))

    if (tasksToRemind.length === 0) {
      this.logger.debug('All due task reminders already sent')
      return
    }

    this.logger.log(`Sending due reminder for ${tasksToRemind.length} tasks`)

    for (const task of tasksToRemind) {
      try {
        const contactId = task.assigneeContactId!

        // Get contact email
        const [contact] = await this.db.client
          .select({ email: contacts.email, firstName: contacts.firstName })
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1)

        if (!contact?.email) {
          this.logger.warn(`Contact ${contactId} has no email - skipping due reminder for task ${task.id}`)
          // Mark as sent to avoid retrying for emailless contacts
          await this.db.client
            .insert(taskNotificationPending)
            .values({
              agencyId: task.agencyId,
              taskId: task.id,
              contactId,
              eventType: 'due_reminder',
            })
            .onConflictDoNothing()
          continue
        }

        // Send reminder email
        await this.notificationService.sendToContact({
          contactId,
          agencyId: task.agencyId,
          templateSlug: 'task-due-reminder',
          context: {
            agencyId: task.agencyId,
            contactId,
            customVariables: {
              task_title: escapeHtml(task.title),
              task_due_date: (task.dueDate || task.dueAt)
                ? new Date(task.dueDate || task.dueAt!).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : 'No due date',
            },
          },
        })

        // Mark as sent (prevents duplicate reminders)
        await this.db.client
          .insert(taskNotificationPending)
          .values({
            agencyId: task.agencyId,
            taskId: task.id,
            contactId,
            eventType: 'due_reminder',
          })
          .onConflictDoNothing()

        this.logger.log(`Sent due reminder for task ${task.id} to contact ${contactId}`)
      } catch (error) {
        this.logger.error(`Failed to send due reminder for task ${task.id}: ${error}`)
        // Don't mark as sent on failure — will retry next hour
      }
    }
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
