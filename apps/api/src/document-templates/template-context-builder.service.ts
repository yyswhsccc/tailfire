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
    const [agency, contact, trip, agent, activity, payment] = await Promise.all([
      this.loadAgency(params.agencyId),
      this.loadContact(params.contactId, params.tripId),
      this.loadTrip(params.tripId),
      this.loadAgent(params.agentId, params.tripId),
      this.loadActivity(params.activityId),
      this.loadPaymentItem(params.paymentItemId),
    ])

    return {
      agency,
      business: agency, // alias — same reference
      contact,
      trip,
      agent,
      activity,
      payment,
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
}
