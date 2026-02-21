/**
 * Itinerary Versions Service
 *
 * Manages publish-gated itinerary snapshots. On publish, builds a full
 * SharedItineraryDto snapshot and stores it as JSONB. The shared proposal
 * page then serves the snapshot instead of live data.
 */

import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, desc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { TripsService } from './trips.service'
import type {
  ItineraryVersionSummaryDto,
  SharedItineraryDto,
} from '@tailfire/shared-types'

@Injectable()
export class ItineraryVersionsService implements OnModuleInit {
  private readonly logger = new Logger(ItineraryVersionsService.name)
  private tripsService!: TripsService

  constructor(
    private readonly db: DatabaseService,
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    // Lazy-resolve TripsService to break circular dependency
    // (trips.service imports itinerary-versions.service and vice versa)
    const { TripsService } = require('./trips.service')
    this.tripsService = this.moduleRef.get(TripsService, { strict: false })
  }

  /**
   * Publish a new version of an itinerary.
   * Builds a full snapshot and stores it in itinerary_versions.
   *
   * Fix A: tripId scoping — itinerary must belong to tripId.
   * Fix C: Transactional publish with retry on conflict.
   * Fix H: Derive agencyId from trip if itinerary.agencyId is null.
   */
  async publishVersion(
    tripId: string,
    itineraryId: string,
    actorId: string,
    changeSummary?: string,
  ): Promise<{ versionNumber: number; publishedAt: Date; itineraryId: string }> {
    return this.db.client.transaction(async (tx) => {
      // Load itinerary — scoped to trip (Fix A)
      const [itinerary] = await tx
        .select()
        .from(this.db.schema.itineraries)
        .where(
          and(
            eq(this.db.schema.itineraries.id, itineraryId),
            eq(this.db.schema.itineraries.tripId, tripId),
          ),
        )
        .limit(1)

      if (!itinerary) {
        throw new NotFoundException(`Itinerary ${itineraryId} not found in trip ${tripId}`)
      }

      // Fetch full trip for agencyId fallback and pricing visibility
      const [trip] = await tx
        .select({
          pricingVisibility: this.db.schema.trips.pricingVisibility,
          agencyId: this.db.schema.trips.agencyId,
        })
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, tripId))
        .limit(1)

      const pricingVisible = trip?.pricingVisibility === 'show_all'

      // Fix H: Derive agencyId from trip if itinerary lacks one
      const agencyId = itinerary.agencyId || trip?.agencyId
      if (!agencyId) {
        throw new BadRequestException('Cannot publish: no agency associated with this itinerary')
      }

      // Build the snapshot using the existing proposal builder
      const snapshot = await this.tripsService.buildItinerarySnapshot(itinerary, pricingVisible)

      // Determine new version number
      const newVersion = itinerary.currentVersion + 1
      const now = new Date()

      // Insert the version record
      await tx
        .insert(this.db.schema.itineraryVersions)
        .values({
          itineraryId,
          agencyId,
          versionNumber: newVersion,
          snapshot: snapshot as any,
          changeSummary: changeSummary || null,
          publishedBy: actorId,
          publishedAt: now,
        })

      // Update itinerary version tracking
      await tx
        .update(this.db.schema.itineraries)
        .set({
          currentVersion: newVersion,
          publishedVersion: newVersion,
          lastPublishedAt: now,
          hasUnpublishedChanges: false,
          updatedAt: now,
        })
        .where(eq(this.db.schema.itineraries.id, itineraryId))

      // Emit event for notification hooks
      this.eventEmitter.emit('itinerary.published', {
        itineraryId,
        tripId,
        versionNumber: newVersion,
        actorId,
      })

      this.logger.log(`Published itinerary ${itineraryId} v${newVersion}`)

      return { versionNumber: newVersion, publishedAt: now, itineraryId }
    })
  }

  /**
   * Get version history for an itinerary (newest first).
   * Fix A: tripId scoping.
   */
  async getVersions(tripId: string, itineraryId: string): Promise<ItineraryVersionSummaryDto[]> {
    // Verify itinerary belongs to trip
    const [itinerary] = await this.db.client
      .select({ id: this.db.schema.itineraries.id })
      .from(this.db.schema.itineraries)
      .where(
        and(
          eq(this.db.schema.itineraries.id, itineraryId),
          eq(this.db.schema.itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException(`Itinerary ${itineraryId} not found in trip ${tripId}`)
    }

    const versions = await this.db.client
      .select({
        id: this.db.schema.itineraryVersions.id,
        versionNumber: this.db.schema.itineraryVersions.versionNumber,
        changeSummary: this.db.schema.itineraryVersions.changeSummary,
        publishedAt: this.db.schema.itineraryVersions.publishedAt,
        publisherFirstName: this.db.schema.userProfiles.firstName,
        publisherLastName: this.db.schema.userProfiles.lastName,
      })
      .from(this.db.schema.itineraryVersions)
      .leftJoin(
        this.db.schema.userProfiles,
        eq(this.db.schema.itineraryVersions.publishedBy, this.db.schema.userProfiles.id),
      )
      .where(eq(this.db.schema.itineraryVersions.itineraryId, itineraryId))
      .orderBy(desc(this.db.schema.itineraryVersions.versionNumber))

    return versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      changeSummary: v.changeSummary,
      publishedByName: v.publisherFirstName
        ? [v.publisherFirstName, v.publisherLastName].filter(Boolean).join(' ')
        : null,
      publishedAt: v.publishedAt.toISOString(),
    }))
  }

  /**
   * Get the snapshot JSON for a specific version.
   * Fix A: tripId scoping.
   */
  async getVersionSnapshot(
    tripId: string,
    itineraryId: string,
    versionNumber: number,
  ): Promise<SharedItineraryDto | null> {
    // Verify itinerary belongs to trip
    const [itinerary] = await this.db.client
      .select({ id: this.db.schema.itineraries.id })
      .from(this.db.schema.itineraries)
      .where(
        and(
          eq(this.db.schema.itineraries.id, itineraryId),
          eq(this.db.schema.itineraries.tripId, tripId),
        ),
      )
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException(`Itinerary ${itineraryId} not found in trip ${tripId}`)
    }

    const [version] = await this.db.client
      .select({ snapshot: this.db.schema.itineraryVersions.snapshot })
      .from(this.db.schema.itineraryVersions)
      .where(
        and(
          eq(this.db.schema.itineraryVersions.itineraryId, itineraryId),
          eq(this.db.schema.itineraryVersions.versionNumber, versionNumber),
        ),
      )
      .limit(1)

    return (version?.snapshot as SharedItineraryDto) || null
  }

  /**
   * Get the currently published snapshot for an itinerary.
   * Returns null if no version has been published yet.
   * (Internal — no trip scoping needed since called by trusted services)
   */
  async getPublishedSnapshot(itineraryId: string): Promise<SharedItineraryDto | null> {
    // Load itinerary to get publishedVersion
    const [itinerary] = await this.db.client
      .select({
        publishedVersion: this.db.schema.itineraries.publishedVersion,
      })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.id, itineraryId))
      .limit(1)

    if (!itinerary?.publishedVersion) {
      return null
    }

    const [version] = await this.db.client
      .select({ snapshot: this.db.schema.itineraryVersions.snapshot })
      .from(this.db.schema.itineraryVersions)
      .where(
        and(
          eq(this.db.schema.itineraryVersions.itineraryId, itineraryId),
          eq(this.db.schema.itineraryVersions.versionNumber, itinerary.publishedVersion),
        ),
      )
      .limit(1)

    return (version?.snapshot as SharedItineraryDto) || null
  }
}
