/**
 * Portal Service
 *
 * Business logic for portal user operations.
 * Portal users are contacts with linked Supabase auth accounts.
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { StorageService } from '../trips/storage.service'
import type { UpdatePortalProfileDto } from './dto/update-portal-profile.dto'

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
      displayName: contact.preferredName ?? contact.firstName ?? contact.legalFirstName ?? 'Traveler',
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
