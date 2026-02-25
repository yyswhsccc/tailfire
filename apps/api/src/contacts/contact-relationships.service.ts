/**
 * Contact Relationships Service
 *
 * Business logic for managing relationships between contacts.
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, or } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type {
  CreateContactRelationshipDto,
  UpdateContactRelationshipDto,
  ContactRelationshipFilterDto,
  ContactRelationshipResponseDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class ContactRelationshipsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a new contact relationship
   */
  async create(
    contactId1: string,
    dto: CreateContactRelationshipDto,
    agencyId: string,
  ): Promise<ContactRelationshipResponseDto> {
    // Validate that both contacts exist and belong to the same agency
    const contact1Conditions = [eq(this.db.schema.contacts.id, contactId1), eq(this.db.schema.contacts.agencyId, agencyId)]
    const contact2Conditions = [eq(this.db.schema.contacts.id, dto.contactId2), eq(this.db.schema.contacts.agencyId, agencyId)]

    const contact1 = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(and(...contact1Conditions))
      .limit(1)

    const contact2 = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(and(...contact2Conditions))
      .limit(1)

    if (!contact1.length || !contact2.length) {
      throw new NotFoundException('One or both contacts not found')
    }

    if (contactId1 === dto.contactId2) {
      throw new BadRequestException('Cannot create relationship with self')
    }

    // Check if relationship already exists (bidirectional check)
    const existing = await this.db.client
      .select()
      .from(this.db.schema.contactRelationships)
      .where(
        or(
          and(
            eq(this.db.schema.contactRelationships.contactId1, contactId1),
            eq(this.db.schema.contactRelationships.contactId2, dto.contactId2),
          ),
          and(
            eq(this.db.schema.contactRelationships.contactId1, dto.contactId2),
            eq(this.db.schema.contactRelationships.contactId2, contactId1),
          ),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      throw new BadRequestException('Relationship already exists')
    }

    try {
      const [relationship] = await this.db.client
        .insert(this.db.schema.contactRelationships)
        .values({
          agencyId,
          contactId1,
          contactId2: dto.contactId2,
          labelForContact1: dto.labelForContact1,
          labelForContact2: dto.labelForContact2,
          category: dto.category,
          customLabel: dto.customLabel,
          notes: dto.notes,
        })
        .returning()

      // Return with the related contact populated for immediate UI feedback
      return this.mapToResponseDto(relationship, contactId1, contact2[0])
    } catch (error: any) {
      // Handle database constraint violation (race condition fallback)
      if (error.code === '23505' && error.constraint === 'unique_bidirectional_relationship') {
        throw new BadRequestException('Relationship already exists (detected by database constraint)')
      }
      throw error
    }
  }

  /**
   * Find all relationships for a contact or with filters
   */
  async findAll(
    filters: ContactRelationshipFilterDto,
    agencyId: string,
  ): Promise<ContactRelationshipResponseDto[]> {
    const conditions = []
    conditions.push(eq(this.db.schema.contactRelationships.agencyId, agencyId))

    if (filters.contactId) {
      const contactCondition = or(
        eq(this.db.schema.contactRelationships.contactId1, filters.contactId),
        eq(this.db.schema.contactRelationships.contactId2, filters.contactId),
      )
      if (contactCondition) {
        conditions.push(contactCondition)
      }
    }

    if (filters.category) {
      conditions.push(eq(this.db.schema.contactRelationships.category, filters.category))
    }

    const relationships = await this.db.client
      .select()
      .from(this.db.schema.contactRelationships)
      .where(conditions.length > 0 ? and(...conditions) : undefined)

    // For each relationship, fetch the related contact
    // The "related contact" is the one that ISN'T the requesting contact
    const enrichedRelationships = await Promise.all(
      relationships.map(async (r) => {
        // Determine which contact is the "other" one
        const relatedContactId =
          r.contactId1 === filters.contactId ? r.contactId2 : r.contactId1

        // Fetch the related contact
        const [relatedContact] = await this.db.client
          .select()
          .from(this.db.schema.contacts)
          .where(eq(this.db.schema.contacts.id, relatedContactId))
          .limit(1)

        return this.mapToResponseDto(r, filters.contactId, relatedContact)
      })
    )

    return enrichedRelationships
  }

  /**
   * Find one relationship by ID
   */
  async findOne(id: string): Promise<ContactRelationshipResponseDto> {
    const [relationship] = await this.db.client
      .select()
      .from(this.db.schema.contactRelationships)
      .where(eq(this.db.schema.contactRelationships.id, id))
      .limit(1)

    if (!relationship) {
      throw new NotFoundException(`Relationship with ID ${id} not found`)
    }

    return this.mapToResponseDto(relationship)
  }

  /**
   * Update a relationship
   */
  async update(
    id: string,
    dto: UpdateContactRelationshipDto,
    agencyId: string,
  ): Promise<ContactRelationshipResponseDto> {
    const conditions = [eq(this.db.schema.contactRelationships.id, id)]
    conditions.push(eq(this.db.schema.contactRelationships.agencyId, agencyId))
    const [relationship] = await this.db.client
      .update(this.db.schema.contactRelationships)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning()

    if (!relationship) {
      throw new NotFoundException(`Relationship with ID ${id} not found`)
    }

    return this.mapToResponseDto(relationship)
  }

  /**
   * Delete a relationship
   */
  async remove(id: string, agencyId: string): Promise<void> {
    const conditions = [eq(this.db.schema.contactRelationships.id, id)]
    conditions.push(eq(this.db.schema.contactRelationships.agencyId, agencyId))
    const [relationship] = await this.db.client
      .delete(this.db.schema.contactRelationships)
      .where(and(...conditions))
      .returning()

    if (!relationship) {
      throw new NotFoundException(`Relationship with ID ${id} not found`)
    }
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(
    relationship: any,
    _requestingContactId?: string,
    relatedContact?: any
  ): ContactRelationshipResponseDto {
    return {
      id: relationship.id,
      contactId1: relationship.contactId1,
      contactId2: relationship.contactId2,
      labelForContact1: relationship.labelForContact1,
      labelForContact2: relationship.labelForContact2,
      category: relationship.category,
      customLabel: relationship.customLabel,
      notes: relationship.notes,
      createdAt: relationship.createdAt.toISOString(),
      updatedAt: relationship.updatedAt.toISOString(),
      relatedContact: relatedContact ? this.mapContactToDto(relatedContact) : undefined,
    }
  }

  /**
   * Map contact entity to ContactResponseDto
   */
  private mapContactToDto(contact: any): any {
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
      firstName: contact.firstName,
      lastName: contact.lastName,
      legalFirstName: contact.legalFirstName,
      legalLastName: contact.legalLastName,
      middleName: contact.middleName,
      preferredName: contact.preferredName,
      prefix: contact.prefix,
      suffix: contact.suffix,
      displayName,
      legalFullName,
      gender: contact.gender,
      pronouns: contact.pronouns,
      maritalStatus: contact.maritalStatus,
      email: contact.email,
      phone: contact.phone,
      dateOfBirth: contact.dateOfBirth,
      passportNumber: contact.passportNumber,
      passportExpiry: contact.passportExpiry,
      passportCountry: contact.passportCountry,
      passportIssueDate: contact.passportIssueDate,
      nationality: contact.nationality,
      redressNumber: contact.redressNumber,
      knownTravelerNumber: contact.knownTravelerNumber,
      addressLine1: contact.addressLine1,
      addressLine2: contact.addressLine2,
      city: contact.city,
      province: contact.province,
      postalCode: contact.postalCode,
      country: contact.country,
      dietaryRequirements: contact.dietaryRequirements,
      mobilityNeeds: contact.mobilityNeeds,
      medicalNeeds: contact.medicalNeeds,
      seatingPreference: contact.seatingPreference,
      specialAssistance: contact.specialAssistance,
      travelPreferences: contact.travelPreferences,
      loyaltyPrograms: contact.loyaltyPrograms,
      emergencyContactName: contact.emergencyContactName,
      emergencyContactPhone: contact.emergencyContactPhone,
      emergencyContactRelationship: contact.emergencyContactRelationship,
      tags: contact.tags,
      referralSource: contact.referralSource,
      notes: contact.notes,
      contactType: contact.contactType,
      contactStatus: contact.contactStatus,
      lifecycle: contact.lifecycle,
      leadScore: contact.leadScore,
      leadSource: contact.leadSource,
      marketingEmailOptIn: contact.marketingEmailOptIn,
      marketingSmsOptIn: contact.marketingSmsOptIn,
      marketingPhoneOptIn: contact.marketingPhoneOptIn,
      trustBalanceUsd: contact.trustBalanceUsd,
      isActive: contact.isActive,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    }
  }
}
