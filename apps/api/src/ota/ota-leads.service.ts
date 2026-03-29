/**
 * OTA Leads Service
 *
 * Handles lead capture from the OTA consumer portal with attribution
 * priority chain:
 *
 * 1. CRM ownership — existing contact with assigned agent wins
 * 2. Referral attribution — advisorSlug from referral cookie
 * 3. Unassigned — no attribution available (round-robin later)
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { CreateLeadDto } from './dto/create-lead.dto'
import type { CreateFlightRequestDto } from './dto/create-flight-request.dto'
import type { schema } from '@tailfire/database'

type Contact = typeof schema.contacts.$inferSelect
type AdvisorProfile = typeof schema.advisorProfiles.$inferSelect

export type Attribution = 'crm_existing' | 'referral' | 'round_robin' | 'unassigned'

export interface LeadCaptureResult {
  contact: Contact
  attribution: Attribution
  advisorName?: string
}

@Injectable()
export class OtaLeadsService {
  private readonly logger = new Logger(OtaLeadsService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Capture a lead from the OTA portal.
   *
   * Implements the attribution priority chain:
   * 1. Existing CRM contact with assigned agent → CRM ownership wins
   * 2. advisorSlug provided → referral attribution
   * 3. Neither → unassigned
   */
  async captureLead(dto: CreateLeadDto): Promise<LeadCaptureResult> {
    const { contacts, advisorProfiles } = this.db.schema

    // -----------------------------------------------------------------
    // Step 1: Resolve advisor from slug (if provided) — needed for agency scoping
    // -----------------------------------------------------------------
    let advisor: AdvisorProfile | null = null
    if (dto.advisorSlug) {
      const [found] = await this.db.client
        .select()
        .from(advisorProfiles)
        .where(eq(advisorProfiles.slug, dto.advisorSlug))
        .limit(1)

      advisor = found ?? null
    }

    const agencyId = advisor?.agencyId ?? null

    // -----------------------------------------------------------------
    // Step 2: Check if contact already exists by email (agency-scoped when possible)
    // -----------------------------------------------------------------
    let existingContact: Contact | undefined

    if (agencyId) {
      // Agency-scoped lookup — search within the advisor's agency first
      const [found] = await this.db.client
        .select()
        .from(contacts)
        .where(and(eq(contacts.email, dto.email), eq(contacts.agencyId, agencyId)))
        .limit(1)

      existingContact = found
    }

    if (!existingContact) {
      // Fallback: global email lookup (handles contacts without agencyId)
      const [found] = await this.db.client
        .select()
        .from(contacts)
        .where(eq(contacts.email, dto.email))
        .limit(1)

      existingContact = found
    }

    // -----------------------------------------------------------------
    // Step 3: If existing contact with owner, CRM ownership wins
    //         BUT still mark referral conversion if referralSessionId provided
    // -----------------------------------------------------------------
    if (existingContact && existingContact.ownerId) {
      // Link referral conversion even for CRM-owned contacts
      if (dto.referralSessionId) {
        const { otaReferrals } = this.db.schema
        await this.db.client
          .update(otaReferrals)
          .set({
            convertedToContactId: existingContact.id,
          })
          .where(eq(otaReferrals.sessionId, dto.referralSessionId))

        this.logger.log(
          `Lead ${dto.email}: CRM ownership wins but referral conversion linked (session=${dto.referralSessionId})`,
        )
      }

      this.logger.log(
        `Lead ${dto.email}: CRM ownership (contact=${existingContact.id}, owner=${existingContact.ownerId})`,
      )
      return {
        contact: existingContact,
        attribution: 'crm_existing',
      }
    }

    // -----------------------------------------------------------------
    // Step 4: Determine attribution
    // -----------------------------------------------------------------
    let attribution: Attribution
    if (advisor) {
      attribution = 'referral'
    } else if (!existingContact) {
      // No advisor slug and no existing contact — round-robin fallback
      attribution = 'round_robin'
      this.logger.log(
        `Lead ${dto.email}: no advisor attribution and no existing contact — round_robin (TODO: implement assignment)`,
      )
    } else {
      attribution = 'unassigned'
    }

    const assignedOwnerId = advisor?.userId ?? null

    // -----------------------------------------------------------------
    // Step 5: Create or update the contact
    // -----------------------------------------------------------------
    let contact: Contact

    if (existingContact) {
      // Contact exists but has no owner — update with attribution
      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      }
      if (assignedOwnerId) {
        updateValues.ownerId = assignedOwnerId
      }
      if (agencyId && !existingContact.agencyId) {
        updateValues.agencyId = agencyId
      }
      // Update name/phone if provided and currently empty
      if (dto.name && !existingContact.firstName) {
        const nameParts = splitName(dto.name)
        updateValues.firstName = nameParts.firstName
        updateValues.lastName = nameParts.lastName
      }
      if (dto.phone && !existingContact.phone) {
        updateValues.phone = dto.phone
      }

      const [updated] = await this.db.client
        .update(contacts)
        .set(updateValues)
        .where(eq(contacts.id, existingContact.id))
        .returning()

      contact = updated!
      this.logger.log(
        `Lead ${dto.email}: updated existing contact ${contact.id} (attribution=${attribution})`,
      )
    } else {
      // Create new contact
      const nameParts = dto.name ? splitName(dto.name) : { firstName: null, lastName: null }

      const [created] = await this.db.client
        .insert(contacts)
        .values({
          email: dto.email,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          phone: dto.phone ?? null,
          agencyId: agencyId,
          ownerId: assignedOwnerId,
          contactType: 'lead',
          contactStatus: 'prospecting',
        })
        .returning()

      contact = created!
      this.logger.log(
        `Lead ${dto.email}: created new contact ${contact.id} (attribution=${attribution})`,
      )
    }

    // -----------------------------------------------------------------
    // Step 6: If there's a referralSessionId, link the conversion
    // -----------------------------------------------------------------
    if (dto.referralSessionId) {
      const { otaReferrals } = this.db.schema
      await this.db.client
        .update(otaReferrals)
        .set({
          convertedToContactId: contact.id,
        })
        .where(eq(otaReferrals.sessionId, dto.referralSessionId))
    }

    return {
      contact,
      attribution,
      advisorName: advisor?.displayName ?? undefined,
    }
  }

  /**
   * Create a flight request from the OTA portal.
   *
   * Finds or creates a contact from the consumer's info, then logs the
   * structured flight data. An advisor picks this up from the lead queue.
   */
  async createFlightRequest(dto: CreateFlightRequestDto): Promise<{
    success: boolean
    message: string
    contactId: string
  }> {
    const { contacts } = this.db.schema

    // -----------------------------------------------------------------
    // Step 1: Find or create contact by email
    // -----------------------------------------------------------------
    let contact: Contact | undefined

    const [existing] = await this.db.client
      .select()
      .from(contacts)
      .where(eq(contacts.email, dto.email))
      .limit(1)

    if (existing) {
      // Update name/phone if currently empty
      const updateValues: Record<string, unknown> = { updatedAt: new Date() }
      if (dto.name && !existing.firstName) {
        const nameParts = splitName(dto.name)
        updateValues.firstName = nameParts.firstName
        updateValues.lastName = nameParts.lastName
      }
      if (dto.phone && !existing.phone) {
        updateValues.phone = dto.phone
      }

      const [updated] = await this.db.client
        .update(contacts)
        .set(updateValues)
        .where(eq(contacts.id, existing.id))
        .returning()

      contact = updated!
      this.logger.log(
        `Flight request from ${dto.email}: updated existing contact ${contact.id}`,
      )
    } else {
      const nameParts = splitName(dto.name)

      const [created] = await this.db.client
        .insert(contacts)
        .values({
          email: dto.email,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          phone: dto.phone,
          contactType: 'lead',
          contactStatus: 'prospecting',
        })
        .returning()

      contact = created!
      this.logger.log(
        `Flight request from ${dto.email}: created new contact ${contact.id}`,
      )
    }

    // -----------------------------------------------------------------
    // Step 2: Log structured flight details
    // -----------------------------------------------------------------
    const flightDetails = JSON.stringify(
      {
        outbound: dto.outboundFlight,
        return: dto.returnFlight,
        travelers: dto.travelers,
        travelClass: dto.travelClass,
        specialRequests: dto.specialRequests,
        amadeusOfferId: dto.amadeusOfferId,
      },
      null,
      2,
    )

    this.logger.log(
      `Flight request for contact ${contact!.id}:\n${flightDetails}`,
    )

    return {
      success: true,
      message:
        'Your flight request has been submitted. An advisor will confirm your booking within 2 hours.',
      contactId: contact!.id,
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Split a "First Last" name string into firstName / lastName.
 * Handles single-word names gracefully.
 */
function splitName(name: string): { firstName: string | null; lastName: string | null } {
  const trimmed = name.trim()
  if (!trimmed) return { firstName: null, lastName: null }

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: null }
  }

  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(' '),
  }
}
