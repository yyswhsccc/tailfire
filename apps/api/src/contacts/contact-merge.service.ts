/**
 * Contact Merge Service
 *
 * Core engine for merging duplicate contacts. Runs all operations inside
 * a single database transaction to ensure atomicity. Handles 22+ tables
 * with FK references to contacts, including complex sub-merges for
 * trip_travelers, relationship canonicalization, and tag deduplication.
 *
 * Also provides duplicate detection using pg_trgm similarity() across
 * three tiers (email, phone+name, DOB+name) and dismissal tracking.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ContactAccessService } from './contact-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  ContactMergeRequest,
  ContactMergeResult,
  DuplicateDetectionResult,
  DuplicateGroup,
  DuplicateDismissRequest,
  ContactListItemDto,
} from '../../../../packages/shared-types/src/api'

// Fields on the contacts table that can be overridden during merge
const MERGEABLE_FIELDS = [
  'firstName',
  'lastName',
  'legalFirstName',
  'legalLastName',
  'middleName',
  'preferredName',
  'prefix',
  'suffix',
  'gender',
  'pronouns',
  'maritalStatus',
  'email',
  'phone',
  'dateOfBirth',
  'passportNumber',
  'passportExpiry',
  'passportCountry',
  'passportIssueDate',
  'nationality',
  'redressNumber',
  'knownTravelerNumber',
  'addressLine1',
  'addressLine2',
  'city',
  'province',
  'postalCode',
  'country',
  'dietaryRequirements',
  'mobilityRequirements',
  'seatPreference',
  'cabinPreference',
  'floorPreference',
  'travelPreferences',
  'timezone',
  'photoUrl',
  'photoStoragePath',
] as const

// Map from Drizzle TS property name to actual DB column name
const FIELD_TO_COLUMN: Record<string, string> = {
  firstName: 'first_name',
  lastName: 'last_name',
  legalFirstName: 'legal_first_name',
  legalLastName: 'legal_last_name',
  middleName: 'middle_name',
  preferredName: 'preferred_name',
  prefix: 'prefix',
  suffix: 'suffix',
  gender: 'gender',
  pronouns: 'pronouns',
  maritalStatus: 'marital_status',
  email: 'email',
  phone: 'phone',
  dateOfBirth: 'date_of_birth',
  passportNumber: 'passport_number',
  passportExpiry: 'passport_expiry',
  passportCountry: 'passport_country',
  passportIssueDate: 'passport_issue_date',
  nationality: 'nationality',
  redressNumber: 'redress_number',
  knownTravelerNumber: 'known_traveler_number',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  city: 'city',
  province: 'province',
  postalCode: 'postal_code',
  country: 'country',
  dietaryRequirements: 'dietary_requirements',
  mobilityRequirements: 'mobility_requirements',
  seatPreference: 'seat_preference',
  cabinPreference: 'cabin_preference',
  floorPreference: 'floor_preference',
  travelPreferences: 'travel_preferences',
  timezone: 'timezone',
  photoUrl: 'photo_url',
  photoStoragePath: 'photo_storage_path',
}

@Injectable()
export class ContactMergeService {
  private readonly logger = new Logger(ContactMergeService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly contactAccess: ContactAccessService,
  ) {}

  // ===========================================================================
  // MERGE
  // ===========================================================================

  /**
   * Merge secondaryId into primaryId. Everything runs in a single transaction.
   */
  async merge(
    req: ContactMergeRequest,
    auth: AuthContext,
  ): Promise<ContactMergeResult> {
    const { primaryId, secondaryId, fieldOverrides } = req

    if (primaryId === secondaryId) {
      throw new BadRequestException('Cannot merge a contact into itself')
    }

    const counts = {
      trips: 0,
      travelers: 0,
      relationships: 0,
      tags: 0,
      payments: 0,
      documents: 0,
      notes: 0,
      tasks: 0,
      other: 0,
    }

    await this.db.client.transaction(async (tx) => {
      // -----------------------------------------------------------------------
      // 1. Load both contacts — verify existence, active, same agency, not merged
      // -----------------------------------------------------------------------
      const [primary] = await tx.execute(sql`
        SELECT id, agency_id, owner_id, is_active, merged_into_contact_id,
               first_name, last_name, legal_first_name, legal_last_name,
               middle_name, preferred_name, prefix, suffix,
               gender, pronouns, marital_status,
               email, phone, date_of_birth,
               passport_number, passport_expiry, passport_country,
               passport_issue_date, nationality,
               redress_number, known_traveler_number,
               address_line1, address_line2, city, province, postal_code, country,
               dietary_requirements, mobility_requirements,
               seat_preference, cabin_preference, floor_preference,
               travel_preferences, timezone, photo_url, photo_storage_path
        FROM contacts WHERE id = ${primaryId}
        FOR UPDATE
      `)

      const [secondary] = await tx.execute(sql`
        SELECT id, agency_id, owner_id, is_active, merged_into_contact_id,
               first_name, last_name, legal_first_name, legal_last_name,
               middle_name, preferred_name, prefix, suffix,
               gender, pronouns, marital_status,
               email, phone, date_of_birth,
               passport_number, passport_expiry, passport_country,
               passport_issue_date, nationality,
               redress_number, known_traveler_number,
               address_line1, address_line2, city, province, postal_code, country,
               dietary_requirements, mobility_requirements,
               seat_preference, cabin_preference, floor_preference,
               travel_preferences, timezone, photo_url, photo_storage_path
        FROM contacts WHERE id = ${secondaryId}
        FOR UPDATE
      `)

      if (!primary) throw new NotFoundException(`Primary contact ${primaryId} not found`)
      if (!secondary) throw new NotFoundException(`Secondary contact ${secondaryId} not found`)

      if (!primary.is_active) throw new BadRequestException('Primary contact is inactive')
      if (!secondary.is_active) throw new BadRequestException('Secondary contact is inactive')

      if (primary.merged_into_contact_id) {
        throw new BadRequestException('Primary contact has already been merged into another contact')
      }
      if (secondary.merged_into_contact_id) {
        throw new BadRequestException('Secondary contact has already been merged into another contact')
      }

      if (primary.agency_id !== secondary.agency_id) {
        throw new BadRequestException('Contacts belong to different agencies')
      }

      // Verify the agency matches the auth context
      if (primary.agency_id !== auth.agencyId) {
        throw new ForbiddenException('Contacts do not belong to your agency')
      }

      // -----------------------------------------------------------------------
      // 2. Verify ownership / access
      // -----------------------------------------------------------------------
      if (auth.role !== 'admin') {
        const canUsePrimary = await this.contactAccess.canUseContact(primaryId, auth)
        const canUseSecondary = await this.contactAccess.canUseContact(secondaryId, auth)
        if (!canUsePrimary || !canUseSecondary) {
          throw new ForbiddenException('You do not have access to both contacts')
        }
      }

      // -----------------------------------------------------------------------
      // 3. Build merged field values from fieldOverrides
      // -----------------------------------------------------------------------
      const setClauses: string[] = []
      for (const [field, source] of Object.entries(fieldOverrides)) {
        const col = FIELD_TO_COLUMN[field]
        if (!col) {
          this.logger.warn(`Unknown merge field: ${field} — skipping`)
          continue
        }
        if (source === 'secondary') {
          // Take the value from the secondary contact
          const val = secondary[col]
          // Build a SET clause — we handle this via parameterized update below
          setClauses.push(field)
        }
        // If source === 'primary', no action needed — primary keeps its value
      }

      // -----------------------------------------------------------------------
      // 4. Update primary contact with merged fields
      // -----------------------------------------------------------------------
      // Build dynamic SET clause from secondary's values
      if (setClauses.length > 0) {
        // For each override field that picks secondary, copy the value
        const updateParts = setClauses.map((field) => {
          const col = FIELD_TO_COLUMN[field]
          const val = secondary[col]
          if (val === null || val === undefined) {
            return sql.raw(`${col} = NULL`)
          }
          // Use parameterized value for safety
          return sql`${sql.raw(col)} = ${typeof val === 'object' ? JSON.stringify(val) : val}`
        })

        // Also update the updated_at timestamp
        await tx.execute(sql`
          UPDATE contacts
          SET ${sql.join(updateParts, sql.raw(', '))},
              updated_at = NOW()
          WHERE id = ${primaryId}
        `)
      }

      // If primary has no owner, assign to the merging user
      if (primary.owner_id === null) {
        await tx.execute(sql`
          UPDATE contacts SET owner_id = ${auth.userId} WHERE id = ${primaryId} AND owner_id IS NULL
        `)
      }

      // -----------------------------------------------------------------------
      // 5. Re-point all tables
      // -----------------------------------------------------------------------

      // --- A. Simple re-points ---
      const simpleRepoints: Array<{ table: string; column: string; countKey: keyof typeof counts }> = [
        { table: 'notes', column: 'contact_id', countKey: 'notes' },
        { table: 'tasks', column: 'contact_id', countKey: 'tasks' },
        { table: 'tasks', column: 'assignee_contact_id', countKey: 'tasks' },
        { table: 'email_logs', column: 'contact_id', countKey: 'other' },
        { table: 'calendar_events', column: 'contact_id', countKey: 'other' },
        { table: 'contact_documents', column: 'contact_id', countKey: 'documents' },
        { table: 'proposal_comments', column: 'contact_id', countKey: 'other' },
        { table: 'planning_sessions', column: 'contact_id', countKey: 'other' },
        { table: 'client_activity_responses', column: 'contact_id', countKey: 'other' },
        { table: 'itinerary_feedback', column: 'contact_id', countKey: 'other' },
        { table: 'ota_trip_requests', column: 'contact_id', countKey: 'other' },
        { table: 'ota_referrals', column: 'converted_to_contact_id', countKey: 'other' },
        { table: 'expected_payment_items', column: 'contact_id', countKey: 'payments' },
        { table: 'payment_transactions', column: 'contact_id', countKey: 'payments' },
        { table: 'contact_share_requests', column: 'contact_id', countKey: 'other' },
        { table: 'task_notification_pending', column: 'contact_id', countKey: 'other' },
      ]

      for (const { table, column, countKey } of simpleRepoints) {
        const result = await tx.execute(sql`
          UPDATE ${sql.raw(table)}
          SET ${sql.raw(column)} = ${primaryId}
          WHERE ${sql.raw(column)} = ${secondaryId}
        `)
        const affected = (result as any)?.rowCount ?? (result as any)?.count ?? 0
        counts[countKey] += affected
      }

      // --- B. trips.primary_contact_id ---
      {
        const result = await tx.execute(sql`
          UPDATE trips
          SET primary_contact_id = ${primaryId}
          WHERE primary_contact_id = ${secondaryId}
        `)
        counts.trips += (result as any)?.rowCount ?? (result as any)?.count ?? 0
      }

      // --- C. trip_travelers (complex sub-merge) ---
      await this.mergeTripTravelers(tx, primaryId, secondaryId, counts)

      // --- D. contact_relationships (canonicalize) ---
      await this.mergeContactRelationships(tx, primaryId, secondaryId, counts)

      // --- E. contact_tags (merge additively) ---
      await this.mergeContactTags(tx, primaryId, secondaryId, counts)

      // --- F. contact_group_members ---
      await this.mergeContactGroupMembers(tx, primaryId, secondaryId, counts)

      // --- G. contact_shares ---
      await this.mergeContactShares(tx, primaryId, secondaryId, counts)

      // --- H. contact_loyalty_programs ---
      await this.mergeContactLoyaltyPrograms(tx, primaryId, secondaryId, counts)

      // --- I. contact_stripe_customers ---
      await this.mergeContactStripeCustomers(tx, primaryId, secondaryId, counts)

      // --- J. client_portal_users ---
      await this.mergeClientPortalUsers(tx, primaryId, secondaryId, counts)

      // -----------------------------------------------------------------------
      // 6. Soft-delete secondary
      // -----------------------------------------------------------------------
      await tx.execute(sql`
        UPDATE contacts
        SET is_active = false,
            merged_into_contact_id = ${primaryId},
            merged_at = NOW(),
            merged_by = ${auth.userId},
            updated_at = NOW()
        WHERE id = ${secondaryId}
      `)
    })

    this.logger.log(
      `Merged contact ${secondaryId} into ${primaryId} by user ${auth.userId}. ` +
      `Counts: trips=${counts.trips}, travelers=${counts.travelers}, ` +
      `relationships=${counts.relationships}, tags=${counts.tags}, ` +
      `payments=${counts.payments}, documents=${counts.documents}, ` +
      `notes=${counts.notes}, tasks=${counts.tasks}, other=${counts.other}`,
    )

    return {
      success: true,
      mergedContactId: primaryId,
      repointed: counts,
    }
  }

  // ===========================================================================
  // PRIVATE: Sub-merge helpers (all receive the transaction handle)
  // ===========================================================================

  /**
   * C. trip_travelers — handles overlapping travelers on the same trip.
   *
   * If secondary is a traveler on a trip where primary is NOT, just re-point.
   * If BOTH are travelers on the same trip, keep primary's row, re-point
   * child records (activity_travelers, traveler_bookings) from secondary's
   * traveler row to primary's, then delete secondary's traveler row.
   * Also re-points emergency_contact_id references.
   */
  private async mergeTripTravelers(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    // Find trips where BOTH contacts are travelers (conflict case)
    const conflictTrips = await tx.execute(sql`
      SELECT
        p.id AS primary_traveler_id,
        p.trip_id,
        p.role AS primary_role,
        s.id AS secondary_traveler_id,
        s.role AS secondary_role
      FROM trip_travelers p
      JOIN trip_travelers s ON s.trip_id = p.trip_id
      WHERE p.contact_id = ${primaryId}
        AND s.contact_id = ${secondaryId}
    `)

    for (const conflict of conflictTrips) {
      const primaryTravelerId = conflict.primary_traveler_id
      const secondaryTravelerId = conflict.secondary_traveler_id

      // Re-point child records from secondary's traveler row to primary's
      await tx.execute(sql`
        UPDATE activity_travelers
        SET trip_traveler_id = ${primaryTravelerId}
        WHERE trip_traveler_id = ${secondaryTravelerId}
          AND NOT EXISTS (
            SELECT 1 FROM activity_travelers
            WHERE trip_traveler_id = ${primaryTravelerId}
              AND activity_id = activity_travelers.activity_id
          )
      `)

      // Delete duplicate activity_travelers that would violate unique constraint
      await tx.execute(sql`
        DELETE FROM activity_travelers
        WHERE trip_traveler_id = ${secondaryTravelerId}
      `)

      await tx.execute(sql`
        UPDATE traveler_bookings
        SET trip_traveler_id = ${primaryTravelerId}
        WHERE trip_traveler_id = ${secondaryTravelerId}
          AND NOT EXISTS (
            SELECT 1 FROM traveler_bookings
            WHERE trip_traveler_id = ${primaryTravelerId}
              AND activity_id = traveler_bookings.activity_id
          )
      `)

      // Delete remaining duplicates
      await tx.execute(sql`
        DELETE FROM traveler_bookings
        WHERE trip_traveler_id = ${secondaryTravelerId}
      `)

      // If secondary had primary_contact role and primary didn't, upgrade primary's role
      if (
        conflict.secondary_role === 'primary_contact' &&
        conflict.primary_role !== 'primary_contact'
      ) {
        await tx.execute(sql`
          UPDATE trip_travelers
          SET role = 'primary_contact'
          WHERE id = ${primaryTravelerId}
        `)
      }

      // Delete the secondary's traveler row (children already moved)
      await tx.execute(sql`
        DELETE FROM trip_travelers WHERE id = ${secondaryTravelerId}
      `)

      counts.travelers += 1
    }

    // Non-conflict case: re-point remaining secondary traveler rows
    {
      const result = await tx.execute(sql`
        UPDATE trip_travelers
        SET contact_id = ${primaryId}
        WHERE contact_id = ${secondaryId}
      `)
      counts.travelers += (result as any)?.rowCount ?? (result as any)?.count ?? 0
    }

    // Re-point emergency_contact_id references
    await tx.execute(sql`
      UPDATE trip_travelers
      SET emergency_contact_id = ${primaryId}
      WHERE emergency_contact_id = ${secondaryId}
    `)
  }

  /**
   * D. contact_relationships — canonicalize after re-point.
   *
   * The bidirectional unique index uses LEAST/GREATEST, so we need to:
   * 1. Delete relationships that would create duplicates after re-point
   * 2. Delete self-links (contact_id1 = contact_id2) created by merge
   * 3. Re-point remaining rows
   */
  private async mergeContactRelationships(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    // First, delete relationships involving secondaryId that would conflict
    // with existing relationships after re-pointing to primaryId
    await tx.execute(sql`
      DELETE FROM contact_relationships
      WHERE id IN (
        SELECT cr.id FROM contact_relationships cr
        WHERE (cr.contact_id1 = ${secondaryId} OR cr.contact_id2 = ${secondaryId})
        AND EXISTS (
          SELECT 1 FROM contact_relationships cr2
          WHERE cr2.id != cr.id
          AND LEAST(cr2.contact_id1, cr2.contact_id2) = LEAST(
            CASE WHEN cr.contact_id1 = ${secondaryId} THEN ${primaryId} ELSE cr.contact_id1 END,
            CASE WHEN cr.contact_id2 = ${secondaryId} THEN ${primaryId} ELSE cr.contact_id2 END
          )
          AND GREATEST(cr2.contact_id1, cr2.contact_id2) = GREATEST(
            CASE WHEN cr.contact_id1 = ${secondaryId} THEN ${primaryId} ELSE cr.contact_id1 END,
            CASE WHEN cr.contact_id2 = ${secondaryId} THEN ${primaryId} ELSE cr.contact_id2 END
          )
        )
      )
    `)

    // Delete any relationships that would become self-links after re-point
    // (i.e., secondary had a direct relationship with primary)
    await tx.execute(sql`
      DELETE FROM contact_relationships
      WHERE (contact_id1 = ${secondaryId} AND contact_id2 = ${primaryId})
         OR (contact_id1 = ${primaryId} AND contact_id2 = ${secondaryId})
    `)

    // Re-point remaining relationships
    {
      const r1 = await tx.execute(sql`
        UPDATE contact_relationships
        SET contact_id1 = ${primaryId}
        WHERE contact_id1 = ${secondaryId}
      `)
      const r2 = await tx.execute(sql`
        UPDATE contact_relationships
        SET contact_id2 = ${primaryId}
        WHERE contact_id2 = ${secondaryId}
      `)
      counts.relationships +=
        ((r1 as any)?.rowCount ?? (r1 as any)?.count ?? 0) +
        ((r2 as any)?.rowCount ?? (r2 as any)?.count ?? 0)
    }
  }

  /**
   * E. contact_tags — merge additively.
   * Re-point tags the primary doesn't have; delete duplicates.
   */
  private async mergeContactTags(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    // Re-point tags that primary doesn't already have
    const result = await tx.execute(sql`
      UPDATE contact_tags
      SET contact_id = ${primaryId}
      WHERE contact_id = ${secondaryId}
        AND tag_id NOT IN (
          SELECT tag_id FROM contact_tags WHERE contact_id = ${primaryId}
        )
    `)
    counts.tags += (result as any)?.rowCount ?? (result as any)?.count ?? 0

    // Delete remaining duplicate tags on secondary
    await tx.execute(sql`
      DELETE FROM contact_tags WHERE contact_id = ${secondaryId}
    `)
  }

  /**
   * F. contact_group_members — re-point, skip if primary already in group.
   */
  private async mergeContactGroupMembers(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    const result = await tx.execute(sql`
      UPDATE contact_group_members
      SET contact_id = ${primaryId}
      WHERE contact_id = ${secondaryId}
        AND group_id NOT IN (
          SELECT group_id FROM contact_group_members WHERE contact_id = ${primaryId}
        )
    `)
    counts.other += (result as any)?.rowCount ?? (result as any)?.count ?? 0

    // Delete remaining duplicates
    await tx.execute(sql`
      DELETE FROM contact_group_members WHERE contact_id = ${secondaryId}
    `)

    // Also update contact_groups.primary_contact_id
    await tx.execute(sql`
      UPDATE contact_groups
      SET primary_contact_id = ${primaryId}
      WHERE primary_contact_id = ${secondaryId}
    `)
  }

  /**
   * G. contact_shares — re-point, skip duplicates (same shared_with_user_id).
   */
  private async mergeContactShares(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    const result = await tx.execute(sql`
      UPDATE contact_shares
      SET contact_id = ${primaryId}
      WHERE contact_id = ${secondaryId}
        AND shared_with_user_id NOT IN (
          SELECT shared_with_user_id FROM contact_shares WHERE contact_id = ${primaryId}
        )
    `)
    counts.other += (result as any)?.rowCount ?? (result as any)?.count ?? 0

    // Delete remaining duplicates
    await tx.execute(sql`
      DELETE FROM contact_shares WHERE contact_id = ${secondaryId}
    `)
  }

  /**
   * H. contact_loyalty_programs — re-point, skip if primary already has same program.
   * Uniqueness is on (contact_id, provider_name, membership_number).
   */
  private async mergeContactLoyaltyPrograms(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    const result = await tx.execute(sql`
      UPDATE contact_loyalty_programs
      SET contact_id = ${primaryId}
      WHERE contact_id = ${secondaryId}
        AND NOT EXISTS (
          SELECT 1 FROM contact_loyalty_programs clp2
          WHERE clp2.contact_id = ${primaryId}
            AND clp2.provider_name = contact_loyalty_programs.provider_name
            AND clp2.membership_number = contact_loyalty_programs.membership_number
        )
    `)
    counts.other += (result as any)?.rowCount ?? (result as any)?.count ?? 0

    // Delete remaining duplicates
    await tx.execute(sql`
      DELETE FROM contact_loyalty_programs WHERE contact_id = ${secondaryId}
    `)
  }

  /**
   * I. contact_stripe_customers — transfer if primary doesn't have one for the
   * same stripe_account_id; otherwise keep primary's, delete secondary's.
   */
  private async mergeContactStripeCustomers(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    const result = await tx.execute(sql`
      UPDATE contact_stripe_customers
      SET contact_id = ${primaryId}
      WHERE contact_id = ${secondaryId}
        AND stripe_account_id NOT IN (
          SELECT stripe_account_id FROM contact_stripe_customers
          WHERE contact_id = ${primaryId}
        )
    `)
    counts.other += (result as any)?.rowCount ?? (result as any)?.count ?? 0

    // Delete duplicates (same connected account)
    await tx.execute(sql`
      DELETE FROM contact_stripe_customers WHERE contact_id = ${secondaryId}
    `)
  }

  /**
   * J. client_portal_users — if primary doesn't have a portal user, transfer.
   * Otherwise deactivate secondary's portal user.
   */
  private async mergeClientPortalUsers(
    tx: any,
    primaryId: string,
    secondaryId: string,
    counts: ContactMergeResult['repointed'],
  ): Promise<void> {
    // Check if primary already has a portal user
    const [primaryPortal] = await tx.execute(sql`
      SELECT id FROM client_portal_users WHERE contact_id = ${primaryId} LIMIT 1
    `)

    if (!primaryPortal) {
      // Transfer secondary's portal user to primary
      const result = await tx.execute(sql`
        UPDATE client_portal_users
        SET contact_id = ${primaryId}
        WHERE contact_id = ${secondaryId}
      `)
      counts.other += (result as any)?.rowCount ?? (result as any)?.count ?? 0
    } else {
      // Deactivate secondary's portal user
      await tx.execute(sql`
        UPDATE client_portal_users
        SET status = 'disabled'
        WHERE contact_id = ${secondaryId}
      `)
    }
  }

  // ===========================================================================
  // DUPLICATE DETECTION
  // ===========================================================================

  /**
   * Detect potential duplicate contacts using three tiers:
   * 1. Exact email match (high confidence)
   * 2. Phone + similar name (high confidence)
   * 3. Same DOB + similar name (medium confidence)
   *
   * Requires pg_trgm extension for similarity().
   * Filters out previously dismissed pairs.
   */
  async detectDuplicates(auth: AuthContext): Promise<DuplicateDetectionResult> {
    const groups: DuplicateGroup[] = []

    // Tier 1: Exact email match
    const emailMatches = await this.db.client.execute(sql`
      SELECT
        c1.id AS id1, c2.id AS id2,
        c1.first_name AS fn1, c1.last_name AS ln1, c1.email AS email1,
        c1.phone AS phone1, c1.date_of_birth AS dob1, c1.owner_id AS owner1,
        c1.agency_id AS agency1, c1.contact_type AS type1, c1.contact_status AS status1,
        c1.photo_url AS photo1, c1.created_at AS created1,
        c2.first_name AS fn2, c2.last_name AS ln2, c2.email AS email2,
        c2.phone AS phone2, c2.date_of_birth AS dob2, c2.owner_id AS owner2,
        c2.agency_id AS agency2, c2.contact_type AS type2, c2.contact_status AS status2,
        c2.photo_url AS photo2, c2.created_at AS created2
      FROM contacts c1
      JOIN contacts c2
        ON LOWER(c1.email) = LOWER(c2.email)
        AND c1.id < c2.id
      WHERE c1.agency_id = ${auth.agencyId}
        AND c2.agency_id = ${auth.agencyId}
        AND c1.is_active = true
        AND c2.is_active = true
        AND c1.merged_into_contact_id IS NULL
        AND c2.merged_into_contact_id IS NULL
        AND c1.email IS NOT NULL
        AND c1.email != ''
        AND NOT EXISTS (
          SELECT 1 FROM contact_duplicate_dismissals d
          WHERE d.agency_id = ${auth.agencyId}
            AND LEAST(d.contact_id1, d.contact_id2) = LEAST(c1.id, c2.id)
            AND GREATEST(d.contact_id1, d.contact_id2) = GREATEST(c1.id, c2.id)
            AND d.match_type = 'email'
        )
      ORDER BY c1.last_name, c1.first_name
      LIMIT 50
    `)

    for (const row of emailMatches) {
      groups.push({
        matchType: 'email',
        confidence: 'high',
        contacts: [
          this.rowToListItem(row, '1'),
          this.rowToListItem(row, '2'),
        ],
      })
    }

    // Tier 2: Same phone + similar name (pg_trgm similarity >= 0.4)
    const phoneNameMatches = await this.db.client.execute(sql`
      SELECT
        c1.id AS id1, c2.id AS id2,
        c1.first_name AS fn1, c1.last_name AS ln1, c1.email AS email1,
        c1.phone AS phone1, c1.date_of_birth AS dob1, c1.owner_id AS owner1,
        c1.agency_id AS agency1, c1.contact_type AS type1, c1.contact_status AS status1,
        c1.photo_url AS photo1, c1.created_at AS created1,
        c2.first_name AS fn2, c2.last_name AS ln2, c2.email AS email2,
        c2.phone AS phone2, c2.date_of_birth AS dob2, c2.owner_id AS owner2,
        c2.agency_id AS agency2, c2.contact_type AS type2, c2.contact_status AS status2,
        c2.photo_url AS photo2, c2.created_at AS created2,
        similarity(
          COALESCE(c1.first_name, '') || ' ' || COALESCE(c1.last_name, ''),
          COALESCE(c2.first_name, '') || ' ' || COALESCE(c2.last_name, '')
        ) AS name_sim
      FROM contacts c1
      JOIN contacts c2
        ON c1.phone = c2.phone
        AND c1.id < c2.id
      WHERE c1.agency_id = ${auth.agencyId}
        AND c2.agency_id = ${auth.agencyId}
        AND c1.is_active = true
        AND c2.is_active = true
        AND c1.merged_into_contact_id IS NULL
        AND c2.merged_into_contact_id IS NULL
        AND c1.phone IS NOT NULL
        AND c1.phone != ''
        AND similarity(
          COALESCE(c1.first_name, '') || ' ' || COALESCE(c1.last_name, ''),
          COALESCE(c2.first_name, '') || ' ' || COALESCE(c2.last_name, '')
        ) >= 0.4
        AND NOT EXISTS (
          SELECT 1 FROM contact_duplicate_dismissals d
          WHERE d.agency_id = ${auth.agencyId}
            AND LEAST(d.contact_id1, d.contact_id2) = LEAST(c1.id, c2.id)
            AND GREATEST(d.contact_id1, d.contact_id2) = GREATEST(c1.id, c2.id)
            AND d.match_type = 'phone_name'
        )
        -- Exclude pairs already matched by email tier
        AND NOT (
          c1.email IS NOT NULL AND c1.email != ''
          AND LOWER(c1.email) = LOWER(c2.email)
        )
      ORDER BY name_sim DESC
      LIMIT 50
    `)

    for (const row of phoneNameMatches) {
      groups.push({
        matchType: 'phone_name',
        confidence: 'high',
        contacts: [
          this.rowToListItem(row, '1'),
          this.rowToListItem(row, '2'),
        ],
      })
    }

    // Tier 3: Same DOB + similar name (medium confidence)
    const dobNameMatches = await this.db.client.execute(sql`
      SELECT
        c1.id AS id1, c2.id AS id2,
        c1.first_name AS fn1, c1.last_name AS ln1, c1.email AS email1,
        c1.phone AS phone1, c1.date_of_birth AS dob1, c1.owner_id AS owner1,
        c1.agency_id AS agency1, c1.contact_type AS type1, c1.contact_status AS status1,
        c1.photo_url AS photo1, c1.created_at AS created1,
        c2.first_name AS fn2, c2.last_name AS ln2, c2.email AS email2,
        c2.phone AS phone2, c2.date_of_birth AS dob2, c2.owner_id AS owner2,
        c2.agency_id AS agency2, c2.contact_type AS type2, c2.contact_status AS status2,
        c2.photo_url AS photo2, c2.created_at AS created2,
        similarity(
          COALESCE(c1.first_name, '') || ' ' || COALESCE(c1.last_name, ''),
          COALESCE(c2.first_name, '') || ' ' || COALESCE(c2.last_name, '')
        ) AS name_sim
      FROM contacts c1
      JOIN contacts c2
        ON c1.date_of_birth = c2.date_of_birth
        AND c1.id < c2.id
      WHERE c1.agency_id = ${auth.agencyId}
        AND c2.agency_id = ${auth.agencyId}
        AND c1.is_active = true
        AND c2.is_active = true
        AND c1.merged_into_contact_id IS NULL
        AND c2.merged_into_contact_id IS NULL
        AND c1.date_of_birth IS NOT NULL
        AND similarity(
          COALESCE(c1.first_name, '') || ' ' || COALESCE(c1.last_name, ''),
          COALESCE(c2.first_name, '') || ' ' || COALESCE(c2.last_name, '')
        ) >= 0.4
        AND NOT EXISTS (
          SELECT 1 FROM contact_duplicate_dismissals d
          WHERE d.agency_id = ${auth.agencyId}
            AND LEAST(d.contact_id1, d.contact_id2) = LEAST(c1.id, c2.id)
            AND GREATEST(d.contact_id1, d.contact_id2) = GREATEST(c1.id, c2.id)
            AND d.match_type = 'dob_name'
        )
        -- Exclude pairs already matched by higher tiers
        AND NOT (
          c1.email IS NOT NULL AND c1.email != ''
          AND LOWER(c1.email) = LOWER(c2.email)
        )
        AND NOT (
          c1.phone IS NOT NULL AND c1.phone != ''
          AND c1.phone = c2.phone
        )
      ORDER BY name_sim DESC
      LIMIT 50
    `)

    for (const row of dobNameMatches) {
      groups.push({
        matchType: 'dob_name',
        confidence: 'medium',
        contacts: [
          this.rowToListItem(row, '1'),
          this.rowToListItem(row, '2'),
        ],
      })
    }

    return {
      groups,
      totalGroups: groups.length,
    }
  }

  // ===========================================================================
  // DISMISS DUPLICATE
  // ===========================================================================

  /**
   * Record that an agent has dismissed a suggested duplicate pair,
   * preventing it from surfacing again.
   */
  async dismissDuplicate(
    req: DuplicateDismissRequest,
    auth: AuthContext,
  ): Promise<void> {
    const { contactId1, contactId2, matchType } = req

    if (contactId1 === contactId2) {
      throw new BadRequestException('Cannot dismiss a contact paired with itself')
    }

    // Canonicalize ordering so dismissals are consistent regardless of input order
    const [canonId1, canonId2] =
      contactId1 < contactId2 ? [contactId1, contactId2] : [contactId2, contactId1]

    // Check if already dismissed
    const [existing] = await this.db.client.execute(sql`
      SELECT id FROM contact_duplicate_dismissals
      WHERE agency_id = ${auth.agencyId}
        AND LEAST(contact_id1, contact_id2) = ${canonId1}
        AND GREATEST(contact_id1, contact_id2) = ${canonId2}
        AND match_type = ${matchType}
      LIMIT 1
    `)

    if (existing) {
      return // Already dismissed, idempotent
    }

    await this.db.client.execute(sql`
      INSERT INTO contact_duplicate_dismissals
        (agency_id, contact_id1, contact_id2, match_type, dismissed_by)
      VALUES
        (${auth.agencyId}, ${canonId1}, ${canonId2}, ${matchType}, ${auth.userId})
    `)
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Convert a raw SQL duplicate-detection row into a ContactListItemDto.
   * The suffix ('1' or '2') selects which contact's fields to extract.
   */
  private rowToListItem(
    row: any,
    suffix: '1' | '2',
  ): ContactListItemDto {
    const id = row[`id${suffix}`]
    const firstName = row[`fn${suffix}`]
    const lastName = row[`ln${suffix}`]
    const email = row[`email${suffix}`]
    const phone = row[`phone${suffix}`]
    const dob = row[`dob${suffix}`]
    const ownerId = row[`owner${suffix}`]
    const agencyId = row[`agency${suffix}`]
    const contactType = row[`type${suffix}`]
    const contactStatus = row[`status${suffix}`]
    const photoUrl = row[`photo${suffix}`]
    const createdAt = row[`created${suffix}`]

    const displayName = firstName
      ? `${firstName}${lastName ? ' ' + lastName : ''}`
      : lastName ?? 'Unknown'

    const legalFullName = firstName && lastName ? `${firstName} ${lastName}` : null

    // Return a minimal but valid ContactListItemDto
    // Many fields will be null — this is intentional for the duplicate detection view
    return {
      id,
      agencyId,
      ownerId,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      legalFirstName: null,
      legalLastName: null,
      middleName: null,
      preferredName: null,
      prefix: null,
      suffix: null,
      displayName,
      legalFullName,
      gender: null,
      pronouns: null,
      maritalStatus: null,
      email: email ?? null,
      phone: phone ?? null,
      dateOfBirth: dob ?? null,
      passportNumber: null,
      passportExpiry: null,
      passportCountry: null,
      passportIssueDate: null,
      nationality: null,
      redressNumber: null,
      knownTravelerNumber: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      country: null,
      dietaryRequirements: null,
      mobilityRequirements: null,
      seatPreference: null,
      cabinPreference: null,
      floorPreference: null,
      travelPreferences: null,
      contactType: contactType ?? 'lead',
      contactStatus: contactStatus ?? 'prospecting',
      becameClientAt: null,
      firstBookingDate: null,
      lastTripReturnDate: null,
      marketingEmailOptIn: false,
      marketingEmailOptInAt: null,
      marketingSmsOptIn: false,
      marketingSmsOptInAt: null,
      marketingPhoneOptIn: false,
      marketingPhoneOptInAt: null,
      marketingOptInSource: null,
      marketingOptOutAt: null,
      marketingOptOutReason: null,
      trustBalanceCad: null,
      trustBalanceUsd: null,
      tags: [],
      isActive: true,
      timezone: null,
      portalUserId: null,
      portalStatus: 'not_invited' as const,
      portalInvitedAt: null,
      photoUrl: photoUrl ?? null,
      createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
      updatedAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
    } as ContactListItemDto
  }
}
