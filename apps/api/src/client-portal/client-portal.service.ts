import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripsService } from '../trips/trips.service'
import { ItineraryVersionsService } from '../trips/itinerary-versions.service'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'
import { UpdateClientProfileDto } from './dto/update-client-profile.dto'

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tripsService: TripsService,
    private readonly itineraryVersionsService: ItineraryVersionsService,
  ) {}

  /**
   * Verify contact exists and matches auth context.
   * Uses auth.contactId directly (NOT client_portal_users lookup).
   */
  async resolveContact(contactId: string, agencyId: string) {
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(
        and(
          eq(this.db.schema.contacts.id, contactId),
          eq(this.db.schema.contacts.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Portal contact not found')
    }

    return contact
  }

  /**
   * Verify the contact has access to the trip (traveler or primary contact).
   * Enforces agency scope on both paths.
   */
  async verifyTripAccess(contactId: string, agencyId: string, tripId: string) {
    // Check traveler link
    const [traveler] = await this.db.client
      .select({ role: this.db.schema.tripTravelers.role })
      .from(this.db.schema.tripTravelers)
      .where(
        and(
          eq(this.db.schema.tripTravelers.tripId, tripId),
          eq(this.db.schema.tripTravelers.contactId, contactId),
        ),
      )
      .limit(1)

    if (traveler) return

    // Check primary contact
    const [trip] = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.id, tripId),
          eq(this.db.schema.trips.primaryContactId, contactId),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!trip) {
      throw new ForbiddenException('You do not have access to this trip')
    }
  }

  /**
   * List all trips where the contact is a traveler or primary contact.
   */
  async getTrips(contactId: string, agencyId: string) {
    await this.resolveContact(contactId, agencyId)

    // Find trip IDs where contact is a traveler + their role
    const travelerRows = await this.db.client
      .select({
        tripId: this.db.schema.tripTravelers.tripId,
        role: this.db.schema.tripTravelers.role,
      })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.contactId, contactId))

    const travelerTripIds = travelerRows.map((t) => t.tripId)
    const roleByTripId = new Map(travelerRows.map((t) => [t.tripId, t.role]))

    // Build OR condition: primary contact OR traveler
    const conditions = [
      eq(this.db.schema.trips.primaryContactId, contactId),
    ]
    if (travelerTripIds.length > 0) {
      conditions.push(inArray(this.db.schema.trips.id, travelerTripIds))
    }

    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        description: this.db.schema.trips.description,
        status: this.db.schema.trips.status,
        tripType: this.db.schema.trips.tripType,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
        coverPhotoUrl: this.db.schema.trips.coverPhotoUrl,
      })
      .from(this.db.schema.trips)
      .where(
        and(
          or(...conditions),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .orderBy(desc(this.db.schema.trips.createdAt))

    return trips.map((t) => ({
      tripId: t.id,
      name: t.name,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      coverPhotoUrl: t.coverPhotoUrl,
      tripType: t.tripType,
      travelerRole: roleByTripId.get(t.id) ?? 'primary_contact',
    }))
  }

  /**
   * Get detailed trip info including itineraries and travelers.
   * Only shows proposing/approved itineraries for the client view.
   */
  async getTripDetail(contactId: string, agencyId: string, tripId: string) {
    await this.resolveContact(contactId, agencyId)
    await this.verifyTripAccess(contactId, agencyId, tripId)

    const trip = await this.tripsService.findOne(tripId)
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    // Get itineraries (proposing + approved only for client view)
    const allItineraries = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, tripId))
      .orderBy(this.db.schema.itineraries.sequenceOrder)

    const clientItineraries = allItineraries
      .filter((it) => ['proposing', 'approved'].includes(it.status))
      .map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        status: it.status,
        startDate: it.startDate,
        endDate: it.endDate,
        coverPhoto: it.coverPhoto,
        overview: it.overview,
        primaryDestinationName: it.primaryDestinationName,
        sequenceOrder: it.sequenceOrder,
      }))

    // Get travelers on this trip
    const travelers = await this.db.client
      .select({
        id: this.db.schema.tripTravelers.id,
        role: this.db.schema.tripTravelers.role,
        travelerType: this.db.schema.tripTravelers.travelerType,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
        preferredName: this.db.schema.contacts.preferredName,
      })
      .from(this.db.schema.tripTravelers)
      .innerJoin(
        this.db.schema.contacts,
        eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id),
      )
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))

    return {
      id: trip.id,
      name: trip.name,
      description: trip.description,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      coverPhotoUrl: trip.coverPhotoUrl,
      tripType: trip.tripType,
      pricingVisibility: trip.pricingVisibility,
      itineraries: clientItineraries,
      travelers,
    }
  }

  /**
   * Get full itinerary detail with days/activities.
   * Uses published-snapshot-first pattern: once published, always serve the
   * frozen snapshot to avoid leaking in-progress draft edits.
   */
  async getItineraryDetail(contactId: string, agencyId: string, tripId: string, itineraryId: string) {
    await this.resolveContact(contactId, agencyId)
    await this.verifyTripAccess(contactId, agencyId, tripId)

    // Verify itinerary belongs to this trip
    const [itinerary] = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(
        and(
          eq(this.db.schema.itineraries.id, itineraryId),
          eq(this.db.schema.itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found')
    }

    // Only allow viewing proposing/approved itineraries
    if (!['proposing', 'approved'].includes(itinerary.status)) {
      throw new NotFoundException('Itinerary not available')
    }

    // Get trip for pricing visibility
    const trip = await this.tripsService.findOne(tripId)
    const pricingVisible = trip?.pricingVisibility === 'show_all'

    // Published-snapshot-first pattern (matches share endpoint logic)
    let snapshot: any = null
    if (itinerary.publishedVersion) {
      // STRICT: Once published, serve snapshot to avoid draft leakage
      snapshot = await this.itineraryVersionsService.getPublishedSnapshot(itinerary.id)
    }

    if (!snapshot) {
      // LEGACY FALLBACK: Never-published or missing snapshot, use live data
      snapshot = await this.tripsService.buildItinerarySnapshot(itinerary, pricingVisible)
    }

    if (snapshot && itinerary.publishedVersion) {
      snapshot.publishedVersion = itinerary.publishedVersion
    }

    return {
      ...snapshot,
      pricingVisibility: trip?.pricingVisibility ?? 'hide_all',
    }
  }

  /**
   * Submit an approval for a proposing itinerary.
   * Transitions itinerary to approved and sets clientSelectedItineraryId on the trip.
   */
  async submitApproval(
    contactId: string,
    agencyId: string,
    tripId: string,
    itineraryId: string,
    dto: SubmitFeedbackDto,
  ) {
    await this.resolveContact(contactId, agencyId)
    await this.verifyTripAccess(contactId, agencyId, tripId)

    // Verify itinerary is proposing
    const [itinerary] = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(
        and(
          eq(this.db.schema.itineraries.id, itineraryId),
          eq(this.db.schema.itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary || itinerary.status !== 'proposing') {
      throw new NotFoundException('Itinerary not available for approval')
    }

    // Record feedback — capture the published version the client was reviewing
    await this.db.client
      .insert(this.db.schema.itineraryFeedback)
      .values({
        itineraryId,
        contactId,
        agencyId,
        feedbackType: 'approval',
        message: dto.message || null,
        activityNotes: dto.activityNotes || null,
        versionNumber: itinerary.publishedVersion ?? null,
      })

    // Archive any previously approved itinerary for this trip (single-approved rule)
    await this.db.client
      .update(this.db.schema.itineraries)
      .set({ status: 'archived', isSelected: false })
      .where(
        and(
          eq(this.db.schema.itineraries.tripId, tripId),
          eq(this.db.schema.itineraries.status, 'approved'),
        ),
      )

    // Transition itinerary to approved
    await this.db.client
      .update(this.db.schema.itineraries)
      .set({ status: 'approved', isSelected: true })
      .where(eq(this.db.schema.itineraries.id, itineraryId))

    // Set clientSelectedItineraryId on the trip
    await this.db.client
      .update(this.db.schema.trips)
      .set({ clientSelectedItineraryId: itineraryId })
      .where(eq(this.db.schema.trips.id, tripId))

    return { success: true }
  }

  /**
   * Submit a change request for an itinerary.
   * Records feedback without changing itinerary status.
   */
  async submitChangeRequest(
    contactId: string,
    agencyId: string,
    tripId: string,
    itineraryId: string,
    dto: SubmitFeedbackDto,
  ) {
    await this.resolveContact(contactId, agencyId)
    await this.verifyTripAccess(contactId, agencyId, tripId)

    // Verify itinerary exists and belongs to trip
    const [itinerary] = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(
        and(
          eq(this.db.schema.itineraries.id, itineraryId),
          eq(this.db.schema.itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found')
    }

    // Record feedback — capture the published version the client was reviewing
    await this.db.client
      .insert(this.db.schema.itineraryFeedback)
      .values({
        itineraryId,
        contactId,
        agencyId,
        feedbackType: 'change_request',
        message: dto.message || null,
        activityNotes: dto.activityNotes || null,
        versionNumber: itinerary.publishedVersion ?? null,
      })

    return { success: true }
  }

  /**
   * Get feedback history for an itinerary, ordered newest first.
   * Joins with contacts to include submitter names.
   */
  async getFeedbackHistory(
    contactId: string,
    agencyId: string,
    tripId: string,
    itineraryId: string,
  ) {
    await this.resolveContact(contactId, agencyId)
    await this.verifyTripAccess(contactId, agencyId, tripId)

    const feedback = await this.db.client
      .select({
        id: this.db.schema.itineraryFeedback.id,
        feedbackType: this.db.schema.itineraryFeedback.feedbackType,
        message: this.db.schema.itineraryFeedback.message,
        activityNotes: this.db.schema.itineraryFeedback.activityNotes,
        status: this.db.schema.itineraryFeedback.status,
        reviewedAt: this.db.schema.itineraryFeedback.reviewedAt,
        createdAt: this.db.schema.itineraryFeedback.createdAt,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
      })
      .from(this.db.schema.itineraryFeedback)
      .innerJoin(
        this.db.schema.contacts,
        eq(this.db.schema.itineraryFeedback.contactId, this.db.schema.contacts.id),
      )
      .where(
        and(
          eq(this.db.schema.itineraryFeedback.itineraryId, itineraryId),
          eq(this.db.schema.itineraryFeedback.agencyId, agencyId),
        ),
      )
      .orderBy(desc(this.db.schema.itineraryFeedback.createdAt))

    return feedback.map((f) => ({
      id: f.id,
      feedbackType: f.feedbackType,
      message: f.message,
      activityNotes: f.activityNotes,
      status: f.status,
      reviewedAt: f.reviewedAt?.toISOString() ?? null,
      createdAt: f.createdAt.toISOString(),
      submittedBy: {
        firstName: f.firstName,
        lastName: f.lastName,
      },
    }))
  }

  /**
   * Get the client's profile with frontend field name mapping.
   * DB fields addressLine1/addressLine2/province → frontend address1/address2/state.
   */
  async getProfile(contactId: string, agencyId: string) {
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(
        and(
          eq(this.db.schema.contacts.id, contactId),
          eq(this.db.schema.contacts.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    // Map DB field names to frontend field names
    return {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      legalFirstName: contact.legalFirstName,
      legalLastName: contact.legalLastName,
      middleName: contact.middleName,
      preferredName: contact.preferredName,
      prefix: contact.prefix,
      suffix: contact.suffix,
      email: contact.email,
      phone: contact.phone,
      gender: contact.gender,
      pronouns: contact.pronouns,
      dateOfBirth: contact.dateOfBirth,
      passportNumber: contact.passportNumber,
      passportExpiry: contact.passportExpiry,
      passportCountry: contact.passportCountry,
      passportIssueDate: contact.passportIssueDate,
      nationality: contact.nationality,
      redressNumber: contact.redressNumber,
      knownTravelerNumber: contact.knownTravelerNumber,
      address1: contact.addressLine1,
      address2: contact.addressLine2,
      city: contact.city,
      state: contact.province,
      postalCode: contact.postalCode,
      country: contact.country,
      dietaryRequirements: contact.dietaryRequirements,
      mobilityRequirements: contact.mobilityRequirements,
      seatPreference: contact.seatPreference,
      cabinPreference: contact.cabinPreference,
      floorPreference: contact.floorPreference,
      travelPreferences: null,
    }
  }

  /**
   * Update the client's profile.
   * Maps frontend field names → DB field names (address1→addressLine1, etc.).
   */
  async updateProfile(contactId: string, agencyId: string, dto: UpdateClientProfileDto) {
    await this.resolveContact(contactId, agencyId)

    // Map frontend field names → DB field names
    const fieldMap: Record<string, string> = {
      address1: 'addressLine1',
      address2: 'addressLine2',
      state: 'province',
    }

    const allowedFields = [
      'firstName', 'lastName', 'preferredName', 'prefix', 'suffix',
      'legalFirstName', 'legalLastName', 'middleName',
      'phone', 'dateOfBirth', 'gender', 'pronouns',
      'passportNumber', 'passportExpiry', 'passportCountry', 'passportIssueDate', 'nationality',
      'redressNumber', 'knownTravelerNumber',
      'address1', 'address2', 'city', 'state', 'postalCode', 'country',
      'dietaryRequirements', 'mobilityRequirements',
      'seatPreference', 'cabinPreference', 'floorPreference',
    ]

    const updateData: Record<string, any> = { updatedAt: new Date() }

    for (const field of allowedFields) {
      if ((dto as any)[field] !== undefined) {
        const dbField = fieldMap[field] || field
        const value = (dto as any)[field]
        updateData[dbField] = value === '' ? null : value
      }
    }

    await this.db.client
      .update(this.db.schema.contacts)
      .set(updateData)
      .where(eq(this.db.schema.contacts.id, contactId))

    return this.getProfile(contactId, agencyId)
  }
}
