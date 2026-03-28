/**
 * Destinations Service
 *
 * Public read methods for the destinations hub entity.
 * Supports paginated listing with filters, slug lookup, and ID lookup.
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'
import { eq, and, ilike, sql, or, inArray, gt, asc } from 'drizzle-orm'

export interface DestinationFilters {
  type?: string
  countryCode?: string
  search?: string
  page?: number
  pageSize?: number
}

@Injectable()
export class DestinationsService {
  constructor(private readonly db: DatabaseService) {}

  // ============================================================================
  // PUBLIC — Paginated list with filters
  // ============================================================================

  async findAll(filters: DestinationFilters = {}) {
    const { destinations } = this.db.schema

    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(Math.max(1, filters.pageSize ?? 20), 100)
    const offset = (page - 1) * pageSize

    // Build WHERE conditions
    const conditions: any[] = []

    if (filters.type) {
      conditions.push(eq(destinations.destinationType, filters.type))
    }

    if (filters.countryCode) {
      conditions.push(eq(destinations.countryCode, filters.countryCode.toUpperCase()))
    }

    if (filters.search) {
      // Search across name and normalized_name
      const searchPattern = `%${filters.search}%`
      conditions.push(
        or(
          ilike(destinations.name, searchPattern),
          ilike(destinations.normalizedName, searchPattern),
        ),
      )
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count
    const [countRow] = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(destinations)
      .where(whereClause)

    const total = countRow?.count ?? 0

    // Get paginated results
    const rows = await this.db.client
      .select()
      .from(destinations)
      .where(whereClause)
      .orderBy(destinations.name)
      .limit(pageSize)
      .offset(offset)

    return {
      destinations: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  // ============================================================================
  // PUBLIC — Single destination by slug (with port mappings)
  // ============================================================================

  async findBySlug(slug: string) {
    const {
      destinations,
      destinationPorts,
      destinationAliases,
      destinationCache,
      cruisePorts,
      cruiseSailingStops,
      cruiseSailings,
    } = this.db.schema

    // Get the destination
    const [destination] = await this.db.client
      .select()
      .from(destinations)
      .where(eq(destinations.slug, slug))
      .limit(1)

    if (!destination) {
      throw new NotFoundException(`Destination with slug "${slug}" not found`)
    }

    // Get port mappings with port names (join destinationPorts → cruisePorts)
    const portMappings = await this.db.client
      .select({
        portId: destinationPorts.portId,
        isPrimary: destinationPorts.isPrimary,
        portName: cruisePorts.name,
      })
      .from(destinationPorts)
      .leftJoin(cruisePorts, eq(destinationPorts.portId, cruisePorts.id))
      .where(eq(destinationPorts.destinationId, destination.id))

    const ports = portMappings.map((p) => ({
      portId: p.portId,
      portName: p.portName ?? null,
      isPrimary: p.isPrimary,
    }))

    // Get aliases — flatten to string[]
    const aliasRows = await this.db.client
      .select({ alias: destinationAliases.alias })
      .from(destinationAliases)
      .where(eq(destinationAliases.destinationId, destination.id))

    const aliases = aliasRows.map((r) => r.alias)

    // Get enrichment cache (tripadvisor, fresh only)
    const [cacheEntry] = await this.db.client
      .select({
        normalizedPayload: destinationCache.normalizedPayload,
        summaryMd: destinationCache.summaryMd,
        fetchedAt: destinationCache.fetchedAt,
      })
      .from(destinationCache)
      .where(
        and(
          eq(destinationCache.destinationId, destination.id),
          eq(destinationCache.source, 'tripadvisor'),
          eq(destinationCache.status, 'fresh'),
        ),
      )
      .limit(1)

    // Parse enrichment from normalizedPayload
    let enrichment: {
      summary: string | null
      photos: Array<{ url: string; caption?: string }>
      topAttractions: Array<{ title: string; rating: number; description: string }>
      averageRating: number | null
      totalReviewCount: number | null
      lastEnrichedAt: string | null
    } | null = null

    if (cacheEntry) {
      const payload = cacheEntry.normalizedPayload as Record<string, unknown> | null
      enrichment = {
        summary: cacheEntry.summaryMd ?? (payload?.summary as string | null) ?? null,
        photos: (payload?.photos as Array<{ url: string; caption?: string }>) ?? [],
        topAttractions:
          (payload?.topResults as Array<{ title: string; rating: number; description: string }>) ?? [],
        averageRating: (payload?.averageRating as number | null) ?? null,
        totalReviewCount: (payload?.totalReviewCount as number | null) ?? null,
        lastEnrichedAt: cacheEntry.fetchedAt ? cacheEntry.fetchedAt.toISOString() : null,
      }
    }

    // Count active future sailings that stop at this destination's ports
    let cruiseCount = 0
    const portIds = ports.map((p) => p.portId)

    if (portIds.length > 0) {
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

      const [countRow] = await this.db.client
        .select({ count: sql<number>`count(distinct ${cruiseSailingStops.sailingId})::int` })
        .from(cruiseSailingStops)
        .innerJoin(
          cruiseSailings,
          and(
            eq(cruiseSailingStops.sailingId, cruiseSailings.id),
            eq(cruiseSailings.isActive, true),
            gt(cruiseSailings.sailDate, today),
          ),
        )
        .where(inArray(cruiseSailingStops.portId, portIds))

      cruiseCount = countRow?.count ?? 0
    }

    return {
      ...destination,
      ports,
      aliases,
      enrichment,
      stats: {
        cruiseCount,
        tourCount: 0,
      },
    }
  }

  // ============================================================================
  // PUBLIC — Paginated sailings at a destination
  // ============================================================================

  async findCruisesAtDestination(slug: string, page = 1, pageSize = 20) {
    const {
      destinations,
      destinationPorts,
      cruiseSailingStops,
      cruiseSailings,
      cruiseShips,
      cruiseLines,
    } = this.db.schema

    // 1. Get destination by slug
    const [destination] = await this.db.client
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(eq(destinations.slug, slug))
      .limit(1)

    if (!destination) {
      throw new NotFoundException(`Destination with slug "${slug}" not found`)
    }

    // 2. Get port IDs from destination_ports
    const portRows = await this.db.client
      .select({ portId: destinationPorts.portId })
      .from(destinationPorts)
      .where(eq(destinationPorts.destinationId, destination.id))

    const portIds = portRows.map((r) => r.portId)

    if (portIds.length === 0) {
      return {
        destination: { id: destination.id, name: destination.name, slug },
        sailings: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      }
    }

    const normalizedPage = Math.max(1, page)
    const normalizedPageSize = Math.min(Math.max(1, pageSize), 100)
    const offset = (normalizedPage - 1) * normalizedPageSize

    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    // 3. Count distinct sailings at these ports (active, future)
    const [countRow] = await this.db.client
      .select({ count: sql<number>`count(distinct ${cruiseSailingStops.sailingId})::int` })
      .from(cruiseSailingStops)
      .innerJoin(
        cruiseSailings,
        and(
          eq(cruiseSailingStops.sailingId, cruiseSailings.id),
          eq(cruiseSailings.isActive, true),
          gt(cruiseSailings.sailDate, today),
        ),
      )
      .where(inArray(cruiseSailingStops.portId, portIds))

    const total = countRow?.count ?? 0

    // 4. Get paginated sailing IDs via a subquery approach: get distinct sailing IDs first
    const sailingIdRows = await this.db.client
      .selectDistinct({
        sailingId: cruiseSailingStops.sailingId,
        sailDate: cruiseSailings.sailDate,
      })
      .from(cruiseSailingStops)
      .innerJoin(
        cruiseSailings,
        and(
          eq(cruiseSailingStops.sailingId, cruiseSailings.id),
          eq(cruiseSailings.isActive, true),
          gt(cruiseSailings.sailDate, today),
        ),
      )
      .where(inArray(cruiseSailingStops.portId, portIds))
      .orderBy(asc(cruiseSailings.sailDate))
      .limit(normalizedPageSize)
      .offset(offset)

    const sailingIds = sailingIdRows.map((r) => r.sailingId)

    if (sailingIds.length === 0) {
      return {
        destination: { id: destination.id, name: destination.name, slug },
        sailings: [],
        total,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        totalPages: Math.ceil(total / normalizedPageSize),
      }
    }

    // 5. Fetch full sailing data with ship + line
    const sailings = await this.db.client
      .select({
        id: cruiseSailings.id,
        name: cruiseSailings.name,
        sailDate: cruiseSailings.sailDate,
        endDate: cruiseSailings.endDate,
        nights: cruiseSailings.nights,
        voyageCode: cruiseSailings.voyageCode,
        cheapestInsideCents: cruiseSailings.cheapestInsideCents,
        cheapestBalconyCents: cruiseSailings.cheapestBalconyCents,
        shipId: cruiseSailings.shipId,
        shipName: cruiseShips.name,
        shipImageUrl: cruiseShips.imageUrl,
        cruiseLineId: cruiseSailings.cruiseLineId,
        cruiseLineName: cruiseLines.name,
        cruiseLineSlug: cruiseLines.slug,
      })
      .from(cruiseSailings)
      .leftJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
      .leftJoin(cruiseLines, eq(cruiseSailings.cruiseLineId, cruiseLines.id))
      .where(inArray(cruiseSailings.id, sailingIds))
      .orderBy(asc(cruiseSailings.sailDate))

    return {
      destination: { id: destination.id, name: destination.name, slug },
      sailings,
      total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages: Math.ceil(total / normalizedPageSize),
    }
  }

  // ============================================================================
  // PUBLIC — Tours at a destination (placeholder — linkage coming later)
  // ============================================================================

  async findToursAtDestination(slug: string, page = 1, pageSize = 20) {
    const { destinations } = this.db.schema

    // Verify destination exists
    const [destination] = await this.db.client
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(eq(destinations.slug, slug))
      .limit(1)

    if (!destination) {
      throw new NotFoundException(`Destination with slug "${slug}" not found`)
    }

    // Tour ↔ destination linkage is not yet implemented.
    // Returning empty results with a note for now.
    return {
      destination: { id: destination.id, name: destination.name, slug },
      tours: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      note: 'Tour linkage to destinations is coming in a future update.',
    }
  }

  // ============================================================================
  // INTERNAL — Simple by-ID lookup
  // ============================================================================

  async findById(id: string) {
    const { destinations } = this.db.schema

    const [destination] = await this.db.client
      .select()
      .from(destinations)
      .where(eq(destinations.id, id))
      .limit(1)

    return destination ?? null
  }

  // ============================================================================
  // INTERNAL — Count with filters (for external consumers)
  // ============================================================================

  async count(filters: Omit<DestinationFilters, 'page' | 'pageSize'> = {}): Promise<number> {
    const { destinations } = this.db.schema

    const conditions: any[] = []

    if (filters.type) {
      conditions.push(eq(destinations.destinationType, filters.type))
    }

    if (filters.countryCode) {
      conditions.push(eq(destinations.countryCode, filters.countryCode.toUpperCase()))
    }

    if (filters.search) {
      const searchPattern = `%${filters.search}%`
      conditions.push(
        or(
          ilike(destinations.name, searchPattern),
          ilike(destinations.normalizedName, searchPattern),
        ),
      )
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [row] = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(destinations)
      .where(whereClause)

    return row?.count ?? 0
  }
}
