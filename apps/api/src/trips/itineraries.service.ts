/**
 * Itineraries Service
 *
 * Business logic for managing trip itineraries.
 */

import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common'
import { eq, and, ne, sql, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ItineraryDaysService } from './itinerary-days.service'
import type {
  CreateItineraryDto,
  UpdateItineraryDto,
  ItineraryFilterDto,
  ItineraryResponseDto,
} from '../../../../packages/shared-types/src/api'

@Injectable()
export class ItinerariesService {
  private readonly logger = new Logger(ItinerariesService.name)

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => ItineraryDaysService))
    private readonly itineraryDaysService: ItineraryDaysService,
  ) {}

  /**
   * Create a new itinerary for a trip
   * If created with 'approved' status, enforces single-approved rule
   * Auto-selects if this is the first itinerary for the trip
   */
  async create(
    tripId: string,
    dto: CreateItineraryDto,
  ): Promise<ItineraryResponseDto> {
    // Validate trip exists
    const [trip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException('Trip not found')
    }

    // Check if this is the first itinerary for the trip
    const existingCount = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, tripId))
      .then(result => Number(result[0]?.count ?? 0))

    const isFirstItinerary = existingCount === 0

    // If creating with approved status, archive any existing approved itineraries
    const isApproved = dto.status === 'approved'
    if (isApproved) {
      // Archive any previously approved itineraries (enforces single-approved rule)
      await this.db.client
        .update(this.db.schema.itineraries)
        .set({ status: 'archived', isSelected: false, updatedAt: new Date() })
        .where(
          and(
            eq(this.db.schema.itineraries.tripId, tripId),
            eq(this.db.schema.itineraries.status, 'approved')
          )
        )
    }

    // Auto-select if approved OR if this is the first itinerary
    const shouldSelect = isApproved || isFirstItinerary

    const [itinerary] = await this.db.client
      .insert(this.db.schema.itineraries)
      .values({
        tripId,
        agencyId: trip.agencyId,
        name: dto.name,
        description: dto.description,
        coverPhoto: dto.coverPhoto || null,
        overview: dto.overview || null,
        startDate: dto.startDate || null,
        endDate: dto.endDate || null,
        status: dto.status || 'draft',
        isSelected: shouldSelect,
        sequenceOrder: dto.sequenceOrder || 0,
      })
      .returning()

    if (!itinerary) {
      throw new Error('Failed to create itinerary')
    }

    // Auto-generate days if itinerary has both start and end dates
    if (dto.startDate && dto.endDate) {
      try {
        await this.itineraryDaysService.autoGenerate({
          itineraryId: itinerary.id,
          includePreTravelDay: false,
        })
        this.logger.log({
          message: 'Auto-generated itinerary days on creation',
          itineraryId: itinerary.id,
          startDate: dto.startDate,
          endDate: dto.endDate,
        })
      } catch (error) {
        // Log but don't fail itinerary creation if day generation fails
        this.logger.warn({
          message: 'Failed to auto-generate itinerary days',
          itineraryId: itinerary.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return this.mapToResponseDto(itinerary)
  }

  /**
   * Find all itineraries with optional filters
   * Auto-selects the only itinerary if filtering by isSelected=true and none are selected
   */
  async findAll(
    filters: ItineraryFilterDto,
  ): Promise<ItineraryResponseDto[]> {
    const conditions = []

    // If tripId filter is provided, validate it exists
    if (filters.tripId) {
      const [trip] = await this.db.client
        .select()
        .from(this.db.schema.trips)
        .where(eq(this.db.schema.trips.id, filters.tripId))
        .limit(1)

      if (!trip) {
        throw new NotFoundException('Trip not found')
      }

      conditions.push(eq(this.db.schema.itineraries.tripId, filters.tripId))
    }

    if (filters.status) {
      conditions.push(eq(this.db.schema.itineraries.status, filters.status))
    }

    if (filters.isSelected !== undefined) {
      conditions.push(eq(this.db.schema.itineraries.isSelected, filters.isSelected))
    }

    let itineraries = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(this.db.schema.itineraries.createdAt))

    // Auto-select if: filtering by isSelected=true, no results, tripId provided, and exactly one itinerary exists
    if (filters.isSelected === true && itineraries.length === 0 && filters.tripId) {
      const allTripItineraries = await this.db.client
        .select()
        .from(this.db.schema.itineraries)
        .where(eq(this.db.schema.itineraries.tripId, filters.tripId))
        .orderBy(asc(this.db.schema.itineraries.createdAt))

      const onlyItinerary = allTripItineraries[0]
      if (allTripItineraries.length === 1 && onlyItinerary) {
        // Auto-select the only itinerary
        const [updated] = await this.db.client
          .update(this.db.schema.itineraries)
          .set({ isSelected: true, updatedAt: new Date() })
          .where(eq(this.db.schema.itineraries.id, onlyItinerary.id))
          .returning()

        if (updated) {
          itineraries = [updated]
        }
      }
    }

    return itineraries.map((itinerary) => this.mapToResponseDto(itinerary))
  }

  /**
   * Find one itinerary by ID
   * Optionally validates the itinerary belongs to a specific trip
   */
  async findOne(
    id: string,
    tripId?: string,
  ): Promise<ItineraryResponseDto> {
    // First get the itinerary
    const [itinerary] = await this.db.client
      .select()
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.id, id))
      .limit(1)

    if (!itinerary) {
      throw new NotFoundException(`Itinerary with ID ${id} not found`)
    }

    // Validate trip exists
    const [trip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, itinerary.tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Itinerary with ID ${id} not found`)
    }

    // If tripId is provided, validate the itinerary belongs to that specific trip
    if (tripId && itinerary.tripId !== tripId) {
      throw new NotFoundException(
        `Itinerary with ID ${id} does not belong to trip ${tripId}`,
      )
    }

    return this.mapToResponseDto(itinerary)
  }

  /**
   * Update an itinerary
   * Optionally validates the itinerary belongs to a specific trip
   * If status is set to 'approved', enforces single-approved rule
   */
  async update(
    id: string,
    dto: UpdateItineraryDto,
    tripId?: string,
  ): Promise<ItineraryResponseDto> {
    // Validate itinerary exists (and belongs to specific trip if provided)
    const existing = await this.findOne(id, tripId)
    const resolvedTripId = tripId || existing.tripId

    // If setting status to 'approved', enforce single-approved rule
    if (dto.status === 'approved') {
      // Archive any other approved itineraries for this trip (enforces single-approved rule)
      await this.db.client
        .update(this.db.schema.itineraries)
        .set({ status: 'archived', isSelected: false, updatedAt: new Date() })
        .where(
          and(
            eq(this.db.schema.itineraries.tripId, resolvedTripId),
            ne(this.db.schema.itineraries.id, id),
            eq(this.db.schema.itineraries.status, 'approved')
          )
        )

      // Set this itinerary as selected along with approved status
      const { primaryDestinationLat: apdLat, primaryDestinationLng: apdLng, secondaryDestinationLat: asdLat, secondaryDestinationLng: asdLng, ...approveRestDto } = dto
      const [itinerary] = await this.db.client
        .update(this.db.schema.itineraries)
        .set({
          ...approveRestDto,
          ...(apdLat !== undefined ? { primaryDestinationLat: apdLat != null ? String(apdLat) : null } : {}),
          ...(apdLng !== undefined ? { primaryDestinationLng: apdLng != null ? String(apdLng) : null } : {}),
          ...(asdLat !== undefined ? { secondaryDestinationLat: asdLat != null ? String(asdLat) : null } : {}),
          ...(asdLng !== undefined ? { secondaryDestinationLng: asdLng != null ? String(asdLng) : null } : {}),
          status: 'approved',
          isSelected: true,
          hasUnpublishedChanges: true,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.itineraries.id, id))
        .returning()

      if (!itinerary) {
        throw new NotFoundException(`Itinerary with ID ${id} not found`)
      }

      return this.mapToResponseDto(itinerary)
    }

    // Normal update for non-approved status changes
    // If status is being changed AND existing was approved, clear isSelected
    // (dto.status here is never 'approved' - that case returned above)
    const shouldClearSelected = dto.status && existing.status === 'approved'

    // Convert numeric DTO fields to strings for Drizzle numeric columns
    const { primaryDestinationLat, primaryDestinationLng, secondaryDestinationLat, secondaryDestinationLng, ...restDto } = dto
    const [itinerary] = await this.db.client
      .update(this.db.schema.itineraries)
      .set({
        ...restDto,
        ...(primaryDestinationLat !== undefined ? { primaryDestinationLat: primaryDestinationLat != null ? String(primaryDestinationLat) : null } : {}),
        ...(primaryDestinationLng !== undefined ? { primaryDestinationLng: primaryDestinationLng != null ? String(primaryDestinationLng) : null } : {}),
        ...(secondaryDestinationLat !== undefined ? { secondaryDestinationLat: secondaryDestinationLat != null ? String(secondaryDestinationLat) : null } : {}),
        ...(secondaryDestinationLng !== undefined ? { secondaryDestinationLng: secondaryDestinationLng != null ? String(secondaryDestinationLng) : null } : {}),
        ...(shouldClearSelected ? { isSelected: false } : {}),
        hasUnpublishedChanges: true,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.itineraries.id, id))
      .returning()

    if (!itinerary) {
      throw new NotFoundException(`Itinerary with ID ${id} not found`)
    }

    return this.mapToResponseDto(itinerary)
  }

  /**
   * Select an itinerary for viewing/editing
   * Sets isSelected=true for the target itinerary and false for all others
   * Does NOT change status - status changes are done via update()
   */
  async selectItinerary(
    id: string,
    tripId: string,
  ): Promise<ItineraryResponseDto> {
    // Validate itinerary exists and belongs to the trip
    await this.findOne(id, tripId)

    // Deselect all other itineraries
    await this.db.client
      .update(this.db.schema.itineraries)
      .set({ isSelected: false, updatedAt: new Date() })
      .where(
        and(
          eq(this.db.schema.itineraries.tripId, tripId),
          ne(this.db.schema.itineraries.id, id)
        )
      )

    // Select the target itinerary (keep existing status)
    const [itinerary] = await this.db.client
      .update(this.db.schema.itineraries)
      .set({ isSelected: true, updatedAt: new Date() })
      .where(eq(this.db.schema.itineraries.id, id))
      .returning()

    if (!itinerary) {
      throw new NotFoundException(`Itinerary with ID ${id} not found`)
    }

    return this.mapToResponseDto(itinerary)
  }

  /**
   * Delete an itinerary
   * Optionally validates the itinerary belongs to a specific trip
   * Guards against deleting the last itinerary or an approved itinerary
   */
  async remove(id: string, tripId?: string): Promise<void> {
    // Validate itinerary exists (and belongs to specific trip if provided)
    const itineraryToDelete = await this.findOne(id, tripId)

    // Guard: Cannot delete an approved itinerary
    if (itineraryToDelete.status === 'approved') {
      throw new BadRequestException('Cannot delete an approved itinerary. Archive it first.')
    }

    // Guard: Cannot delete the last itinerary for a trip
    const itineraryCount = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.tripId, itineraryToDelete.tripId))
      .then(result => Number(result[0]?.count ?? 0))

    if (itineraryCount <= 1) {
      throw new BadRequestException('Cannot delete the last itinerary. At least one itinerary is required.')
    }

    const [itinerary] = await this.db.client
      .delete(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.id, id))
      .returning()

    if (!itinerary) {
      throw new NotFoundException(`Itinerary with ID ${id} not found`)
    }
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(itinerary: any): ItineraryResponseDto {
    return {
      id: itinerary.id,
      tripId: itinerary.tripId,
      name: itinerary.name,
      description: itinerary.description,
      coverPhoto: itinerary.coverPhoto,
      overview: itinerary.overview,
      startDate: itinerary.startDate,
      endDate: itinerary.endDate,
      primaryDestinationName: itinerary.primaryDestinationName || null,
      primaryDestinationLat: itinerary.primaryDestinationLat ? Number(itinerary.primaryDestinationLat) : null,
      primaryDestinationLng: itinerary.primaryDestinationLng ? Number(itinerary.primaryDestinationLng) : null,
      secondaryDestinationName: itinerary.secondaryDestinationName || null,
      secondaryDestinationLat: itinerary.secondaryDestinationLat ? Number(itinerary.secondaryDestinationLat) : null,
      secondaryDestinationLng: itinerary.secondaryDestinationLng ? Number(itinerary.secondaryDestinationLng) : null,
      status: itinerary.status,
      isSelected: itinerary.isSelected,
      sequenceOrder: itinerary.sequenceOrder,
      currentVersion: itinerary.currentVersion ?? 0,
      publishedVersion: itinerary.publishedVersion ?? null,
      lastPublishedAt: itinerary.lastPublishedAt?.toISOString() ?? null,
      hasUnpublishedChanges: itinerary.hasUnpublishedChanges ?? false,
      createdAt: itinerary.createdAt.toISOString(),
      updatedAt: itinerary.updatedAt.toISOString(),
    }
  }
}
