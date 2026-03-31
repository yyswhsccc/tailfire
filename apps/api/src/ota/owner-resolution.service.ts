/**
 * Owner Resolution Service
 *
 * Resolves who should own an OTA trip request through a two-layer
 * attribution chain:
 *
 * Layer 1 — Contact Attribution:
 *   1. Existing CRM contact with assigned agent → CRM ownership wins
 *   2. advisorSlug provided → referral attribution
 *
 * Layer 2 — Group Override:
 *   3. tripGroupId provided (no CRM owner) → inherit group trip's owner
 *
 * Fallback:
 *   4. Unassigned — no attribution available
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

// ============================================================================
// Types
// ============================================================================

export interface OwnerResolution {
  ownerId: string | null
  agencyId: string
  attribution: 'crm_existing' | 'referral' | 'group' | 'unassigned'
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class OwnerResolutionService {
  private readonly logger = new Logger(OwnerResolutionService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Resolve the owner and agency for an OTA trip request.
   *
   * Priority:
   * 1. Existing contact with ownerId → crm_existing
   * 2. advisorSlug → referral
   * 3. tripGroupId → group (inherits group trip owner)
   * 4. Fallback → unassigned
   */
  async resolve(params: {
    contactEmail: string
    advisorSlug?: string | null
    tripGroupId?: string | null
  }): Promise<OwnerResolution> {
    const { contacts, advisorProfiles, trips } = this.db.schema

    // -----------------------------------------------------------------
    // Step 1: Look up contact by email
    // -----------------------------------------------------------------
    const [existingContact] = await this.db.client
      .select({
        id: contacts.id,
        ownerId: contacts.ownerId,
        agencyId: contacts.agencyId,
      })
      .from(contacts)
      .where(eq(contacts.email, params.contactEmail))
      .limit(1)

    // -----------------------------------------------------------------
    // Step 2: If contact exists with ownerId → CRM ownership wins
    // -----------------------------------------------------------------
    if (existingContact?.ownerId) {
      this.logger.log(
        `Owner resolution [${params.contactEmail}]: crm_existing ` +
          `(contact owner=${existingContact.ownerId}, agency=${existingContact.agencyId})`,
      )
      return {
        ownerId: existingContact.ownerId,
        agencyId: existingContact.agencyId!,
        attribution: 'crm_existing',
      }
    }

    // -----------------------------------------------------------------
    // Step 3: If advisorSlug provided → referral attribution
    // -----------------------------------------------------------------
    if (params.advisorSlug) {
      const [advisor] = await this.db.client
        .select({
          userId: advisorProfiles.userId,
          agencyId: advisorProfiles.agencyId,
        })
        .from(advisorProfiles)
        .where(eq(advisorProfiles.slug, params.advisorSlug))
        .limit(1)

      if (advisor) {
        this.logger.log(
          `Owner resolution [${params.contactEmail}]: referral ` +
            `(advisor=${advisor.userId}, agency=${advisor.agencyId}, slug=${params.advisorSlug})`,
        )
        return {
          ownerId: advisor.userId,
          agencyId: advisor.agencyId,
          attribution: 'referral',
        }
      }

      this.logger.warn(
        `Owner resolution [${params.contactEmail}]: advisorSlug "${params.advisorSlug}" not found, continuing`,
      )
    }

    // -----------------------------------------------------------------
    // Step 4 (Layer 2): If tripGroupId provided → inherit group trip owner
    // -----------------------------------------------------------------
    if (params.tripGroupId) {
      const [groupTrip] = await this.db.client
        .select({
          ownerId: trips.ownerId,
          agencyId: trips.agencyId,
        })
        .from(trips)
        .where(eq(trips.id, params.tripGroupId))
        .limit(1)

      if (groupTrip?.ownerId) {
        this.logger.log(
          `Owner resolution [${params.contactEmail}]: group ` +
            `(tripGroup=${params.tripGroupId}, owner=${groupTrip.ownerId}, agency=${groupTrip.agencyId})`,
        )
        return {
          ownerId: groupTrip.ownerId,
          agencyId: groupTrip.agencyId,
          attribution: 'group',
        }
      }

      this.logger.warn(
        `Owner resolution [${params.contactEmail}]: tripGroupId "${params.tripGroupId}" ` +
          `not found or has no owner, continuing`,
      )
    }

    // -----------------------------------------------------------------
    // Step 5 (Fallback): Unassigned — use existing contact's agency or default
    // -----------------------------------------------------------------
    const fallbackAgencyId =
      existingContact?.agencyId ?? (await this.getDefaultAgencyId())

    this.logger.log(
      `Owner resolution [${params.contactEmail}]: unassigned (agency=${fallbackAgencyId})`,
    )

    return {
      ownerId: null,
      agencyId: fallbackAgencyId,
      attribution: 'unassigned',
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Get the default agency ID as a last-resort fallback.
   * In a single-agency setup this returns the only agency.
   */
  private async getDefaultAgencyId(): Promise<string> {
    const { agencies } = this.db.schema

    const [defaultAgency] = await this.db.client
      .select({ id: agencies.id })
      .from(agencies)
      .limit(1)

    if (!defaultAgency) {
      throw new Error('No agencies found in database — cannot resolve default agency')
    }

    return defaultAgency.id
  }
}
