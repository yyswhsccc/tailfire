/**
 * Tour Repository Service
 *
 * Read-only service for browsing tour catalog data.
 * Data is synced from external providers (Globus) via tour-import module.
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { eq, and, or, ilike, gte, lte, sql, asc, desc, count, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import {
  tours,
  tourOperators,
  tourDepartures,
  tourDeparturePricing,
  tourItineraryDays,
  tourHotels,
  tourMedia,
  tourInclusions,
} from '@tailfire/database'
import {
  TourSearchDto,
  TourSearchResponseDto,
  TourSummaryDto,
  TourFiltersResponseDto,
} from './dto/tour-search.dto'
import {
  TourDetailResponseDto,
  TourDeparturesResponseDto,
  TourDepartureDto,
} from './dto/tour-detail.dto'

@Injectable()
export class TourRepositoryService {
  constructor(private readonly db: DatabaseService) {}

  // ============================================================================
  // SEARCH
  // ============================================================================

  async searchTours(dto: TourSearchDto): Promise<TourSearchResponseDto> {
    const page = dto.page || 1
    const pageSize = Math.min(dto.pageSize || 20, 50)
    const offset = (page - 1) * pageSize

    // Build where conditions
    const conditions = [eq(tours.isActive, true)]

    if (dto.q) {
      const searchCondition = or(
        ilike(tours.name, `%${dto.q}%`),
        ilike(tours.description, `%${dto.q}%`)
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    if (dto.operator) {
      conditions.push(eq(tours.operatorCode, dto.operator))
    }

    if (dto.season) {
      conditions.push(eq(tours.season, dto.season))
    }

    if (dto.minDays) {
      conditions.push(gte(tours.days, dto.minDays))
    }

    if (dto.maxDays) {
      conditions.push(lte(tours.days, dto.maxDays))
    }

    const whereClause = and(...conditions)

    // Get total count
    const countResult = await this.db.db
      .select({ count: count() })
      .from(tours)
      .where(whereClause)

    const total = countResult[0]?.count ?? 0

    // Build order by
    const orderColumn =
      dto.sortBy === 'days' ? tours.days : dto.sortBy === 'createdAt' ? tours.createdAt : tours.name
    const orderFn = dto.sortDir === 'desc' ? desc : asc

    // Get tours with first image
    const toursData = await this.db.db
      .select({
        id: tours.id,
        provider: tours.provider,
        providerIdentifier: tours.providerIdentifier,
        operatorCode: tours.operatorCode,
        name: tours.name,
        season: tours.season,
        days: tours.days,
        nights: tours.nights,
        description: tours.description,
      })
      .from(tours)
      .where(whereClause)
      .orderBy(orderFn(orderColumn))
      .limit(pageSize)
      .offset(offset)

    // Batch-fetch first image + departure aggregates for all tours on this page
    // (replaces a previous N+1 that ran 2 queries per tour inside Promise.all).
    const tourIds = toursData.map((t) => t.id)

    const [imageRows, depRows] = tourIds.length === 0
      ? [[], []]
      : await Promise.all([
          // First image per tour: ordered scan + first-write-wins dedupe via Map.
          // (Could be DISTINCT ON (tour_id) if media cardinality grows.)
          this.db.db
            .select({
              tourId: tourMedia.tourId,
              url: tourMedia.url,
              sortOrder: tourMedia.sortOrder,
            })
            .from(tourMedia)
            .where(and(inArray(tourMedia.tourId, tourIds), eq(tourMedia.mediaType, 'image')))
            .orderBy(asc(tourMedia.tourId), asc(tourMedia.sortOrder)),
          // Departure aggregates grouped by tour.
          this.db.db
            .select({
              tourId: tourDepartures.tourId,
              count: count(),
              lowestPrice: sql<number>`MIN(${tourDepartures.basePriceCents})`,
            })
            .from(tourDepartures)
            .where(and(inArray(tourDepartures.tourId, tourIds), eq(tourDepartures.isActive, true)))
            .groupBy(tourDepartures.tourId),
        ])

    const firstImageByTour = new Map<string, string>()
    for (const row of imageRows) {
      if (!firstImageByTour.has(row.tourId)) firstImageByTour.set(row.tourId, row.url)
    }

    const depByTour = new Map<string, { count: number; lowestPrice: number | null }>()
    for (const row of depRows) {
      depByTour.set(row.tourId, { count: row.count ?? 0, lowestPrice: row.lowestPrice })
    }

    const tourSummaries: TourSummaryDto[] = toursData.map((tour) => {
      const dep = depByTour.get(tour.id)
      return {
        id: tour.id,
        provider: tour.provider,
        providerIdentifier: tour.providerIdentifier,
        operatorCode: tour.operatorCode,
        name: tour.name,
        season: tour.season ?? undefined,
        days: tour.days ?? undefined,
        nights: tour.nights ?? undefined,
        description: tour.description?.substring(0, 200) ?? undefined,
        imageUrl: firstImageByTour.get(tour.id) ?? undefined,
        departureCount: dep?.count ?? 0,
        lowestPriceCents: dep?.lowestPrice ?? undefined,
      }
    })

    return {
      tours: tourSummaries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  // ============================================================================
  // FILTERS
  // ============================================================================

  async getFilterOptions(_currentFilters?: TourSearchDto): Promise<TourFiltersResponseDto> {
    // Get operators with tour counts
    const operatorsResult = await this.db.db
      .select({
        code: tourOperators.code,
        name: tourOperators.name,
        count: count(tours.id),
      })
      .from(tourOperators)
      .leftJoin(tours, and(eq(tours.operatorId, tourOperators.id), eq(tours.isActive, true)))
      .groupBy(tourOperators.code, tourOperators.name)
      .orderBy(desc(count(tours.id)))

    // Get seasons with tour counts
    const seasonsResult = await this.db.db
      .select({
        season: tours.season,
        count: count(),
      })
      .from(tours)
      .where(eq(tours.isActive, true))
      .groupBy(tours.season)
      .orderBy(desc(tours.season))

    // Get min/max days
    const daysResult = await this.db.db
      .select({
        minDays: sql<number>`MIN(${tours.days})`,
        maxDays: sql<number>`MAX(${tours.days})`,
      })
      .from(tours)
      .where(eq(tours.isActive, true))

    return {
      operators: operatorsResult.map((op) => ({
        code: op.code,
        name: op.name,
        count: op.count ?? 0,
      })),
      seasons: seasonsResult
        .filter((s) => s.season)
        .map((s) => ({
          season: s.season!,
          count: s.count ?? 0,
        })),
      minDays: daysResult[0]?.minDays ?? 1,
      maxDays: daysResult[0]?.maxDays ?? 30,
    }
  }

  // ============================================================================
  // TOUR DETAIL
  // ============================================================================

  async getTourDetail(id: string): Promise<TourDetailResponseDto> {
    // Get tour
    const tourResult = await this.db.db
      .select()
      .from(tours)
      .where(and(eq(tours.id, id), eq(tours.isActive, true)))
      .limit(1)

    if (tourResult.length === 0) {
      throw new NotFoundException(`Tour ${id} not found`)
    }

    const tour = tourResult[0]!

    // Get itinerary
    const itinerary = await this.db.db
      .select()
      .from(tourItineraryDays)
      .where(eq(tourItineraryDays.tourId, id))
      .orderBy(asc(tourItineraryDays.dayNumber))

    // Get hotels
    const hotels = await this.db.db.select().from(tourHotels).where(eq(tourHotels.tourId, id))

    // Get media
    const media = await this.db.db
      .select()
      .from(tourMedia)
      .where(eq(tourMedia.tourId, id))
      .orderBy(asc(tourMedia.sortOrder))

    // Get inclusions
    const inclusions = await this.db.db
      .select()
      .from(tourInclusions)
      .where(eq(tourInclusions.tourId, id))
      .orderBy(asc(tourInclusions.sortOrder))

    // Get departure count and lowest price
    const depResult = await this.db.db
      .select({
        count: count(),
        lowestPrice: sql<number>`MIN(${tourDepartures.basePriceCents})`,
      })
      .from(tourDepartures)
      .where(and(eq(tourDepartures.tourId, id), eq(tourDepartures.isActive, true)))

    return {
      id: tour.id,
      provider: tour.provider,
      providerIdentifier: tour.providerIdentifier,
      operatorCode: tour.operatorCode,
      name: tour.name,
      season: tour.season ?? undefined,
      days: tour.days ?? undefined,
      nights: tour.nights ?? undefined,
      description: tour.description ?? undefined,
      itinerary: itinerary.map((day) => ({
        dayNumber: day.dayNumber,
        title: day.title ?? undefined,
        description: day.description ?? undefined,
        overnightCity: day.overnightCity ?? undefined,
      })),
      hotels: hotels.map((hotel) => ({
        dayNumber: hotel.dayNumber ?? undefined,
        hotelName: hotel.hotelName,
        city: hotel.city ?? undefined,
        description: hotel.description ?? undefined,
      })),
      media: media.map((m) => ({
        mediaType: m.mediaType as 'image' | 'brochure' | 'video' | 'map',
        url: m.url,
        caption: m.caption ?? undefined,
      })),
      inclusions: inclusions.map((inc) => ({
        inclusionType: inc.inclusionType as 'included' | 'excluded' | 'highlight',
        category: inc.category ?? undefined,
        description: inc.description,
      })),
      departureCount: depResult[0]?.count ?? 0,
      lowestPriceCents: depResult[0]?.lowestPrice ?? undefined,
    }
  }

  // ============================================================================
  // DEPARTURES
  // ============================================================================

  async getTourDepartures(tourId: string): Promise<TourDeparturesResponseDto> {
    // Verify tour exists
    const tourExists = await this.db.db
      .select({ id: tours.id })
      .from(tours)
      .where(and(eq(tours.id, tourId), eq(tours.isActive, true)))
      .limit(1)

    if (tourExists.length === 0) {
      throw new NotFoundException(`Tour ${tourId} not found`)
    }

    // Get departures
    const departures = await this.db.db
      .select()
      .from(tourDepartures)
      .where(and(eq(tourDepartures.tourId, tourId), eq(tourDepartures.isActive, true)))
      .orderBy(asc(tourDepartures.landStartDate))

    // Get pricing for each departure
    const departuresWithPricing: TourDepartureDto[] = await Promise.all(
      departures.map(async (dep) => {
        const pricing = await this.db.db
          .select()
          .from(tourDeparturePricing)
          .where(eq(tourDeparturePricing.departureId, dep.id))

        return {
          id: dep.id,
          departureCode: dep.departureCode,
          season: dep.season ?? undefined,
          landStartDate: dep.landStartDate ?? undefined,
          landEndDate: dep.landEndDate ?? undefined,
          status: dep.status ?? undefined,
          basePriceCents: dep.basePriceCents ?? undefined,
          currency: dep.currency ?? 'CAD',
          guaranteedDeparture: dep.guaranteedDeparture ?? false,
          shipName: dep.shipName ?? undefined,
          startCity: dep.startCity ?? undefined,
          endCity: dep.endCity ?? undefined,
          cabinPricing: pricing.map((p) => ({
            cabinCategory: p.cabinCategory ?? undefined,
            priceCents: p.priceCents,
            discountCents: p.discountCents ?? undefined,
            currency: p.currency ?? 'CAD',
          })),
        }
      })
    )

    return {
      tourId,
      departures: departuresWithPricing,
      total: departuresWithPricing.length,
    }
  }
}
