/**
 * Calendar Service
 *
 * Aggregates events from multiple sources for calendar display:
 * - Tasks
 * - Trips (start/end dates)
 * - Payments (deposit and final due dates)
 * - Birthdays (from contacts)
 * - Scheduled emails (from automation)
 */

import { Injectable } from '@nestjs/common'
import { and, eq, gte, lte, or, ne, isNotNull, inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripAccessService } from '../trips/trip-access.service'
import { CalendarEventsService } from '../calendar-events/calendar-events.service'
import type { CalendarQueryDto } from './dto'
import type { AuthContext } from '../auth/auth.types'
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarEventsResponseDto,
  TodayEventsResponseDto,
  ContactEventsResponseDto,
  TripEventsResponseDto,
} from '../../../../packages/shared-types/src/api'

// Event colors (matching frontend types)
const EVENT_COLORS: Record<CalendarEventType, { background: string; border: string }> = {
  task: { background: '#3b82f6', border: '#2563eb' },
  payment_deposit: { background: '#f59e0b', border: '#d97706' },
  payment_final: { background: '#ef4444', border: '#dc2626' },
  birthday: { background: '#ec4899', border: '#db2777' },
  trip: { background: '#10b981', border: '#059669' },
  scheduled_email: { background: '#64748b', border: '#475569' },
  event: { background: '#8b5cf6', border: '#7c3aed' },
  activity: { background: '#6366f1', border: '#4f46e5' },
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tripAccessService: TripAccessService,
    private readonly calendarEventsService: CalendarEventsService
  ) {}

  /**
   * Get all calendar events within a date range
   */
  async getEvents(
    query: CalendarQueryDto,
    auth: AuthContext
  ): Promise<CalendarEventsResponseDto> {
    const enabledTypes = query.types || [
      'task',
      'payment_deposit',
      'payment_final',
      'birthday',
      'trip',
      'scheduled_email',
      'event',
      'activity',
    ]

    // Fetch events in batches of 3 to avoid connection pool exhaustion
    // (Supabase PgBouncer session mode has a limited pool size)
    const [tasks, trips, payments] = await Promise.all([
      enabledTypes.includes('task')
        ? this.getTaskEvents(query, auth)
        : [],
      enabledTypes.includes('trip')
        ? this.getTripCalendarEvents(query, auth)
        : [],
      enabledTypes.some((t) => t === 'payment_deposit' || t === 'payment_final')
        ? this.getPaymentEvents(query, auth, enabledTypes)
        : [],
    ])

    const [birthdays, scheduledEmails, calendarEvents] = await Promise.all([
      enabledTypes.includes('birthday')
        ? this.getBirthdayEvents(query, auth)
        : [],
      enabledTypes.includes('scheduled_email')
        ? this.getScheduledEmailEvents(query, auth)
        : [],
      enabledTypes.includes('event')
        ? this.getCalendarEventEvents(query, auth)
        : [],
    ])

    const activityEvents = enabledTypes.includes('activity')
      ? await this.getActivityCalendarEvents(query, auth)
      : []

    // Combine and sort events
    const events = [...tasks, ...trips, ...payments, ...birthdays, ...scheduledEmails, ...calendarEvents, ...activityEvents].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    )

    return {
      events,
      range: {
        start: query.start,
        end: query.end,
      },
      filters: {
        types: query.types,
        userId: query.userId,
      },
    }
  }

  /**
   * Get today's events for the navbar preview
   */
  async getTodayEvents(auth: AuthContext): Promise<TodayEventsResponseDto> {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const result = await this.getEvents(
      { start: today!, end: tomorrow! },
      auth
    )

    return {
      events: result.events,
      date: today!,
      count: result.events.length,
    }
  }

  /**
   * Get events for a specific contact
   */
  async getContactEvents(
    contactId: string,
    query: { start: string; end: string },
    auth: AuthContext
  ): Promise<ContactEventsResponseDto> {
    // Get contact info
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.contacts)
      .where(
        and(
          eq(this.db.schema.contacts.id, contactId),
          eq(this.db.schema.contacts.agencyId, auth.agencyId)
        )
      )
      .limit(1)

    const contactName = contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
      : 'Unknown'

    // Get events related to this contact
    const extendedQuery: CalendarQueryDto = {
      ...query,
      contactId,
    }

    const result = await this.getEvents(extendedQuery, auth)

    return {
      contactId,
      contactName,
      events: result.events,
      range: {
        start: query.start,
        end: query.end,
      },
    }
  }

  /**
   * Get events for a specific trip (public API)
   */
  async getTripEvents(
    tripId: string,
    query: { start: string; end: string },
    auth: AuthContext
  ): Promise<TripEventsResponseDto> {
    // Get trip info
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
      })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.id, tripId),
          eq(this.db.schema.trips.agencyId, auth.agencyId)
        )
      )
      .limit(1)

    const tripName = trip?.name || 'Unknown Trip'

    // Get events related to this trip
    const extendedQuery: CalendarQueryDto = {
      ...query,
      tripId,
    }

    const result = await this.getEvents(extendedQuery, auth)

    return {
      tripId,
      tripName,
      events: result.events,
      range: {
        start: query.start,
        end: query.end,
      },
    }
  }

  // ============================================================================
  // PRIVATE EVENT FETCHERS
  // ============================================================================

  private async getTaskEvents(
    query: CalendarQueryDto,
    auth: AuthContext
  ): Promise<CalendarEvent[]> {
    const conditions = [
      eq(this.db.schema.tasks.agencyId, auth.agencyId),
      eq(this.db.schema.tasks.isDeleted, false),
      eq(this.db.schema.tasks.isVisibleInCalendar, true),
    ]

    // Date range filter (use dueDate or dueAt)
    // For dueAt (timestamp), use end-of-day UTC to include events on the end date
    const endOfDay = new Date(query.end)
    endOfDay.setUTCHours(23, 59, 59, 999)

    const dateCondition = or(
      and(
        isNotNull(this.db.schema.tasks.dueDate),
        gte(this.db.schema.tasks.dueDate, query.start),
        lte(this.db.schema.tasks.dueDate, query.end)
      ),
      and(
        isNotNull(this.db.schema.tasks.dueAt),
        gte(this.db.schema.tasks.dueAt, new Date(query.start)),
        lte(this.db.schema.tasks.dueAt, endOfDay)
      )
    )
    if (dateCondition) {
      conditions.push(dateCondition)
    }

    // User filter (admin can filter by user)
    if (query.userId && auth.role === 'admin') {
      const userCondition = or(
        eq(this.db.schema.tasks.assigneeUserId, query.userId),
        eq(this.db.schema.tasks.ownerId, query.userId)
      )
      if (userCondition) {
        conditions.push(userCondition)
      }
    } else if (auth.role !== 'admin') {
      // Non-admins see their own tasks or tasks assigned to them
      const accessCondition = or(
        eq(this.db.schema.tasks.ownerId, auth.userId),
        eq(this.db.schema.tasks.assigneeUserId, auth.userId),
        eq(this.db.schema.tasks.createdBy, auth.userId)
      )
      if (accessCondition) {
        conditions.push(accessCondition)
      }
    }

    // Trip/contact filters
    if (query.tripId) {
      conditions.push(eq(this.db.schema.tasks.tripId, query.tripId))
    }
    if (query.contactId) {
      conditions.push(eq(this.db.schema.tasks.contactId, query.contactId))
    }

    const tasks = await this.db.client
      .select()
      .from(this.db.schema.tasks)
      .where(and(...conditions))

    return tasks.map((task): CalendarEvent => ({
      id: `task-${task.id}`,
      type: 'task',
      title: task.title,
      description: task.description ?? undefined,
      start: task.dueAt?.toISOString() || task.dueDate || new Date().toISOString(),
      allDay: !task.dueAt,
      backgroundColor: task.colorOverride || EVENT_COLORS.task.background,
      borderColor: task.colorOverride || EVENT_COLORS.task.border,
      sourceId: task.id,
      sourceType: 'task',
      tripId: task.tripId ?? undefined,
      contactId: task.contactId ?? undefined,
      editable: true,
      clickable: true,
      metadata: {
        tripId: task.tripId ?? undefined,
        contactId: task.contactId ?? undefined,
        status: task.status,
        priority: task.priority,
      },
    }))
  }

  /**
   * Get trips as calendar events (internal method)
   */
  private async getTripCalendarEvents(
    query: CalendarQueryDto,
    auth: AuthContext
  ): Promise<CalendarEvent[]> {
    const conditions = [
      eq(this.db.schema.trips.agencyId, auth.agencyId),
      // Skip trips in 'activities' mode — they show individual activities instead
      ne(this.db.schema.trips.calendarDisplayMode, 'activities'),
    ]

    // Date range filter
    const dateCondition = or(
      // Trip starts within range
      and(
        isNotNull(this.db.schema.trips.startDate),
        gte(this.db.schema.trips.startDate, query.start),
        lte(this.db.schema.trips.startDate, query.end)
      ),
      // Trip ends within range
      and(
        isNotNull(this.db.schema.trips.endDate),
        gte(this.db.schema.trips.endDate, query.start),
        lte(this.db.schema.trips.endDate, query.end)
      ),
      // Trip spans the entire range
      and(
        isNotNull(this.db.schema.trips.startDate),
        isNotNull(this.db.schema.trips.endDate),
        lte(this.db.schema.trips.startDate, query.start),
        gte(this.db.schema.trips.endDate, query.end)
      )
    )
    if (dateCondition) {
      conditions.push(dateCondition)
    }

    // RBAC: Use TripAccessService to get accessible trips
    const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
    if (accessibleTripIds !== 'all') {
      if (accessibleTripIds.length === 0) {
        return [] // User has no accessible trips
      }
      conditions.push(inArray(this.db.schema.trips.id, accessibleTripIds))
    }

    // Admin user filter (when admin wants to see a specific user's trips)
    if (query.userId && auth.role === 'admin') {
      conditions.push(eq(this.db.schema.trips.ownerId, query.userId))
    }

    // Specific trip filter
    if (query.tripId) {
      conditions.push(eq(this.db.schema.trips.id, query.tripId))
    }

    // Contact filter: only show trips where this contact is a traveler
    if (query.contactId) {
      const contactTripIds = this.db.client
        .select({ tripId: this.db.schema.tripTravelers.tripId })
        .from(this.db.schema.tripTravelers)
        .where(eq(this.db.schema.tripTravelers.contactId, query.contactId))
      conditions.push(inArray(this.db.schema.trips.id, contactTripIds))
    }

    const trips = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(and(...conditions))

    return trips.map((trip): CalendarEvent => {
      const startDate = trip.startDate ?? new Date().toISOString().split('T')[0]!
      return {
        id: `trip-${trip.id}`,
        type: 'trip',
        title: trip.name,
        start: startDate,
        end: trip.endDate ?? undefined,
        allDay: true,
        backgroundColor: EVENT_COLORS.trip.background,
        borderColor: EVENT_COLORS.trip.border,
        sourceId: trip.id,
        sourceType: 'trip',
        tripId: trip.id,
        editable: false,
        clickable: true,
        metadata: {
          tripId: trip.id,
          tripName: trip.name,
          status: trip.status,
          referenceNumber: trip.referenceNumber,
          contactId: trip.primaryContactId,
        },
      }
    })
  }

  private async getPaymentEvents(
    query: CalendarQueryDto,
    auth: AuthContext,
    enabledTypes: CalendarEventType[]
  ): Promise<CalendarEvent[]> {
    // RBAC: Get accessible trip IDs first
    const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
    if (accessibleTripIds !== 'all' && accessibleTripIds.length === 0) {
      return [] // User has no accessible trips
    }

    // Build conditions - filter by agency on expectedPaymentItems
    const conditions = [
      eq(this.db.schema.expectedPaymentItems.agencyId, auth.agencyId),
      isNotNull(this.db.schema.expectedPaymentItems.dueDate),
      gte(this.db.schema.expectedPaymentItems.dueDate, query.start),
      lte(this.db.schema.expectedPaymentItems.dueDate, query.end),
      ne(this.db.schema.trips.status, 'cancelled'),
    ]

    // Apply trip access filtering
    if (accessibleTripIds !== 'all') {
      conditions.push(inArray(this.db.schema.trips.id, accessibleTripIds))
    }

    // Admin user filter
    if (query.userId && auth.role === 'admin') {
      conditions.push(eq(this.db.schema.trips.ownerId, query.userId))
    }

    // Specific trip filter
    if (query.tripId) {
      conditions.push(eq(this.db.schema.trips.id, query.tripId))
    }

    // Contact filter: only show payments for trips where this contact is a traveler
    if (query.contactId) {
      const contactTripIds = this.db.client
        .select({ tripId: this.db.schema.tripTravelers.tripId })
        .from(this.db.schema.tripTravelers)
        .where(eq(this.db.schema.tripTravelers.contactId, query.contactId))
      conditions.push(inArray(this.db.schema.trips.id, contactTripIds))
    }

    // Get payments with trip info via correct join path:
    // expectedPaymentItems → paymentScheduleConfig → activityPricing → itineraryActivities → itineraryDays → itineraries → trips
    const payments = await this.db.client
      .select({
        id: this.db.schema.expectedPaymentItems.id,
        paymentName: this.db.schema.expectedPaymentItems.paymentName,
        expectedAmountCents: this.db.schema.expectedPaymentItems.expectedAmountCents,
        status: this.db.schema.expectedPaymentItems.status,
        dueDate: this.db.schema.expectedPaymentItems.dueDate,
        currency: this.db.schema.activityPricing.currency,
        tripId: this.db.schema.trips.id,
        tripName: this.db.schema.trips.name,
      })
      .from(this.db.schema.expectedPaymentItems)
      .innerJoin(
        this.db.schema.paymentScheduleConfig,
        eq(
          this.db.schema.expectedPaymentItems.paymentScheduleConfigId,
          this.db.schema.paymentScheduleConfig.id
        )
      )
      .innerJoin(
        this.db.schema.activityPricing,
        eq(
          this.db.schema.paymentScheduleConfig.activityPricingId,
          this.db.schema.activityPricing.id
        )
      )
      .innerJoin(
        this.db.schema.itineraryActivities,
        eq(
          this.db.schema.activityPricing.activityId,
          this.db.schema.itineraryActivities.id
        )
      )
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(
          this.db.schema.itineraryActivities.itineraryDayId,
          this.db.schema.itineraryDays.id
        )
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(
          this.db.schema.itineraryDays.itineraryId,
          this.db.schema.itineraries.id
        )
      )
      .innerJoin(
        this.db.schema.trips,
        eq(this.db.schema.itineraries.tripId, this.db.schema.trips.id)
      )
      .where(and(...conditions))

    return payments
      .filter((payment) => {
        // Determine if deposit or final based on payment name
        const isDeposit = payment.paymentName?.toLowerCase().includes('deposit')
        const eventType = isDeposit ? 'payment_deposit' : 'payment_final'
        return enabledTypes.includes(eventType)
      })
      .map((payment): CalendarEvent => {
        const isDeposit = payment.paymentName?.toLowerCase().includes('deposit')
        const eventType: CalendarEventType = isDeposit ? 'payment_deposit' : 'payment_final'
        const colors = EVENT_COLORS[eventType]

        // Format amount from cents
        const amountFormatted = payment.expectedAmountCents
          ? (payment.expectedAmountCents / 100).toFixed(2)
          : '0.00'

        return {
          id: `payment-${payment.id}`,
          type: eventType,
          title: `${payment.paymentName || 'Payment'} - ${payment.tripName}`,
          description: `${payment.currency || 'CAD'} ${amountFormatted}`,
          start: payment.dueDate!,
          allDay: true,
          backgroundColor: colors.background,
          borderColor: colors.border,
          sourceId: payment.id,
          sourceType: 'payment',
          tripId: payment.tripId,
          editable: false,
          clickable: true,
          metadata: {
            tripId: payment.tripId,
            tripName: payment.tripName,
            amount: payment.expectedAmountCents ? (payment.expectedAmountCents / 100).toFixed(2) : undefined,
            amountCents: payment.expectedAmountCents,
            currency: payment.currency || 'CAD',
            status: payment.status,
          },
        }
      })
  }

  private async getBirthdayEvents(
    query: CalendarQueryDto,
    auth: AuthContext
  ): Promise<CalendarEvent[]> {
    // Extract month-day range from query dates
    const startDate = new Date(query.start)
    const endDate = new Date(query.end)

    // Build conditions for contacts query
    const conditions = [
      eq(this.db.schema.contacts.agencyId, auth.agencyId),
      eq(this.db.schema.contacts.isActive, true),
      isNotNull(this.db.schema.contacts.dateOfBirth),
    ]

    // User filter for admin viewing specific user's contacts
    if (query.userId && auth.role === 'admin') {
      conditions.push(eq(this.db.schema.contacts.ownerId, query.userId))
    }

    // Specific contact filter
    if (query.contactId) {
      conditions.push(eq(this.db.schema.contacts.id, query.contactId))
    }

    // Non-admin users only see birthdays for contacts they own or have shared access to
    if (auth.role !== 'admin') {
      conditions.push(
        sql`(
          ${this.db.schema.contacts.ownerId} = ${auth.userId}
          OR EXISTS (
            SELECT 1 FROM contact_shares cs
            WHERE cs.contact_id = contacts.id
            AND cs.shared_with_user_id = ${auth.userId}
          )
        )`,
      )
    }

    // Get contacts with birthdays
    const contacts = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
        dateOfBirth: this.db.schema.contacts.dateOfBirth,
      })
      .from(this.db.schema.contacts)
      .where(and(...conditions))

    // Filter contacts whose birthday falls within the range
    const events: CalendarEvent[] = []
    const queryYear = startDate.getFullYear()

    for (const contact of contacts) {
      if (!contact.dateOfBirth) continue

      const dob = new Date(contact.dateOfBirth)
      const birthdayThisYear = new Date(queryYear, dob.getMonth(), dob.getDate())

      // Check if birthday falls within the query range (inclusive of end date)
      if (birthdayThisYear >= startDate && birthdayThisYear <= endDate) {
        const contactName = [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(' ')

        events.push({
          id: `birthday-${contact.id}-${queryYear}`,
          type: 'birthday',
          title: `${contactName}'s Birthday`,
          start: birthdayThisYear.toISOString().split('T')[0]!,
          allDay: true,
          backgroundColor: EVENT_COLORS.birthday.background,
          borderColor: EVENT_COLORS.birthday.border,
          sourceId: contact.id,
          sourceType: 'contact',
          contactId: contact.id,
          contactName,
          editable: false,
          clickable: true,
        })
      }
    }

    return events
  }

  private async getScheduledEmailEvents(
    query: CalendarQueryDto,
    auth: AuthContext
  ): Promise<CalendarEvent[]> {
    // Email-related job types
    const emailJobTypes = [
      'notification.email',
      'notification.email_only',
      'post_trip.thank_you',
      'post_trip.feedback',
      'payment.reminder',
      'departure.reminder',
      'client.welcome',
      'client.post_trip',
      'client.birthday',
      'client.follow_up',
    ]

    // Get scheduled jobs from automation_job_history
    // Note: agencyId is stored in jobData JSONB, not as a direct column
    const jobs = await this.db.client
      .select()
      .from(this.db.schema.automationJobHistory)
      .where(
        and(
          inArray(this.db.schema.automationJobHistory.jobType, emailJobTypes),
          eq(this.db.schema.automationJobHistory.status, 'queued'),
          isNotNull(this.db.schema.automationJobHistory.scheduledFor),
          gte(this.db.schema.automationJobHistory.scheduledFor, new Date(query.start)),
          lte(this.db.schema.automationJobHistory.scheduledFor, new Date(query.end))
        )
      )

    // Filter by agencyId from jobData and apply RBAC
    const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)

    return jobs
      .filter((job) => {
        const jobData = job.jobData as Record<string, unknown> | null
        if (!jobData) return false

        // Filter by agency
        if (jobData.agencyId !== auth.agencyId) return false

        // Apply trip-based RBAC if job has tripId
        if (jobData.tripId && accessibleTripIds !== 'all') {
          if (!accessibleTripIds.includes(jobData.tripId as string)) {
            return false
          }
        }

        // Specific trip filter
        if (query.tripId && jobData.tripId !== query.tripId) {
          return false
        }

        // Specific contact filter
        if (query.contactId && jobData.contactId !== query.contactId) {
          return false
        }

        return true
      })
      .map((job): CalendarEvent => {
        const jobData = job.jobData as Record<string, unknown>
        const jobType = job.jobType

        // Generate a user-friendly title based on job type
        let title = 'Scheduled Email'
        if (jobType.includes('thank_you')) title = 'Thank You Email'
        else if (jobType.includes('feedback')) title = 'Feedback Request'
        else if (jobType.includes('payment')) title = 'Payment Reminder'
        else if (jobType.includes('departure')) title = 'Departure Reminder'
        else if (jobType.includes('welcome')) title = 'Welcome Email'
        else if (jobType.includes('birthday')) title = 'Birthday Email'
        else if (jobType.includes('follow_up')) title = 'Follow-up Email'
        else if (jobData.title) title = String(jobData.title)

        return {
          id: `email-${job.id}`,
          type: 'scheduled_email',
          title,
          description: jobData.body ? String(jobData.body) : undefined,
          start: job.scheduledFor?.toISOString() || new Date().toISOString(),
          allDay: false,
          backgroundColor: EVENT_COLORS.scheduled_email.background,
          borderColor: EVENT_COLORS.scheduled_email.border,
          sourceId: job.id,
          sourceType: 'email',
          tripId: (jobData.tripId as string) ?? undefined,
          contactId: (jobData.contactId as string) ?? undefined,
          editable: false,
          clickable: true,
          metadata: {
            jobStatus: job.status,
            jobType: job.jobType,
          },
        }
      })
  }

  /**
   * Get individual activity events for trips in 'activities' calendar display mode
   */
  private async getActivityCalendarEvents(
    query: CalendarQueryDto,
    auth: AuthContext
  ): Promise<CalendarEvent[]> {
    // First find trips in 'activities' mode within the date range
    const tripConditions = [
      eq(this.db.schema.trips.agencyId, auth.agencyId),
      eq(this.db.schema.trips.calendarDisplayMode, 'activities'),
    ]

    // RBAC: Use TripAccessService to get accessible trips
    const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
    if (accessibleTripIds !== 'all') {
      if (accessibleTripIds.length === 0) {
        return []
      }
      tripConditions.push(inArray(this.db.schema.trips.id, accessibleTripIds))
    }

    // Admin user filter
    if (query.userId && auth.role === 'admin') {
      tripConditions.push(eq(this.db.schema.trips.ownerId, query.userId))
    }

    // Specific trip filter
    if (query.tripId) {
      tripConditions.push(eq(this.db.schema.trips.id, query.tripId))
    }

    // Contact filter
    if (query.contactId) {
      const contactTripIds = this.db.client
        .select({ tripId: this.db.schema.tripTravelers.tripId })
        .from(this.db.schema.tripTravelers)
        .where(eq(this.db.schema.tripTravelers.contactId, query.contactId))
      tripConditions.push(inArray(this.db.schema.trips.id, contactTripIds))
    }

    // Query activities: trips → itineraries → itinerary_days → itinerary_activities
    // Filter: isVisibleInCalendar = true, has itineraryDayId (not floating), has dates
    const queryStart = new Date(query.start)
    const queryEnd = new Date(query.end)
    queryEnd.setUTCHours(23, 59, 59, 999)

    const activities = await this.db.client
      .select({
        activityId: this.db.schema.itineraryActivities.id,
        activityName: this.db.schema.itineraryActivities.name,
        activityType: this.db.schema.itineraryActivities.activityType,
        startDatetime: this.db.schema.itineraryActivities.startDatetime,
        endDatetime: this.db.schema.itineraryActivities.endDatetime,
        location: this.db.schema.itineraryActivities.location,
        proposalStatus: this.db.schema.itineraryActivities.proposalStatus,
        tripId: this.db.schema.trips.id,
        tripName: this.db.schema.trips.name,
      })
      .from(this.db.schema.itineraryActivities)
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .innerJoin(
        this.db.schema.trips,
        eq(this.db.schema.itineraries.tripId, this.db.schema.trips.id)
      )
      .where(
        and(
          ...tripConditions,
          eq(this.db.schema.itineraryActivities.isVisibleInCalendar, true),
          isNotNull(this.db.schema.itineraryActivities.itineraryDayId),
          isNotNull(this.db.schema.itineraryActivities.startDatetime),
          // Date overlap: activity overlaps with query range
          or(
            // Activity starts within range
            and(
              gte(this.db.schema.itineraryActivities.startDatetime, queryStart),
              lte(this.db.schema.itineraryActivities.startDatetime, queryEnd)
            ),
            // Activity ends within range
            and(
              isNotNull(this.db.schema.itineraryActivities.endDatetime),
              gte(this.db.schema.itineraryActivities.endDatetime, queryStart),
              lte(this.db.schema.itineraryActivities.endDatetime, queryEnd)
            ),
            // Activity spans entire range
            and(
              lte(this.db.schema.itineraryActivities.startDatetime, queryStart),
              isNotNull(this.db.schema.itineraryActivities.endDatetime),
              gte(this.db.schema.itineraryActivities.endDatetime, queryEnd)
            )
          )
        )
      )

    return activities.map((a): CalendarEvent => {
      const start = a.startDatetime!.toISOString()
      const end = a.endDatetime?.toISOString()

      return {
        id: `activity-${a.activityId}`,
        type: 'activity',
        title: `${a.activityName} — ${a.tripName}`,
        description: a.location ?? undefined,
        start,
        end,
        allDay: false,
        backgroundColor: EVENT_COLORS.activity.background,
        borderColor: EVENT_COLORS.activity.border,
        sourceId: a.activityId,
        sourceType: 'activity',
        tripId: a.tripId,
        editable: false,
        clickable: true,
        metadata: {
          tripId: a.tripId,
          tripName: a.tripName,
          activityType: a.activityType,
          status: a.proposalStatus,
        },
      }
    })
  }

  /**
   * Get standalone calendar events as CalendarEvent[]
   */
  private async getCalendarEventEvents(
    query: CalendarQueryDto,
    auth: AuthContext
  ): Promise<CalendarEvent[]> {
    const rows = await this.calendarEventsService.findInRange(
      query.start,
      query.end,
      auth.agencyId,
      query.contactId,
      query.tripId
    )

    return rows.map((row): CalendarEvent => {
      // For all-day events, normalize to date-only strings
      const start = row.allDay
        ? row.startAt.toISOString().split('T')[0]!
        : row.startAt.toISOString()
      const end = row.endAt
        ? row.allDay
          ? row.endAt.toISOString().split('T')[0]!
          : row.endAt.toISOString()
        : undefined

      return {
        id: `event-${row.id}`,
        type: 'event',
        title: row.title,
        description: row.description ?? undefined,
        start,
        end,
        allDay: row.allDay,
        backgroundColor: EVENT_COLORS.event.background,
        borderColor: EVENT_COLORS.event.border,
        sourceId: row.id,
        sourceType: 'event',
        tripId: row.tripId ?? undefined,
        contactId: row.contactId ?? undefined,
        editable: true,
        clickable: true,
        metadata: {
          eventType: row.eventType,
        },
      }
    })
  }
}
