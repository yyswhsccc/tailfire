/**
 * OTA Published Trips Service
 *
 * Manages published trip listings for the OTA consumer portal.
 * Templates are snapshotted at publish time into renderedSnapshot (JSONB),
 * so the OTA page always renders from a stable payload.
 *
 * The `refresh` method re-reads the source itinerary_templates row and
 * overwrites renderedSnapshot with fresh data.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { PublishTripDto, UpdatePublishedTripDto } from './dto/publish-trip.dto'
import type { schema } from '@tailfire/database'

type OtaPublishedTrip = typeof schema.otaPublishedTrips.$inferSelect

@Injectable()
export class OtaPublishedTripsService {
  private readonly logger = new Logger(OtaPublishedTripsService.name)

  constructor(private readonly db: DatabaseService) {}

  // ============================================================================
  // PUBLIC — Fetch by slug (only if published)
  // ============================================================================

  async findBySlug(slug: string): Promise<OtaPublishedTrip | null> {
    const { otaPublishedTrips } = this.db.schema

    const [row] = await this.db.client
      .select()
      .from(otaPublishedTrips)
      .where(eq(otaPublishedTrips.slug, slug))
      .limit(1)

    if (!row || !row.isPublished) {
      return null
    }

    return row
  }

  // ============================================================================
  // ADMIN — Publish a template (creates the published trip row)
  // ============================================================================

  async publish(dto: PublishTripDto, agencyId: string): Promise<OtaPublishedTrip> {
    const { otaPublishedTrips, itineraryTemplates } = this.db.schema

    // Read the source template
    const [template] = await this.db.client
      .select()
      .from(itineraryTemplates)
      .where(eq(itineraryTemplates.id, dto.templateId))
      .limit(1)

    if (!template) {
      throw new NotFoundException(`Itinerary template ${dto.templateId} not found`)
    }

    const [published] = await this.db.client
      .insert(otaPublishedTrips)
      .values({
        agencyId,
        templateId: dto.templateId,
        advisorProfileId: dto.advisorProfileId,
        slug: dto.slug,
        publishType: dto.publishType,
        headline: dto.headline ?? null,
        callToAction: dto.callToAction ?? 'Inquire About This Trip',
        heroImageUrl: dto.heroImageUrl ?? null,
        renderedSnapshot: template.payload as unknown as Record<string, unknown>,
        isPublished: true,
      })
      .returning()

    this.logger.log(
      `Published trip created: ${published!.id} (slug=${published!.slug}, template=${dto.templateId})`,
    )

    return published!
  }

  // ============================================================================
  // ADMIN — Update metadata fields
  // ============================================================================

  async update(id: string, dto: UpdatePublishedTripDto, agencyId: string): Promise<OtaPublishedTrip> {
    const { otaPublishedTrips } = this.db.schema

    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (dto.headline !== undefined) updateValues.headline = dto.headline
    if (dto.publishType !== undefined) updateValues.publishType = dto.publishType
    if (dto.callToAction !== undefined) updateValues.callToAction = dto.callToAction
    if (dto.heroImageUrl !== undefined) updateValues.heroImageUrl = dto.heroImageUrl
    if (dto.isPublished !== undefined) updateValues.isPublished = dto.isPublished

    const [updated] = await this.db.client
      .update(otaPublishedTrips)
      .set(updateValues)
      .where(and(eq(otaPublishedTrips.id, id), eq(otaPublishedTrips.agencyId, agencyId)))
      .returning()

    if (!updated) {
      throw new NotFoundException(`Published trip ${id} not found`)
    }

    this.logger.log(`Published trip updated: ${updated.id} (slug=${updated.slug})`)
    return updated
  }

  // ============================================================================
  // ADMIN — Re-snapshot from current template data
  // ============================================================================

  async refresh(id: string, agencyId: string): Promise<OtaPublishedTrip> {
    const { otaPublishedTrips, itineraryTemplates } = this.db.schema

    // Read the existing published trip (scoped by agency)
    const [existing] = await this.db.client
      .select()
      .from(otaPublishedTrips)
      .where(and(eq(otaPublishedTrips.id, id), eq(otaPublishedTrips.agencyId, agencyId)))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Published trip ${id} not found`)
    }

    // Re-read the source template
    const [template] = await this.db.client
      .select()
      .from(itineraryTemplates)
      .where(eq(itineraryTemplates.id, existing.templateId))
      .limit(1)

    if (!template) {
      throw new NotFoundException(
        `Source template ${existing.templateId} not found — cannot refresh`,
      )
    }

    const [refreshed] = await this.db.client
      .update(otaPublishedTrips)
      .set({
        renderedSnapshot: template.payload as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(otaPublishedTrips.id, id))
      .returning()

    this.logger.log(
      `Published trip refreshed: ${refreshed!.id} (slug=${refreshed!.slug}, template=${existing.templateId})`,
    )

    return refreshed!
  }

  // ============================================================================
  // ADMIN — Hard delete
  // ============================================================================

  async delete(id: string, agencyId: string): Promise<void> {
    const { otaPublishedTrips } = this.db.schema

    const [deleted] = await this.db.client
      .delete(otaPublishedTrips)
      .where(and(eq(otaPublishedTrips.id, id), eq(otaPublishedTrips.agencyId, agencyId)))
      .returning({ id: otaPublishedTrips.id })

    if (!deleted) {
      throw new NotFoundException(`Published trip ${id} not found`)
    }

    this.logger.log(`Published trip deleted: ${id}`)
  }
}
