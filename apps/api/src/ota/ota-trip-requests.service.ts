/**
 * OTA Trip Requests Service
 *
 * CRUD operations for OTA trip requests. Consumers build multi-component
 * trip requests (flights, cruises, hotels, tours) which progress through:
 *
 *   draft → submitted → promoted (or failed/expired)
 *
 * On submission, the request enters the promotion pipeline where it gets
 * resolved to an owner/agency and converted into a full Tailfire trip.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { CreateTripRequestDto, UpdateComponentsDto } from './dto/create-trip-request.dto'
import type { schema } from '@tailfire/database'

type OtaTripRequest = typeof schema.otaTripRequests.$inferSelect

@Injectable()
export class OtaTripRequestsService {
  private readonly logger = new Logger(OtaTripRequestsService.name)

  constructor(private readonly db: DatabaseService) {}

  // ============================================================================
  // CREATE — Insert a new trip request (status = draft)
  // ============================================================================

  async create(dto: CreateTripRequestDto): Promise<OtaTripRequest> {
    const { otaTripRequests } = this.db.schema

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const [created] = await this.db.client
      .insert(otaTripRequests)
      .values({
        contactEmail: dto.email,
        contactName: dto.name ?? null,
        contactPhone: dto.phone ?? null,
        advisorSlug: dto.advisorSlug ?? null,
        referralSessionId: dto.referralSessionId ?? null,
        source: dto.source ?? 'ota',
        tripGroupId: dto.tripGroupId ?? null,
        title: dto.title ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        travelers: dto.travelers ?? 1,
        specialRequests: dto.specialRequests ?? null,
        components: dto.components,
        status: 'draft',
        expiresAt,
      })
      .returning()

    this.logger.log(
      `Created trip request ${created!.id} for ${dto.email} (${dto.components.length} components)`,
    )

    return created!
  }

  // ============================================================================
  // FIND BY ID
  // ============================================================================

  async findById(id: string): Promise<OtaTripRequest> {
    const { otaTripRequests } = this.db.schema

    const [row] = await this.db.client
      .select()
      .from(otaTripRequests)
      .where(eq(otaTripRequests.id, id))
      .limit(1)

    if (!row) {
      throw new NotFoundException(`Trip request ${id} not found`)
    }

    return row
  }

  // ============================================================================
  // UPDATE COMPONENTS — Only allowed while status = draft
  // ============================================================================

  async updateComponents(id: string, dto: UpdateComponentsDto): Promise<OtaTripRequest> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot update components: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        components: dto.components,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    this.logger.log(
      `Updated components for trip request ${id} (${dto.components.length} components)`,
    )

    return updated!
  }

  // ============================================================================
  // SUBMIT — Transition draft → submitted
  // ============================================================================

  async submit(id: string): Promise<OtaTripRequest> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot submit: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    const components = existing.components as any[]
    if (!components || components.length === 0) {
      throw new BadRequestException(
        `Cannot submit: trip request ${id} has no components`,
      )
    }

    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    this.logger.log(`Submitted trip request ${id}`)

    return updated!
  }

  // ============================================================================
  // MARK PROMOTED — Set status to promoted with trip reference
  // ============================================================================

  async markPromoted(id: string, tripId: string): Promise<OtaTripRequest> {
    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        status: 'promoted',
        promotedTripId: tripId,
        promotedAt: new Date(),
        promotedBy: 'system',
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    if (!updated) {
      throw new NotFoundException(`Trip request ${id} not found`)
    }

    this.logger.log(`Promoted trip request ${id} → trip ${tripId}`)

    return updated
  }

  // ============================================================================
  // MARK FAILED — Record promotion failure
  // ============================================================================

  async markFailed(id: string, error: string): Promise<OtaTripRequest> {
    const existing = await this.findById(id)
    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        status: 'failed',
        promotionError: error,
        promotionAttempts: (existing.promotionAttempts ?? 0) + 1,
        lastPromotionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    this.logger.warn(`Trip request ${id} failed: ${error}`)

    return updated!
  }

  // ============================================================================
  // UPDATE RESOLUTION — Set resolved owner, agency, and attribution
  // ============================================================================

  async updateResolution(
    id: string,
    resolution: {
      ownerId: string | null
      agencyId: string
      attribution: string
    },
  ): Promise<OtaTripRequest> {
    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        resolvedOwnerId: resolution.ownerId,
        resolvedAgencyId: resolution.agencyId,
        attribution: resolution.attribution,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    if (!updated) {
      throw new NotFoundException(`Trip request ${id} not found`)
    }

    this.logger.log(
      `Updated resolution for trip request ${id} (owner=${resolution.ownerId}, agency=${resolution.agencyId}, attribution=${resolution.attribution})`,
    )

    return updated
  }
}
