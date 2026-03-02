/**
 * Template Context Builder Service
 *
 * Builds a full context object from database entities for Handlebars rendering.
 * Replaces the per-variable DB queries in VariableResolverService with a single
 * batch load of all relevant entities.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContextParams {
  agencyId: string
  tripId?: string
  contactId?: string
  activityId?: string
  agentId?: string
  paymentItemId?: string
}

export interface TemplateContext {
  agency: Record<string, unknown> | null
  /** Backward-compatible alias — same object reference as `agency`. */
  business: Record<string, unknown> | null
  contact: Record<string, unknown> | null
  trip: Record<string, unknown> | null
  agent: Record<string, unknown> | null
  activity: Record<string, unknown> | null
  payment: Record<string, unknown> | null
  passengers: Record<string, unknown>[]
  bookings: Record<string, unknown>[]
  businessConfig: Record<string, unknown> | null
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class TemplateContextBuilderService {
  private readonly logger = new Logger(TemplateContextBuilderService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Build the full rendering context by loading all referenced entities
   * concurrently. Any entity that fails to load is silently set to `null`.
   *
   * `additionalVariables` are spread at the top level so callers can inject
   * ad-hoc values (e.g. custom merge fields).
   */
  async buildContext(
    params: ContextParams,
    additionalVariables?: Record<string, unknown>,
  ): Promise<TemplateContext> {
    const [agency, contact, trip, agent, activity, payment, passengers, bookings, businessConfig] = await Promise.all([
      this.loadAgency(params.agencyId),
      this.loadContact(params.contactId, params.tripId),
      this.loadTrip(params.tripId),
      this.loadAgent(params.agentId, params.tripId),
      this.loadActivity(params.activityId),
      this.loadPaymentItem(params.paymentItemId),
      this.loadPassengers(params.tripId),
      this.loadBookings(params.tripId),
      this.loadBusinessConfig(params.agencyId),
    ])

    // Enrich agency with logo from businessConfig so {{agency.logo}} works in templates
    if (agency && businessConfig) {
      const bc = businessConfig as Record<string, unknown>
      if (bc.logo_url && !(agency as Record<string, unknown>).logo) {
        ;(agency as Record<string, unknown>).logo = bc.logo_url
      }
    }

    return {
      agency,
      business: agency, // alias — same reference
      contact,
      trip,
      agent,
      activity,
      payment,
      passengers,
      bookings,
      businessConfig,
      ...additionalVariables,
    }
  }

  // -----------------------------------------------------------------------
  // Private loaders — each catches errors and returns null on failure
  // -----------------------------------------------------------------------

  private async loadAgency(agencyId?: string): Promise<Record<string, unknown> | null> {
    if (!agencyId) return null
    try {
      const { agencies } = this.db.schema
      const [row] = await this.db.client
        .select()
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)
      return (row as Record<string, unknown>) ?? null
    } catch (error) {
      this.logger.warn(`Failed to load agency ${agencyId}: ${error}`)
      return null
    }
  }

  private async loadContact(
    contactId?: string,
    tripId?: string,
  ): Promise<Record<string, unknown> | null> {
    let resolvedContactId = contactId

    // Fall back to the trip's primary contact
    if (!resolvedContactId && tripId) {
      try {
        const { trips } = this.db.schema
        const [trip] = await this.db.client
          .select({ primaryContactId: trips.primaryContactId })
          .from(trips)
          .where(eq(trips.id, tripId))
          .limit(1)
        resolvedContactId = trip?.primaryContactId ?? undefined
      } catch {
        // Swallow — will return null below
      }
    }

    if (!resolvedContactId) return null

    try {
      const { contacts } = this.db.schema
      const [row] = await this.db.client
        .select()
        .from(contacts)
        .where(eq(contacts.id, resolvedContactId))
        .limit(1)

      if (!row) return null

      const record = row as Record<string, unknown>
      const firstName = (record.firstName as string) ?? ''
      const lastName = (record.lastName as string) ?? ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ')

      return {
        ...record,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
      }
    } catch (error) {
      this.logger.warn(`Failed to load contact ${resolvedContactId}: ${error}`)
      return null
    }
  }

  private async loadTrip(tripId?: string): Promise<Record<string, unknown> | null> {
    if (!tripId) return null
    try {
      const { trips } = this.db.schema
      const [row] = await this.db.client
        .select()
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1)
      return (row as Record<string, unknown>) ?? null
    } catch (error) {
      this.logger.warn(`Failed to load trip ${tripId}: ${error}`)
      return null
    }
  }

  private async loadAgent(
    agentId?: string,
    tripId?: string,
  ): Promise<Record<string, unknown> | null> {
    let resolvedAgentId = agentId

    // Fall back to the trip owner
    if (!resolvedAgentId && tripId) {
      try {
        const { trips } = this.db.schema
        const [trip] = await this.db.client
          .select({ ownerId: trips.ownerId })
          .from(trips)
          .where(eq(trips.id, tripId))
          .limit(1)
        resolvedAgentId = trip?.ownerId ?? undefined
      } catch {
        // Swallow
      }
    }

    if (!resolvedAgentId) return null

    try {
      const { userProfiles } = this.db.schema
      const [row] = await this.db.client
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.id, resolvedAgentId))
        .limit(1)

      if (!row) return null

      const record = row as Record<string, unknown>
      const firstName = (record.firstName as string) ?? ''
      const lastName = (record.lastName as string) ?? ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ')

      return {
        ...record,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        name: fullName, // convenience alias for agent
      }
    } catch (error) {
      this.logger.warn(`Failed to load agent ${resolvedAgentId}: ${error}`)
      return null
    }
  }

  private async loadActivity(activityId?: string): Promise<Record<string, unknown> | null> {
    if (!activityId) return null
    try {
      const { itineraryActivities } = this.db.schema
      const [row] = await this.db.client
        .select()
        .from(itineraryActivities)
        .where(eq(itineraryActivities.id, activityId))
        .limit(1)
      return (row as Record<string, unknown>) ?? null
    } catch (error) {
      this.logger.warn(`Failed to load activity ${activityId}: ${error}`)
      return null
    }
  }

  private async loadPaymentItem(paymentItemId?: string): Promise<Record<string, unknown> | null> {
    if (!paymentItemId) return null
    try {
      const { expectedPaymentItems } = this.db.schema
      const [row] = await this.db.client
        .select()
        .from(expectedPaymentItems)
        .where(eq(expectedPaymentItems.id, paymentItemId))
        .limit(1)
      return (row as Record<string, unknown>) ?? null
    } catch (error) {
      this.logger.warn(`Failed to load payment item ${paymentItemId}: ${error}`)
      return null
    }
  }

  // -----------------------------------------------------------------------
  // Trip-specific loaders (passengers, bookings, business config)
  // -----------------------------------------------------------------------

  private async loadPassengers(tripId?: string): Promise<Record<string, unknown>[]> {
    if (!tripId) return []
    try {
      const { tripTravelers, contacts } = this.db.schema
      const travelers = await this.db.client
        .select({
          id: tripTravelers.id,
          travelerType: tripTravelers.travelerType,
          contactId: tripTravelers.contactId,
          contactSnapshot: tripTravelers.contactSnapshot,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactEmail: contacts.email,
          contactDateOfBirth: contacts.dateOfBirth,
        })
        .from(tripTravelers)
        .leftJoin(contacts, eq(contacts.id, tripTravelers.contactId))
        .where(eq(tripTravelers.tripId, tripId))

      return travelers.map((t) => {
        const snapshot = t.contactSnapshot as { firstName?: string; lastName?: string; email?: string; dateOfBirth?: string } | null
        const firstName = t.contactFirstName || snapshot?.firstName || ''
        const lastName = t.contactLastName || snapshot?.lastName || ''
        return {
          id: t.id,
          firstName,
          lastName,
          full_name: [firstName, lastName].filter(Boolean).join(' '),
          type: t.travelerType || 'adult',
          dateOfBirth: t.contactDateOfBirth || snapshot?.dateOfBirth || null,
          email: t.contactEmail || snapshot?.email || null,
        }
      })
    } catch (error) {
      this.logger.warn(`Failed to load passengers for trip ${tripId}: ${error}`)
      return []
    }
  }

  private async loadBookings(tripId?: string): Promise<Record<string, unknown>[]> {
    if (!tripId) return []
    try {
      const { itineraryActivities, itineraryDays, itineraries, activityPricing } = this.db.schema
      const activities = await this.db.client
        .select({
          id: itineraryActivities.id,
          name: itineraryActivities.name,
          activityType: itineraryActivities.activityType,
          confirmationNumber: itineraryActivities.confirmationNumber,
          startDatetime: itineraryActivities.startDatetime,
          endDatetime: itineraryActivities.endDatetime,
          totalPriceCents: activityPricing.totalPriceCents,
          currency: activityPricing.currency,
        })
        .from(itineraryActivities)
        .innerJoin(itineraryDays, eq(itineraryActivities.itineraryDayId, itineraryDays.id))
        .innerJoin(itineraries, eq(itineraryDays.itineraryId, itineraries.id))
        .leftJoin(activityPricing, eq(activityPricing.activityId, itineraryActivities.id))
        .where(eq(itineraries.tripId, tripId))

      return activities.map((a) => ({
        id: a.id,
        title: a.name,
        booking_type: a.activityType || 'other',
        vendor_confirmation: a.confirmationNumber || null,
        start_date: a.startDatetime ? new Date(a.startDatetime).toISOString().split('T')[0] : null,
        end_date: a.endDatetime ? new Date(a.endDatetime).toISOString().split('T')[0] : null,
        amount: a.totalPriceCents ? a.totalPriceCents / 100 : 0,
        currency: a.currency || 'CAD',
      }))
    } catch (error) {
      this.logger.warn(`Failed to load bookings for trip ${tripId}: ${error}`)
      return []
    }
  }

  private async loadBusinessConfig(agencyId?: string): Promise<Record<string, unknown> | null> {
    if (!agencyId) return null
    try {
      const { agencySettings, agencies } = this.db.schema

      const [settings] = await this.db.client
        .select({
          logoUrl: agencySettings.logoUrl,
          primaryColor: agencySettings.primaryColor,
        })
        .from(agencySettings)
        .where(eq(agencySettings.agencyId, agencyId))
        .limit(1)

      const [agency] = await this.db.client
        .select({ name: agencies.name })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)

      return {
        company_name: agency?.name || 'Phoenix Voyages',
        company_tagline: 'Discover, Soar, Repeat',
        logo_url: settings?.logoUrl || null,
        primary_color: settings?.primaryColor || '#c59746',
        secondary_color: '#e89e4a',
        tico_registration: '',
        hst_number: '',
      }
    } catch (error) {
      this.logger.warn(`Failed to load business config for agency ${agencyId}: ${error}`)
      return null
    }
  }
}
