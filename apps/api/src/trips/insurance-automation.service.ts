/**
 * Insurance Automation Service
 *
 * Handles the automation flow for insurance proposal emails:
 * 1. Preview: calculates who needs insurance, detects minors, finds guardians
 * 2. Queue: creates form tokens and schedules BullMQ jobs for email delivery
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { eq, and, or, ilike } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { FormsService } from '../forms/forms.service'
import { AutomationService } from '../automation/automation.service'
import { QUEUES } from '../automation/automation.types'

export interface TravelerPreview {
  tripTravelerId: string
  contactId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  dateOfBirth: string | null
  age: number | null
  isMinor: boolean
  insuranceStatus: string | null
  guardian: {
    contactId: string
    firstName: string | null
    lastName: string | null
  } | null
  needsGuardianAssignment: boolean
}

@Injectable()
export class InsuranceAutomationService {
  private readonly logger = new Logger(InsuranceAutomationService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly formsService: FormsService,
    private readonly automationService: AutomationService,
  ) {}

  /**
   * Get a preview of all travelers for insurance proposal emails.
   * Calculates age, detects minors, finds guardians via contact_relationships.
   */
  async getProposalPreview(tripId: string): Promise<{
    tripId: string
    tripName: string
    startDate: string | null
    travelers: TravelerPreview[]
  }> {
    // 1. Get trip with dates
    const { trips, tripTravelers, contacts, tripTravelerInsurance, contactRelationships } = this.db.schema

    const [trip] = await this.db.client
      .select({
        id: trips.id,
        name: trips.name,
        startDate: trips.startDate,
      })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // 2. Get all trip travelers with contact info and insurance status
    const travelers = await this.db.client
      .select({
        tripTravelerId: tripTravelers.id,
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        dateOfBirth: contacts.dateOfBirth,
        insuranceStatus: tripTravelerInsurance.status,
      })
      .from(tripTravelers)
      .innerJoin(contacts, eq(contacts.id, tripTravelers.contactId))
      .leftJoin(
        tripTravelerInsurance,
        and(
          eq(tripTravelerInsurance.tripTravelerId, tripTravelers.id),
          eq(tripTravelerInsurance.tripId, tripId),
        ),
      )
      .where(eq(tripTravelers.tripId, tripId))

    // 3. Calculate ages and detect minors
    const tripStartDate = trip.startDate ? new Date(trip.startDate) : new Date()
    const previews: TravelerPreview[] = []

    for (const t of travelers) {
      let age: number | null = null
      let isMinor = false

      if (t.dateOfBirth) {
        const dob = new Date(t.dateOfBirth)
        age = Math.floor((tripStartDate.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        isMinor = age < 18
      }

      let guardian: TravelerPreview['guardian'] = null
      let needsGuardianAssignment = false

      // 4. If minor, find parent/guardian via contact_relationships
      if (isMinor && t.contactId) {
        const parentLabels = ['parent', 'mother', 'father', 'guardian']

        const relationships = await this.db.client
          .select({
            contactId1: contactRelationships.contactId1,
            contactId2: contactRelationships.contactId2,
            labelForContact1: contactRelationships.labelForContact1,
            labelForContact2: contactRelationships.labelForContact2,
          })
          .from(contactRelationships)
          .where(
            and(
              or(
                eq(contactRelationships.contactId1, t.contactId),
                eq(contactRelationships.contactId2, t.contactId),
              ),
              or(
                ...parentLabels.map((label) => ilike(contactRelationships.labelForContact1, label)),
                ...parentLabels.map((label) => ilike(contactRelationships.labelForContact2, label)),
              ),
            ),
          )

        // Find the guardian contact (the other side of the relationship)
        for (const rel of relationships) {
          let guardianContactId: string | null = null

          // If the minor is contact2, check if contact1's label is a parent label
          if (rel.contactId2 === t.contactId) {
            const label = (rel.labelForContact1 || '').toLowerCase()
            if (parentLabels.some((pl) => label.includes(pl))) {
              guardianContactId = rel.contactId1
            }
          }

          // If the minor is contact1, check if contact2's label is a parent label
          if (rel.contactId1 === t.contactId) {
            const label = (rel.labelForContact2 || '').toLowerCase()
            if (parentLabels.some((pl) => label.includes(pl))) {
              guardianContactId = rel.contactId2
            }
          }

          if (guardianContactId) {
            // Verify the guardian is also a traveler on this trip
            const isOnTrip = travelers.some((tr) => tr.contactId === guardianContactId)
            if (isOnTrip) {
              const [guardianContact] = await this.db.client
                .select({
                  contactId: contacts.id,
                  firstName: contacts.firstName,
                  lastName: contacts.lastName,
                })
                .from(contacts)
                .where(eq(contacts.id, guardianContactId))
                .limit(1)

              if (guardianContact) {
                guardian = guardianContact
                break
              }
            }
          }
        }

        // If no guardian found on trip, flag for manual assignment
        if (!guardian) {
          needsGuardianAssignment = true
        }
      }

      previews.push({
        tripTravelerId: t.tripTravelerId,
        contactId: t.contactId,
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.email,
        dateOfBirth: t.dateOfBirth,
        age,
        isMinor,
        insuranceStatus: t.insuranceStatus ?? null,
        guardian,
        needsGuardianAssignment,
      })
    }

    return {
      tripId: trip.id,
      tripName: trip.name,
      startDate: trip.startDate,
      travelers: previews,
    }
  }

  /**
   * Queue insurance proposal emails for selected travelers.
   * Groups minors under their guardians and creates form tokens.
   */
  async queueProposalEmails(
    tripId: string,
    params: {
      travelerIds: string[]
      guardianOverrides?: Record<string, string>
      scheduledFor?: string
      agencyId: string
      userId: string
    },
  ): Promise<{ queuedCount: number; jobIds: string[] }> {
    const { trips } = this.db.schema

    // Get trip info
    const [trip] = await this.db.client
      .select({ id: trips.id, name: trips.name })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // Get the full preview to understand who's a minor
    const preview = await this.getProposalPreview(tripId)
    const travelerMap = new Map(preview.travelers.map((t) => [t.tripTravelerId, t]))

    // Group: build a map of adult recipient → their dependents (minors)
    const recipients = new Map<string, { traveler: TravelerPreview; dependents: TravelerPreview[] }>()

    // First, add all selected adult travelers
    for (const tId of params.travelerIds) {
      const t = travelerMap.get(tId)
      if (!t) continue
      if (!t.isMinor && t.email) {
        recipients.set(tId, { traveler: t, dependents: [] })
      }
    }

    // Then, attach minors to their guardians
    for (const t of preview.travelers) {
      if (!t.isMinor) continue

      // Use override if provided, otherwise use detected guardian
      const overrideGuardianId = params.guardianOverrides?.[t.tripTravelerId]
      let guardianTripTravelerId: string | null = null

      if (overrideGuardianId) {
        guardianTripTravelerId = overrideGuardianId
      } else if (t.guardian) {
        // Find the trip traveler ID for this guardian contact
        const guardianTraveler = preview.travelers.find(
          (pt) => pt.contactId === t.guardian!.contactId,
        )
        guardianTripTravelerId = guardianTraveler?.tripTravelerId ?? null
      }

      if (guardianTripTravelerId && recipients.has(guardianTripTravelerId)) {
        recipients.get(guardianTripTravelerId)!.dependents.push(t)
      }
    }

    // Queue emails
    const jobIds: string[] = []
    let queuedCount = 0

    for (const [_, { traveler, dependents }] of recipients) {
      // Create form token with all traveler IDs (adult + dependents)
      const allTravelerIds = [traveler.tripTravelerId, ...dependents.map((d) => d.tripTravelerId)]

      const { token } = await this.formsService.createToken({
        formType: 'insurance_waiver',
        tripId,
        travelerIds: allTravelerIds,
        agencyId: params.agencyId,
        contextData: {
          recipientName: `${traveler.firstName || ''} ${traveler.lastName || ''}`.trim(),
          tripName: trip.name,
          dependentNames: dependents.map((d) => `${d.firstName || ''} ${d.lastName || ''}`.trim()),
        },
        expiresInDays: 30,
      })

      // Build job data
      const jobData = {
        type: 'insurance.proposal.email' as const,
        tripId,
        recipientTravelerId: traveler.tripTravelerId,
        recipientName: `${traveler.firstName || ''} ${traveler.lastName || ''}`.trim(),
        recipientEmail: traveler.email!,
        dependentTravelerIds: dependents.map((d) => d.tripTravelerId),
        formToken: token,
        agencyId: params.agencyId,
        tripName: trip.name,
      }

      // Calculate delay if scheduled for later
      let delay: number | undefined
      if (params.scheduledFor) {
        const scheduledDate = new Date(params.scheduledFor)
        const now = new Date()
        delay = Math.max(0, scheduledDate.getTime() - now.getTime())
      }

      const jobId = await this.automationService.schedule(
        QUEUES.CLIENT_CARE,
        'insurance.proposal.email',
        jobData as unknown as Record<string, unknown>,
        {
          delay,
          jobId: `insurance:${tripId}:${traveler.tripTravelerId}`,
        },
      )

      // Update job history with tripId association
      try {
        await this.db.client
          .update(this.db.schema.automationJobHistory)
          .set({ tripId })
          .where(
            and(
              eq(this.db.schema.automationJobHistory.queueName, QUEUES.CLIENT_CARE),
              eq(this.db.schema.automationJobHistory.jobId, jobId),
            ),
          )
      } catch {
        // Non-blocking
      }

      jobIds.push(jobId)
      queuedCount++

      this.logger.log(
        `Queued insurance proposal email for ${traveler.email} (trip: ${tripId}, dependents: ${dependents.length})`,
      )
    }

    return { queuedCount, jobIds }
  }
}
