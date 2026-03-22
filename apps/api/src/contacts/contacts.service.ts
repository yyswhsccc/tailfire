/**
 * Contacts Service
 *
 * Business logic for Contact CRUD operations.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { eq, and, ilike, or, sql, desc, asc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { UserValidationService } from '../common/user-validation.service'
import { EmailService } from '../email/email.service'
import { TripActiveEvent } from '../trips/events/trip-active.event'
import { AuditEvent } from '../activity-logs/events/audit.event'
import { sanitizeForAudit, computeAuditDiff } from '../activity-logs/audit-sanitizer'
import type {
  CreateContactDto,
  UpdateContactDto,
  ContactFilterDto,
  ContactResponseDto,
  PaginatedContactsResponseDto,
  PortalInviteResponseDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name)
  private readonly supabaseAdmin: SupabaseClient

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly userValidationService: UserValidationService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }

    this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  /**
   * Create a new contact
   */
  async create(dto: CreateContactDto, agencyId: string, userId?: string): Promise<ContactResponseDto> {
    const [contact] = await this.db.client
      .insert(this.db.schema.contacts)
      .values({
        agencyId,
        // Name fields
        firstName: dto.firstName,
        lastName: dto.lastName,
        legalFirstName: dto.legalFirstName,
        legalLastName: dto.legalLastName,
        middleName: dto.middleName,
        preferredName: dto.preferredName,
        prefix: dto.prefix,
        suffix: dto.suffix,

        // Phase 1: LGBTQ+ inclusive
        gender: dto.gender,
        pronouns: dto.pronouns,
        maritalStatus: dto.maritalStatus,

        // Contact info
        email: dto.email,
        phone: dto.phone,
        dateOfBirth: dto.dateOfBirth,

        // Passport
        passportNumber: dto.passportNumber,
        passportExpiry: dto.passportExpiry,
        passportCountry: dto.passportCountry,
        passportIssueDate: dto.passportIssueDate,
        nationality: dto.nationality,

        // Phase 4: TSA credentials
        redressNumber: dto.redressNumber,
        knownTravelerNumber: dto.knownTravelerNumber,

        // Address
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        province: dto.province,
        postalCode: dto.postalCode,
        country: dto.country,

        // Requirements
        dietaryRequirements: dto.dietaryRequirements,
        mobilityRequirements: dto.mobilityRequirements,

        // Phase 4: Travel preferences
        seatPreference: dto.seatPreference,
        cabinPreference: dto.cabinPreference,
        floorPreference: dto.floorPreference,
        travelPreferences: dto.travelPreferences
          ? JSON.parse(dto.travelPreferences)
          : undefined,

        // Phase 2: Lifecycle (optional on create)
        contactType: dto.contactType,
        contactStatus: dto.contactStatus,
        becameClientAt: dto.becameClientAt ? new Date(dto.becameClientAt) : undefined,

        // Phase 3: Marketing consent (optional on create)
        marketingEmailOptIn: dto.marketingEmailOptIn,
        marketingSmsOptIn: dto.marketingSmsOptIn,
        marketingPhoneOptIn: dto.marketingPhoneOptIn,
        marketingOptInSource: dto.marketingOptInSource,

        // Phase 3.5: Date/Time Management
        timezone: dto.timezone,
      })
      .returning()

    const result = this.mapToResponseDto(contact)

    const displayName = `${contact!.firstName || ''} ${contact!.lastName || ''}`.trim() || 'Unknown'
    this.eventEmitter.emit('audit.created', new AuditEvent(
      'contact', contact!.id, 'created', null, userId ?? null,
      displayName,
      { after: sanitizeForAudit('contact', contact as Record<string, unknown>) }
    ))

    return result
  }

  /**
   * Find all contacts with filtering and pagination
   */
  async findAll(
    filters: ContactFilterDto,
    agencyId: string,
    userId?: string,
  ): Promise<PaginatedContactsResponseDto> {
    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const conditions = []

    // Always filter by agency
    conditions.push(eq(this.db.schema.contacts.agencyId, agencyId))

    // Default to showing only active contacts unless explicitly filtering for inactive ones
    if (filters.isActive !== undefined) {
      conditions.push(eq(this.db.schema.contacts.isActive, filters.isActive))
    } else {
      // Default: only show active contacts
      conditions.push(eq(this.db.schema.contacts.isActive, true))
    }

    if (filters.search) {
      const searchCondition = or(
        ilike(this.db.schema.contacts.firstName, `%${filters.search}%`),
        ilike(this.db.schema.contacts.lastName, `%${filters.search}%`),
        ilike(this.db.schema.contacts.email, `%${filters.search}%`),
        ilike(this.db.schema.contacts.phone, `%${filters.search}%`),
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    if (filters.tags && filters.tags.length > 0) {
      // Match any of the provided tags (via junction table, visibility-scoped)
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM contact_tags
          JOIN tags ON tags.id = contact_tags.tag_id
          WHERE contact_tags.contact_id = contacts.id
          AND tags.name = ANY(${filters.tags})
          AND tags.agency_id = ${agencyId}
          AND (tags.type = 'system' OR (tags.type = 'agent' AND tags.created_by = ${userId}))
        )`,
      )
    }

    if (filters.hasPassport) {
      conditions.push(sql`${this.db.schema.contacts.passportNumber} IS NOT NULL`)
    }

    if (filters.passportExpiring) {
      // Passport expiring within 6 months
      const sixMonthsFromNow = new Date()
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
      conditions.push(
        sql`${this.db.schema.contacts.passportExpiry} <= ${sixMonthsFromNow.toISOString().split('T')[0]}`,
      )
    }

    // Build ORDER BY
    const sortBy = filters.sortBy || 'lastName'
    const sortOrder = filters.sortOrder || 'asc'
    const orderByColumn = this.db.schema.contacts[sortBy] || this.db.schema.contacts.lastName
    const orderByFn = sortOrder === 'desc' ? desc : asc

    // Execute query
    const contacts = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByFn(orderByColumn))
      .limit(limit)
      .offset(offset)

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(this.db.schema.contacts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
    const count = countResult[0]?.count ?? 0

    // Load junction-table tags for all returned contacts
    const contactIds = contacts.map((c) => c.id)
    const tagsByContact = new Map<string, Set<string>>()
    if (contactIds.length > 0 && userId) {
      const tagRows = await this.db.client
        .select({
          contactId: this.db.schema.contactTags.contactId,
          tagName: this.db.schema.tags.name,
        })
        .from(this.db.schema.contactTags)
        .innerJoin(this.db.schema.tags, eq(this.db.schema.tags.id, this.db.schema.contactTags.tagId))
        .where(and(
          inArray(this.db.schema.contactTags.contactId, contactIds),
          eq(this.db.schema.tags.agencyId, agencyId),
          or(
            eq(this.db.schema.tags.type, 'system'),
            and(eq(this.db.schema.tags.type, 'agent'), eq(this.db.schema.tags.createdBy, userId)),
          ),
        ))
        .orderBy(asc(this.db.schema.tags.name))
      tagRows.forEach((r) => {
        if (!tagsByContact.has(r.contactId)) tagsByContact.set(r.contactId, new Set())
        tagsByContact.get(r.contactId)!.add(r.tagName)
      })
    } else if (contactIds.length > 0 && !userId) {
      this.logger.warn('findAll: userId absent, returning empty tags for contact list')
    }

    return {
      data: contacts.map((c) => ({
        ...this.mapToResponseDto(c),
        tags: [...(tagsByContact.get(c.id) || [])],
      })),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    }
  }

  /**
   * Find one contact by ID
   */
  async findOne(id: string, agencyId: string): Promise<ContactResponseDto> {
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .limit(1)

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    return this.mapToResponseDto(contact)
  }

  /**
   * Internal: Find contact by ID without agency scoping.
   * Only for event handlers and tests — never expose via controller.
   */
  async findOneInternal(id: string): Promise<ContactResponseDto> {
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, id))
      .limit(1)

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    return this.mapToResponseDto(contact)
  }

  /**
   * Update a contact
   */
  async update(
    id: string,
    dto: UpdateContactDto,
    agencyId: string,
    userId?: string,
  ): Promise<ContactResponseDto> {
    // Fetch before state for audit diff
    const [before] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .limit(1)

    // Strip legacy tags field — tags are managed via junction table endpoints
    const { tags: _legacyTags, ...dtoWithoutTags } = dto as any
    const updateData: any = { ...dtoWithoutTags }

    // Parse travelPreferences if it's a string
    if (typeof dto.travelPreferences === 'string') {
      updateData.travelPreferences = JSON.parse(dto.travelPreferences)
    }

    const [contact] = await this.db.client
      .update(this.db.schema.contacts)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .returning()

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    // Emit audit events for update
    if (before) {
      const diff = computeAuditDiff('contact', before as Record<string, unknown>, contact as Record<string, unknown>)
      const displayName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown'

      // Emit status_changed if contactStatus or contactType changed via update()
      const statusFields = ['contactStatus', 'contactType']
      const statusChanges = diff.changedFields.filter(f => statusFields.includes(f))
      if (statusChanges.length > 0) {
        const statusBefore: Record<string, unknown> = {}
        const statusAfter: Record<string, unknown> = {}
        for (const f of statusChanges) {
          statusBefore[f] = diff.before[f]
          statusAfter[f] = diff.after[f]
        }
        this.eventEmitter.emit('audit.status_changed', new AuditEvent(
          'contact', id, 'status_changed', null, userId ?? null,
          displayName,
          { before: statusBefore, after: statusAfter, changedFields: statusChanges }
        ))
      }

      // Emit updated for non-status field changes (strip status fields from diff)
      diff.changedFields = diff.changedFields.filter(f => !statusFields.includes(f))
      delete diff.before.contactStatus
      delete diff.before.contactType
      delete diff.after.contactStatus
      delete diff.after.contactType
      if (diff.changedFields.length > 0) {
        this.eventEmitter.emit('audit.updated', new AuditEvent(
          'contact', id, 'updated', null, userId ?? null,
          displayName,
          diff
        ))
      }
    }

    return this.mapToResponseDto(contact)
  }

  /**
   * Delete a contact (soft delete by setting isActive = false)
   */
  async remove(id: string, agencyId: string, userId?: string): Promise<void> {
    const [contact] = await this.db.client
      .update(this.db.schema.contacts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .returning()

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    const displayName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown'
    this.eventEmitter.emit('audit.deleted', new AuditEvent(
      'contact', id, 'deleted', null, userId ?? null,
      displayName
    ))
  }

  /**
   * Hard delete a contact (permanent deletion)
   */
  async hardDelete(id: string, agencyId: string): Promise<void> {
    // Mark affected travelers BEFORE deletion (FK cascade will null contactId)
    await this.db.client
      .update(this.db.schema.tripTravelers)
      .set({ contactDeletedAt: new Date() })
      .where(eq(this.db.schema.tripTravelers.contactId, id))

    const [contact] = await this.db.client
      .delete(this.db.schema.contacts)
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .returning()

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }
  }

  /**
   * Promote a lead to client
   */
  async promoteToClient(id: string, agencyId: string, userId?: string): Promise<ContactResponseDto> {
    const [contact] = await this.db.client
      .update(this.db.schema.contacts)
      .set({
        contactType: 'client',
        becameClientAt: new Date(),
        contactStatus: 'prospecting',
        updatedAt: new Date(),
      })
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .returning()

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    const displayName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown'
    this.eventEmitter.emit('audit.status_changed', new AuditEvent(
      'contact', id, 'status_changed', null, userId ?? null,
      displayName,
      { before: { contactType: 'lead' }, after: { contactType: 'client' }, changedFields: ['contactType'] }
    ))

    return this.mapToResponseDto(contact)
  }

  /**
   * Update contact status
   */
  async updateStatus(id: string, status: string, agencyId: string, userId?: string): Promise<ContactResponseDto> {
    // Find contact first to validate status transition
    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    // Validate: leads can only be prospecting
    if (existing.contactType === 'lead' && status !== 'prospecting') {
      throw new Error('Leads can only have status "prospecting". Promote to client first.')
    }

    const previousStatus = existing.contactStatus

    const [contact] = await this.db.client
      .update(this.db.schema.contacts)
      .set({
        contactStatus: status as 'prospecting' | 'quoted' | 'booked' | 'traveling' | 'returned' | 'awaiting_next' | 'inactive',
        updatedAt: new Date(),
      })
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .returning()

    const result = this.mapToResponseDto(contact)

    // Only emit if status actually changed
    if (previousStatus !== status) {
      const displayName = `${contact!.firstName || ''} ${contact!.lastName || ''}`.trim() || 'Unknown'
      this.eventEmitter.emit('audit.status_changed', new AuditEvent(
        'contact', id, 'status_changed', null, userId ?? null,
        displayName,
        { before: { contactStatus: previousStatus }, after: { contactStatus: status }, changedFields: ['contactStatus'] }
      ))
    }

    return result
  }

  /**
   * Update contact ownership (Admin only)
   * Can set to any user in the agency or null (agency-wide)
   */
  async updateOwner(id: string, ownerId: string | null, agencyId: string): Promise<ContactResponseDto> {
    // Validate new owner exists and belongs to same agency (if not null)
    if (ownerId !== null) {
      await this.userValidationService.validateUserInAgency(
        ownerId,
        agencyId,
        'New owner',
      )
    }

    const [contact] = await this.db.client
      .update(this.db.schema.contacts)
      .set({
        ownerId,
        updatedAt: new Date(),
      })
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .returning()

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    return this.mapToResponseDto(contact)
  }

  /**
   * Update marketing consent
   */
  async updateMarketingConsent(id: string, dto: any, agencyId: string): Promise<ContactResponseDto> {
    const updates: any = { updatedAt: new Date() }

    if (dto.email !== undefined) {
      updates.marketingEmailOptIn = dto.email
      if (dto.email && dto.source) {
        updates.marketingOptInSource = dto.source
      }
    }

    if (dto.sms !== undefined) {
      updates.marketingSmsOptIn = dto.sms
      if (dto.sms && dto.source) {
        updates.marketingOptInSource = dto.source
      }
    }

    if (dto.phone !== undefined) {
      updates.marketingPhoneOptIn = dto.phone
      if (dto.phone && dto.source) {
        updates.marketingOptInSource = dto.source
      }
    }

    if (dto.optOutReason) {
      updates.marketingOptOutAt = new Date()
      updates.marketingOptOutReason = dto.optOutReason
    }

    const [contact] = await this.db.client
      .update(this.db.schema.contacts)
      .set(updates)
      .where(and(eq(this.db.schema.contacts.id, id), eq(this.db.schema.contacts.agencyId, agencyId)))
      .returning()

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`)
    }

    return this.mapToResponseDto(contact)
  }

  /**
   * Set first booking date (called by trips service)
   * Stores as date-only string (YYYY-MM-DD) to match trip.bookingDate format
   */
  async setFirstBookingDate(id: string, date: Date): Promise<void> {
    await this.db.client
      .update(this.db.schema.contacts)
      .set({
        firstBookingDate: date.toISOString().split('T')[0],
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.contacts.id, id))
  }

  /**
   * Event Listener: Handle TripActiveEvent
   *
   * When a trip is activated (booked), set the contact's first booking date if it's not already set.
   * This decouples ContactsService from TripsService by using domain events.
   */
  @OnEvent('trip.active')
  async handleTripActive(event: TripActiveEvent): Promise<void> {
    if (!event.primaryContactId) {
      return
    }

    // Only set first booking date if it's not already set
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, event.primaryContactId))
      .limit(1)

    if (!contact || contact.firstBookingDate) {
      return
    }

    await this.setFirstBookingDate(
      event.primaryContactId,
      new Date(event.bookingDate),
    )
  }

  /**
   * Get trips associated with a contact (as traveler or primary contact)
   */
  async getTripsForContact(contactId: string, agencyId: string) {
    // Find trip IDs where contact is a traveler
    const travelerTrips = await this.db.client
      .select({ tripId: this.db.schema.tripTravelers.tripId })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.contactId, contactId))

    const travelerTripIds = travelerTrips.map((t) => t.tripId)

    // Find trips where contact is primary contact OR a traveler
    const conditions = []
    conditions.push(eq(this.db.schema.trips.primaryContactId, contactId))
    if (travelerTripIds.length > 0) {
      conditions.push(inArray(this.db.schema.trips.id, travelerTripIds))
    }

    const tripConditions = [or(...conditions)]
    tripConditions.push(eq(this.db.schema.trips.agencyId, agencyId))

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
      isPrimaryContact: t.primaryContactId === contactId,
      createdAt: t.createdAt.toISOString(),
    }))
  }

  /**
   * Get booked activities for a contact across all their trips.
   * Returns activities where bookingStatus = 'booked' from trips the contact is a traveler on.
   */
  async getBookingsForContact(contactId: string, agencyId: string) {
    // Get trip IDs where contact is a traveler
    const travelerTrips = await this.db.client
      .select({ tripId: this.db.schema.tripTravelers.tripId })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.contactId, contactId))

    const tripIds = travelerTrips.map((t) => t.tripId)
    if (tripIds.length === 0) return []

    // Fetch booked activities from those trips, joined with trip info
    const rows = await this.db.client
      .select({
        activityId: this.db.schema.itineraryActivities.id,
        activityName: this.db.schema.itineraryActivities.name,
        activityType: this.db.schema.itineraryActivities.activityType,
        proposalStatus: this.db.schema.itineraryActivities.proposalStatus,
        startDatetime: this.db.schema.itineraryActivities.startDatetime,
        endDatetime: this.db.schema.itineraryActivities.endDatetime,
        location: this.db.schema.itineraryActivities.location,
        confirmationNumber: this.db.schema.itineraryActivities.confirmationNumber,
        bookingDate: this.db.schema.itineraryActivities.bookingDate,
        tripId: this.db.schema.trips.id,
        tripName: this.db.schema.trips.name,
        tripStatus: this.db.schema.trips.status,
      })
      .from(this.db.schema.itineraryActivities)
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id),
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id),
      )
      .innerJoin(
        this.db.schema.trips,
        eq(this.db.schema.itineraries.tripId, this.db.schema.trips.id),
      )
      .where(
        and(
          inArray(this.db.schema.itineraries.tripId, tripIds),
          eq(this.db.schema.itineraryActivities.bookingStatus, 'booked'),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .orderBy(asc(this.db.schema.itineraryActivities.startDatetime))

    return rows.map((r) => ({
      id: r.activityId,
      name: r.activityName,
      activityType: r.activityType,
      status: r.proposalStatus,
      startDatetime: r.startDatetime?.toISOString() || null,
      endDatetime: r.endDatetime?.toISOString() || null,
      location: r.location,
      confirmationNumber: r.confirmationNumber,
      bookingDate: r.bookingDate?.toISOString() || null,
      trip: {
        id: r.tripId,
        name: r.tripName,
        status: r.tripStatus,
      },
    }))
  }

  /**
   * Send portal invite to a contact
   */
  async sendPortalInvite(
    contactId: string,
    invitedBy: string,
    agencyId: string,
  ): Promise<PortalInviteResponseDto> {
    // 1. Find the contact
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(and(eq(this.db.schema.contacts.id, contactId), eq(this.db.schema.contacts.agencyId, agencyId)))
      .limit(1)

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`)
    }

    if (!contact.email) {
      throw new BadRequestException('Contact must have an email address to receive a portal invite')
    }

    // 2. Check if already active
    if (contact.portalActivatedAt) {
      throw new ConflictException('Contact already has an active portal account')
    }

    // 3. Re-invite if pending (already has portalUserId but not activated)
    if (contact.portalUserId) {
      return this.resendPortalInvite(contact, invitedBy, agencyId)
    }

    // 4. Get inviter info for personalized email
    const inviter = await this.db.client
      .select({ firstName: this.db.schema.userProfiles.firstName, lastName: this.db.schema.userProfiles.lastName })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, invitedBy))
      .limit(1)
    const agentName = inviter[0] ? `${inviter[0].firstName} ${inviter[0].lastName}`.trim() : undefined

    const clientPortalUrl = this.configService.get<string>('CLIENT_PORTAL_URL') || 'http://localhost:3103'

    // 5. Create Supabase auth user
    const displayFirstName = contact.preferredName || contact.firstName || contact.legalFirstName || ''
    const displayLastName = contact.lastName || contact.legalLastName || ''
    const { data: userData, error: userError } = await this.supabaseAdmin.auth.admin.createUser({
      email: contact.email,
      email_confirm: true, // Auto-confirm since we send our own branded invite email
      user_metadata: {
        first_name: displayFirstName,
        last_name: displayLastName,
      },
      app_metadata: {
        portal_user: true,
        contact_id: contactId,
        agency_id: agencyId,
      },
    })

    if (userError || !userData.user) {
      this.logger.error(`Failed to create portal auth user: ${userError?.message}`)
      throw new InternalServerErrorException('Failed to create portal invitation')
    }

    // 6. Generate invite link
    const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: contact.email,
      options: {
        redirectTo: `${clientPortalUrl}/auth/callback`,
      },
    })

    if (linkError || !linkData.properties?.hashed_token) {
      await this.supabaseAdmin.auth.admin.deleteUser(userData.user.id)
      this.logger.error(`Failed to generate portal invite link: ${linkError?.message}`)
      throw new InternalServerErrorException('Failed to generate portal invitation')
    }

    // Build direct callback URL with token_hash (avoids Supabase redirect using hash fragments
    // which server-side route handlers can't read)
    const inviteLink = `${clientPortalUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`

    // 7. Update contact with portal fields
    try {
      await this.db.client
        .update(this.db.schema.contacts)
        .set({
          portalUserId: userData.user.id,
          portalInvitedAt: new Date(),
          portalInvitedBy: invitedBy,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.contacts.id, contactId))
    } catch (dbError) {
      await this.supabaseAdmin.auth.admin.deleteUser(userData.user.id)
      this.logger.error('Failed to update contact with portal fields, rolling back auth user')
      throw new InternalServerErrorException('Failed to update contact with portal invitation')
    }

    // 8. Send branded email
    const firstName = contact.preferredName || contact.firstName || contact.legalFirstName || 'Traveler'
    const emailResult = await this.emailService.sendClientPortalInviteEmail(
      contact.email,
      inviteLink,
      firstName,
      agencyId,
      agentName,
      contactId,
    )

    if (!emailResult.success) {
      // Rollback: revert contact and delete auth user
      this.logger.error(`Portal invite email failed, rolling back: ${emailResult.error}`)
      await this.db.client
        .update(this.db.schema.contacts)
        .set({ portalUserId: null, portalInvitedAt: null, portalInvitedBy: null, updatedAt: new Date() })
        .where(eq(this.db.schema.contacts.id, contactId))
      await this.supabaseAdmin.auth.admin.deleteUser(userData.user.id)
      throw new InternalServerErrorException('Failed to send portal invitation email')
    }

    this.logger.log(`Portal invite sent to contact ${contactId} (auth user ${userData.user.id})`)

    return {
      contactId,
      portalUserId: userData.user.id,
      email: contact.email,
      inviteSent: true,
    }
  }

  /**
   * Re-send portal invite for a pending contact
   */
  private async resendPortalInvite(
    contact: any,
    invitedBy: string,
    agencyId: string,
  ): Promise<PortalInviteResponseDto> {
    const inviter = await this.db.client
      .select({ firstName: this.db.schema.userProfiles.firstName, lastName: this.db.schema.userProfiles.lastName })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, invitedBy))
      .limit(1)
    const agentName = inviter[0] ? `${inviter[0].firstName} ${inviter[0].lastName}`.trim() : undefined

    const clientPortalUrl = this.configService.get<string>('CLIENT_PORTAL_URL') || 'http://localhost:3103'

    // Use 'magiclink' for re-invites since the auth user already exists
    // ('invite' type fails with "user already registered")
    const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: contact.email,
      options: {
        redirectTo: `${clientPortalUrl}/auth/callback`,
      },
    })

    if (linkError || !linkData.properties?.hashed_token) {
      this.logger.error(`Failed to re-generate portal invite link: ${linkError?.message}`)
      throw new InternalServerErrorException('Failed to resend portal invitation')
    }

    // Build direct callback URL with token_hash
    const inviteLink = `${clientPortalUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=magiclink`

    // Update invited timestamp
    await this.db.client
      .update(this.db.schema.contacts)
      .set({ portalInvitedAt: new Date(), portalInvitedBy: invitedBy, updatedAt: new Date() })
      .where(eq(this.db.schema.contacts.id, contact.id))

    const firstName = contact.preferredName || contact.firstName || contact.legalFirstName || 'Traveler'
    const emailResult = await this.emailService.sendClientPortalInviteEmail(
      contact.email,
      inviteLink,
      firstName,
      agencyId,
      agentName,
      contact.id,
    )

    if (!emailResult.success) {
      throw new InternalServerErrorException('Failed to resend portal invitation email')
    }

    this.logger.log(`Portal invite re-sent to contact ${contact.id}`)

    return {
      contactId: contact.id,
      portalUserId: contact.portalUserId,
      email: contact.email,
      inviteSent: true,
    }
  }

  /**
   * Get filter options for contacts
   *
   * Returns tag names actually in use on contacts (visibility-scoped).
   */
  async getContactFilterOptions(agencyId: string, userId: string): Promise<{ tags: string[] }> {
    const tagsResult = await this.db.client
      .selectDistinct({ tag: this.db.schema.tags.name })
      .from(this.db.schema.tags)
      .innerJoin(this.db.schema.contactTags, eq(this.db.schema.tags.id, this.db.schema.contactTags.tagId))
      .innerJoin(this.db.schema.contacts, eq(this.db.schema.contacts.id, this.db.schema.contactTags.contactId))
      .where(and(
        eq(this.db.schema.contacts.agencyId, agencyId),
        eq(this.db.schema.contacts.isActive, true),
        eq(this.db.schema.tags.agencyId, agencyId),
        or(
          eq(this.db.schema.tags.type, 'system'),
          and(eq(this.db.schema.tags.type, 'agent'), eq(this.db.schema.tags.createdBy, userId)),
        ),
      ))

    const tags = tagsResult
      .map(r => r.tag)
      .filter((tag): tag is string => tag !== null)
      .sort()

    return { tags }
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(contact: any): ContactResponseDto {
    // Compute display name: preferred > first > legal_first
    const displayName = contact.preferredName || contact.firstName || contact.legalFirstName || 'Unknown'

    // Compute legal full name for documents
    const legalFullName = [
      contact.prefix,
      contact.legalFirstName ?? contact.firstName,
      contact.middleName,
      contact.legalLastName ?? contact.lastName,
      contact.suffix
    ].filter(Boolean).join(' ') || null

    return {
      id: contact.id,
      agencyId: contact.agencyId,
      ownerId: contact.ownerId,

      // Name fields
      firstName: contact.firstName,
      lastName: contact.lastName,
      legalFirstName: contact.legalFirstName,
      legalLastName: contact.legalLastName,
      middleName: contact.middleName,
      preferredName: contact.preferredName,
      prefix: contact.prefix,
      suffix: contact.suffix,

      // Computed names
      displayName,
      legalFullName,

      // LGBTQ+ inclusive
      gender: contact.gender,
      pronouns: contact.pronouns,
      maritalStatus: contact.maritalStatus,

      // Contact info
      email: contact.email,
      phone: contact.phone,
      dateOfBirth: contact.dateOfBirth,

      // Passport
      passportNumber: contact.passportNumber,
      passportExpiry: contact.passportExpiry,
      passportCountry: contact.passportCountry,
      passportIssueDate: contact.passportIssueDate,
      nationality: contact.nationality,

      // TSA
      redressNumber: contact.redressNumber,
      knownTravelerNumber: contact.knownTravelerNumber,

      // Address
      addressLine1: contact.addressLine1,
      addressLine2: contact.addressLine2,
      city: contact.city,
      province: contact.province,
      postalCode: contact.postalCode,
      country: contact.country,

      // Requirements
      dietaryRequirements: contact.dietaryRequirements,
      mobilityRequirements: contact.mobilityRequirements,

      // Travel preferences
      seatPreference: contact.seatPreference,
      cabinPreference: contact.cabinPreference,
      floorPreference: contact.floorPreference,
      travelPreferences: contact.travelPreferences
        ? JSON.stringify(contact.travelPreferences)
        : null,

      // Lifecycle
      contactType: contact.contactType,
      contactStatus: contact.contactStatus,
      becameClientAt: contact.becameClientAt?.toISOString() ?? null,
      firstBookingDate: contact.firstBookingDate,
      lastTripReturnDate: contact.lastTripReturnDate,

      // Marketing consent
      marketingEmailOptIn: contact.marketingEmailOptIn ?? false,
      marketingEmailOptInAt: contact.marketingEmailOptInAt?.toISOString() ?? null,
      marketingSmsOptIn: contact.marketingSmsOptIn ?? false,
      marketingSmsOptInAt: contact.marketingSmsOptInAt?.toISOString() ?? null,
      marketingPhoneOptIn: contact.marketingPhoneOptIn ?? false,
      marketingPhoneOptInAt: contact.marketingPhoneOptInAt?.toISOString() ?? null,
      marketingOptInSource: contact.marketingOptInSource,
      marketingOptOutAt: contact.marketingOptOutAt?.toISOString() ?? null,
      marketingOptOutReason: contact.marketingOptOutReason,

      // Trust balances
      trustBalanceCad: contact.trustBalanceCad,
      trustBalanceUsd: contact.trustBalanceUsd,

      // Metadata
      tags: contact.tags || [],
      isActive: contact.isActive,

      // Date/Time Management
      timezone: contact.timezone,

      // Photo
      photoUrl: contact.photoUrl ?? null,

      // Portal
      portalUserId: contact.portalUserId ?? null,
      portalStatus: contact.portalActivatedAt ? 'active' : contact.portalUserId ? 'pending' : 'not_invited',
      portalInvitedAt: contact.portalInvitedAt?.toISOString() ?? null,

      // Audit
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    }
  }
}
