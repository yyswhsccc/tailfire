/**
 * Trip Promotion Service
 *
 * Core pipeline that converts a submitted OTA trip request into a full
 * Tailfire trip with itinerary, days, and activities.
 *
 * Pipeline steps:
 *   1. Validate request (must be 'submitted')
 *   2. Resolve owner/agency via OwnerResolutionService
 *   3. Create or update contact via OtaLeadsService
 *   4. Compute date range from all components
 *   5. Create trip
 *   6. Bootstrap itinerary with days
 *   7. Build date → dayId map
 *   8. Promote each component into a real activity
 *   9. Mark request as promoted
 *  10. Notify assigned advisor (or all agency admins if unassigned)
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import * as Sentry from '@sentry/nestjs'
import { DatabaseService } from '../db/database.service'
import { OtaTripRequestsService } from './ota-trip-requests.service'
import { OwnerResolutionService } from './owner-resolution.service'
import { OtaLeadsService } from './ota-leads.service'
import { TripsService } from '../trips/trips.service'
import { ItinerariesService } from '../trips/itineraries.service'
import { NotificationService } from '../notifications/notification.service'
import { FlightPromoter } from './component-promoters/flight.promoter'
import { LodgingPromoter } from './component-promoters/lodging.promoter'
import { CruisePromoter } from './component-promoters/cruise.promoter'
import { TourPromoter } from './component-promoters/tour.promoter'
import { extractDates } from './component-promoters/base.promoter'
import type { ComponentPromoter, PromotionContext } from './component-promoters/base.promoter'

@Injectable()
export class TripPromotionService {
  private readonly logger = new Logger(TripPromotionService.name)
  private readonly promoterMap: Map<string, ComponentPromoter>

  constructor(
    private readonly tripRequests: OtaTripRequestsService,
    private readonly ownerResolution: OwnerResolutionService,
    private readonly leadsService: OtaLeadsService,
    private readonly tripsService: TripsService,
    private readonly itinerariesService: ItinerariesService,
    private readonly notificationService: NotificationService,
    private readonly db: DatabaseService,
    private readonly flightPromoter: FlightPromoter,
    private readonly lodgingPromoter: LodgingPromoter,
    private readonly cruisePromoter: CruisePromoter,
    private readonly tourPromoter: TourPromoter,
  ) {
    this.promoterMap = new Map<string, ComponentPromoter>([
      [this.flightPromoter.type, this.flightPromoter],
      [this.lodgingPromoter.type, this.lodgingPromoter],
      [this.cruisePromoter.type, this.cruisePromoter],
      [this.tourPromoter.type, this.tourPromoter],
    ])
  }

  /**
   * Promote a submitted OTA trip request into a full Tailfire trip.
   *
   * @param requestId - The OTA trip request ID to promote
   * @returns The created trip ID and any promotion warnings
   */
  async promote(requestId: string): Promise<{ tripId: string; promotedCount: number; failedCount: number; warnings: string[] }> {
    try {
      // ================================================================
      // Step 1: Validate — request must exist and be 'submitted'
      // ================================================================
      const request = await this.tripRequests.findById(requestId)

      if (request.status !== 'submitted') {
        throw new BadRequestException(
          `Cannot promote trip request ${requestId}: status is '${request.status}', expected 'submitted'`,
        )
      }

      this.logger.log(
        `Starting promotion pipeline for trip request ${requestId} (${request.contactEmail})`,
      )

      // ================================================================
      // Step 2: Resolve owner — determine who owns this trip
      // ================================================================
      const resolution = await this.ownerResolution.resolve({
        contactEmail: request.contactEmail,
        advisorSlug: request.advisorSlug,
        tripGroupId: request.tripGroupId,
      })

      await this.tripRequests.updateResolution(requestId, resolution)

      this.logger.log(
        `Owner resolved: ${resolution.attribution} (owner=${resolution.ownerId}, agency=${resolution.agencyId})`,
      )

      // ================================================================
      // Step 3: Create/update contact via lead capture
      // ================================================================
      const leadResult = await this.leadsService.captureLead({
        email: request.contactEmail,
        name: request.contactName ?? undefined,
        phone: request.contactPhone ?? undefined,
        advisorSlug: request.advisorSlug ?? undefined,
        referralSessionId: request.referralSessionId ?? undefined,
      })

      const contactId = leadResult.contact.id
      const originalContactOwnerId = leadResult.contact.ownerId ?? null

      // Reconcile: if owner resolution and lead capture disagree, patch the contact
      if (resolution.ownerId && leadResult.contact.ownerId !== resolution.ownerId) {
        const { contacts } = this.db.schema
        await this.db.client
          .update(contacts)
          .set({ ownerId: resolution.ownerId, updatedAt: new Date() })
          .where(eq(contacts.id, contactId))

        this.logger.log(
          `Contact ${contactId}: patched ownerId from ${leadResult.contact.ownerId ?? 'null'} to ${resolution.ownerId} (owner-resolution wins)`,
        )
      }

      this.logger.log(
        `Contact resolved: ${contactId} (attribution=${leadResult.attribution})`,
      )

      // ================================================================
      // Step 4: Compute dates from all components
      // ================================================================
      const components = (request.components as any[]) ?? []
      const allDates: string[] = []

      for (const component of components) {
        const dates = extractDates(component.type, component.data)
        allDates.push(...dates)
      }

      // Also include top-level request dates
      if (request.startDate) allDates.push(request.startDate)
      if (request.endDate) allDates.push(request.endDate)

      // Sort and deduplicate
      const uniqueDates = [...new Set(allDates)].sort()
      const startDate = uniqueDates[0] ?? undefined
      const endDate = uniqueDates.length > 1
        ? uniqueDates[uniqueDates.length - 1]
        : startDate

      this.logger.log(
        `Date range: ${startDate ?? 'unknown'} to ${endDate ?? 'unknown'} (${uniqueDates.length} unique dates)`,
      )

      // ================================================================
      // Step 5: Create trip
      // ================================================================
      const tripName = request.title ?? `Trip Request from ${request.contactEmail}`

      const trip = await this.tripsService.create(
        {
          name: tripName,
          primaryContactId: contactId,
          status: 'inbound',
          tripType: request.tripGroupId ? 'group' : 'leisure',
          startDate,
          endDate,
          tripGroupId: request.tripGroupId ?? undefined,
          source: 'ota',
        },
        resolution.ownerId,
        resolution.agencyId,
      )

      this.logger.log(`Trip created: ${trip.id} (${tripName})`)

      // ================================================================
      // Step 6: Bootstrap itinerary
      // ================================================================
      const itinerary = await this.itinerariesService.create(trip.id, {
        name: 'Main Itinerary',
        status: 'draft',
        startDate,
        endDate,
      })

      this.logger.log(`Itinerary created: ${itinerary.id}`)

      // ================================================================
      // Step 7: Get itinerary days — build date → dayId map
      // ================================================================
      const { itineraryDays } = this.db.schema

      let days = await this.db.client
        .select({ id: itineraryDays.id, date: itineraryDays.date })
        .from(itineraryDays)
        .where(eq(itineraryDays.itineraryId, itinerary.id))

      // If auto-generation didn't create days, manually create them
      if (days.length === 0 && uniqueDates.length > 0) {
        this.logger.warn(
          `No itinerary days auto-generated for ${itinerary.id}, creating manually`,
        )

        for (let i = 0; i < uniqueDates.length; i++) {
          const dateStr = uniqueDates[i]!
          await this.db.client
            .insert(itineraryDays)
            .values({
              itineraryId: itinerary.id,
              agencyId: resolution.agencyId,
              dayNumber: i + 1,
              date: dateStr,
              sequenceOrder: i + 1,
            })
        }

        // Re-fetch days
        days = await this.db.client
          .select({ id: itineraryDays.id, date: itineraryDays.date })
          .from(itineraryDays)
          .where(eq(itineraryDays.itineraryId, itinerary.id))
      }

      const dayMap = new Map<string, string>()
      for (const day of days) {
        if (day.date) {
          dayMap.set(day.date, day.id)
        }
      }

      this.logger.log(`Day map built: ${dayMap.size} days`)

      // ================================================================
      // Step 8: Promote components
      // ================================================================
      const context: PromotionContext = {
        tripId: trip.id,
        itineraryId: itinerary.id,
        agencyId: resolution.agencyId,
        itineraryDayMap: dayMap,
      }

      let promotedCount = 0
      let failedCount = 0
      const warnings: string[] = []

      for (const component of components) {
        const promoter = this.promoterMap.get(component.type)

        if (!promoter) {
          const msg = `Unsupported component type '${component.type}' — skipped (no promoter implemented)`
          this.logger.warn(`${msg} (request=${requestId})`)
          warnings.push(msg)
          failedCount++
          continue
        }

        try {
          const activityId = await promoter.promote(component, context)
          promotedCount++
          this.logger.log(
            `Promoted ${component.type} component → activity ${activityId}`,
          )
        } catch (error) {
          failedCount++
          const message = error instanceof Error ? error.message : String(error)
          warnings.push(`Failed to promote ${component.type} component: ${message}`)
          this.logger.error(
            `Failed to promote ${component.type} component: ${message}`,
            error instanceof Error ? error.stack : undefined,
          )
          Sentry.captureException(error, {
            tags: { pipeline: 'trip-promotion', componentType: component.type },
            extra: { requestId, tripId: trip.id, componentData: component },
          })
        }
      }

      this.logger.log(
        `Component promotion: ${promotedCount} succeeded, ${failedCount} failed (total: ${components.length})`,
      )

      // ================================================================
      // Step 9: Mark promoted
      // ================================================================
      await this.tripRequests.markPromoted(requestId, trip.id)

      this.logger.log(`Trip request ${requestId} marked as promoted → trip ${trip.id}`)

      // ================================================================
      // Step 9b: Handle group booking conflict (auto-share)
      // ================================================================
      if (request.tripGroupId) {
        try {
          await this.handleGroupConflict({
            tripGroupId: request.tripGroupId,
            tripId: trip.id,
            contactId,
            contactName: request.contactName ?? request.contactEmail,
            agencyId: resolution.agencyId,
            originalContactOwnerId,
            resolvedOwnerId: resolution.ownerId,
          })
        } catch (error) {
          // Group conflict handling should not fail the promotion
          const msg = error instanceof Error ? error.message : String(error)
          warnings.push(`Group conflict handling failed: ${msg}`)
          this.logger.error(
            `Group conflict handling failed for trip ${trip.id}: ${msg}`,
            error instanceof Error ? error.stack : undefined,
          )
        }
      }

      // ================================================================
      // Step 10: Notify
      // ================================================================
      try {
        await this.notifyAssignment(resolution.ownerId, resolution.agencyId, trip.id, tripName)
      } catch (error) {
        // Notification failure should not fail the promotion
        this.logger.error(
          `Failed to send assignment notification: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      return { tripId: trip.id, promotedCount, failedCount, warnings }
    } catch (error) {
      // ================================================================
      // Error handling — mark request as failed
      // ================================================================
      const message = error instanceof Error ? error.message : String(error)

      // Only mark failed if the error is not a validation/idempotency error
      if (!(error instanceof BadRequestException)) {
        try {
          await this.tripRequests.markFailed(requestId, message)
        } catch (markError) {
          this.logger.error(
            `Failed to mark trip request ${requestId} as failed: ${markError instanceof Error ? markError.message : String(markError)}`,
          )
        }
      }

      Sentry.captureException(error, {
        tags: { pipeline: 'trip-promotion' },
        extra: { requestId },
      })

      this.logger.error(
        `Promotion pipeline failed for request ${requestId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      )

      throw error
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Send assignment notification to the advisor (or all agency admins if unassigned).
   */
  private async notifyAssignment(
    ownerId: string | null,
    agencyId: string,
    tripId: string,
    tripName: string,
  ): Promise<void> {
    const actionUrl = `/trips/${tripId}`
    const title = 'New Trip Request'
    const body = `A new trip request has been assigned: "${tripName}"`

    if (ownerId) {
      // Notify the assigned advisor
      await this.notificationService.send({
        userId: ownerId,
        category: 'assignment',
        title,
        body,
        actionUrl,
      })
      this.logger.log(`Assignment notification sent to advisor ${ownerId}`)
    } else {
      // No owner — notify all admins in the agency
      const { userProfiles } = this.db.schema

      const admins = await this.db.client
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.agencyId, agencyId),
            eq(userProfiles.role, 'admin'),
          ),
        )

      for (const admin of admins) {
        await this.notificationService.send({
          userId: admin.id,
          category: 'assignment',
          title,
          body: `An unassigned trip request needs attention: "${tripName}"`,
          actionUrl,
        })
      }

      this.logger.log(
        `Assignment notification sent to ${admins.length} agency admin(s)`,
      )
    }
  }

  /**
   * Handle group booking ownership conflict.
   *
   * When a consumer's ORIGINAL CRM advisor differs from the trip group owner,
   * auto-create shares so both advisors have appropriate access:
   *
   * 1. Trip share: CRM advisor gets 'write' access to the group trip,
   *    scoped to their contact's activities (only if CRM advisor !== trip owner)
   * 2. Contact share: Group owner gets 'basic' access to the consumer's contact
   *    (only if group owner !== contact owner)
   *
   * Uses direct Drizzle inserts with onConflictDoNothing() to bypass the
   * self-share guard and avoid 409s on duplicate shares.
   */
  private async handleGroupConflict(params: {
    tripGroupId: string
    tripId: string
    contactId: string
    contactName: string
    agencyId: string
    originalContactOwnerId: string | null
    resolvedOwnerId: string | null
  }): Promise<void> {
    const {
      tripGroupId, tripId, contactId, contactName,
      agencyId, originalContactOwnerId, resolvedOwnerId,
    } = params
    const { tripGroups, tripShares, contactShares } = this.db.schema

    // Look up the group owner
    const [group] = await this.db.client
      .select({ ownerId: tripGroups.ownerId })
      .from(tripGroups)
      .where(eq(tripGroups.id, tripGroupId))
      .limit(1)

    if (!group?.ownerId) {
      this.logger.log(
        `Group conflict check: trip group ${tripGroupId} has no owner, skipping`,
      )
      return
    }

    const groupOwnerId = group.ownerId
    const crmAdvisorId = originalContactOwnerId

    // No conflict if same owner or no CRM advisor
    if (!crmAdvisorId || groupOwnerId === crmAdvisorId) {
      this.logger.log(
        `Group conflict check: same owner or no CRM advisor (group=${groupOwnerId}, crm=${crmAdvisorId}), no shares needed`,
      )
      return
    }

    this.logger.log(
      `Group conflict detected: group owner=${groupOwnerId}, CRM advisor=${crmAdvisorId}. Creating auto-shares.`,
    )

    // The trip was created with resolvedOwnerId as the owner.
    // The contact was patched to resolvedOwnerId during reconciliation.

    // 1. Trip share: give CRM advisor scoped access to the group trip
    //    Skip if CRM advisor is already the trip owner
    if (crmAdvisorId !== resolvedOwnerId) {
      await this.db.client
        .insert(tripShares)
        .values({
          tripId,
          sharedWithUserId: crmAdvisorId,
          agencyId,
          accessLevel: 'write',
          sharedBy: resolvedOwnerId ?? groupOwnerId,
          reason: 'group_booking',
          scopedContactId: contactId,
          grantedBy: resolvedOwnerId ?? groupOwnerId,
          notes: `Auto-shared: ${contactName} booked into group`,
        })
        .onConflictDoNothing()

      this.logger.log(
        `Trip share created: CRM advisor ${crmAdvisorId} → trip ${tripId} (scoped to contact ${contactId})`,
      )
    } else {
      this.logger.log(
        `Trip share skipped: CRM advisor ${crmAdvisorId} is already the trip owner`,
      )
    }

    // 2. Contact share: give group owner basic access to the consumer's contact
    //    Skip if group owner is already the contact owner (post-reconciliation)
    if (groupOwnerId !== resolvedOwnerId) {
      await this.db.client
        .insert(contactShares)
        .values({
          contactId,
          sharedWithUserId: groupOwnerId,
          agencyId,
          accessLevel: 'basic',
          sharedBy: resolvedOwnerId ?? crmAdvisorId,
          reason: 'group_booking',
          grantedBy: resolvedOwnerId ?? crmAdvisorId,
          notes: `Auto-shared: ${contactName} is in your group`,
        })
        .onConflictDoNothing()

      this.logger.log(
        `Contact share created: group owner ${groupOwnerId} → contact ${contactId}`,
      )
    } else {
      this.logger.log(
        `Contact share skipped: group owner ${groupOwnerId} is already the contact owner`,
      )
    }
  }
}
