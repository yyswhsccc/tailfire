/**
 * Contact Groups Service
 *
 * Business logic for managing contact groups (families, corporate groups, etc.).
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, ilike, sql, desc, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type {
  CreateContactGroupDto,
  UpdateContactGroupDto,
  ContactGroupFilterDto,
  AddContactToGroupDto,
  UpdateContactGroupMemberDto,
  ContactGroupResponseDto,
  ContactGroupWithMembersResponseDto,
  PaginatedContactGroupsResponseDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class ContactGroupsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a new contact group
   */
  async create(dto: CreateContactGroupDto, agencyId: string): Promise<ContactGroupResponseDto> {
    const [group] = await this.db.client
      .insert(this.db.schema.contactGroups)
      .values({
        agencyId,
        name: dto.name,
        groupType: dto.groupType,
        description: dto.description,
        primaryContactId: dto.primaryContactId,
        tags: dto.tags,
      })
      .returning()

    return this.mapToResponseDto(group)
  }

  /**
   * Find all contact groups with filtering and pagination
   */
  async findAll(
    filters: ContactGroupFilterDto,
    agencyId: string,
  ): Promise<PaginatedContactGroupsResponseDto> {
    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const conditions = []

    // Always filter by agency
    conditions.push(eq(this.db.schema.contactGroups.agencyId, agencyId))

    if (filters.search) {
      conditions.push(ilike(this.db.schema.contactGroups.name, `%${filters.search}%`))
    }

    if (filters.groupType) {
      conditions.push(eq(this.db.schema.contactGroups.groupType, filters.groupType))
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(this.db.schema.contactGroups.isActive, filters.isActive))
    }

    // Build ORDER BY
    const sortBy = filters.sortBy || 'name'
    const sortOrder = filters.sortOrder || 'asc'
    const orderByColumn = this.db.schema.contactGroups[sortBy] || this.db.schema.contactGroups.name
    const orderByFn = sortOrder === 'desc' ? desc : asc

    // Execute query
    const groups = await this.db.client
      .select()
      .from(this.db.schema.contactGroups)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByFn(orderByColumn))
      .limit(limit)
      .offset(offset)

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(this.db.schema.contactGroups)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
    const count = countResult[0]?.count ?? 0

    // Get member counts for each group
    const groupIds = groups.map((g) => g.id)
    const memberCounts = await this.db.client
      .select({
        groupId: this.db.schema.contactGroupMembers.groupId,
        count: sql<number>`count(*)::int`,
      })
      .from(this.db.schema.contactGroupMembers)
      .where(sql`${this.db.schema.contactGroupMembers.groupId} = ANY(${groupIds})`)
      .groupBy(this.db.schema.contactGroupMembers.groupId)

    const memberCountMap = new Map(memberCounts.map((mc) => [mc.groupId, mc.count]))

    return {
      data: groups.map((g) => ({
        ...this.mapToResponseDto(g),
        memberCount: memberCountMap.get(g.id) || 0,
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
   * Find one contact group by ID
   */
  async findOne(id: string, agencyId: string): Promise<ContactGroupResponseDto> {
    const conditions = [eq(this.db.schema.contactGroups.id, id)]
    conditions.push(eq(this.db.schema.contactGroups.agencyId, agencyId))
    const [group] = await this.db.client
      .select()
      .from(this.db.schema.contactGroups)
      .where(and(...conditions))
      .limit(1)

    if (!group) {
      throw new NotFoundException(`Contact group with ID ${id} not found`)
    }

    return this.mapToResponseDto(group)
  }

  /**
   * Find one contact group with members
   */
  async findOneWithMembers(
    id: string,
    agencyId: string,
  ): Promise<ContactGroupWithMembersResponseDto> {
    const group = await this.findOne(id, agencyId)

    // Get members with contact details
    const members = await this.db.client
      .select({
        id: this.db.schema.contactGroupMembers.id,
        groupId: this.db.schema.contactGroupMembers.groupId,
        contactId: this.db.schema.contactGroupMembers.contactId,
        role: this.db.schema.contactGroupMembers.role,
        notes: this.db.schema.contactGroupMembers.notes,
        joinedAt: this.db.schema.contactGroupMembers.joinedAt,
        contact: this.db.schema.contacts,
      })
      .from(this.db.schema.contactGroupMembers)
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.contactGroupMembers.contactId, this.db.schema.contacts.id),
      )
      .where(eq(this.db.schema.contactGroupMembers.groupId, id))

    return {
      ...group,
      members: members.map((m) => ({
        id: m.id,
        groupId: m.groupId,
        contactId: m.contactId,
        role: m.role,
        notes: m.notes,
        joinedAt: m.joinedAt.toISOString(),
        contact: m.contact
          ? {
              id: m.contact.id,
              agencyId: m.contact.agencyId,
              ownerId: m.contact.ownerId,
              timezone: m.contact.timezone,
              // Name fields
              firstName: m.contact.firstName,
              lastName: m.contact.lastName,
              legalFirstName: m.contact.legalFirstName,
              legalLastName: m.contact.legalLastName,
              middleName: m.contact.middleName,
              preferredName: m.contact.preferredName,
              prefix: m.contact.prefix,
              suffix: m.contact.suffix,
              // Computed display names
              displayName: m.contact.preferredName || m.contact.firstName || m.contact.legalFirstName || 'Unknown',
              legalFullName: m.contact.legalFirstName && m.contact.legalLastName
                ? `${m.contact.legalFirstName} ${m.contact.legalLastName}`
                : null,
              // LGBTQ+ inclusive
              gender: m.contact.gender,
              pronouns: m.contact.pronouns,
              maritalStatus: m.contact.maritalStatus,
              // Contact info
              email: m.contact.email,
              phone: m.contact.phone,
              dateOfBirth: m.contact.dateOfBirth,
              // Passport
              passportNumber: m.contact.passportNumber,
              passportExpiry: m.contact.passportExpiry,
              passportCountry: m.contact.passportCountry,
              passportIssueDate: m.contact.passportIssueDate,
              nationality: m.contact.nationality,
              // TSA Credentials
              redressNumber: m.contact.redressNumber,
              knownTravelerNumber: m.contact.knownTravelerNumber,
              // Address
              addressLine1: m.contact.addressLine1,
              addressLine2: m.contact.addressLine2,
              city: m.contact.city,
              province: m.contact.province,
              postalCode: m.contact.postalCode,
              country: m.contact.country,
              // Requirements
              dietaryRequirements: m.contact.dietaryRequirements,
              mobilityRequirements: m.contact.mobilityRequirements,
              // Travel preferences
              seatPreference: m.contact.seatPreference,
              cabinPreference: m.contact.cabinPreference,
              floorPreference: m.contact.floorPreference,
              travelPreferences: m.contact.travelPreferences
                ? JSON.stringify(m.contact.travelPreferences)
                : null,
              // Lifecycle & Status
              contactType: m.contact.contactType,
              contactStatus: m.contact.contactStatus,
              becameClientAt: m.contact.becameClientAt
                ? m.contact.becameClientAt.toISOString()
                : null,
              firstBookingDate: m.contact.firstBookingDate,
              lastTripReturnDate: m.contact.lastTripReturnDate,
              // Marketing Consent
              marketingEmailOptIn: m.contact.marketingEmailOptIn ?? false,
              marketingEmailOptInAt: m.contact.marketingEmailOptInAt
                ? m.contact.marketingEmailOptInAt.toISOString()
                : null,
              marketingSmsOptIn: m.contact.marketingSmsOptIn ?? false,
              marketingSmsOptInAt: m.contact.marketingSmsOptInAt
                ? m.contact.marketingSmsOptInAt.toISOString()
                : null,
              marketingPhoneOptIn: m.contact.marketingPhoneOptIn ?? false,
              marketingPhoneOptInAt: m.contact.marketingPhoneOptInAt
                ? m.contact.marketingPhoneOptInAt.toISOString()
                : null,
              marketingOptInSource: m.contact.marketingOptInSource,
              marketingOptOutAt: m.contact.marketingOptOutAt
                ? m.contact.marketingOptOutAt.toISOString()
                : null,
              marketingOptOutReason: m.contact.marketingOptOutReason,
              // Trust balances
              trustBalanceCad: m.contact.trustBalanceCad,
              trustBalanceUsd: m.contact.trustBalanceUsd,
              // Metadata
              tags: m.contact.tags || [],
              isActive: m.contact.isActive,
              // Photo
              photoUrl: m.contact.photoUrl ?? null,
              // Portal
              portalUserId: m.contact.portalUserId ?? null,
              portalStatus: m.contact.portalActivatedAt
                ? 'active' as const
                : m.contact.portalUserId
                  ? 'pending' as const
                  : 'not_invited' as const,
              portalInvitedAt: m.contact.portalInvitedAt
                ? m.contact.portalInvitedAt.toISOString()
                : null,
              // Audit
              createdAt: m.contact.createdAt.toISOString(),
              updatedAt: m.contact.updatedAt.toISOString(),
            }
          : undefined,
      })),
    }
  }

  /**
   * Update a contact group
   */
  async update(
    id: string,
    dto: UpdateContactGroupDto,
    agencyId: string,
  ): Promise<ContactGroupResponseDto> {
    const conditions = [eq(this.db.schema.contactGroups.id, id)]
    conditions.push(eq(this.db.schema.contactGroups.agencyId, agencyId))
    const [group] = await this.db.client
      .update(this.db.schema.contactGroups)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning()

    if (!group) {
      throw new NotFoundException(`Contact group with ID ${id} not found`)
    }

    return this.mapToResponseDto(group)
  }

  /**
   * Delete a contact group
   */
  async remove(id: string, agencyId: string): Promise<void> {
    const conditions = [eq(this.db.schema.contactGroups.id, id)]
    conditions.push(eq(this.db.schema.contactGroups.agencyId, agencyId))
    const [group] = await this.db.client
      .delete(this.db.schema.contactGroups)
      .where(and(...conditions))
      .returning()

    if (!group) {
      throw new NotFoundException(`Contact group with ID ${id} not found`)
    }
  }

  /**
   * Add a contact to a group
   */
  async addMember(
    groupId: string,
    dto: AddContactToGroupDto,
    agencyId: string,
  ): Promise<void> {
    // Verify group exists and belongs to agency
    await this.findOne(groupId, agencyId)

    // Verify contact exists
    const [contact] = await this.db.client
      .select()
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, dto.contactId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    // Check if already a member
    const existing = await this.db.client
      .select()
      .from(this.db.schema.contactGroupMembers)
      .where(
        and(
          eq(this.db.schema.contactGroupMembers.groupId, groupId),
          eq(this.db.schema.contactGroupMembers.contactId, dto.contactId),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      throw new BadRequestException('Contact is already a member of this group')
    }

    await this.db.client.insert(this.db.schema.contactGroupMembers).values({
      groupId,
      contactId: dto.contactId,
      role: dto.role,
      notes: dto.notes,
    })
  }

  /**
   * Remove a contact from a group
   */
  async removeMember(groupId: string, memberId: string, agencyId: string): Promise<void> {
    // Verify group exists and belongs to agency
    await this.findOne(groupId, agencyId)

    const [member] = await this.db.client
      .delete(this.db.schema.contactGroupMembers)
      .where(
        and(
          eq(this.db.schema.contactGroupMembers.id, memberId),
          eq(this.db.schema.contactGroupMembers.groupId, groupId),
        ),
      )
      .returning()

    if (!member) {
      throw new NotFoundException('Group member not found')
    }
  }

  /**
   * Update a group member's role/notes
   */
  async updateMember(
    groupId: string,
    memberId: string,
    dto: UpdateContactGroupMemberDto,
    agencyId: string,
  ): Promise<void> {
    // Verify group exists and belongs to agency
    await this.findOne(groupId, agencyId)

    const [member] = await this.db.client
      .update(this.db.schema.contactGroupMembers)
      .set(dto)
      .where(
        and(
          eq(this.db.schema.contactGroupMembers.id, memberId),
          eq(this.db.schema.contactGroupMembers.groupId, groupId),
        ),
      )
      .returning()

    if (!member) {
      throw new NotFoundException('Group member not found')
    }
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(group: any): ContactGroupResponseDto {
    return {
      id: group.id,
      agencyId: group.agencyId,
      // branchId: group.branchId, // Phase 2 - Multi-branch support
      name: group.name,
      groupType: group.groupType,
      description: group.description,
      primaryContactId: group.primaryContactId,
      tags: group.tags || [],
      isActive: group.isActive,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    }
  }
}
