/**
 * Portal Service
 *
 * Business logic for portal user operations.
 * Portal users are contacts with linked Supabase auth accounts.
 */

import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common'
import { eq, and, or, desc, asc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { StorageService } from '../trips/storage.service'
import type { UpdatePortalProfileDto } from './dto/update-portal-profile.dto'
import type { CreatePortalLoyaltyProgramDto, UpdatePortalLoyaltyProgramDto } from './dto/portal-loyalty-program.dto'
import type { LoyaltyProgramDto } from '@tailfire/shared-types'

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Find contact row by portal user ID.
   * Throws NotFoundException if not found.
   */
  private async findContactByPortalUser(portalUserId: string) {
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.portalUserId, portalUserId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Portal profile not found')
    }

    return contact
  }

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
    const contact = await this.findContactByPortalUser(portalUserId)

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
      displayName: contact.preferredName || contact.firstName || contact.legalFirstName || 'Traveler',
      email: contact.email,
      phone: contact.phone,
      portalActivatedAt: contact.portalActivatedAt?.toISOString() ?? null,
      agent,
      // Photo
      photoUrl: contact.photoUrl ?? null,
      // Extended name fields
      legalFirstName: contact.legalFirstName,
      legalLastName: contact.legalLastName,
      middleName: contact.middleName,
      prefix: contact.prefix,
      suffix: contact.suffix,
      // Identity
      gender: contact.gender,
      pronouns: contact.pronouns,
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
    }
  }

  /**
   * Update portal user profile (allowlisted fields only)
   */
  async updatePortalProfile(portalUserId: string, dto: UpdatePortalProfileDto) {
    const contact = await this.findContactByPortalUser(portalUserId)

    // Allowlisted fields that portal users may edit
    const allowedFields = [
      'firstName', 'lastName', 'preferredName', 'prefix', 'suffix',
      'legalFirstName', 'legalLastName', 'middleName',
      'phone', 'dateOfBirth', 'gender', 'pronouns',
      'passportNumber', 'passportExpiry', 'passportCountry', 'passportIssueDate', 'nationality',
      'redressNumber', 'knownTravelerNumber',
      'addressLine1', 'addressLine2', 'city', 'province', 'postalCode', 'country',
      'dietaryRequirements', 'mobilityRequirements',
      'seatPreference', 'cabinPreference', 'floorPreference',
    ] as const

    // Build update object from allowlisted DTO fields only
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    }

    for (const field of allowedFields) {
      if ((dto as any)[field] !== undefined) {
        // Normalize empty strings to null for clearable fields
        const value = (dto as any)[field]
        updateData[field] = value === '' ? null : value
      }
    }

    await this.db.client
      .update(this.db.schema.contacts)
      .set(updateData)
      .where(eq(this.db.schema.contacts.id, contact.id))

    this.logger.log(`Portal profile updated for contact ${contact.id}`)

    return this.getPortalProfile(portalUserId)
  }

  /**
   * Upload portal avatar (contact photo)
   */
  async uploadPortalAvatar(
    portalUserId: string,
    file: Buffer,
    fileName: string,
    contentType: string,
  ): Promise<{ photoUrl: string }> {
    const contact = await this.findContactByPortalUser(portalUserId)
    const oldStoragePath = contact.photoStoragePath

    // Upload NEW file first (avoids data loss if DB update fails)
    const folder = `contacts/${contact.id}`
    const { path, url } = await this.storageService.uploadMediaFile(
      file,
      folder,
      fileName,
      contentType,
    )

    // Update contact DB with new photo; clean up uploaded file on DB failure
    try {
      await this.db.client
        .update(this.db.schema.contacts)
        .set({
          photoUrl: url,
          photoStoragePath: path,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.contacts.id, contact.id))
    } catch (error) {
      // DB update failed — clean up the newly uploaded file to avoid orphans
      try {
        await this.storageService.deleteMedia(path)
      } catch (cleanupError) {
        this.logger.warn(`Failed to clean up orphaned upload ${path}: ${cleanupError}`)
      }
      throw error
    }

    // Best-effort delete old file (if existed)
    if (oldStoragePath) {
      try {
        await this.storageService.deleteMedia(oldStoragePath)
        this.logger.log(`Deleted previous contact photo: ${oldStoragePath}`)
      } catch (error) {
        this.logger.warn(`Failed to delete previous contact photo: ${error}`)
      }
    }

    this.logger.log(`Uploaded contact photo for ${contact.id}: ${path}`)

    return { photoUrl: url }
  }

  /**
   * Delete portal avatar (contact photo)
   */
  async deletePortalAvatar(portalUserId: string): Promise<void> {
    const contact = await this.findContactByPortalUser(portalUserId)
    const storagePath = contact.photoStoragePath

    // Clear DB fields first
    await this.db.client
      .update(this.db.schema.contacts)
      .set({
        photoUrl: null,
        photoStoragePath: null,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.contacts.id, contact.id))

    // Best-effort delete from storage
    if (storagePath) {
      try {
        await this.storageService.deleteMedia(storagePath)
        this.logger.log(`Deleted contact photo: ${storagePath}`)
      } catch (error) {
        this.logger.warn(`Failed to delete contact photo from storage: ${error}`)
      }
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

    return Promise.all(
      documents.map(async (doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        fileName: doc.fileName,
        fileUrl: await this.storageService.getSignedUrl(doc.fileUrl).catch(() => doc.fileUrl),
        fileSize: doc.fileSize,
        uploadedAt: doc.uploadedAt?.toISOString() ?? null,
      })),
    )
  }

  /**
   * Upload a travel document for the portal user's contact
   */
  async uploadPortalDocument(
    portalUserId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    documentType: string,
  ) {
    const contact = await this.findContactByPortalUser(portalUserId)

    const folder = `portal/${contact.id}/documents`
    const storagePath = await this.storageService.uploadDocument(fileBuffer, folder, originalName, mimeType)

    const signedUrl = await this.storageService.getSignedUrl(storagePath)

    const [doc] = await this.db.client
      .insert(this.db.schema.contactDocuments)
      .values({
        contactId: contact.id,
        documentType,
        fileName: originalName,
        fileUrl: storagePath,
        fileSize: fileBuffer.length,
        uploadedAt: new Date(),
        uploadedBy: portalUserId,
      })
      .returning()

    this.logger.log(`Uploaded document for contact ${contact.id}: ${storagePath}`)

    return {
      id: doc!.id,
      documentType: doc!.documentType,
      fileName: doc!.fileName,
      fileUrl: signedUrl,
      fileSize: doc!.fileSize,
      uploadedAt: doc!.uploadedAt?.toISOString() ?? null,
    }
  }

  /**
   * Delete a travel document owned by the portal user's contact
   */
  async deletePortalDocument(portalUserId: string, documentId: string) {
    const contact = await this.findContactByPortalUser(portalUserId)

    const [doc] = await this.db.client
      .select()
      .from(this.db.schema.contactDocuments)
      .where(
        and(
          eq(this.db.schema.contactDocuments.id, documentId),
          eq(this.db.schema.contactDocuments.contactId, contact.id),
        ),
      )
      .limit(1)

    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`)
    }

    // Delete from R2 storage
    try {
      await this.storageService.deleteDocument(doc.fileUrl)
    } catch (error) {
      this.logger.warn(`Failed to delete document from storage ${doc.fileUrl}: ${error}`)
    }

    // Delete DB record
    await this.db.client
      .delete(this.db.schema.contactDocuments)
      .where(eq(this.db.schema.contactDocuments.id, documentId))

    this.logger.log(`Deleted document ${documentId} for contact ${contact.id}`)

    return { deleted: true }
  }

  // ============================================================================
  // LOYALTY PROGRAMS
  // ============================================================================

  /**
   * Get loyalty programs for the portal user's own contact
   */
  async getMyLoyaltyPrograms(portalUserId: string): Promise<LoyaltyProgramDto[]> {
    const contact = await this.findContactByPortalUser(portalUserId)

    const programs = await this.db.client
      .select()
      .from(this.db.schema.contactLoyaltyPrograms)
      .where(eq(this.db.schema.contactLoyaltyPrograms.contactId, contact.id))
      .orderBy(asc(this.db.schema.contactLoyaltyPrograms.providerName))

    return programs.map((p) => this.formatLoyaltyProgram(p))
  }

  /**
   * Create a loyalty program for the portal user's own contact
   */
  async createMyLoyaltyProgram(
    portalUserId: string,
    dto: CreatePortalLoyaltyProgramDto,
  ): Promise<LoyaltyProgramDto> {
    const contact = await this.findContactByPortalUser(portalUserId)

    // If loyaltyProgramId provided, auto-fill from catalog
    let providerName = dto.providerName
    let programName = dto.programName
    if (dto.loyaltyProgramId) {
      const [catalogEntry] = await this.db.client
        .select()
        .from(this.db.schema.loyaltyPrograms)
        .where(
          and(
            eq(this.db.schema.loyaltyPrograms.id, dto.loyaltyProgramId),
            eq(this.db.schema.loyaltyPrograms.agencyId, contact.agencyId!),
          ),
        )
        .limit(1)
      if (catalogEntry) {
        providerName = catalogEntry.providerName
        programName = catalogEntry.programName
      }
    }

    try {
      const [program] = await this.db.client
        .insert(this.db.schema.contactLoyaltyPrograms)
        .values({
          contactId: contact.id,
          programName,
          providerName,
          membershipNumber: dto.membershipNumber.trim(),
          tierLevel: dto.tierLevel || null,
          notes: dto.notes || null,
          metadata: {},
          loyaltyProgramId: dto.loyaltyProgramId || null,
        })
        .returning()

      return this.formatLoyaltyProgram(program!)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          `A loyalty program for ${providerName} with this membership number already exists`,
        )
      }
      throw error
    }
  }

  /**
   * Update a loyalty program owned by the portal user
   */
  async updateMyLoyaltyProgram(
    portalUserId: string,
    programId: string,
    dto: UpdatePortalLoyaltyProgramDto,
  ): Promise<LoyaltyProgramDto> {
    const contact = await this.findContactByPortalUser(portalUserId)

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (dto.providerName !== undefined) updateData.providerName = dto.providerName
    if (dto.programName !== undefined) updateData.programName = dto.programName
    if (dto.membershipNumber !== undefined) updateData.membershipNumber = dto.membershipNumber.trim()
    if (dto.tierLevel !== undefined) updateData.tierLevel = dto.tierLevel || null
    if (dto.notes !== undefined) updateData.notes = dto.notes || null
    if (dto.loyaltyProgramId !== undefined) updateData.loyaltyProgramId = dto.loyaltyProgramId || null

    try {
      const [updated] = await this.db.client
        .update(this.db.schema.contactLoyaltyPrograms)
        .set(updateData)
        .where(
          and(
            eq(this.db.schema.contactLoyaltyPrograms.id, programId),
            eq(this.db.schema.contactLoyaltyPrograms.contactId, contact.id),
          ),
        )
        .returning()

      if (!updated) {
        throw new NotFoundException(`Loyalty program ${programId} not found`)
      }

      return this.formatLoyaltyProgram(updated)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          'A loyalty program with this provider and membership number already exists',
        )
      }
      throw error
    }
  }

  /**
   * Delete a loyalty program owned by the portal user
   */
  async deleteMyLoyaltyProgram(portalUserId: string, programId: string): Promise<void> {
    const contact = await this.findContactByPortalUser(portalUserId)

    const [deleted] = await this.db.client
      .delete(this.db.schema.contactLoyaltyPrograms)
      .where(
        and(
          eq(this.db.schema.contactLoyaltyPrograms.id, programId),
          eq(this.db.schema.contactLoyaltyPrograms.contactId, contact.id),
        ),
      )
      .returning()

    if (!deleted) {
      throw new NotFoundException(`Loyalty program ${programId} not found`)
    }
  }

  /**
   * Get the agency's loyalty programs catalog (active only, for provider dropdown)
   */
  async getLoyaltyCatalog(portalUserId: string) {
    const contact = await this.findContactByPortalUser(portalUserId)

    if (!contact.agencyId) {
      return { programs: [] }
    }

    const programs = await this.db.client
      .select()
      .from(this.db.schema.loyaltyPrograms)
      .where(
        and(
          eq(this.db.schema.loyaltyPrograms.agencyId, contact.agencyId),
          eq(this.db.schema.loyaltyPrograms.isActive, true),
        ),
      )
      .orderBy(
        asc(this.db.schema.loyaltyPrograms.programType),
        asc(this.db.schema.loyaltyPrograms.providerName),
      )

    return {
      programs: programs.map((p) => ({
        id: p.id,
        providerName: p.providerName,
        programName: p.programName,
        programType: p.programType,
      })),
    }
  }

  /**
   * Format a contact loyalty program row to DTO
   */
  private formatLoyaltyProgram(program: any): LoyaltyProgramDto {
    return {
      id: program.id,
      contactId: program.contactId,
      programName: program.programName,
      providerName: program.providerName,
      membershipNumber: program.membershipNumber,
      tierLevel: program.tierLevel,
      notes: program.notes,
      loyaltyProgramId: program.loyaltyProgramId ?? null,
      metadata: program.metadata || {},
      createdAt: program.createdAt.toISOString(),
      updatedAt: program.updatedAt.toISOString(),
    }
  }
}
