/**
 * Contact Access Service
 *
 * Core access control logic for contacts.
 * Determines who can see what contact data based on ownership and sharing.
 *
 * Access Levels:
 * - Admin: Full access to all contacts in agency
 * - Owner: Full access to owned contacts
 * - Full Share: Full access via explicit share
 * - Basic Share: Basic fields only via explicit share
 * - Agency (no share): Basic fields only for non-owned contacts
 */

import { Injectable } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { AuthContext } from '../auth/auth.types'
import type { ContactResponseDto } from '../../../../packages/shared-types/src/api'

/**
 * Fields visible to basic-access users.
 * All other fields are nulled (not omitted) to preserve DTO shape.
 */
export const BASIC_VIEW_ALLOWED_FIELDS = [
  'id',
  'firstName',
  'lastName',
  'email',
  'phone',
  'ownerId',
  'agencyId',
  'isActive',
  'createdAt',
  'updatedAt',
  '_accessLevel',
  '_ownerName',
  '_shareRequestStatus',
] as const

export interface ContactAccessResult {
  canAccessBasic: boolean
  canAccessSensitive: boolean
  reason: string
}

@Injectable()
export class ContactAccessService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Check what level of access a user has to a contact's data
   */
  async canAccessSensitiveData(
    contactId: string,
    auth: AuthContext,
  ): Promise<ContactAccessResult> {
    // Admins have full access
    if (auth.role === 'admin') {
      return {
        canAccessBasic: true,
        canAccessSensitive: true,
        reason: 'Admin has full access',
      }
    }

    // Get the contact to check ownership
    const [contact] = await this.db.client
      .select({
        ownerId: this.db.schema.contacts.ownerId,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact) {
      return {
        canAccessBasic: false,
        canAccessSensitive: false,
        reason: 'Contact not found',
      }
    }

    // Check agency match
    if (contact.agencyId !== auth.agencyId) {
      return {
        canAccessBasic: false,
        canAccessSensitive: false,
        reason: 'Contact belongs to different agency',
      }
    }

    // Owner has full access
    if (contact.ownerId === auth.userId) {
      return {
        canAccessBasic: true,
        canAccessSensitive: true,
        reason: 'User owns this contact',
      }
    }

    // Check for explicit share
    const [share] = await this.db.client
      .select({ accessLevel: this.db.schema.contactShares.accessLevel })
      .from(this.db.schema.contactShares)
      .where(
        and(
          eq(this.db.schema.contactShares.contactId, contactId),
          eq(this.db.schema.contactShares.sharedWithUserId, auth.userId),
        ),
      )
      .limit(1)

    if (share) {
      if (share.accessLevel === 'full') {
        return {
          canAccessBasic: true,
          canAccessSensitive: true,
          reason: 'Full share granted',
        }
      }
      return {
        canAccessBasic: true,
        canAccessSensitive: false,
        reason: 'Basic share granted',
      }
    }

    // Agency-wide contact (no owner) - basic access for all
    if (contact.ownerId === null) {
      return {
        canAccessBasic: true,
        canAccessSensitive: false,
        reason: 'Agency-wide contact (no owner)',
      }
    }

    // Default: basic access only for agency members
    return {
      canAccessBasic: true,
      canAccessSensitive: false,
      reason: 'Default agency access (basic only)',
    }
  }

  /**
   * Check if a user can use a contact (e.g., add to a trip)
   * Users can use:
   * - Contacts they own
   * - Contacts shared with them
   * - Agency-wide contacts (no owner)
   * - Admins can use any contact in the agency
   */
  async canUseContact(contactId: string, auth: AuthContext): Promise<boolean> {
    // Admins can use any contact
    if (auth.role === 'admin') {
      return true
    }

    // Get contact details
    const [contact] = await this.db.client
      .select({
        ownerId: this.db.schema.contacts.ownerId,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, contactId))
      .limit(1)

    if (!contact) {
      return false
    }

    // Must be same agency
    if (contact.agencyId !== auth.agencyId) {
      return false
    }

    // Owner can use their contacts
    if (contact.ownerId === auth.userId) {
      return true
    }

    // Agency-wide contact (no owner) can be used by anyone
    if (contact.ownerId === null) {
      return true
    }

    // Check for explicit share
    const [share] = await this.db.client
      .select({ id: this.db.schema.contactShares.id })
      .from(this.db.schema.contactShares)
      .where(
        and(
          eq(this.db.schema.contactShares.contactId, contactId),
          eq(this.db.schema.contactShares.sharedWithUserId, auth.userId),
        ),
      )
      .limit(1)

    return !!share
  }

  /**
   * Filter contact fields based on access level using an allowlist.
   * Non-allowed fields are set to null (not omitted) to preserve DTO shape.
   */
  filterToBasicView(contact: ContactResponseDto): ContactResponseDto {
    const filtered = { ...contact }
    const allowedSet = new Set<string>(BASIC_VIEW_ALLOWED_FIELDS)

    for (const key of Object.keys(filtered)) {
      if (!allowedSet.has(key)) {
        const value = (filtered as Record<string, unknown>)[key]
        if (Array.isArray(value)) {
          ;(filtered as Record<string, unknown>)[key] = []
        } else {
          ;(filtered as Record<string, unknown>)[key] = null
        }
      }
    }
    return filtered
  }

  /**
   * Apply access control filtering to a contact response
   * Includes _accessLevel in the response so the frontend can show "Limited View" badge.
   */
  async applyAccessControl(
    contact: ContactResponseDto,
    auth: AuthContext,
  ): Promise<ContactResponseDto> {
    const access = await this.canAccessSensitiveData(contact.id, auth)
    if (access.canAccessSensitive) {
      return { ...contact, _accessLevel: 'full' as const }
    }
    return { ...this.filterToBasicView(contact), _accessLevel: 'basic' as const }
  }

  /**
   * Apply access control filtering to multiple contacts
   * Includes _accessLevel in each contact response.
   */
  async applyAccessControlToMany(
    contacts: ContactResponseDto[],
    auth: AuthContext,
  ): Promise<ContactResponseDto[]> {
    // For efficiency, batch check ownership and shares
    if (auth.role === 'admin') {
      return contacts.map((c) => ({ ...c, _accessLevel: 'full' as const }))
    }

    // Get all shares for these contacts for this user
    // Note: We get all shares for the user and filter in memory for efficiency
    // This avoids an IN query with potentially many contact IDs
    const shares = await this.db.client
      .select({
        contactId: this.db.schema.contactShares.contactId,
        accessLevel: this.db.schema.contactShares.accessLevel,
      })
      .from(this.db.schema.contactShares)
      .where(eq(this.db.schema.contactShares.sharedWithUserId, auth.userId))

    const shareMap = new Map(shares.map((s) => [s.contactId, s.accessLevel]))

    return contacts.map((contact) => {
      // Owner has full access
      if (contact.ownerId === auth.userId) {
        return { ...contact, _accessLevel: 'full' as const }
      }

      // Check share
      const shareLevel = shareMap.get(contact.id)
      if (shareLevel === 'full') {
        return { ...contact, _accessLevel: 'full' as const }
      }

      // Basic access only — apply allowlist filter
      return { ...this.filterToBasicView(contact), _accessLevel: 'basic' as const }
    })
  }

  /**
   * Filter a contact snapshot based on access level
   * Used when creating/reading trip travelers
   */
  filterSnapshotFields(
    snapshot: Record<string, any> | null,
    canAccessSensitive: boolean,
  ): Record<string, any> | null {
    if (!snapshot || canAccessSensitive) {
      return snapshot
    }

    // Fields to keep in basic view (non-sensitive snapshot fields)
    const basicSnapshotFields = [
      'firstName',
      'lastName',
      'legalFirstName',
      'legalLastName',
      'middleName',
      'preferredName',
      'prefix',
      'suffix',
      'email',
      'phone',
      'gender',
      'pronouns',
    ]

    const filtered: Record<string, any> = {}
    for (const field of basicSnapshotFields) {
      if (field in snapshot) {
        filtered[field] = snapshot[field]
      }
    }
    return filtered
  }
}
