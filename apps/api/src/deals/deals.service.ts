/**
 * Deals Service
 *
 * Business logic for deal CRUD operations.
 * Supports public listing (OTA), admin management, and scraper upsert.
 */

import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { eq, and, ilike, sql, desc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { OtaRevalidationService } from '../common/services/ota-revalidation.service'
import type { CreateDealDto } from './dto/create-deal.dto'
import type { UpdateDealDto } from './dto/update-deal.dto'
import type { DealSearchDto } from './dto/deal-search.dto'
import type { schema } from '@tailfire/database'

type Deal = typeof schema.deals.$inferSelect

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly otaRevalidation: OtaRevalidationService,
  ) {}

  // ============================================================================
  // PUBLIC — List published deals with filters
  // ============================================================================

  async findPublished(
    filters: DealSearchDto,
  ): Promise<{ deals: Deal[]; total: number }> {
    const { deals } = this.db.schema

    const page = Math.max(1, filters.page ?? 1)
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100)
    const offset = (page - 1) * limit

    // Build WHERE conditions — always filter to published only
    const conditions: any[] = [eq(deals.isPublished, true)]

    if (filters.productType) {
      conditions.push(eq(deals.productType, filters.productType))
    }

    if (filters.destination) {
      // Match any deal that has this destination in its destinations array
      conditions.push(
        sql`${deals.destinations} @> ARRAY[${filters.destination}]::text[]`,
      )
    }

    if (filters.supplier) {
      conditions.push(ilike(deals.supplierName, `%${filters.supplier}%`))
    }

    const whereClause = and(...conditions)

    // Get total count
    const [countRow] = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(whereClause)

    const total = countRow?.count ?? 0

    // Get paginated results
    const rows = await this.db.client
      .select()
      .from(deals)
      .where(whereClause)
      .orderBy(desc(deals.createdAt))
      .limit(limit)
      .offset(offset)

    return { deals: rows, total }
  }

  // ============================================================================
  // PUBLIC — Single deal by slug
  // ============================================================================

  async findBySlug(slug: string): Promise<Deal | null> {
    const { deals } = this.db.schema

    const [deal] = await this.db.client
      .select()
      .from(deals)
      .where(and(eq(deals.slug, slug), eq(deals.isPublished, true)))
      .limit(1)

    return deal ?? null
  }

  // ============================================================================
  // ADMIN — Create a deal
  // ============================================================================

  async create(dto: CreateDealDto, agencyId: string): Promise<Deal> {
    const { deals } = this.db.schema

    const [deal] = await this.db.client
      .insert(deals)
      .values({
        agencyId,
        title: dto.title,
        slug: dto.slug,
        productType: dto.productType,
        description: dto.description,
        heroImageUrl: dto.heroImageUrl,
        pricing: dto.pricing ?? {},
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
        destinations: dto.destinations,
        supplierName: dto.supplierName,
        externalSource: dto.externalSource,
        externalId: dto.externalId,
        isPublished: dto.isPublished ?? false,
        seoMeta: dto.seoMeta ?? {},
      })
      .returning()

    this.logger.log(`Deal created: ${deal!.id} (${deal!.title})`)

    // Invalidate OTA ISR cache for deals listing pages
    this.otaRevalidation.revalidateTag('deals')

    return deal!
  }

  // ============================================================================
  // ADMIN — Update a deal
  // ============================================================================

  async update(id: string, dto: UpdateDealDto, agencyId: string): Promise<Deal> {
    const { deals } = this.db.schema

    // Build update values — only include defined fields
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (dto.title !== undefined) updateValues.title = dto.title
    if (dto.slug !== undefined) updateValues.slug = dto.slug
    if (dto.productType !== undefined) updateValues.productType = dto.productType
    if (dto.description !== undefined) updateValues.description = dto.description
    if (dto.heroImageUrl !== undefined) updateValues.heroImageUrl = dto.heroImageUrl
    if (dto.pricing !== undefined) updateValues.pricing = dto.pricing
    if (dto.validFrom !== undefined) updateValues.validFrom = dto.validFrom
    if (dto.validUntil !== undefined) updateValues.validUntil = dto.validUntil
    if (dto.destinations !== undefined) updateValues.destinations = dto.destinations
    if (dto.supplierName !== undefined) updateValues.supplierName = dto.supplierName
    if (dto.externalSource !== undefined) updateValues.externalSource = dto.externalSource
    if (dto.externalId !== undefined) updateValues.externalId = dto.externalId
    if (dto.isPublished !== undefined) updateValues.isPublished = dto.isPublished
    if (dto.seoMeta !== undefined) updateValues.seoMeta = dto.seoMeta

    const [deal] = await this.db.client
      .update(deals)
      .set(updateValues)
      .where(and(eq(deals.id, id), eq(deals.agencyId, agencyId)))
      .returning()

    if (!deal) {
      throw new NotFoundException(`Deal ${id} not found`)
    }

    this.logger.log(`Deal updated: ${deal.id} (${deal.title})`)

    // Invalidate OTA ISR cache — both the listing and the specific deal page
    this.otaRevalidation.revalidateTag('deals')
    if (deal.slug) {
      this.otaRevalidation.revalidatePath(`/deals/${deal.slug}`)
    }

    return deal
  }

  // ============================================================================
  // ADMIN — Delete a deal (hard delete)
  // ============================================================================

  async delete(id: string, agencyId: string): Promise<void> {
    const { deals } = this.db.schema

    const [deleted] = await this.db.client
      .delete(deals)
      .where(and(eq(deals.id, id), eq(deals.agencyId, agencyId)))
      .returning({ id: deals.id })

    if (!deleted) {
      throw new NotFoundException(`Deal ${id} not found`)
    }

    this.logger.log(`Deal deleted: ${id}`)

    // Invalidate OTA ISR cache for deals listing pages
    this.otaRevalidation.revalidateTag('deals')
  }

  // ============================================================================
  // SCRAPER — Upsert deals from external source
  // ============================================================================

  async upsertFromScraper(
    dtos: CreateDealDto[],
    agencyId: string,
  ): Promise<{ created: number; updated: number }> {
    const { deals } = this.db.schema

    let created = 0
    let updated = 0

    for (const dto of dtos) {
      // Dedup by agencyId + externalSource + externalId
      if (dto.externalSource && dto.externalId) {
        const [existing] = await this.db.client
          .select({ id: deals.id })
          .from(deals)
          .where(
            and(
              eq(deals.agencyId, agencyId),
              eq(deals.externalSource, dto.externalSource),
              eq(deals.externalId, dto.externalId),
            ),
          )
          .limit(1)

        if (existing) {
          // Update existing deal
          await this.db.client
            .update(deals)
            .set({
              title: dto.title,
              slug: dto.slug,
              productType: dto.productType,
              description: dto.description,
              heroImageUrl: dto.heroImageUrl,
              pricing: dto.pricing ?? {},
              validFrom: dto.validFrom,
              validUntil: dto.validUntil,
              destinations: dto.destinations,
              supplierName: dto.supplierName,
              isPublished: dto.isPublished ?? false,
              seoMeta: dto.seoMeta ?? {},
              updatedAt: new Date(),
            })
            .where(eq(deals.id, existing.id))

          updated++
          continue
        }
      }

      // Create new deal
      await this.db.client.insert(deals).values({
        agencyId,
        title: dto.title,
        slug: dto.slug,
        productType: dto.productType,
        description: dto.description,
        heroImageUrl: dto.heroImageUrl,
        pricing: dto.pricing ?? {},
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
        destinations: dto.destinations,
        supplierName: dto.supplierName,
        externalSource: dto.externalSource,
        externalId: dto.externalId,
        isPublished: dto.isPublished ?? false,
        seoMeta: dto.seoMeta ?? {},
      })

      created++
    }

    this.logger.log(
      `Scraper upsert complete: ${created} created, ${updated} updated (${dtos.length} total)`,
    )

    // Invalidate OTA ISR cache after bulk scraper import
    if (created > 0 || updated > 0) {
      this.otaRevalidation.revalidateTag('deals')
    }

    return { created, updated }
  }
}
