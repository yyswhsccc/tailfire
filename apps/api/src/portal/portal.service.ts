/**
 * Portal Service
 *
 * Business logic for portal user operations.
 * Portal users are contacts with linked Supabase auth accounts.
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

@Injectable()
export class PortalService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Activate portal account (set portal_activated_at on first login)
   */
  async activatePortalAccount(portalUserId: string): Promise<void> {
    await this.db.client
      .update(this.db.schema.contacts)
      .set({ portalActivatedAt: new Date() })
      .where(
        and(
          eq(this.db.schema.contacts.portalUserId, portalUserId),
          // Only set if not already activated (idempotent)
          eq(this.db.schema.contacts.portalActivatedAt, null as any),
        ),
      )
  }

  /**
   * Get portal user profile (contact data)
   */
  async getPortalProfile(portalUserId: string) {
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.portalUserId, portalUserId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Portal profile not found')
    }

    // Get the agent (owner) info if available
    let agent = null
    if (contact.ownerId) {
      const [profile] = await this.db.client
        .select({
          id: this.db.schema.userProfiles.id,
          firstName: this.db.schema.userProfiles.firstName,
          lastName: this.db.schema.userProfiles.lastName,
          email: this.db.schema.userProfiles.email,
          avatarUrl: this.db.schema.userProfiles.avatarUrl,
          phone: this.db.schema.userProfiles.publicPhone,
        })
        .from(this.db.schema.userProfiles)
        .where(eq(this.db.schema.userProfiles.id, contact.ownerId))
        .limit(1)

      if (profile) {
        agent = {
          id: profile.id,
          name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Your Travel Advisor',
          email: profile.email,
          avatarUrl: profile.avatarUrl,
          phone: profile.phone,
        }
      }
    }

    return {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      preferredName: contact.preferredName,
      displayName: contact.preferredName ?? contact.firstName ?? contact.legalFirstName ?? 'Traveler',
      email: contact.email,
      phone: contact.phone,
      portalActivatedAt: contact.portalActivatedAt?.toISOString() ?? null,
      agent,
    }
  }

  /**
   * Get trips linked to this portal contact
   */
  async getTripsForPortalUser(portalUserId: string) {
    const [contact] = await this.db.client
      .select({ id: this.db.schema.contacts.id, agencyId: this.db.schema.contacts.agencyId })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.portalUserId, portalUserId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Portal profile not found')
    }

    // Find trip IDs where contact is a traveler
    const travelerTrips = await this.db.client
      .select({ tripId: this.db.schema.tripTravelers.tripId })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.contactId, contact.id))

    const travelerTripIds = travelerTrips.map((t) => t.tripId)

    // Find trips where contact is primary contact OR a traveler
    const conditions = []
    conditions.push(eq(this.db.schema.trips.primaryContactId, contact.id))
    if (travelerTripIds.length > 0) {
      conditions.push(inArray(this.db.schema.trips.id, travelerTripIds))
    }

    const tripConditions = [or(...conditions)]
    if (contact.agencyId) {
      tripConditions.push(eq(this.db.schema.trips.agencyId, contact.agencyId))
    }

    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        status: this.db.schema.trips.status,
        tripType: this.db.schema.trips.tripType,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
        primaryContactId: this.db.schema.trips.primaryContactId,
        createdAt: this.db.schema.trips.createdAt,
      })
      .from(this.db.schema.trips)
      .where(and(...tripConditions))
      .orderBy(desc(this.db.schema.trips.createdAt))

    return trips.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      tripType: t.tripType,
      startDate: t.startDate,
      endDate: t.endDate,
      coverImageUrl: null,
      isPrimaryContact: t.primaryContactId === contact.id,
      createdAt: t.createdAt.toISOString(),
    }))
  }

  /**
   * Get documents for this portal contact
   */
  async getDocumentsForPortalUser(portalUserId: string) {
    const [contact] = await this.db.client
      .select({ id: this.db.schema.contacts.id })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.portalUserId, portalUserId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Portal profile not found')
    }

    const documents = await this.db.client
      .select()
      .from(this.db.schema.contactDocuments)
      .where(eq(this.db.schema.contactDocuments.contactId, contact.id))
      .orderBy(desc(this.db.schema.contactDocuments.uploadedAt))

    return documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt?.toISOString() ?? null,
    }))
  }
}
