/**
 * Notification Events Listener
 *
 * Listens to domain events and creates platform notifications for users.
 * Routes notifications based on user preferences via NotificationService.
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OnEvent } from '@nestjs/event-emitter'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { EmailService } from '../../email/email.service'
import { getTripCancellationTemplate } from '../../email/templates/trip-cancellation.template'
import { NotificationService } from '../notification.service'
// NotificationCategory type available from '../notification.types' if needed

// Import event types
import { TripCreatedEvent } from '../../activity-logs/events/trip-created.event'
import { TripUpdatedEvent } from '../../activity-logs/events/trip-updated.event'
import { TripActiveEvent } from '../../trips/events/trip-active.event'
import { TripTravellingEvent } from '../../trips/events/trip-travelling.event'
import { TripTravelledEvent } from '../../trips/events/trip-travelled.event'
import { TripCancelledEvent } from '../../trips/events/trip-cancelled.event'

/**
 * Payment overdue event (emitted by client-care processor)
 */
interface PaymentOverdueEvent {
  tripId: string
  tripName: string
  contactId: string
  agencyId: string
  paymentItemId: string
  paymentName: string
  amountDue: number
  daysOverdue: number
}

/**
 * Payment received event
 */
interface PaymentReceivedEvent {
  tripId: string
  paymentItemId: string
  amount: number
  tripOwnerId?: string
}

@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // =========================================================================
  // Trip Events
  // =========================================================================

  /**
   * Handle trip.created event
   * Notify owner when a new trip (lead) is created and assigned to them
   */
  @OnEvent('trip.created')
  async handleTripCreated(event: TripCreatedEvent): Promise<void> {
    const { tripId, tripName, actorId, metadata } = event

    // Get the trip to find the owner and agency
    const trip = await this.getTrip(tripId)
    if (!trip) return

    // Only notify if trip has an owner (assigned lead)
    if (!trip.ownerId) {
      this.logger.debug(`Trip ${tripId} has no owner - skipping notification`)
      return
    }

    // Don't notify if the owner created the trip themselves
    if (actorId === trip.ownerId) {
      this.logger.debug(`Trip ${tripId} owner is the creator - skipping notification`)
      return
    }

    const status = metadata?.status || 'inbound'
    const isInbound = status === 'inbound'

    await this.notificationService.send({
      userId: trip.ownerId,
      category: isInbound ? 'assignment' : 'trip_updates',
      title: isInbound ? 'New Lead Assigned' : 'New Trip Created',
      body: isInbound
        ? `A new lead "${tripName}" has been assigned to you`
        : `Trip "${tripName}" has been created`,
      actionUrl: `/trips/${tripId}`,
      data: {
        tripId,
        tripName,
        status,
        notificationType: isInbound ? 'trip.lead_assigned' : 'trip.created',
      },
    })

    this.logger.debug(`Sent trip.created notification to user ${trip.ownerId} for trip ${tripId}`)
  }

  /**
   * Handle trip.updated event
   * Notify new owner when a trip is reassigned
   */
  @OnEvent('trip.updated')
  async handleTripUpdated(event: TripUpdatedEvent): Promise<void> {
    const { tripId, tripName, actorId, changes } = event

    // Check if owner changed
    if (!changes?.ownerId) return

    // Skip assignment notification if suppressed (bulk sends summary instead)
    if (changes?.suppressAssignmentNotification) return

    const newOwnerId = changes.ownerId as string

    // Don't notify if the new owner made the change themselves
    if (actorId === newOwnerId) {
      this.logger.debug(`Trip ${tripId} new owner is the actor - skipping notification`)
      return
    }

    // Get the trip to find agency
    const trip = await this.getTrip(tripId)
    if (!trip) return

    // Send in-app notification only (email handled by dedicated template below)
    await this.notificationService.send({
      userId: newOwnerId,
      category: 'assignment',
      title: 'Trip Assigned to You',
      body: `Trip "${tripName}" has been assigned to you`,
      actionUrl: `/trips/${tripId}`,
      forceChannels: ['platform'],
      data: {
        tripId,
        tripName,
        notificationType: 'trip.assigned',
        previousOwnerId: actorId,
      },
    })

    this.logger.debug(`Sent trip.assigned notification to user ${newOwnerId} for trip ${tripId}`)

    // Send formatted reassignment email (instead of generic notification email with JSON)
    try {
      const adminUrl = this.configService.get<string>('ADMIN_URL') || ''
      // Get actor name
      let adminName = 'An admin'
      if (actorId) {
        const [actor] = await this.db.client
          .select({ firstName: this.db.schema.userProfiles.firstName, lastName: this.db.schema.userProfiles.lastName })
          .from(this.db.schema.userProfiles)
          .where(eq(this.db.schema.userProfiles.id, actorId))
          .limit(1)
        if (actor) {
          adminName = [actor.firstName, actor.lastName].filter(Boolean).join(' ') || 'An admin'
        }
      }
      // Get new owner email
      const [newOwner] = await this.db.client
        .select({ email: this.db.schema.userProfiles.email })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, newOwnerId))
        .limit(1)

      if (newOwner?.email) {
        await this.emailService.sendTripReassignmentEmail(
          newOwner.email,
          tripName,
          adminName,
          0, // contactsAssigned not available in single event
          `${adminUrl}/trips/${tripId}`,
          trip.agencyId,
        )
      }
    } catch (e) {
      this.logger.warn('Failed to send trip reassignment email', e)
    }
  }

  /**
   * Handle trip.active event
   * Notify trip owner when a trip is booked/activated
   */
  @OnEvent('trip.active')
  async handleTripActive(event: TripActiveEvent): Promise<void> {
    const { tripId, bookingDate } = event

    const trip = await this.getTrip(tripId)
    if (!trip || !trip.ownerId) return

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'booking_alerts',
      title: 'Trip Booked',
      body: `Trip "${trip.name}" has been booked`,
      actionUrl: `/trips/${tripId}`,
      data: {
        tripId,
        tripName: trip.name,
        bookingDate,
        notificationType: 'trip.active',
      },
    })

    this.logger.debug(`Sent trip.active notification to user ${trip.ownerId} for trip ${tripId}`)
  }

  /**
   * Handle trip.travelling event
   * Notify trip owner when a trip starts (travelling)
   */
  @OnEvent('trip.travelling')
  async handleTripTravelling(event: TripTravellingEvent): Promise<void> {
    const { tripId, tripName, isAutoTransition, startDate } = event

    const trip = await this.getTrip(tripId)
    if (!trip || !trip.ownerId) return

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'trip_updates',
      title: 'Trip Started',
      body: isAutoTransition
        ? `Trip "${tripName}" has automatically started (departure date reached)`
        : `Trip "${tripName}" is now travelling`,
      actionUrl: `/trips/${tripId}`,
      data: {
        tripId,
        tripName,
        startDate,
        isAutoTransition,
        notificationType: 'trip.travelling',
      },
    })

    this.logger.debug(`Sent trip.travelling notification to user ${trip.ownerId} for trip ${tripId}`)
  }

  /**
   * Handle trip.travelled event
   * Notify trip owner when a trip completes
   */
  @OnEvent('trip.travelled')
  async handleTripTravelled(event: TripTravelledEvent): Promise<void> {
    const { tripId, tripName, isAutoTransition, endDate } = event

    const trip = await this.getTrip(tripId)
    if (!trip || !trip.ownerId) return

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'trip_updates',
      title: 'Trip Completed',
      body: isAutoTransition
        ? `Trip "${tripName}" has automatically completed (return date passed)`
        : `Trip "${tripName}" has been marked as travelled`,
      actionUrl: `/trips/${tripId}`,
      data: {
        tripId,
        tripName,
        endDate,
        isAutoTransition,
        notificationType: 'trip.travelled',
      },
    })

    this.logger.debug(`Sent trip.travelled notification to user ${trip.ownerId} for trip ${tripId}`)
  }

  /**
   * Handle trip.cancelled event
   * Notify trip owner when a trip is cancelled
   */
  @OnEvent('trip.cancelled')
  async handleTripCancelled(event: TripCancelledEvent): Promise<void> {
    const { tripId, tripName, cancelledBy, cancellationReason } = event

    const trip = await this.getTrip(tripId)
    if (!trip) return

    // Send in-app notification to owner (unless they cancelled it themselves)
    if (trip.ownerId && cancelledBy !== trip.ownerId) {
      await this.notificationService.send({
        userId: trip.ownerId,
        category: 'trip_updates',
        title: 'Trip Cancelled',
        body: cancellationReason
          ? `Trip "${tripName}" has been cancelled: ${cancellationReason}`
          : `Trip "${tripName}" has been cancelled`,
        actionUrl: `/trips/${tripId}`,
        data: {
          tripId,
          tripName,
          reason: cancellationReason,
          cancelledBy,
          notificationType: 'trip.cancelled',
        },
      })

      this.logger.debug(`Sent trip.cancelled notification to user ${trip.ownerId} for trip ${tripId}`)
    }

    // Send cancellation email to travelers if requested
    if (event.notifyTravelers && event.primaryContactId) {
      try {
        // Fetch primary contact email
        const [contact] = await this.db.client
          .select({
            email: this.db.schema.contacts.email,
            firstName: this.db.schema.contacts.firstName,
            lastName: this.db.schema.contacts.lastName,
          })
          .from(this.db.schema.contacts)
          .where(eq(this.db.schema.contacts.id, event.primaryContactId))
          .limit(1)

        if (contact?.email) {
          // Fetch agency info for the email
          const [agency] = await this.db.client
            .select({
              name: this.db.schema.agencies.name,
              id: this.db.schema.agencies.id,
            })
            .from(this.db.schema.agencies)
            .innerJoin(
              this.db.schema.trips,
              eq(this.db.schema.trips.agencyId, this.db.schema.agencies.id),
            )
            .where(eq(this.db.schema.trips.id, event.tripId))
            .limit(1)

          const html = getTripCancellationTemplate({
            travelerName: contact.firstName || 'Traveler',
            tripName: event.tripName,
            cancellationReason: event.cancellationReason,
            agencyName: agency?.name || 'Your Travel Agency',
          })

          await this.emailService.sendEmail({
            to: [contact.email],
            subject: `Trip Cancellation: ${event.tripName}`,
            html,
            agencyId: agency?.id || '',
            tripId: event.tripId,
            contactId: event.primaryContactId,
            templateSlug: 'trip-cancellation',
          })

          this.logger.log(`Sent cancellation email to ${contact.email} for trip ${event.tripId}`)
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(`Failed to send cancellation email for trip ${event.tripId}: ${message}`)
      }
    }
  }

  /**
   * Handle trips.bulk_reassigned event
   * Send a single summary email when multiple trips are reassigned at once
   */
  @OnEvent('trips.bulk_reassigned')
  async handleBulkReassigned(event: {
    tripIds: string[]
    newOwnerId: string
    actorId: string
    agencyId: string
    tripsReassigned: number
    contactsAssigned: number
    contactsSkipped: { contactName: string; currentOwner: string }[]
    tripNames: string[]
  }): Promise<void> {
    try {
      const adminUrl = this.configService.get<string>('ADMIN_URL') || ''

      const [newOwner] = await this.db.client
        .select({ email: this.db.schema.userProfiles.email })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, event.newOwnerId))
        .limit(1)

      if (!newOwner?.email) return

      let adminName = 'An admin'
      const [actor] = await this.db.client
        .select({ firstName: this.db.schema.userProfiles.firstName, lastName: this.db.schema.userProfiles.lastName })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, event.actorId))
        .limit(1)
      if (actor) {
        adminName = [actor.firstName, actor.lastName].filter(Boolean).join(' ') || 'An admin'
      }

      await this.emailService.sendBulkReassignmentEmail(
        newOwner.email,
        adminName,
        event.tripsReassigned,
        event.tripNames,
        event.contactsAssigned,
        event.contactsSkipped.length,
        `${adminUrl}/trips?ownerId=${event.newOwnerId}`,
        event.agencyId,
      )

      this.logger.debug(`Sent bulk reassignment email to ${newOwner.email} for ${event.tripsReassigned} trips`)
    } catch (e) {
      this.logger.warn('Failed to send bulk reassignment email', e)
    }
  }

  // =========================================================================
  // Payment Events
  // =========================================================================

  /**
   * Handle payment.overdue event
   * Notify trip owner when a payment becomes overdue
   */
  @OnEvent('payment.overdue')
  async handlePaymentOverdue(event: PaymentOverdueEvent): Promise<void> {
    const { tripId, tripName, paymentItemId, paymentName, amountDue, daysOverdue } = event

    if (!tripId) {
      this.logger.warn(`payment.overdue event missing tripId (paymentItemId: ${paymentItemId})`)
      return
    }

    const trip = await this.getTrip(tripId)
    if (!trip || !trip.ownerId) return

    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amountDue / 100)

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'payment_alert',
      title: 'Payment Overdue',
      body: `Payment "${paymentName}" (${formattedAmount}) for trip "${tripName}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
      actionUrl: `/trips/${tripId}/payments`,
      data: {
        tripId,
        tripName,
        paymentItemId,
        paymentName,
        amountDue,
        daysOverdue,
        notificationType: 'payment.overdue',
      },
    })

    this.logger.debug(`Sent payment.overdue notification to user ${trip.ownerId} for trip ${tripId}`)
  }

  /**
   * Handle payment.received event
   * Notify trip owner when a payment is received
   */
  @OnEvent('payment.received')
  async handlePaymentReceived(event: PaymentReceivedEvent): Promise<void> {
    const { tripId, paymentItemId, amount, tripOwnerId } = event

    // If we have the owner ID directly, use it
    let ownerId = tripOwnerId
    let tripName = ''

    if (!ownerId) {
      const trip = await this.getTrip(tripId)
      if (!trip || !trip.ownerId) return
      ownerId = trip.ownerId
      tripName = trip.name
    } else {
      const trip = await this.getTrip(tripId)
      tripName = trip?.name || 'Unknown trip'
    }

    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100)

    await this.notificationService.send({
      userId: ownerId,
      category: 'payment_alert',
      title: 'Payment Received',
      body: `A payment of ${formattedAmount} has been received for trip "${tripName}"`,
      actionUrl: `/trips/${tripId}/payments`,
      data: {
        tripId,
        tripName,
        paymentItemId,
        amount,
        notificationType: 'payment.received',
      },
    })

    this.logger.debug(`Sent payment.received notification to user ${ownerId} for trip ${tripId}`)
  }

  // =========================================================================
  // Proposal Events (Client Feedback)
  // =========================================================================

  /**
   * Handle proposal.comment_created event
   * Notify trip owner when a client posts a comment on their proposal
   */
  @OnEvent('proposal.comment_created')
  async handleProposalCommentCreated(event: {
    tripId: string
    itineraryId: string
    commentId: string
    authorType: 'client' | 'agent'
    authorName: string
    activityId: string | null
    dayId: string | null
  }): Promise<void> {
    // Only notify on client comments (agent comments are from the trip owner themselves)
    if (event.authorType !== 'client') return

    const trip = await this.getTrip(event.tripId)
    if (!trip || !trip.ownerId) return

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'collaboration',
      title: 'New Client Comment',
      body: `${event.authorName} commented on proposal for "${trip.name}"`,
      actionUrl: `/trips/${event.tripId}`,
      data: {
        tripId: event.tripId,
        itineraryId: event.itineraryId,
        commentId: event.commentId,
        activityId: event.activityId,
        dayId: event.dayId,
        notificationType: 'proposal.comment_created',
      },
    })

    this.logger.debug(`Sent proposal.comment_created notification to user ${trip.ownerId} for trip ${event.tripId}`)
  }

  /**
   * Handle proposal.activity_response event
   * Notify trip owner when a client confirms or declines an activity
   */
  @OnEvent('proposal.activity_response')
  async handleActivityResponse(event: {
    tripId: string
    itineraryId: string
    activityId: string
    activityName: string
    response: 'confirmed' | 'declined'
    contactName: string
  }): Promise<void> {
    const trip = await this.getTrip(event.tripId)
    if (!trip || !trip.ownerId) return

    const verb = event.response === 'confirmed' ? 'approved' : 'declined'

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'collaboration',
      title: `Activity ${verb.charAt(0).toUpperCase() + verb.slice(1)}`,
      body: `${event.contactName} ${verb} "${event.activityName}" in "${trip.name}"`,
      actionUrl: `/trips/${event.tripId}`,
      data: {
        tripId: event.tripId,
        itineraryId: event.itineraryId,
        activityId: event.activityId,
        response: event.response,
        notificationType: 'proposal.activity_response',
      },
    })

    this.logger.debug(`Sent proposal.activity_response notification to user ${trip.ownerId} for trip ${event.tripId}`)
  }

  /**
   * Handle proposal.declined event
   * Notify trip owner when a client declines the entire proposal
   */
  @OnEvent('proposal.declined')
  async handleProposalDeclined(event: {
    tripId: string
    tripName: string
    itineraryId: string
  }): Promise<void> {
    const trip = await this.getTrip(event.tripId)
    if (!trip || !trip.ownerId) return

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'collaboration',
      title: 'Proposal Declined',
      body: `Client declined proposal for "${event.tripName}"`,
      actionUrl: `/trips/${event.tripId}`,
      data: {
        tripId: event.tripId,
        itineraryId: event.itineraryId,
        notificationType: 'proposal.declined',
      },
    })

    this.logger.debug(`Sent proposal.declined notification to user ${trip.ownerId} for trip ${event.tripId}`)
  }

  /**
   * Handle proposal.itinerary_selected event
   * Notify trip owner when a client selects a preferred itinerary
   */
  @OnEvent('proposal.itinerary_selected')
  async handleItinerarySelected(event: {
    tripId: string
    itineraryId: string
    itineraryName: string
  }): Promise<void> {
    const trip = await this.getTrip(event.tripId)
    if (!trip || !trip.ownerId) return

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'collaboration',
      title: 'Itinerary Selected',
      body: `Client selected "${event.itineraryName}" for "${trip.name}"`,
      actionUrl: `/trips/${event.tripId}`,
      data: {
        tripId: event.tripId,
        itineraryId: event.itineraryId,
        itineraryName: event.itineraryName,
        notificationType: 'proposal.itinerary_selected',
      },
    })

    this.logger.debug(`Sent proposal.itinerary_selected notification to user ${trip.ownerId} for trip ${event.tripId}`)
  }

  /**
   * Handle proposal.approved event
   * Notify trip owner when a client approves the proposal
   */
  @OnEvent('proposal.approved')
  async handleProposalApproved(event: {
    tripId: string
    tripName: string
    itineraryId: string
    itineraryName: string
  }): Promise<void> {
    const trip = await this.getTrip(event.tripId)
    if (!trip || !trip.ownerId) return

    await this.notificationService.send({
      userId: trip.ownerId,
      category: 'collaboration',
      title: 'Proposal Approved',
      body: `Client approved "${event.itineraryName}" for "${event.tripName}"`,
      actionUrl: `/trips/${event.tripId}`,
      data: {
        tripId: event.tripId,
        itineraryId: event.itineraryId,
        itineraryName: event.itineraryName,
        notificationType: 'proposal.approved',
      },
    })

    this.logger.debug(`Sent proposal.approved notification to user ${trip.ownerId} for trip ${event.tripId}`)
  }

  // =========================================================================
  // Contact Share Events
  // =========================================================================

  /**
   * Handle contact.share_requested event
   * Notify the contact owner that an agent has requested access
   */
  @OnEvent('contact.share_requested')
  async handleContactShareRequested(event: {
    requestId: string
    contactId: string
    contactName: string
    ownerId: string
    requesterId: string
    requesterName: string
    agencyId: string
  }): Promise<void> {
    await this.notificationService.send({
      userId: event.ownerId,
      category: 'contact_share',
      title: 'Contact Access Request',
      body: `${event.requesterName} has requested access to your contact "${event.contactName}"`,
      actionUrl: `/contacts/${event.contactId}`,
      data: {
        requestId: event.requestId,
        contactId: event.contactId,
        requesterId: event.requesterId,
        notificationType: 'contact.share_requested',
      },
    })

    this.logger.debug(
      `Sent contact.share_requested notification to user ${event.ownerId} for contact ${event.contactId}`,
    )
  }

  /**
   * Handle contact.share_approved event
   * Notify the requester that their access request was approved
   */
  @OnEvent('contact.share_approved')
  async handleContactShareApproved(event: {
    requestId: string
    contactId: string
    requesterId: string
    ownerId: string
    agencyId: string
  }): Promise<void> {
    await this.notificationService.send({
      userId: event.requesterId,
      category: 'contact_share',
      title: 'Contact Access Approved',
      body: 'Your request for full access to a contact has been approved',
      actionUrl: `/contacts/${event.contactId}`,
      data: {
        requestId: event.requestId,
        contactId: event.contactId,
        notificationType: 'contact.share_approved',
      },
    })

    this.logger.debug(
      `Sent contact.share_approved notification to user ${event.requesterId} for contact ${event.contactId}`,
    )
  }

  /**
   * Handle contact.share_denied event
   * Notify the requester that their access request was denied
   */
  @OnEvent('contact.share_denied')
  async handleContactShareDenied(event: {
    requestId: string
    contactId: string
    requesterId: string
    ownerId: string
    reason?: string
    agencyId: string
  }): Promise<void> {
    const body = event.reason
      ? `Your request for contact access was denied: ${event.reason}`
      : 'Your request for contact access was denied'

    await this.notificationService.send({
      userId: event.requesterId,
      category: 'contact_share',
      title: 'Contact Access Denied',
      body,
      data: {
        requestId: event.requestId,
        contactId: event.contactId,
        reason: event.reason,
        notificationType: 'contact.share_denied',
      },
    })

    this.logger.debug(
      `Sent contact.share_denied notification to user ${event.requesterId} for contact ${event.contactId}`,
    )
  }

  // =========================================================================
  // Impersonation Events
  // =========================================================================

  /**
   * Handle impersonation.ended event
   * Notify the target agent that an admin viewed their account
   */
  @OnEvent('impersonation.ended')
  async handleImpersonationEnded(event: {
    adminUserId: string
    targetUserId: string
    agencyId: string
    sessionId: string
    duration: number
  }): Promise<void> {
    try {
      // Get admin name
      const admin = await this.db.client.query.userProfiles.findFirst({
        where: eq(this.db.schema.userProfiles.id, event.adminUserId),
        columns: { firstName: true, lastName: true },
      })
      const adminName = [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || 'An admin'
      const durationMins = Math.round(event.duration / 60000)

      await this.notificationService.send({
        userId: event.targetUserId,
        category: 'system_alerts',
        title: `${adminName} viewed your account`,
        body: `Admin session lasted ${durationMins} minute(s).`,
        data: { sessionId: event.sessionId },
      })

      this.logger.debug(
        `Sent impersonation.ended notification to user ${event.targetUserId} for session ${event.sessionId}`,
      )
    } catch (error) {
      this.logger.error('Failed to send impersonation ended notification', error)
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Get trip by ID with owner and agency info
   */
  private async getTrip(tripId: string): Promise<{
    id: string
    name: string
    ownerId: string | null
    agencyId: string
    status: string
  } | null> {
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        ownerId: this.db.schema.trips.ownerId,
        agencyId: this.db.schema.trips.agencyId,
        status: this.db.schema.trips.status,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    return trip || null
  }
}
