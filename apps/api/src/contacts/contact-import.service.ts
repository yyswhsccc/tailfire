/**
 * Contact Import Service
 *
 * Handles bulk CSV contact import with duplicate detection, ownership rules,
 * and fill-only merge. Two-phase workflow: preview() then confirm().
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq, and, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ContactsService } from './contacts.service'
import { TagsService } from '../tags/tags.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  ContactImportRow,
  ContactImportConfirmRow,
  ContactImportPreviewResult,
  ContactImportConfirmResult,
  ContactImportDisposition,
} from '@tailfire/shared-types'

/** Fields on ContactImportRow that can be compared for fill-only merge */
const IMPORT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'dateOfBirth',
  'addressLine1',
  'addressLine2',
  'city',
  'province',
  'postalCode',
  'country',
  'passportNumber',
  'passportExpiry',
  'passportCountry',
] as const

/** Internal contact row returned from match queries */
interface MatchedContact {
  id: string
  ownerId: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  dateOfBirth: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  country: string | null
  passportNumber: string | null
  passportExpiry: string | null
  passportCountry: string | null
  updatedAt: Date
}

@Injectable()
export class ContactImportService {
  private readonly logger = new Logger(ContactImportService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly contactsService: ContactsService,
    private readonly tagsService: TagsService,
  ) {}

  // ===========================================================================
  // PREVIEW
  // ===========================================================================

  async preview(
    rows: ContactImportRow[],
    auth: AuthContext,
  ): Promise<ContactImportPreviewResult> {
    const summary = {
      newCount: 0,
      updateCount: 0,
      possibleMatchCount: 0,
      skipOtherAgentCount: 0,
      skipInvalidCount: 0,
      totalRows: rows.length,
    }

    const results: ContactImportPreviewResult['results'] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const result = await this.classifyRow(row, i, auth)
      results.push(result)

      switch (result.disposition) {
        case 'new':
          summary.newCount++
          break
        case 'update':
          summary.updateCount++
          break
        case 'possible_match':
          summary.possibleMatchCount++
          break
        case 'skip_other_agent':
          summary.skipOtherAgentCount++
          break
        case 'skip_invalid':
          summary.skipInvalidCount++
          break
      }
    }

    return { results, summary }
  }

  // ===========================================================================
  // CONFIRM
  // ===========================================================================

  async confirm(
    rows: ContactImportConfirmRow[],
    tags: string[],
    auth: AuthContext,
  ): Promise<ContactImportConfirmResult> {
    let created = 0
    let updated = 0
    let skipped = 0
    const errors: Array<{ rowIndex: number; error: string }> = []
    const importedContactIds: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!

      try {
        if (row.action === 'skip') {
          skipped++
          continue
        }

        if (row.action === 'create') {
          const contactId = await this.createContact(row, auth)
          importedContactIds.push(contactId)
          created++
          continue
        }

        if (row.action === 'merge') {
          if (!row.mergeContactId) {
            errors.push({ rowIndex: i, error: 'merge action requires mergeContactId' })
            skipped++
            continue
          }

          // Re-verify the match still exists and is valid
          const match = await this.findContactById(row.mergeContactId, auth.agencyId)
          if (!match) {
            errors.push({ rowIndex: i, error: `Contact ${row.mergeContactId} not found` })
            skipped++
            continue
          }

          // Verify ownership: must be owned by importing agent or agency-wide
          if (match.ownerId && match.ownerId !== auth.userId) {
            errors.push({ rowIndex: i, error: 'Contact owned by another agent' })
            skipped++
            continue
          }

          await this.mergeContact(row, match, auth)
          importedContactIds.push(row.mergeContactId)
          updated++
          continue
        }

        // Unknown action
        errors.push({ rowIndex: i, error: `Unknown action: ${row.action}` })
        skipped++
      } catch (err: any) {
        this.logger.error(`Import row ${i} failed: ${err.message}`, err.stack)
        errors.push({ rowIndex: i, error: err.message || 'Unknown error' })
        skipped++
      }
    }

    // Assign tags to all successfully imported contacts
    const tagNames = tags.filter((t) => t.trim())
    if (tagNames.length > 0 && importedContactIds.length > 0) {
      await this.assignTags(importedContactIds, tagNames, auth)
    }

    return {
      created,
      updated,
      skipped,
      errors,
      tagName: tagNames.join(', ') || '',
    }
  }

  // ===========================================================================
  // MATCHING / CLASSIFICATION
  // ===========================================================================

  /**
   * Classify a single import row: detect duplicates, compute disposition.
   */
  private async classifyRow(
    row: ContactImportRow,
    rowIndex: number,
    auth: AuthContext,
  ): Promise<ContactImportPreviewResult['results'][number]> {
    // Validate — must have firstName
    if (!row.firstName?.trim()) {
      return {
        rowIndex,
        disposition: 'skip_invalid' as ContactImportDisposition,
        validationErrors: ['Missing required field: firstName'],
      }
    }

    const { contacts } = this.db.schema

    // 1. Match by email
    if (row.email?.trim()) {
      const emailMatches = await this.db.client
        .select({
          id: contacts.id,
          ownerId: contacts.ownerId,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          dateOfBirth: contacts.dateOfBirth,
          addressLine1: contacts.addressLine1,
          addressLine2: contacts.addressLine2,
          city: contacts.city,
          province: contacts.province,
          postalCode: contacts.postalCode,
          country: contacts.country,
          passportNumber: contacts.passportNumber,
          passportExpiry: contacts.passportExpiry,
          passportCountry: contacts.passportCountry,
          updatedAt: contacts.updatedAt,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.agencyId, auth.agencyId),
            eq(contacts.isActive, true),
            sql`LOWER(${contacts.email}) = LOWER(${row.email.trim()})`,
          ),
        )

      if (emailMatches.length > 0) {
        return this.resolveMatch(emailMatches, row, rowIndex, 'email', auth)
      }
    }

    // 2. Match by name + DOB
    if (row.dateOfBirth?.trim() && row.lastName?.trim()) {
      const nameDobMatches = await this.db.client
        .select({
          id: contacts.id,
          ownerId: contacts.ownerId,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          dateOfBirth: contacts.dateOfBirth,
          addressLine1: contacts.addressLine1,
          addressLine2: contacts.addressLine2,
          city: contacts.city,
          province: contacts.province,
          postalCode: contacts.postalCode,
          country: contacts.country,
          passportNumber: contacts.passportNumber,
          passportExpiry: contacts.passportExpiry,
          passportCountry: contacts.passportCountry,
          updatedAt: contacts.updatedAt,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.agencyId, auth.agencyId),
            eq(contacts.isActive, true),
            sql`LOWER(${contacts.firstName}) = LOWER(${row.firstName.trim()})`,
            sql`LOWER(${contacts.lastName}) = LOWER(${row.lastName.trim()})`,
            eq(contacts.dateOfBirth, row.dateOfBirth.trim()),
          ),
        )

      if (nameDobMatches.length > 0) {
        return this.resolveMatch(nameDobMatches, row, rowIndex, 'name_dob', auth)
      }
    }

    // 3. Match by name only
    if (row.lastName?.trim()) {
      const nameMatches = await this.db.client
        .select({
          id: contacts.id,
          ownerId: contacts.ownerId,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          dateOfBirth: contacts.dateOfBirth,
          addressLine1: contacts.addressLine1,
          addressLine2: contacts.addressLine2,
          city: contacts.city,
          province: contacts.province,
          postalCode: contacts.postalCode,
          country: contacts.country,
          passportNumber: contacts.passportNumber,
          passportExpiry: contacts.passportExpiry,
          passportCountry: contacts.passportCountry,
          updatedAt: contacts.updatedAt,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.agencyId, auth.agencyId),
            eq(contacts.isActive, true),
            sql`LOWER(${contacts.firstName}) = LOWER(${row.firstName.trim()})`,
            sql`LOWER(${contacts.lastName}) = LOWER(${row.lastName.trim()})`,
          ),
        )

      if (nameMatches.length > 0) {
        // Name-only matches are always possible_match (lower confidence)
        const best = this.pickBestMatch(nameMatches, auth.userId)
        if (best) {
          const ownerName = await this.getOwnerName(best.ownerId)
          return {
            rowIndex,
            disposition: 'possible_match' as ContactImportDisposition,
            matchedContactId: best.id,
            matchedContactName: this.formatContactName(best),
            matchedContactEmail: best.email ?? undefined,
            matchedContactOwner: ownerName ?? undefined,
            matchType: 'name_only',
            fieldsToFill: this.computeFieldsToFill(row, best),
          }
        }
        // All owned by other agents
        const first = nameMatches[0]!
        const ownerName = await this.getOwnerName(first.ownerId)
        return {
          rowIndex,
          disposition: 'skip_other_agent' as ContactImportDisposition,
          matchedContactId: first.id,
          matchedContactName: this.formatContactName(first),
          matchedContactEmail: first.email ?? undefined,
          matchedContactOwner: ownerName ?? undefined,
          matchType: 'name_only',
        }
      }
    }

    // 4. No match → new
    return {
      rowIndex,
      disposition: 'new' as ContactImportDisposition,
    }
  }

  /**
   * Resolve a set of matches into a single disposition.
   * For email and name+DOB matches (higher confidence), returns 'update' when ownership allows.
   */
  private async resolveMatch(
    matches: MatchedContact[],
    row: ContactImportRow,
    rowIndex: number,
    matchType: 'email' | 'name_dob',
    auth: AuthContext,
  ): Promise<ContactImportPreviewResult['results'][number]> {
    const best = this.pickBestMatch(matches, auth.userId)

    if (!best) {
      // All matches owned by other agents
      const first = matches[0]!
      const ownerName = await this.getOwnerName(first.ownerId)
      return {
        rowIndex,
        disposition: 'skip_other_agent' as ContactImportDisposition,
        matchedContactId: first.id,
        matchedContactName: this.formatContactName(first),
        matchedContactEmail: first.email ?? undefined,
        matchedContactOwner: ownerName ?? undefined,
        matchType,
      }
    }

    const ownerName = await this.getOwnerName(best.ownerId)
    return {
      rowIndex,
      disposition: 'update' as ContactImportDisposition,
      matchedContactId: best.id,
      matchedContactName: this.formatContactName(best),
      matchedContactEmail: best.email ?? undefined,
      matchedContactOwner: ownerName ?? undefined,
      matchType,
      fieldsToFill: this.computeFieldsToFill(row, best),
    }
  }

  /**
   * Multi-match resolution:
   * 1. Prefer match owned by the importing agent
   * 2. Then prefer agency-wide match (ownerId IS NULL), pick most recently updated
   * 3. If all owned by other agents → return null
   */
  private pickBestMatch(
    matches: MatchedContact[],
    importingUserId: string,
  ): MatchedContact | null {
    // 1. Prefer match owned by importing agent
    const ownedByAgent = matches.find((m) => m.ownerId === importingUserId)
    if (ownedByAgent) return ownedByAgent

    // 2. Prefer agency-wide (null owner), sorted by most recently updated
    const agencyWide = matches
      .filter((m) => m.ownerId === null)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    if (agencyWide.length > 0) return agencyWide[0]!

    // 3. All owned by other agents → null
    return null
  }

  /**
   * Compare import row fields against matched contact.
   * Returns list of fields where contact is null/empty but import has a value.
   */
  private computeFieldsToFill(
    row: ContactImportRow,
    contact: MatchedContact,
  ): string[] {
    const fields: string[] = []

    for (const field of IMPORT_FIELDS) {
      const importValue = row[field]
      const contactValue = contact[field as keyof MatchedContact]

      if (
        importValue &&
        importValue.toString().trim() !== '' &&
        (contactValue === null || contactValue === undefined || contactValue.toString().trim() === '')
      ) {
        fields.push(field)
      }
    }

    return fields
  }

  // ===========================================================================
  // WRITE OPERATIONS (confirm phase)
  // ===========================================================================

  /**
   * Create a new contact from an import row.
   */
  private async createContact(
    row: ContactImportConfirmRow,
    auth: AuthContext,
  ): Promise<string> {
    const result = await this.contactsService.create(
      {
        firstName: row.firstName?.trim(),
        lastName: row.lastName?.trim(),
        email: row.email?.trim(),
        phone: row.phone?.trim(),
        dateOfBirth: row.dateOfBirth?.trim(),
        addressLine1: row.addressLine1?.trim(),
        addressLine2: row.addressLine2?.trim(),
        city: row.city?.trim(),
        province: row.province?.trim(),
        postalCode: row.postalCode?.trim(),
        country: row.country?.trim(),
        passportNumber: row.passportNumber?.trim(),
        passportExpiry: row.passportExpiry?.trim(),
        passportCountry: row.passportCountry?.trim(),
        ownerId: auth.userId,
        contactType: 'lead',
        contactStatus: 'prospecting',
      },
      auth.agencyId,
      auth.userId,
    )

    return result.id
  }

  /**
   * Merge (fill-only) import data into an existing contact.
   * Only fills fields where the existing contact has no value.
   * Also claims ownership if the contact is agency-wide (null owner).
   */
  private async mergeContact(
    row: ContactImportConfirmRow,
    existing: MatchedContact,
    auth: AuthContext,
  ): Promise<void> {
    const { contacts } = this.db.schema
    const fillPayload: Record<string, any> = {}

    // Build fill-only payload — only set fields where existing is null/empty
    const fieldMap: Array<{ importKey: keyof ContactImportRow; contactKey: keyof MatchedContact; dbField: any }> = [
      { importKey: 'firstName', contactKey: 'firstName', dbField: contacts.firstName },
      { importKey: 'lastName', contactKey: 'lastName', dbField: contacts.lastName },
      { importKey: 'email', contactKey: 'email', dbField: contacts.email },
      { importKey: 'phone', contactKey: 'phone', dbField: contacts.phone },
      { importKey: 'dateOfBirth', contactKey: 'dateOfBirth', dbField: contacts.dateOfBirth },
      { importKey: 'addressLine1', contactKey: 'addressLine1', dbField: contacts.addressLine1 },
      { importKey: 'addressLine2', contactKey: 'addressLine2', dbField: contacts.addressLine2 },
      { importKey: 'city', contactKey: 'city', dbField: contacts.city },
      { importKey: 'province', contactKey: 'province', dbField: contacts.province },
      { importKey: 'postalCode', contactKey: 'postalCode', dbField: contacts.postalCode },
      { importKey: 'country', contactKey: 'country', dbField: contacts.country },
      { importKey: 'passportNumber', contactKey: 'passportNumber', dbField: contacts.passportNumber },
      { importKey: 'passportExpiry', contactKey: 'passportExpiry', dbField: contacts.passportExpiry },
      { importKey: 'passportCountry', contactKey: 'passportCountry', dbField: contacts.passportCountry },
    ]

    for (const { importKey, contactKey } of fieldMap) {
      const importValue = row[importKey]?.trim()
      const existingValue = existing[contactKey]

      if (
        importValue &&
        (existingValue === null || existingValue === undefined || existingValue.toString().trim() === '')
      ) {
        // Use the Drizzle column name (dbField.name gives the actual column key for .set())
        fillPayload[importKey] = importValue
      }
    }

    // Claim ownership if currently agency-wide
    if (existing.ownerId === null) {
      fillPayload['ownerId'] = auth.userId
    }

    // Always update the timestamp
    fillPayload['updatedAt'] = new Date()

    if (Object.keys(fillPayload).length > 0) {
      await this.db.client
        .update(contacts)
        .set(fillPayload)
        .where(eq(contacts.id, existing.id))
    }
  }

  // ===========================================================================
  // TAG ASSIGNMENT
  // ===========================================================================

  /**
   * Find or create tags by name, then assign them to all imported contacts.
   */
  private async assignTags(
    contactIds: string[],
    tagNames: string[],
    auth: AuthContext,
  ): Promise<void> {
    const tagAuth = {
      agencyId: auth.agencyId,
      userId: auth.userId,
      role: auth.role,
    }

    for (const contactId of contactIds) {
      for (const tagName of tagNames) {
        try {
          await this.tagsService.createAndAssignToContact(contactId, { name: tagName }, tagAuth)
        } catch (err: any) {
          // Tag may already exist (ConflictException) — find it and assign directly
          if (err.status === 409 || err.message?.includes('already exists')) {
            try {
              await this.findAndAssignExistingTag(contactId, tagName, auth)
            } catch (innerErr: any) {
              this.logger.warn(
                `Failed to assign tag "${tagName}" to contact ${contactId}: ${innerErr.message}`,
              )
            }
          } else {
            this.logger.warn(
              `Failed to create/assign tag "${tagName}" to contact ${contactId}: ${err.message}`,
            )
          }
        }
      }
    }
  }

  /**
   * Find an existing tag by name and assign it to a contact.
   */
  private async findAndAssignExistingTag(
    contactId: string,
    tagName: string,
    auth: AuthContext,
  ): Promise<void> {
    const { tags, contactTags } = this.db.schema

    // Find the tag (system or own agent tag)
    const [existingTag] = await this.db.client
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.agencyId, auth.agencyId),
          sql`LOWER(${tags.name}) = LOWER(${tagName.trim()})`,
        ),
      )
      .limit(1)

    if (existingTag) {
      await this.db.client
        .insert(contactTags)
        .values({ contactId, tagId: existingTag.id })
        .onConflictDoNothing()
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private selectMatchFields() {
    const { contacts } = this.db.schema
    return {
      id: contacts.id,
      ownerId: contacts.ownerId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      dateOfBirth: contacts.dateOfBirth,
      addressLine1: contacts.addressLine1,
      addressLine2: contacts.addressLine2,
      city: contacts.city,
      province: contacts.province,
      postalCode: contacts.postalCode,
      country: contacts.country,
      passportNumber: contacts.passportNumber,
      passportExpiry: contacts.passportExpiry,
      passportCountry: contacts.passportCountry,
      updatedAt: contacts.updatedAt,
    }
  }

  /**
   * Find a contact by ID within the agency (for confirm-phase re-verification).
   */
  private async findContactById(
    contactId: string,
    agencyId: string,
  ): Promise<MatchedContact | null> {
    const { contacts } = this.db.schema

    const [match] = await this.db.client
      .select(this.selectMatchFields())
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.agencyId, agencyId),
          eq(contacts.isActive, true),
        ),
      )
      .limit(1)

    return match ?? null
  }

  /**
   * Look up the display name for a contact owner (user profile).
   */
  private async getOwnerName(ownerId: string | null): Promise<string | null> {
    if (!ownerId) return null

    const { userProfiles } = this.db.schema
    const [user] = await this.db.client
      .select({
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
        email: userProfiles.email,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, ownerId))
      .limit(1)

    if (!user) return null
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
    return name || user.email || ownerId
  }

  private formatContactName(contact: MatchedContact): string {
    const parts = [contact.firstName, contact.lastName].filter(Boolean)
    return parts.join(' ') || 'Unknown'
  }
}
