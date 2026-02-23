/**
 * Client Portal Service
 *
 * Core business logic for client portal: invitations, access checks,
 * trip/itinerary reads, feedback, and profile management.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'
import { eq, and, sql, desc, ne } from 'drizzle-orm'
import * as crypto from 'crypto'
import { DatabaseService } from '../db/database.service'
import { EmailService } from '../email/email.service'
import type { ClientAuthContext } from './client-portal-auth.types'
import type { InviteClientDto } from './dto/invite-client.dto'
import type { ActivateClientDto } from './dto/activate-client.dto'
import type { SubmitFeedbackDto } from './dto/submit-feedback.dto'
import type { UpdateClientProfileDto } from './dto/update-profile.dto'

@Injectable()
export class ClientPortalService {
  private readonly logger = new Logger(ClientPortalService.name)
  private readonly supabaseAdmin

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.supabaseAdmin = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    )
  }

  // ==========================================================================
  // Access Control
  // ==========================================================================

  /**
   * Verify client has access to a trip via trip_travelers
   */
  async verifyClientTripAccess(
    contactId: string,
    tripId: string,
    agencyId: string,
  ): Promise<{ role: string }> {
    const { tripTravelers, trips } = this.db.schema

    const [traveler] = await this.db.client
      .select({
        role: tripTravelers.role,
        tripAgencyId: trips.agencyId,
      })
      .from(tripTravelers)
      .innerJoin(trips, eq(trips.id, tripTravelers.tripId))
      .where(
        and(
          eq(tripTravelers.contactId, contactId),
          eq(tripTravelers.tripId, tripId),
          eq(trips.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!traveler) {
      throw new ForbiddenException('You do not have access to this trip')
    }

    return { role: traveler.role }
  }

  /**
   * Verify client has action access (approve/request changes)
   * Only primary_contact or full_access roles can take actions.
   */
  async verifyClientActionAccess(
    contactId: string,
    tripId: string,
    agencyId: string,
  ): Promise<void> {
    const { role } = await this.verifyClientTripAccess(contactId, tripId, agencyId)

    if (role !== 'primary_contact' && role !== 'full_access') {
      throw new ForbiddenException('Only primary contacts or full-access travelers can perform this action')
    }
  }

  // ==========================================================================
  // Invitation Flow
  // ==========================================================================

  async inviteClient(dto: InviteClientDto, agencyId: string, invitedBy: string) {
    const { clientPortalUsers, contacts } = this.db.schema

    // Verify contact exists in this agency
    const [contact] = await this.db.client
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, dto.contactId), eq(contacts.agencyId, agencyId)))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    // Check for existing portal user
    const [existing] = await this.db.client
      .select()
      .from(clientPortalUsers)
      .where(
        and(
          eq(clientPortalUsers.contactId, dto.contactId),
          eq(clientPortalUsers.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (existing && existing.status === 'active') {
      throw new BadRequestException('This contact already has an active portal account')
    }

    if (existing && existing.status === 'disabled') {
      throw new BadRequestException('This contact has a disabled portal account. Re-enable it first.')
    }

    // Generate invite token (for activation verification)
    const inviteToken = crypto.randomBytes(32).toString('hex')
    const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex')
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h TTL

    const clientPortalUrl = this.configService.get<string>('CLIENT_PORTAL_URL') || 'http://localhost:3102'

    if (existing && existing.status === 'invited') {
      // Re-invite: update token and resend
      const magicLinkUrl = `${clientPortalUrl}/auth/callback?invite_token=${inviteToken}`

      // Generate new magic link for existing Supabase user
      const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: dto.email,
        options: {
          redirectTo: magicLinkUrl,
        },
      })

      if (linkError || !linkData?.properties?.action_link) {
        this.logger.error(`Failed to generate magic link: ${linkError?.message}`)
        throw new InternalServerErrorException('Failed to generate invitation link')
      }

      await this.db.client
        .update(clientPortalUsers)
        .set({
          inviteTokenHash,
          inviteExpiresAt,
          inviteConsumedAt: null,
          invitedAt: new Date(),
          invitedBy,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          updatedAt: new Date(),
        })
        .where(eq(clientPortalUsers.id, existing.id))

      await this.sendClientInviteEmail(dto.email, linkData.properties.action_link, dto.firstName, agencyId)

      return { id: existing.id, status: 'reinvited' }
    }

    // New invitation: Create Supabase auth user deterministically
    const { data: userData, error: userError } = await this.supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      email_confirm: false,
      user_metadata: { portal_type: 'client' },
    })

    if (userError) {
      // If user already exists in auth, use their ID
      if (userError.message?.includes('already been registered')) {
        const { data: existingUsers } = await this.supabaseAdmin.auth.admin.listUsers()
        const existingAuthUser = existingUsers?.users?.find((u) => u.email === dto.email)
        if (!existingAuthUser) {
          throw new InternalServerErrorException('User exists but could not be found')
        }

        return this.createPortalUserRecord(
          existingAuthUser.id,
          dto,
          agencyId,
          invitedBy,
          inviteToken,
          inviteTokenHash,
          inviteExpiresAt,
          clientPortalUrl,
        )
      }

      this.logger.error(`Failed to create Supabase user: ${userError.message}`)
      throw new InternalServerErrorException('Failed to create portal user')
    }

    return this.createPortalUserRecord(
      userData.user.id,
      dto,
      agencyId,
      invitedBy,
      inviteToken,
      inviteTokenHash,
      inviteExpiresAt,
      clientPortalUrl,
    )
  }

  private async createPortalUserRecord(
    supabaseUserId: string,
    dto: InviteClientDto,
    agencyId: string,
    invitedBy: string,
    inviteToken: string,
    inviteTokenHash: string,
    inviteExpiresAt: Date,
    clientPortalUrl: string,
  ) {
    const { clientPortalUsers } = this.db.schema

    const magicLinkUrl = `${clientPortalUrl}/auth/callback?invite_token=${inviteToken}`

    // Generate magic link
    const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: dto.email,
      options: {
        redirectTo: magicLinkUrl,
      },
    })

    if (linkError || !linkData?.properties?.action_link) {
      this.logger.error(`Failed to generate magic link: ${linkError?.message}`)
      throw new InternalServerErrorException('Failed to generate invitation link')
    }

    // Create client_portal_users record
    const [portalUser] = await this.db.client
      .insert(clientPortalUsers)
      .values({
        supabaseUserId,
        agencyId,
        contactId: dto.contactId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: 'invited',
        inviteTokenHash,
        inviteExpiresAt,
        invitedBy,
      })
      .returning()

    // Send invite email
    await this.sendClientInviteEmail(dto.email, linkData.properties.action_link, dto.firstName, agencyId)

    return { id: portalUser!.id, status: 'invited' }
  }

  private async sendClientInviteEmail(
    email: string,
    magicLink: string,
    firstName: string,
    agencyId: string,
  ) {
    const html = `
      <div style="font-family: 'Lato', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1a1a2e; padding: 24px; text-align: center;">
          <h1 style="color: #d4a853; font-family: 'Cinzel', serif; margin: 0;">Phoenix Voyages</h1>
        </div>
        <div style="padding: 32px 24px; background: #fff;">
          <h2 style="color: #1a1a2e;">Welcome to Your Travel Portal, ${firstName}!</h2>
          <p style="color: #444; line-height: 1.6;">
            Your travel advisor has invited you to access your personalized travel portal.
            Here you can review your trip itineraries, approve travel plans, and manage your passenger information.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${magicLink}" style="background-color: #d4a853; color: #1a1a2e; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Access Your Travel Portal
            </a>
          </div>
          <p style="color: #888; font-size: 14px;">
            This link expires in 24 hours. If it expires, you can request a new one from the login page.
          </p>
        </div>
        <div style="background-color: #f5f5f5; padding: 16px 24px; text-align: center; color: #888; font-size: 12px;">
          <p>Phoenix Voyages &mdash; Luxury Travel, Redefined</p>
        </div>
      </div>
    `

    await this.emailService.sendEmail({
      to: [email],
      subject: 'Welcome to Your Travel Portal - Phoenix Voyages',
      html,
      agencyId,
      templateSlug: 'client-portal-invite',
      variables: { first_name: firstName },
    })
  }

  // ==========================================================================
  // Account Activation
  // ==========================================================================

  async activateAccount(
    dto: ActivateClientDto,
    supabaseUserId: string,
  ) {
    const { clientPortalUsers } = this.db.schema
    const tokenHash = crypto.createHash('sha256').update(dto.inviteToken).digest('hex')

    // Atomic activation within a transaction
    return this.db.client.transaction(async (tx) => {
      // Use raw SQL for SELECT ... FOR UPDATE (Drizzle doesn't support .for() natively)
      const portalUserRows = await tx.execute(
        sql`SELECT * FROM client_portal_users WHERE invite_token_hash = ${tokenHash} LIMIT 1 FOR UPDATE`
      )
      const portalUser = (portalUserRows as any).rows?.[0] || (portalUserRows as any)[0]

      if (!portalUser) {
        throw new BadRequestException('Invalid invite token')
      }

      // Verify the authenticated user matches the invited user (raw SQL returns snake_case)
      if (portalUser.supabase_user_id !== supabaseUserId) {
        throw new ForbiddenException('Token does not match authenticated user')
      }

      if (portalUser.invite_consumed_at) {
        // Already consumed - if active, that's fine
        if (portalUser.status === 'active') {
          return { status: 'already_active' }
        }
        throw new BadRequestException('Invite token has already been used')
      }

      if (portalUser.invite_expires_at && new Date(portalUser.invite_expires_at) < new Date()) {
        throw new BadRequestException('Invite token has expired')
      }

      // Atomically activate
      await tx
        .update(clientPortalUsers)
        .set({
          status: 'active',
          inviteConsumedAt: new Date(),
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientPortalUsers.id, portalUser.id))

      return { status: 'activated' }
    })
  }

  // ==========================================================================
  // Invitations Management
  // ==========================================================================

  async listInvitations(agencyId: string) {
    const { clientPortalUsers } = this.db.schema

    return this.db.client
      .select()
      .from(clientPortalUsers)
      .where(eq(clientPortalUsers.agencyId, agencyId))
      .orderBy(desc(clientPortalUsers.createdAt))
  }

  async revokeInvitation(id: string, agencyId: string) {
    const { clientPortalUsers } = this.db.schema

    const [portalUser] = await this.db.client
      .update(clientPortalUsers)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(and(eq(clientPortalUsers.id, id), eq(clientPortalUsers.agencyId, agencyId)))
      .returning()

    if (!portalUser) {
      throw new NotFoundException('Invitation not found')
    }

    return { status: 'revoked' }
  }

  // ==========================================================================
  // Trips
  // ==========================================================================

  async getClientTrips(auth: ClientAuthContext) {
    const { tripTravelers, trips } = this.db.schema

    const results = await this.db.client
      .select({
        tripId: trips.id,
        name: trips.name,
        description: trips.description,
        startDate: trips.startDate,
        endDate: trips.endDate,
        status: trips.status,
        coverPhotoUrl: trips.coverPhotoUrl,
        tripType: trips.tripType,
        travelerRole: tripTravelers.role,
      })
      .from(tripTravelers)
      .innerJoin(trips, eq(trips.id, tripTravelers.tripId))
      .where(
        and(
          eq(tripTravelers.contactId, auth.contactId),
          eq(trips.agencyId, auth.agencyId),
        ),
      )
      .orderBy(desc(trips.startDate))

    return results
  }

  async getClientTrip(tripId: string, auth: ClientAuthContext) {
    await this.verifyClientTripAccess(auth.contactId, tripId, auth.agencyId)

    const { trips, itineraries, tripTravelers, contacts } = this.db.schema

    // Get trip details
    const [trip] = await this.db.client
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.agencyId, auth.agencyId)))
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    // Get itineraries (exclude drafts)
    const tripItineraries = await this.db.client
      .select({
        id: itineraries.id,
        name: itineraries.name,
        description: itineraries.description,
        status: itineraries.status,
        startDate: itineraries.startDate,
        endDate: itineraries.endDate,
        coverPhoto: itineraries.coverPhoto,
        overview: itineraries.overview,
        primaryDestinationName: itineraries.primaryDestinationName,
        sequenceOrder: itineraries.sequenceOrder,
      })
      .from(itineraries)
      .where(
        and(
          eq(itineraries.tripId, tripId),
          ne(itineraries.status, 'draft'),
        ),
      )
      .orderBy(itineraries.sequenceOrder)

    // Get travelers (limited fields)
    const travelers = await this.db.client
      .select({
        id: tripTravelers.id,
        role: tripTravelers.role,
        travelerType: tripTravelers.travelerType,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        preferredName: contacts.preferredName,
      })
      .from(tripTravelers)
      .innerJoin(contacts, eq(contacts.id, tripTravelers.contactId))
      .where(eq(tripTravelers.tripId, tripId))

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
      itineraries: tripItineraries,
      travelers,
    }
  }

  // ==========================================================================
  // Itineraries
  // ==========================================================================

  async getClientItinerary(tripId: string, itineraryId: string, auth: ClientAuthContext) {
    await this.verifyClientTripAccess(auth.contactId, tripId, auth.agencyId)

    const { itineraries, itineraryDays, itineraryActivities, trips } = this.db.schema

    // Get itinerary (must not be draft)
    const [itinerary] = await this.db.client
      .select()
      .from(itineraries)
      .where(
        and(
          eq(itineraries.id, itineraryId),
          eq(itineraries.tripId, tripId),
          ne(itineraries.status, 'draft'),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found')
    }

    // Get trip for pricing visibility
    const [trip] = await this.db.client
      .select({ pricingVisibility: trips.pricingVisibility })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    // Get days
    const days = await this.db.client
      .select()
      .from(itineraryDays)
      .where(eq(itineraryDays.itineraryId, itineraryId))
      .orderBy(itineraryDays.dayNumber)

    // Get activities for each day
    const dayIds = days.map((d) => d.id)
    let activities: any[] = []
    if (dayIds.length > 0) {
      activities = await this.db.client
        .select({
          id: itineraryActivities.id,
          itineraryDayId: itineraryActivities.itineraryDayId,
          activityType: itineraryActivities.activityType,
          name: itineraryActivities.name,
          description: itineraryActivities.description,
          sequenceOrder: itineraryActivities.sequenceOrder,
          startDatetime: itineraryActivities.startDatetime,
          endDatetime: itineraryActivities.endDatetime,
          timezone: itineraryActivities.timezone,
          location: itineraryActivities.location,
          address: itineraryActivities.address,
          coordinates: itineraryActivities.coordinates,
          confirmationNumber: itineraryActivities.confirmationNumber,
          status: itineraryActivities.status,
          isBooked: itineraryActivities.isBooked,
          photos: itineraryActivities.photos,
          // Intentionally omit: notes (internal), estimatedCost, pricingType
        })
        .from(itineraryActivities)
        .where(
          sql`${itineraryActivities.itineraryDayId} = ANY(${dayIds})`
        )
        .orderBy(itineraryActivities.sequenceOrder)
    }

    // Group activities by day
    const activitiesByDay = new Map<string, typeof activities>()
    for (const activity of activities) {
      const dayId = activity.itineraryDayId
      if (dayId) {
        if (!activitiesByDay.has(dayId)) activitiesByDay.set(dayId, [])
        activitiesByDay.get(dayId)!.push(activity)
      }
    }

    return {
      id: itinerary.id,
      name: itinerary.name,
      description: itinerary.description,
      status: itinerary.status,
      startDate: itinerary.startDate,
      endDate: itinerary.endDate,
      coverPhoto: itinerary.coverPhoto,
      overview: itinerary.overview,
      primaryDestinationName: itinerary.primaryDestinationName,
      secondaryDestinationName: itinerary.secondaryDestinationName,
      pricingVisibility: trip?.pricingVisibility || 'hide_all',
      days: days.map((day) => ({
        id: day.id,
        dayNumber: day.dayNumber,
        date: day.date,
        title: day.title,
        notes: day.notes,
        startLocationName: day.startLocationName,
        endLocationName: day.endLocationName,
        activities: activitiesByDay.get(day.id) || [],
      })),
    }
  }

  // ==========================================================================
  // Feedback
  // ==========================================================================

  async approveItinerary(tripId: string, itineraryId: string, auth: ClientAuthContext, dto: SubmitFeedbackDto) {
    await this.verifyClientActionAccess(auth.contactId, tripId, auth.agencyId)

    const { itineraries, itineraryFeedback } = this.db.schema

    // Verify itinerary is in proposing status
    const [itinerary] = await this.db.client
      .select()
      .from(itineraries)
      .where(
        and(
          eq(itineraries.id, itineraryId),
          eq(itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found')
    }

    if (itinerary.status !== 'proposing') {
      throw new BadRequestException('Only itineraries with "proposing" status can be approved')
    }

    // Update itinerary status to approved
    await this.db.client
      .update(itineraries)
      .set({ status: 'approved', isSelected: true, updatedAt: new Date() })
      .where(eq(itineraries.id, itineraryId))

    // Create feedback record
    const [feedback] = await this.db.client
      .insert(itineraryFeedback)
      .values({
        itineraryId,
        clientPortalUserId: auth.clientPortalUserId,
        agencyId: auth.agencyId,
        feedbackType: 'approval',
        message: dto.message,
        activityNotes: dto.activityNotes,
      })
      .returning()

    return feedback
  }

  async requestChanges(tripId: string, itineraryId: string, auth: ClientAuthContext, dto: SubmitFeedbackDto) {
    await this.verifyClientActionAccess(auth.contactId, tripId, auth.agencyId)

    const { itineraries, itineraryFeedback } = this.db.schema

    // Verify itinerary exists on this trip
    const [itinerary] = await this.db.client
      .select()
      .from(itineraries)
      .where(
        and(
          eq(itineraries.id, itineraryId),
          eq(itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found')
    }

    // Create change request feedback
    const [feedback] = await this.db.client
      .insert(itineraryFeedback)
      .values({
        itineraryId,
        clientPortalUserId: auth.clientPortalUserId,
        agencyId: auth.agencyId,
        feedbackType: 'change_request',
        message: dto.message,
        activityNotes: dto.activityNotes,
      })
      .returning()

    return feedback
  }

  async getFeedbackHistory(tripId: string, itineraryId: string, auth: ClientAuthContext) {
    await this.verifyClientTripAccess(auth.contactId, tripId, auth.agencyId)

    const { itineraryFeedback, clientPortalUsers } = this.db.schema

    return this.db.client
      .select({
        id: itineraryFeedback.id,
        feedbackType: itineraryFeedback.feedbackType,
        message: itineraryFeedback.message,
        activityNotes: itineraryFeedback.activityNotes,
        status: itineraryFeedback.status,
        reviewedAt: itineraryFeedback.reviewedAt,
        createdAt: itineraryFeedback.createdAt,
        submittedBy: {
          firstName: clientPortalUsers.firstName,
          lastName: clientPortalUsers.lastName,
        },
      })
      .from(itineraryFeedback)
      .innerJoin(clientPortalUsers, eq(clientPortalUsers.id, itineraryFeedback.clientPortalUserId))
      .where(eq(itineraryFeedback.itineraryId, itineraryId))
      .orderBy(desc(itineraryFeedback.createdAt))
  }

  // ==========================================================================
  // Profile (Passenger Info)
  // ==========================================================================

  async getClientProfile(auth: ClientAuthContext) {
    const { contacts } = this.db.schema

    const [contact] = await this.db.client
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        legalFirstName: contacts.legalFirstName,
        legalLastName: contacts.legalLastName,
        middleName: contacts.middleName,
        preferredName: contacts.preferredName,
        prefix: contacts.prefix,
        suffix: contacts.suffix,
        email: contacts.email,
        phone: contacts.phone,
        gender: contacts.gender,
        pronouns: contacts.pronouns,
        dateOfBirth: contacts.dateOfBirth,
        passportNumber: contacts.passportNumber,
        passportExpiry: contacts.passportExpiry,
        passportCountry: contacts.passportCountry,
        passportIssueDate: contacts.passportIssueDate,
        nationality: contacts.nationality,
        redressNumber: contacts.redressNumber,
        knownTravelerNumber: contacts.knownTravelerNumber,
        addressLine1: contacts.addressLine1,
        addressLine2: contacts.addressLine2,
        city: contacts.city,
        province: contacts.province,
        postalCode: contacts.postalCode,
        country: contacts.country,
        dietaryRequirements: contacts.dietaryRequirements,
        mobilityRequirements: contacts.mobilityRequirements,
        seatPreference: contacts.seatPreference,
        cabinPreference: contacts.cabinPreference,
        floorPreference: contacts.floorPreference,
        travelPreferences: contacts.travelPreferences,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, auth.contactId),
          eq(contacts.agencyId, auth.agencyId),
        ),
      )
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Profile not found')
    }

    return contact
  }

  async updateClientProfile(auth: ClientAuthContext, dto: UpdateClientProfileDto) {
    const { contacts } = this.db.schema

    // Build update object from whitelisted fields only
    const updateData: Record<string, any> = { updatedAt: new Date() }

    const allowedFields = [
      'legalFirstName', 'legalLastName', 'middleName', 'preferredName',
      'prefix', 'suffix', 'gender', 'pronouns', 'dateOfBirth',
      'passportNumber', 'passportExpiry', 'passportCountry', 'passportIssueDate',
      'nationality', 'redressNumber', 'knownTravelerNumber', 'phone',
      'addressLine1', 'addressLine2', 'city', 'province', 'postalCode', 'country',
      'dietaryRequirements', 'mobilityRequirements', 'seatPreference',
      'cabinPreference', 'floorPreference',
    ] as const

    for (const field of allowedFields) {
      if (dto[field] !== undefined) {
        updateData[field] = dto[field]
      }
    }

    const [updated] = await this.db.client
      .update(contacts)
      .set(updateData)
      .where(
        and(
          eq(contacts.id, auth.contactId),
          eq(contacts.agencyId, auth.agencyId),
        ),
      )
      .returning()

    if (!updated) {
      throw new NotFoundException('Profile not found')
    }

    return { status: 'updated' }
  }

  // ==========================================================================
  // Co-travelers
  // ==========================================================================

  async getTripTravelers(tripId: string, auth: ClientAuthContext) {
    await this.verifyClientTripAccess(auth.contactId, tripId, auth.agencyId)

    const { tripTravelers, contacts } = this.db.schema

    return this.db.client
      .select({
        id: tripTravelers.id,
        role: tripTravelers.role,
        travelerType: tripTravelers.travelerType,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        preferredName: contacts.preferredName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(tripTravelers)
      .innerJoin(contacts, eq(contacts.id, tripTravelers.contactId))
      .where(eq(tripTravelers.tripId, tripId))
      .orderBy(tripTravelers.sequenceOrder)
  }

  // ==========================================================================
  // Feedback Management (Admin)
  // ==========================================================================

  async updateFeedbackStatus(feedbackId: string, status: string, reviewedBy: string, agencyId: string) {
    const { itineraryFeedback } = this.db.schema

    const [feedback] = await this.db.client
      .update(itineraryFeedback)
      .set({
        status: status as 'reviewed' | 'resolved',
        reviewedAt: new Date(),
        reviewedBy,
      })
      .where(
        and(
          eq(itineraryFeedback.id, feedbackId),
          eq(itineraryFeedback.agencyId, agencyId),
        ),
      )
      .returning()

    if (!feedback) {
      throw new NotFoundException('Feedback not found')
    }

    return feedback
  }
}
