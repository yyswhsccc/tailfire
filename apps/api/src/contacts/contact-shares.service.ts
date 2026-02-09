/**
 * Contact Shares Service
 *
 * Business logic for managing contact shares.
 * Allows contact owners to share contacts with other users in the agency.
 */

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { UserValidationService } from '../common/user-validation.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  ContactShareResponseDto,
  CreateContactShareDto,
  UpdateContactShareDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class ContactSharesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userValidationService: UserValidationService,
  ) {}

  /**
   * Share a contact with another user
   * Only the contact owner or admin can share
   */
  async create(
    contactId: string,
    dto: CreateContactShareDto,
    auth: AuthContext,
  ): Promise<ContactShareResponseDto> {
    // Validate contact exists and check ownership
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        ownerId: this.db.schema.contacts.ownerId,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    // Check agency match
    if (contact.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Contact belongs to different agency')
    }

    // Only owner or admin can share
    if (auth.role !== 'admin' && contact.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the contact owner can share this contact')
    }

    // Cannot share with yourself
    if (dto.sharedWithUserId === auth.userId) {
      throw new ForbiddenException('Cannot share a contact with yourself')
    }

    // Validate target user exists and belongs to same agency
    await this.userValidationService.validateUserInAgency(
      dto.sharedWithUserId,
      auth.agencyId,
      'Target user',
    )

    // Check if share already exists
    const [existingShare] = await this.db.client
      .select({ id: this.db.schema.contactShares.id })
      .from(this.db.schema.contactShares)
      .where(
        and(
          eq(this.db.schema.contactShares.contactId, contactId),
          eq(this.db.schema.contactShares.sharedWithUserId, dto.sharedWithUserId),
        ),
      )
      .limit(1)

    if (existingShare) {
      throw new ConflictException('Contact is already shared with this user')
    }

    // Create the share
    const [share] = await this.db.client
      .insert(this.db.schema.contactShares)
      .values({
        contactId,
        sharedWithUserId: dto.sharedWithUserId,
        agencyId: auth.agencyId,
        accessLevel: dto.accessLevel || 'basic',
        sharedBy: auth.userId,
        notes: dto.notes,
      })
      .returning()

    return this.mapToResponseDto(share)
  }

  /**
   * List all shares for a contact
   */
  async findAll(contactId: string, auth: AuthContext): Promise<ContactShareResponseDto[]> {
    // Validate contact exists and check access
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        ownerId: this.db.schema.contacts.ownerId,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    // Check agency match
    if (contact.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Contact belongs to different agency')
    }

    // Only owner or admin can see all shares
    if (auth.role !== 'admin' && contact.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the contact owner can view shares')
    }

    const shares = await this.db.client
      .select()
      .from(this.db.schema.contactShares)
      .where(eq(this.db.schema.contactShares.contactId, contactId))

    return shares.map((share) => this.mapToResponseDto(share))
  }

  /**
   * Update a share's access level
   */
  async update(
    contactId: string,
    sharedWithUserId: string,
    dto: UpdateContactShareDto,
    auth: AuthContext,
  ): Promise<ContactShareResponseDto> {
    // Validate contact exists and check ownership
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        ownerId: this.db.schema.contacts.ownerId,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    // Check agency match
    if (contact.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Contact belongs to different agency')
    }

    // Only owner or admin can update shares
    if (auth.role !== 'admin' && contact.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the contact owner can update shares')
    }

    const [share] = await this.db.client
      .update(this.db.schema.contactShares)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(this.db.schema.contactShares.contactId, contactId),
          eq(this.db.schema.contactShares.sharedWithUserId, sharedWithUserId),
        ),
      )
      .returning()

    if (!share) {
      throw new NotFoundException('Share not found')
    }

    return this.mapToResponseDto(share)
  }

  /**
   * Revoke a share
   */
  async remove(
    contactId: string,
    sharedWithUserId: string,
    auth: AuthContext,
  ): Promise<void> {
    // Validate contact exists and check ownership
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        ownerId: this.db.schema.contacts.ownerId,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Contact not found')
    }

    // Check agency match
    if (contact.agencyId !== auth.agencyId) {
      throw new ForbiddenException('Contact belongs to different agency')
    }

    // Only owner or admin can revoke shares
    if (auth.role !== 'admin' && contact.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the contact owner can revoke shares')
    }

    const [deleted] = await this.db.client
      .delete(this.db.schema.contactShares)
      .where(
        and(
          eq(this.db.schema.contactShares.contactId, contactId),
          eq(this.db.schema.contactShares.sharedWithUserId, sharedWithUserId),
        ),
      )
      .returning()

    if (!deleted) {
      throw new NotFoundException('Share not found')
    }
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(share: any): ContactShareResponseDto {
    return {
      id: share.id,
      contactId: share.contactId,
      sharedWithUserId: share.sharedWithUserId,
      accessLevel: share.accessLevel,
      sharedBy: share.sharedBy,
      sharedAt: share.sharedAt.toISOString(),
      notes: share.notes,
      createdAt: share.createdAt.toISOString(),
      updatedAt: share.updatedAt.toISOString(),
    }
  }
}
