/**
 * Destinations Service
 *
 * Public read methods for the destinations hub entity.
 * Supports paginated listing with filters, slug lookup, and ID lookup.
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'
import { eq, and, ilike, sql, or } from 'drizzle-orm'

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
    const { destinations, destinationPorts, destinationAliases } = this.db.schema

    // Get the destination
    const [destination] = await this.db.client
      .select()
      .from(destinations)
      .where(eq(destinations.slug, slug))
      .limit(1)

    if (!destination) {
      throw new NotFoundException(`Destination with slug "${slug}" not found`)
    }

    // Get port mappings
    const ports = await this.db.client
      .select()
      .from(destinationPorts)
      .where(eq(destinationPorts.destinationId, destination.id))

    // Get aliases
    const aliases = await this.db.client
      .select()
      .from(destinationAliases)
      .where(eq(destinationAliases.destinationId, destination.id))

    return {
      ...destination,
      ports,
      aliases,
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
