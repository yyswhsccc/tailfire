/**
 * Destinations Service
 *
 * Public read methods for the destinations hub entity.
 * Supports paginated listing with filters, slug lookup, and ID lookup.
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'
import { eq, and, ilike, sql, or, inArray, gt } from 'drizzle-orm'

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
          (payload?.topAttractions as Array<{ title: string; rating: number; description: string }>) ?? [],
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
