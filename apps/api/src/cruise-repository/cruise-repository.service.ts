/**
 * Cruise Repository Service
 *
 * Provides search and detail queries for cruise sailings.
 * Features:
 * - Full-text search across sailing name, ship, ports
 * - Filter by line, ship, region, port, dates, nights, price
 * - Pagination with capped page size (max 50)
 * - Price summary with lastSyncedAt for staleness detection
 * - Paginated ship images for heavy asset management
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { eq, and, gte, lte, ilike, sql, desc, asc, or, inArray, exists } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ImportOrchestratorService } from '../cruise-import/services/import-orchestrator.service'
import {
  SailingSearchDto,
  SailingSearchResponseDto,
  SailingSearchItemDto,
  SortField,
  SortDirection,
  CabinCategory,
  SailingFiltersResponseDto,
} from './dto/sailing-search.dto'
import {
  SailingDetailResponseDto,
  ShipImagesResponseDto,
  ItineraryStopDto,
  CabinPriceDto,
  ShipDecksResponseDto,
  AlternateSailingsResponseDto,
  CabinImagesResponseDto,
} from './dto/sailing-detail.dto'
import type { DeckMetadata } from '@tailfire/database'

@Injectable()
export class CruiseRepositoryService {
  // Constants
  private readonly DEFAULT_PAGE_SIZE = 20
  private readonly MAX_PAGE_SIZE = 50
  private readonly STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

  constructor(
    private readonly db: DatabaseService,
    private readonly importOrchestrator: ImportOrchestratorService
  ) {}

  // ============================================================================
  // SEARCH SAILINGS
  // ============================================================================

  async searchSailings(dto: SailingSearchDto): Promise<SailingSearchResponseDto> {
    const {
      cruiseSailings,
      cruiseShips,
      cruiseLines,
      cruiseSailingRegions,
    } = this.db.schema

    // Pagination with caps
    const page = Math.max(1, dto.page ?? 1)
    const pageSize = Math.min(dto.pageSize ?? this.DEFAULT_PAGE_SIZE, this.MAX_PAGE_SIZE)
    const offset = (page - 1) * pageSize

    // Build WHERE conditions
    const conditions: any[] = [eq(cruiseSailings.isActive, true)]

    // Only show future sailings (sail date >= today) unless a specific date range is provided
    if (!dto.sailDateFrom) {
      const today = new Date().toISOString().split('T')[0]!
      conditions.push(gte(cruiseSailings.sailDate, today))
    }

    // Text search - broadly matches sailing name, ship, cruise line, ports, and regions
    if (dto.q) {
      const { cruiseSailingStops, cruisePorts, cruiseRegions } = this.db.schema
      const searchTerm = `%${dto.q}%`
      conditions.push(
        or(
          // Direct fields
          ilike(cruiseSailings.name, searchTerm),
          ilike(cruiseShips.name, searchTerm),
          ilike(cruiseLines.name, searchTerm),
          ilike(cruiseSailings.embarkPortName, searchTerm),
          ilike(cruiseSailings.disembarkPortName, searchTerm),
          // Ports of call (intermediate stops)
          exists(
            this.db.db
              .select({ one: sql`1` })
              .from(cruiseSailingStops)
              .innerJoin(cruisePorts, eq(cruiseSailingStops.portId, cruisePorts.id))
              .where(
                and(
                  eq(cruiseSailingStops.sailingId, cruiseSailings.id),
                  ilike(cruisePorts.name, searchTerm)
                )
              )
          ),
          // Regions
          exists(
            this.db.db
              .select({ one: sql`1` })
              .from(cruiseSailingRegions)
              .innerJoin(cruiseRegions, eq(cruiseSailingRegions.regionId, cruiseRegions.id))
              .where(
                and(
                  eq(cruiseSailingRegions.sailingId, cruiseSailings.id),
                  ilike(cruiseRegions.name, searchTerm)
                )
              )
          )
        )
      )
    }

    // FK filters
    if (dto.cruiseLineId) {
      conditions.push(eq(cruiseSailings.cruiseLineId, dto.cruiseLineId))
    }
    if (dto.shipId) {
      conditions.push(eq(cruiseSailings.shipId, dto.shipId))
    }
    if (dto.embarkPortId) {
      conditions.push(eq(cruiseSailings.embarkPortId, dto.embarkPortId))
    }
    if (dto.disembarkPortId) {
      conditions.push(eq(cruiseSailings.disembarkPortId, dto.disembarkPortId))
    }

    // Ports of call filter (sailings that visit any of these ports)
    if (dto.portOfCallIds && dto.portOfCallIds.length > 0) {
      const { cruiseSailingStops } = this.db.schema
      // EXISTS subquery: find sailings that have a stop at any of the specified ports
      conditions.push(
        exists(
          this.db.db
            .select({ one: sql`1` })
            .from(cruiseSailingStops)
            .where(
              and(
                eq(cruiseSailingStops.sailingId, cruiseSailings.id),
                inArray(cruiseSailingStops.portId, dto.portOfCallIds)
              )
            )
        )
      )
    }

    // Date range
    if (dto.sailDateFrom) {
      conditions.push(gte(cruiseSailings.sailDate, dto.sailDateFrom))
    }
    if (dto.sailDateTo) {
      conditions.push(lte(cruiseSailings.sailDate, dto.sailDateTo))
    }

    // Nights range
    if (dto.nightsMin !== undefined) {
      conditions.push(gte(cruiseSailings.nights, dto.nightsMin))
    }
    if (dto.nightsMax !== undefined) {
      conditions.push(lte(cruiseSailings.nights, dto.nightsMax))
    }

    // Price range (based on cabin category)
    const priceCol = this.getPriceColumnRef(cruiseSailings, dto.cabinCategory ?? CabinCategory.INSIDE)
    if (dto.priceMinCents !== undefined && priceCol) {
      conditions.push(gte(priceCol, dto.priceMinCents))
    }
    if (dto.priceMaxCents !== undefined && priceCol) {
      conditions.push(lte(priceCol, dto.priceMaxCents))
    }

    // Region filter (via join table)
    let regionFilter: string | undefined
    if (dto.regionId) {
      regionFilter = dto.regionId
    }

    // Build sort order
    const sortDir = dto.sortDir === SortDirection.DESC ? desc : asc
    const sortColumn = this.getSortColumn(dto.sortBy ?? SortField.SAIL_DATE)

    // Execute count query
    const countResult = await this.db.db
      .select({ count: sql<number>`COUNT(DISTINCT ${cruiseSailings.id})` })
      .from(cruiseSailings)
      .leftJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
      .leftJoin(cruiseLines, eq(cruiseSailings.cruiseLineId, cruiseLines.id))
      .leftJoin(cruiseSailingRegions, eq(cruiseSailings.id, cruiseSailingRegions.sailingId))
      .where(
        regionFilter
          ? and(...conditions, eq(cruiseSailingRegions.regionId, regionFilter))
          : and(...conditions)
      )

    const totalItems = Number(countResult[0]?.count ?? 0)
    const totalPages = Math.ceil(totalItems / pageSize)

    // Execute main query
    // Build where clause safely - filter out undefined conditions
    const validConditions = conditions.filter((c): c is NonNullable<typeof c> => c != null)
    const whereClause = validConditions.length > 0 ? and(...validConditions) : undefined

    const results = await this.db.db
      .select({
        id: cruiseSailings.id,
        name: cruiseSailings.name,
        sailDate: cruiseSailings.sailDate,
        endDate: cruiseSailings.endDate,
        nights: cruiseSailings.nights,
        embarkPortId: cruiseSailings.embarkPortId,
        embarkPortName: cruiseSailings.embarkPortName,
        disembarkPortId: cruiseSailings.disembarkPortId,
        disembarkPortName: cruiseSailings.disembarkPortName,
        cheapestInsideCents: cruiseSailings.cheapestInsideCents,
        cheapestOceanviewCents: cruiseSailings.cheapestOceanviewCents,
        cheapestBalconyCents: cruiseSailings.cheapestBalconyCents,
        cheapestSuiteCents: cruiseSailings.cheapestSuiteCents,
        lastSyncedAt: cruiseSailings.lastSyncedAt,
        shipId: cruiseShips.id,
        shipName: cruiseShips.name,
        shipImageUrl: cruiseShips.imageUrl,
        lineId: cruiseLines.id,
        lineName: cruiseLines.name,
        lineMetadata: cruiseLines.metadata,
        // Join actual port names from cruise_ports table
        embarkPortActualName: sql<string>`embark_port.name`.as('embark_port_actual_name'),
        disembarkPortActualName: sql<string>`disembark_port.name`.as('disembark_port_actual_name'),
      })
      .from(cruiseSailings)
      .leftJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
      .leftJoin(cruiseLines, eq(cruiseSailings.cruiseLineId, cruiseLines.id))
      .leftJoin(
        sql`catalog.cruise_ports as embark_port`,
        sql`${cruiseSailings.embarkPortId} = embark_port.id`
      )
      .leftJoin(
        sql`catalog.cruise_ports as disembark_port`,
        sql`${cruiseSailings.disembarkPortId} = disembark_port.id`
      )
      .where(whereClause)
      .orderBy(sortDir(sortColumn))
      .limit(pageSize)
      .offset(offset)

    // Map to response DTOs
    const items: SailingSearchItemDto[] = results.map((row) => {
      // Extract logoUrl from metadata if available
      const lineMetadata = row.lineMetadata as { logo_url?: string } | null
      // Use actual port name from join, fallback to stored name, then 'Unknown'
      const embarkName = row.embarkPortActualName || row.embarkPortName || 'Unknown'
      const disembarkName = row.disembarkPortActualName || row.disembarkPortName || 'Unknown'
      return {
        id: row.id,
        name: row.name,
        sailDate: row.sailDate,
        endDate: row.endDate,
        nights: row.nights,
        ship: {
          id: row.shipId || '',
          name: row.shipName || 'Unknown Ship',
          imageUrl: row.shipImageUrl,
        },
        cruiseLine: {
          id: row.lineId || '',
          name: row.lineName || 'Unknown Line',
          logoUrl: lineMetadata?.logo_url || null,
        },
        embarkPort: {
          id: row.embarkPortId,
          name: embarkName,
        },
        disembarkPort: {
          id: row.disembarkPortId,
          name: disembarkName,
        },
        prices: {
          inside: row.cheapestInsideCents,
          oceanview: row.cheapestOceanviewCents,
          balcony: row.cheapestBalconyCents,
          suite: row.cheapestSuiteCents,
        },
        lastSyncedAt: row.lastSyncedAt?.toISOString() || new Date().toISOString(),
        pricesUpdating: this.isPricesStale(row.lastSyncedAt),
      }
    })

    // Get global sync status from orchestrator
    const syncInProgress = this.importOrchestrator.isSyncInProgress()

    // Get most recent lastSyncedAt from results (or null if no results)
    const lastSyncedAt = items.length > 0 && items[0] ? items[0].lastSyncedAt : null

    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasMore: page < totalPages,
      },
      sync: {
        syncInProgress,
        pricesUpdating: syncInProgress, // Deprecated alias
        lastSyncedAt,
      },
      filters: {
        q: dto.q,
        cruiseLineId: dto.cruiseLineId,
        shipId: dto.shipId,
        regionId: dto.regionId,
        embarkPortId: dto.embarkPortId,
        sailDateFrom: dto.sailDateFrom,
        sailDateTo: dto.sailDateTo,
        nightsMin: dto.nightsMin,
        nightsMax: dto.nightsMax,
        priceMinCents: dto.priceMinCents,
        priceMaxCents: dto.priceMaxCents,
        cabinCategory: dto.cabinCategory,
        portOfCallIds: dto.portOfCallIds,
        sortBy: dto.sortBy,
        sortDir: dto.sortDir,
      },
    }
  }

  // ============================================================================
  // FILTER OPTIONS
  // ============================================================================

  async getFilterOptions(currentFilters?: Partial<SailingSearchDto>): Promise<SailingFiltersResponseDto> {
    const {
      cruiseSailings,
      cruiseShips,
      cruiseLines,
      cruiseRegions,
      cruisePorts,
      cruiseSailingRegions,
      cruiseSailingStops,
    } = this.db.schema

    // Build base conditions that apply to all filter option queries
    // This ensures dropdowns are filtered based on current selections
    const baseConditions: any[] = [eq(cruiseSailings.isActive, true)]

    // Only include future sailings in filter options unless a specific date range is provided
    if (!currentFilters?.sailDateFrom) {
      const today = new Date().toISOString().split('T')[0]!
      baseConditions.push(gte(cruiseSailings.sailDate, today))
    }

    if (currentFilters?.cruiseLineId) {
      baseConditions.push(eq(cruiseSailings.cruiseLineId, currentFilters.cruiseLineId))
    }
    if (currentFilters?.shipId) {
      baseConditions.push(eq(cruiseSailings.shipId, currentFilters.shipId))
    }
    if (currentFilters?.embarkPortId) {
      baseConditions.push(eq(cruiseSailings.embarkPortId, currentFilters.embarkPortId))
    }
    if (currentFilters?.disembarkPortId) {
      baseConditions.push(eq(cruiseSailings.disembarkPortId, currentFilters.disembarkPortId))
    }
    if (currentFilters?.sailDateFrom) {
      baseConditions.push(gte(cruiseSailings.sailDate, currentFilters.sailDateFrom))
    }
    if (currentFilters?.sailDateTo) {
      baseConditions.push(lte(cruiseSailings.sailDate, currentFilters.sailDateTo))
    }
    if (currentFilters?.nightsMin !== undefined) {
      baseConditions.push(gte(cruiseSailings.nights, currentFilters.nightsMin))
    }
    if (currentFilters?.nightsMax !== undefined) {
      baseConditions.push(lte(cruiseSailings.nights, currentFilters.nightsMax))
    }

    // Get distinct cruise lines with counts
    const linesResult = await this.db.db
      .select({
        id: cruiseLines.id,
        name: cruiseLines.name,
        count: sql<number>`COUNT(${cruiseSailings.id})`,
      })
      .from(cruiseLines)
      .leftJoin(cruiseSailings, eq(cruiseSailings.cruiseLineId, cruiseLines.id))
      .where(and(...baseConditions))
      .groupBy(cruiseLines.id, cruiseLines.name)
      .orderBy(cruiseLines.name)

    // Get distinct ships with counts (filtered by current cruiseLine if selected)
    const shipsResult = await this.db.db
      .select({
        id: cruiseShips.id,
        name: cruiseShips.name,
        count: sql<number>`COUNT(${cruiseSailings.id})`,
      })
      .from(cruiseShips)
      .leftJoin(cruiseSailings, eq(cruiseSailings.shipId, cruiseShips.id))
      .where(and(...baseConditions))
      .groupBy(cruiseShips.id, cruiseShips.name)
      .orderBy(cruiseShips.name)

    // Get distinct regions with counts (filtered by current selections)
    const regionsResult = await this.db.db
      .select({
        id: cruiseRegions.id,
        name: cruiseRegions.name,
        count: sql<number>`COUNT(DISTINCT ${cruiseSailingRegions.sailingId})`,
      })
      .from(cruiseRegions)
      .leftJoin(cruiseSailingRegions, eq(cruiseSailingRegions.regionId, cruiseRegions.id))
      .leftJoin(cruiseSailings, eq(cruiseSailings.id, cruiseSailingRegions.sailingId))
      .where(and(...baseConditions))
      .groupBy(cruiseRegions.id, cruiseRegions.name)
      .orderBy(cruiseRegions.name)

    // Get distinct embark ports with counts (filtered by current selections)
    const embarkPortsResult = await this.db.db
      .select({
        id: cruisePorts.id,
        name: cruisePorts.name,
        count: sql<number>`COUNT(${cruiseSailings.id})`,
      })
      .from(cruisePorts)
      .leftJoin(cruiseSailings, eq(cruiseSailings.embarkPortId, cruisePorts.id))
      .where(and(...baseConditions))
      .groupBy(cruisePorts.id, cruisePorts.name)
      .orderBy(cruisePorts.name)

    // Get distinct disembark ports with counts (filtered by current selections)
    const disembarkPortsResult = await this.db.db
      .select({
        id: cruisePorts.id,
        name: cruisePorts.name,
        count: sql<number>`COUNT(${cruiseSailings.id})`,
      })
      .from(cruisePorts)
      .leftJoin(cruiseSailings, eq(cruiseSailings.disembarkPortId, cruisePorts.id))
      .where(and(...baseConditions))
      .groupBy(cruisePorts.id, cruisePorts.name)
      .orderBy(cruisePorts.name)

    // Get ports of call (all ports visited during sailings, not embark/disembark)
    // Group by trimmed name to deduplicate ports with same name but different IDs
    // Collect all port IDs for each unique name (for filtering)
    const portsOfCallResult = await this.db.db
      .select({
        // Use array indexing to get first ID (MIN doesn't work with UUID type)
        id: sql<string>`(ARRAY_AGG(${cruisePorts.id}))[1]`,
        name: sql<string>`TRIM(${cruisePorts.name})`,
        count: sql<number>`COUNT(DISTINCT ${cruiseSailingStops.sailingId})`,
        allIds: sql<string[]>`ARRAY_AGG(DISTINCT ${cruisePorts.id})`, // All IDs for this port name
      })
      .from(cruisePorts)
      .innerJoin(cruiseSailingStops, eq(cruiseSailingStops.portId, cruisePorts.id))
      .innerJoin(cruiseSailings, eq(cruiseSailings.id, cruiseSailingStops.sailingId))
      .where(and(...baseConditions, eq(cruiseSailingStops.isSeaDay, false)))
      .groupBy(sql`TRIM(${cruisePorts.name})`)
      .orderBy(sql`TRIM(${cruisePorts.name})`)

    // Get date range (future sailings only)
    const dateRangeResult = await this.db.db
      .select({
        minDate: sql<string>`MIN(${cruiseSailings.sailDate})`,
        maxDate: sql<string>`MAX(${cruiseSailings.sailDate})`,
      })
      .from(cruiseSailings)
      .where(and(...baseConditions))

    // Get nights range
    const nightsRangeResult = await this.db.db
      .select({
        minNights: sql<number>`MIN(${cruiseSailings.nights})`,
        maxNights: sql<number>`MAX(${cruiseSailings.nights})`,
      })
      .from(cruiseSailings)
      .where(and(...baseConditions))

    // Get price range (inside cabin)
    const priceRangeResult = await this.db.db
      .select({
        minPrice: sql<number>`MIN(${cruiseSailings.cheapestInsideCents})`,
        maxPrice: sql<number>`MAX(${cruiseSailings.cheapestInsideCents})`,
      })
      .from(cruiseSailings)
      .where(
        and(
          ...baseConditions,
          sql`${cruiseSailings.cheapestInsideCents} IS NOT NULL`
        )
      )

    return {
      cruiseLines: (linesResult || []).map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
      ships: (shipsResult || []).map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
      regions: (regionsResult || []).map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
      embarkPorts: (embarkPortsResult || []).map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
      disembarkPorts: (disembarkPortsResult || []).map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
      portsOfCall: (portsOfCallResult || []).map((r) => ({
        id: r.id,
        name: r.name,
        count: Number(r.count),
        allIds: r.allIds || [r.id], // All port IDs with this name (for filtering duplicates)
      })),
      dateRange: {
        min: dateRangeResult?.[0]?.minDate || null,
        max: dateRangeResult?.[0]?.maxDate || null,
      },
      nightsRange: {
        min: nightsRangeResult?.[0]?.minNights ?? null,
        max: nightsRangeResult?.[0]?.maxNights ?? null,
      },
      priceRange: {
        min: priceRangeResult?.[0]?.minPrice ?? null,
        max: priceRangeResult?.[0]?.maxPrice ?? null,
      },
    }
  }

  // ============================================================================
  // SAILING DETAIL
  // ============================================================================

  async getSailingDetail(id: string): Promise<SailingDetailResponseDto> {
    const {
      cruiseSailings,
      cruiseShips,
      cruiseLines,
      cruisePorts,
      cruiseSailingStops,
      cruiseSailingCabinPrices,
      cruiseSailingRegions,
      cruiseRegions,
    } = this.db.schema

    // Get sailing with joins
    const [sailing] = await this.db.db
      .select({
        // Sailing fields
        id: cruiseSailings.id,
        provider: cruiseSailings.provider,
        providerIdentifier: cruiseSailings.providerIdentifier,
        name: cruiseSailings.name,
        sailDate: cruiseSailings.sailDate,
        endDate: cruiseSailings.endDate,
        nights: cruiseSailings.nights,
        embarkPortId: cruiseSailings.embarkPortId,
        embarkPortName: cruiseSailings.embarkPortName,
        disembarkPortId: cruiseSailings.disembarkPortId,
        disembarkPortName: cruiseSailings.disembarkPortName,
        cheapestInsideCents: cruiseSailings.cheapestInsideCents,
        cheapestOceanviewCents: cruiseSailings.cheapestOceanviewCents,
        cheapestBalconyCents: cruiseSailings.cheapestBalconyCents,
        cheapestSuiteCents: cruiseSailings.cheapestSuiteCents,
        // Market and flight data
        marketId: cruiseSailings.marketId,
        noFly: cruiseSailings.noFly,
        departUk: cruiseSailings.departUk,
        metadata: cruiseSailings.metadata,
        lastSyncedAt: cruiseSailings.lastSyncedAt,
        createdAt: cruiseSailings.createdAt,
        updatedAt: cruiseSailings.updatedAt,
        // Ship fields
        shipId: cruiseShips.id,
        shipName: cruiseShips.name,
        shipClass: cruiseShips.shipClass,
        shipImageUrl: cruiseShips.imageUrl,
        shipMetadata: cruiseShips.metadata,
        // Line fields
        lineId: cruiseLines.id,
        lineName: cruiseLines.name,
        lineMetadata: cruiseLines.metadata, // logoUrl and websiteUrl are in metadata
      })
      .from(cruiseSailings)
      .leftJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
      .leftJoin(cruiseLines, eq(cruiseSailings.cruiseLineId, cruiseLines.id))
      .where(eq(cruiseSailings.id, id))
      .limit(1)

    if (!sailing) {
      throw new NotFoundException(`Sailing not found: ${id}`)
    }

    // Get embark port
    let embarkPort = null
    if (sailing.embarkPortId) {
      const [port] = await this.db.db
        .select()
        .from(cruisePorts)
        .where(eq(cruisePorts.id, sailing.embarkPortId))
        .limit(1)
      if (port) {
        const portMeta = port.metadata as { country?: string; latitude?: number; longitude?: number } | null
        embarkPort = {
          id: port.id,
          name: port.name,
          country: portMeta?.country || null,
          latitude: portMeta?.latitude || null,
          longitude: portMeta?.longitude || null,
        }
      }
    }

    // Get disembark port
    let disembarkPort = null
    if (sailing.disembarkPortId) {
      const [port] = await this.db.db
        .select()
        .from(cruisePorts)
        .where(eq(cruisePorts.id, sailing.disembarkPortId))
        .limit(1)
      if (port) {
        const portMeta = port.metadata as { country?: string; latitude?: number; longitude?: number } | null
        disembarkPort = {
          id: port.id,
          name: port.name,
          country: portMeta?.country || null,
          latitude: portMeta?.latitude || null,
          longitude: portMeta?.longitude || null,
        }
      }
    }

    // Get regions
    const regionsData = await this.db.db
      .select({
        id: cruiseRegions.id,
        name: cruiseRegions.name,
        isPrimary: cruiseSailingRegions.isPrimary,
      })
      .from(cruiseSailingRegions)
      .leftJoin(cruiseRegions, eq(cruiseSailingRegions.regionId, cruiseRegions.id))
      .where(eq(cruiseSailingRegions.sailingId, id))

    // Get itinerary stops
    const stops = await this.db.db
      .select()
      .from(cruiseSailingStops)
      .where(eq(cruiseSailingStops.sailingId, id))
      .orderBy(cruiseSailingStops.sequenceOrder)

    const itinerary: ItineraryStopDto[] = stops.map((stop) => ({
      dayNumber: stop.dayNumber,
      portName: stop.portName || 'Unknown',
      portId: stop.portId,
      isSeaDay: stop.isSeaDay,
      arrivalTime: stop.arrivalTime,
      departureTime: stop.departureTime,
    }))

    // Get cabin prices
    const pricesData = await this.db.db
      .select()
      .from(cruiseSailingCabinPrices)
      .where(eq(cruiseSailingCabinPrices.sailingId, id))
      .orderBy(cruiseSailingCabinPrices.cabinCategory, cruiseSailingCabinPrices.basePriceCents)

    const prices: CabinPriceDto[] = pricesData.map((p) => ({
      cabinCode: p.cabinCode,
      cabinCategory: p.cabinCategory,
      occupancy: p.occupancy,
      basePriceCents: p.basePriceCents,
      taxesCents: p.taxesCents,
      totalPriceCents: p.basePriceCents + p.taxesCents,
      isPerPerson: p.isPerPerson === 1,
    }))

    // Build ship metadata
    const shipMeta = (sailing.shipMetadata as any) || {}
    const lineMeta = (sailing.lineMetadata as { logo_url?: string; website?: string }) || {}

    // Extract ship images from metadata
    // Handle both normalized format (from import service) and raw Traveltek format (from SQL backfill)
    const shipImages = shipMeta.ship_images as
      | Array<{
          // Normalized format (from import service)
          url?: string
          url_hd?: string
          url_2k?: string
          is_default?: boolean
          // Raw Traveltek format (from SQL backfill)
          imageurl?: string
          imageurlhd?: string
          imageurl2k?: string
          default?: string
          // Common field
          caption?: string
        }>
      | undefined

    return {
      id: sailing.id,
      provider: sailing.provider,
      providerIdentifier: sailing.providerIdentifier,
      name: sailing.name,
      sailDate: sailing.sailDate,
      endDate: sailing.endDate,
      nights: sailing.nights,
      ship: {
        id: sailing.shipId || '',
        name: sailing.shipName || 'Unknown Ship',
        shipClass: sailing.shipClass,
        imageUrl: sailing.shipImageUrl,
        yearBuilt: shipMeta.year_built ?? null,
        tonnage: shipMeta.tonnage ?? null,
        passengerCapacity: shipMeta.passenger_capacity ?? null,
        crewCount: shipMeta.crew_count ?? null,
        amenities: shipMeta.amenities ?? null,
        // All ship images from metadata (handles both normalized and raw formats)
        images:
          shipImages?.map((img) => ({
            url: img.url || img.imageurl || null,
            urlHd: img.url_hd || img.imageurlhd || null,
            url2k: img.url_2k || img.imageurl2k || null,
            caption: img.caption || null,
            isDefault: img.is_default ?? (img.default === 'Y' ? true : false),
          })) ?? null,
      },
      cruiseLine: {
        id: sailing.lineId || '',
        name: sailing.lineName || 'Unknown Line',
        logoUrl: lineMeta.logo_url || null,
        websiteUrl: lineMeta.website || null,
      },
      embarkPort,
      embarkPortName: sailing.embarkPortName,
      disembarkPort,
      disembarkPortName: sailing.disembarkPortName,
      regions: regionsData
        .filter((r) => r.id !== null && r.name !== null)
        .map((r) => ({
          id: r.id!,
          name: r.name!,
          isPrimary: r.isPrimary ?? false,
        })),
      itinerary,
      priceSummary: {
        cheapestInside: sailing.cheapestInsideCents,
        cheapestOceanview: sailing.cheapestOceanviewCents,
        cheapestBalcony: sailing.cheapestBalconyCents,
        cheapestSuite: sailing.cheapestSuiteCents,
      },
      prices,
      lastSyncedAt: sailing.lastSyncedAt?.toISOString() || new Date().toISOString(),
      pricesUpdating: this.isPricesStale(sailing.lastSyncedAt),
      // Market and flight data from dedicated columns
      marketId: sailing.marketId ?? null,
      noFly: sailing.noFly ?? null,
      departUk: sailing.departUk ?? null,
      metadata: sailing.metadata as any,
      createdAt: sailing.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: sailing.updatedAt?.toISOString() || new Date().toISOString(),
    }
  }

  // ============================================================================
  // SHIP IMAGES (PAGINATED)
  // ============================================================================

  async getShipImages(
    shipId: string,
    page: number = 1,
    pageSize: number = 10
  ): Promise<ShipImagesResponseDto> {
    const { cruiseShipImages } = this.db.schema

    pageSize = Math.min(pageSize, 20) // Cap at 20 images per page
    const offset = (page - 1) * pageSize

    // Count total
    const countResult = await this.db.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(cruiseShipImages)
      .where(eq(cruiseShipImages.shipId, shipId))

    const totalItems = Number(countResult[0]?.count ?? 0)
    const totalPages = Math.ceil(totalItems / pageSize)

    // Get images
    const imagesData = await this.db.db
      .select()
      .from(cruiseShipImages)
      .where(eq(cruiseShipImages.shipId, shipId))
      .orderBy(desc(cruiseShipImages.isHero), cruiseShipImages.imageType)
      .limit(pageSize)
      .offset(offset)

    return {
      images: imagesData.map((img) => ({
        id: img.id,
        url: img.imageUrl,
        thumbnailUrl: img.thumbnailUrl,
        altText: img.altText,
        imageType: img.imageType || 'ship',
        isHero: img.isHero ?? false,
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasMore: page < totalPages,
      },
    }
  }

  // ============================================================================
  // SHIP DECKS (with cabin coordinates)
  // ============================================================================

  async getShipDecks(shipId: string): Promise<ShipDecksResponseDto> {
    const { cruiseShipDecks, cruiseShips } = this.db.schema

    // Verify ship exists
    const [ship] = await this.db.db
      .select({ id: cruiseShips.id })
      .from(cruiseShips)
      .where(eq(cruiseShips.id, shipId))
      .limit(1)

    if (!ship) {
      throw new NotFoundException(`Ship not found: ${shipId}`)
    }

    // Get all decks for this ship
    const decksData = await this.db.db
      .select()
      .from(cruiseShipDecks)
      .where(eq(cruiseShipDecks.shipId, shipId))
      .orderBy(asc(cruiseShipDecks.displayOrder))

    return {
      shipId,
      decks: decksData.map((deck) => {
        // Extract cabin locations from metadata
        const metadata = deck.metadata as DeckMetadata | null
        const cabinLocations = metadata?.cabin_locations ?? []

        return {
          id: deck.id,
          name: deck.name,
          deckNumber: deck.deckNumber,
          deckPlanUrl: deck.deckPlanUrl,
          description: deck.description,
          displayOrder: deck.displayOrder,
          cabinLocations: cabinLocations.map((loc) => ({
            cabinId: loc.cabin_id,
            x1: loc.x1,
            y1: loc.y1,
            x2: loc.x2,
            y2: loc.y2,
          })),
        }
      }),
    }
  }

  // ============================================================================
  // ALTERNATE SAILINGS
  // ============================================================================

  async getAlternateSailings(sailingId: string): Promise<AlternateSailingsResponseDto> {
    const { cruiseSailings, cruiseShips, cruiseAlternateSailings } = this.db.schema

    // Verify sailing exists
    const [sailing] = await this.db.db
      .select({ id: cruiseSailings.id })
      .from(cruiseSailings)
      .where(eq(cruiseSailings.id, sailingId))
      .limit(1)

    if (!sailing) {
      throw new NotFoundException(`Sailing not found: ${sailingId}`)
    }

    // Get alternate sailings with optional resolved FK
    const alternatesData = await this.db.db
      .select({
        id: cruiseAlternateSailings.id,
        alternateSailingId: cruiseAlternateSailings.alternateSailingId,
        providerIdentifier: cruiseAlternateSailings.alternateProviderIdentifier,
        alternateSailDate: cruiseAlternateSailings.alternateSailDate,
        alternateNights: cruiseAlternateSailings.alternateNights,
        alternateLeadPriceCents: cruiseAlternateSailings.alternateLeadPriceCents,
        // Joined sailing info (if resolved)
        resolvedSailingId: cruiseSailings.id,
        resolvedSailingName: cruiseSailings.name,
        resolvedSailingNights: cruiseSailings.nights,
        resolvedShipId: cruiseShips.id,
        resolvedShipName: cruiseShips.name,
      })
      .from(cruiseAlternateSailings)
      .leftJoin(cruiseSailings, eq(cruiseAlternateSailings.alternateSailingId, cruiseSailings.id))
      .leftJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
      .where(eq(cruiseAlternateSailings.sailingId, sailingId))

    return {
      sailingId,
      alternates: alternatesData.map((alt) => ({
        id: alt.id,
        alternateSailingId: alt.alternateSailingId,
        providerIdentifier: alt.providerIdentifier,
        alternateSailDate: alt.alternateSailDate,
        alternateNights: alt.alternateNights,
        alternateLeadPriceCents: alt.alternateLeadPriceCents,
        // Resolved sailing info (null if not yet imported)
        sailing: alt.resolvedSailingId
          ? {
              id: alt.resolvedSailingId,
              name: alt.resolvedSailingName || 'Unknown',
              nights: alt.resolvedSailingNights || 0,
              ship: {
                id: alt.resolvedShipId || '',
                name: alt.resolvedShipName || 'Unknown',
              },
            }
          : null,
      })),
    }
  }

  // ============================================================================
  // CABIN IMAGES
  // ============================================================================

  async getCabinImages(cabinTypeId: string): Promise<CabinImagesResponseDto> {
    const { cruiseShipCabinTypes, cruiseCabinImages } = this.db.schema

    // Verify cabin type exists
    const [cabinType] = await this.db.db
      .select({ id: cruiseShipCabinTypes.id })
      .from(cruiseShipCabinTypes)
      .where(eq(cruiseShipCabinTypes.id, cabinTypeId))
      .limit(1)

    if (!cabinType) {
      throw new NotFoundException(`Cabin type not found: ${cabinTypeId}`)
    }

    // Get all images for this cabin type
    const imagesData = await this.db.db
      .select()
      .from(cruiseCabinImages)
      .where(eq(cruiseCabinImages.cabinTypeId, cabinTypeId))
      .orderBy(asc(cruiseCabinImages.displayOrder))

    return {
      cabinTypeId,
      images: imagesData.map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        imageUrlHd: img.imageUrlHd,
        imageUrl2k: img.imageUrl2k,
        caption: img.caption,
        displayOrder: img.displayOrder,
        isDefault: img.isDefault,
      })),
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getPriceColumnRef(
    table: typeof this.db.schema.cruiseSailings,
    category: CabinCategory
  ) {
    switch (category) {
      case CabinCategory.INSIDE:
        return table.cheapestInsideCents
      case CabinCategory.OCEANVIEW:
        return table.cheapestOceanviewCents
      case CabinCategory.BALCONY:
        return table.cheapestBalconyCents
      case CabinCategory.SUITE:
        return table.cheapestSuiteCents
      default:
        return table.cheapestInsideCents
    }
  }

  private getSortColumn(sortBy: SortField): any {
    const { cruiseSailings, cruiseShips, cruiseLines } = this.db.schema
    switch (sortBy) {
      case SortField.SAIL_DATE:
        return cruiseSailings.sailDate
      case SortField.PRICE:
        return cruiseSailings.cheapestInsideCents
      case SortField.NIGHTS:
        return cruiseSailings.nights
      case SortField.SHIP_NAME:
        return cruiseShips.name
      case SortField.LINE_NAME:
        return cruiseLines.name
      default:
        return cruiseSailings.sailDate
    }
  }

  private isPricesStale(lastSyncedAt: Date | null): boolean {
    if (!lastSyncedAt) return true
    const now = Date.now()
    const syncTime = new Date(lastSyncedAt).getTime()
    return now - syncTime > this.STALE_THRESHOLD_MS
  }
}
