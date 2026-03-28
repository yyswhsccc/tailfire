/**
 * Vacation Repository Service
 *
 * Provides read-only search and detail queries for vacation catalog tables.
 * Features:
 * - List active gateways (departure cities)
 * - List destinations, optionally filtered by gateway
 * - Paginated hotel search with text, star, destination, and amenity filters
 * - Hotel detail with LEFT JOIN enrichment (Google Places + TripAdvisor)
 * - Filter option helpers for UI dropdowns
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { eq, and, gte, lte, ilike, asc, desc, sql, count } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import {
  vacationGateways,
  vacationDestinations,
  vacationHotels,
  vacationGatewayDestinations,
  vacationHotelEnrichment,
} from '@tailfire/database'
import type {
  VacationHotelSearchDto,
  VacationHotelSearchResponseDto,
  VacationHotelSummary,
  VacationHotelDetail,
  VacationEnrichmentData,
} from './dto/vacation-search.dto'

@Injectable()
export class VacationRepositoryService {
  private readonly DEFAULT_PAGE_SIZE = 20
  private readonly MAX_PAGE_SIZE = 50

  constructor(private readonly db: DatabaseService) {}

  // ============================================================================
  // LIST GATEWAYS
  // ============================================================================

  async listGateways(): Promise<{ id: string; name: string; airportCode: string }[]> {
    const results = await this.db.db
      .select({
        id: vacationGateways.id,
        name: vacationGateways.name,
        airportCode: vacationGateways.airportCode,
      })
      .from(vacationGateways)
      .where(eq(vacationGateways.isActive, true))
      .orderBy(asc(vacationGateways.name))

    return results
  }

  // ============================================================================
  // LIST DESTINATIONS
  // ============================================================================

  async listDestinations(gatewayId?: string): Promise<
    {
      id: string
      name: string
      countryCode: string | null
      countryName: string | null
      regionGroup: string | null
      availableDurations: number[] | null
    }[]
  > {
    if (gatewayId) {
      // When filtering by gateway, join through the gateway_destinations pivot table
      const results = await this.db.db
        .select({
          id: vacationDestinations.id,
          name: vacationDestinations.name,
          countryCode: vacationDestinations.countryCode,
          countryName: vacationDestinations.countryName,
          regionGroup: vacationDestinations.regionGroup,
          availableDurations: vacationDestinations.availableDurations,
        })
        .from(vacationDestinations)
        .innerJoin(
          vacationGatewayDestinations,
          eq(vacationGatewayDestinations.destinationId, vacationDestinations.id)
        )
        .where(
          and(
            eq(vacationDestinations.isActive, true),
            eq(vacationGatewayDestinations.gatewayId, gatewayId)
          )
        )
        .orderBy(asc(vacationDestinations.name))

      return results
    }

    // No gateway filter — return all active destinations
    const results = await this.db.db
      .select({
        id: vacationDestinations.id,
        name: vacationDestinations.name,
        countryCode: vacationDestinations.countryCode,
        countryName: vacationDestinations.countryName,
        regionGroup: vacationDestinations.regionGroup,
        availableDurations: vacationDestinations.availableDurations,
      })
      .from(vacationDestinations)
      .where(eq(vacationDestinations.isActive, true))
      .orderBy(asc(vacationDestinations.name))

    return results
  }

  // ============================================================================
  // SEARCH HOTELS
  // ============================================================================

  async searchHotels(dto: VacationHotelSearchDto): Promise<VacationHotelSearchResponseDto> {
    // Pagination with caps
    const page = Math.max(1, dto.page ?? 1)
    const pageSize = Math.min(dto.pageSize ?? this.DEFAULT_PAGE_SIZE, this.MAX_PAGE_SIZE)
    const offset = (page - 1) * pageSize

    // Build WHERE conditions
    const conditions: ReturnType<typeof eq>[] = [eq(vacationHotels.isActive, true) as any]

    // Text search on hotel name
    if (dto.q) {
      conditions.push(ilike(vacationHotels.name, `%${dto.q}%`) as any)
    }

    // Destination filter
    if (dto.destinationId) {
      conditions.push(eq(vacationHotels.destinationId, dto.destinationId) as any)
    }

    // Star rating filters
    if (dto.minStars !== undefined) {
      conditions.push(gte(vacationHotels.starRating, dto.minStars) as any)
    }
    if (dto.maxStars !== undefined) {
      conditions.push(lte(vacationHotels.starRating, dto.maxStars) as any)
    }

    // Build sort column
    let sortColumn: any
    switch (dto.sortBy) {
      case 'starRating':
        sortColumn = vacationHotels.starRating
        break
      case 'monarcRating':
        sortColumn = vacationHotels.monarcRating
        break
      case 'name':
      default:
        sortColumn = vacationHotels.name
        break
    }
    const sortFn = dto.sortDir === 'desc' ? desc : asc

    const whereClause = and(...conditions)

    // Count query
    const countResult = await this.db.db
      .select({ total: count(vacationHotels.id) })
      .from(vacationHotels)
      .where(whereClause)

    const total = Number(countResult[0]?.total ?? 0)

    // Main query with destination JOIN
    const results = await this.db.db
      .select({
        id: vacationHotels.id,
        name: vacationHotels.name,
        starRating: vacationHotels.starRating,
        imageUrl: vacationHotels.imageUrl,
        amenities: vacationHotels.amenities,
        monarcRating: vacationHotels.monarcRating,
        monarcReviewCount: vacationHotels.monarcReviewCount,
        destinationName: vacationDestinations.name,
      })
      .from(vacationHotels)
      .leftJoin(vacationDestinations, eq(vacationHotels.destinationId, vacationDestinations.id))
      .where(whereClause)
      .orderBy(sortFn(sortColumn))
      .limit(pageSize)
      .offset(offset)

    const items: VacationHotelSummary[] = results.map((row) => ({
      id: row.id,
      name: row.name,
      destination: row.destinationName ?? '',
      starRating: row.starRating ?? null,
      imageUrl: row.imageUrl ?? null,
      amenities: (row.amenities as Record<string, boolean> | null) ?? null,
      monarcRating: row.monarcRating ?? null,
      monarcReviewCount: row.monarcReviewCount ?? null,
    }))

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: offset + items.length < total,
    }
  }

  // ============================================================================
  // GET HOTEL DETAIL
  // ============================================================================

  async getHotelDetail(id: string): Promise<VacationHotelDetail> {
    const results = await this.db.db
      .select({
        id: vacationHotels.id,
        name: vacationHotels.name,
        hotelChain: vacationHotels.hotelChain,
        starRating: vacationHotels.starRating,
        imageUrl: vacationHotels.imageUrl,
        amenities: vacationHotels.amenities,
        monarcRating: vacationHotels.monarcRating,
        monarcReviewCount: vacationHotels.monarcReviewCount,
        destinationName: vacationDestinations.name,
        // Enrichment fields
        googleRating: vacationHotelEnrichment.googleRating,
        googleReviewCount: vacationHotelEnrichment.googleReviewCount,
        tripadvisorRating: vacationHotelEnrichment.tripadvisorRating,
        tripadvisorReviewCount: vacationHotelEnrichment.tripadvisorReviewCount,
        tripadvisorLink: vacationHotelEnrichment.tripadvisorLink,
        latitude: vacationHotelEnrichment.latitude,
        longitude: vacationHotelEnrichment.longitude,
        formattedAddress: vacationHotelEnrichment.formattedAddress,
        website: vacationHotelEnrichment.website,
        phone: vacationHotelEnrichment.phone,
        photos: vacationHotelEnrichment.photos,
        enrichedAt: vacationHotelEnrichment.enrichedAt,
        expiresAt: vacationHotelEnrichment.expiresAt,
      })
      .from(vacationHotels)
      .leftJoin(
        vacationHotelEnrichment,
        eq(vacationHotelEnrichment.hotelId, vacationHotels.id)
      )
      .leftJoin(vacationDestinations, eq(vacationHotels.destinationId, vacationDestinations.id))
      .where(eq(vacationHotels.id, id))
      .limit(1)

    const row = results[0]
    if (!row) {
      throw new NotFoundException(`Vacation hotel with id ${id} not found`)
    }

    // Determine enrichment staleness
    const hasEnrichment = row.enrichedAt !== null
    const isStale = hasEnrichment && row.expiresAt !== null && row.expiresAt < new Date()

    const enrichment: VacationEnrichmentData | null = hasEnrichment
      ? {
          googleRating: row.googleRating ?? null,
          googleReviewCount: row.googleReviewCount ?? null,
          tripadvisorRating: row.tripadvisorRating ?? null,
          tripadvisorReviewCount: row.tripadvisorReviewCount ?? null,
          tripadvisorLink: row.tripadvisorLink ?? null,
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null,
          address: row.formattedAddress ?? null,
          website: row.website ?? null,
          phone: row.phone ?? null,
          photos: (row.photos as string[]) ?? [],
          enrichedAt: row.enrichedAt?.toISOString() ?? null,
          isStale: isStale ?? false,
        }
      : null

    return {
      id: row.id,
      name: row.name,
      destination: row.destinationName ?? '',
      hotelChain: row.hotelChain ?? null,
      starRating: row.starRating ?? null,
      imageUrl: row.imageUrl ?? null,
      amenities: (row.amenities as Record<string, boolean> | null) ?? null,
      monarcRating: row.monarcRating ?? null,
      monarcReviewCount: row.monarcReviewCount ?? null,
      enrichment,
    }
  }

  // ============================================================================
  // GET FILTER OPTIONS
  // ============================================================================

  async getFilterOptions(): Promise<{
    starRatings: number[]
    destinations: { id: string; name: string }[]
  }> {
    // Distinct star ratings from active hotels
    const starRatingsResult = await this.db.db
      .selectDistinct({ starRating: vacationHotels.starRating })
      .from(vacationHotels)
      .where(
        and(eq(vacationHotels.isActive, true), sql`${vacationHotels.starRating} IS NOT NULL`)
      )
      .orderBy(asc(vacationHotels.starRating))

    const starRatings = starRatingsResult
      .map((r) => r.starRating)
      .filter((s): s is number => s !== null)

    // Distinct destinations from active hotels
    const destinationsResult = await this.db.db
      .selectDistinct({
        id: vacationDestinations.id,
        name: vacationDestinations.name,
      })
      .from(vacationHotels)
      .innerJoin(vacationDestinations, eq(vacationHotels.destinationId, vacationDestinations.id))
      .where(eq(vacationHotels.isActive, true))
      .orderBy(asc(vacationDestinations.name))

    return {
      starRatings,
      destinations: destinationsResult,
    }
  }
}
