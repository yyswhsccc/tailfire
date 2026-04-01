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
import { eq, and } from 'drizzle-orm'
import * as crypto from 'crypto'
import { DatabaseService } from '../db/database.service'
import { OtaLeadsService } from './ota-leads.service'
import type { CreateTripRequestDto, UpdateComponentsDto } from './dto/create-trip-request.dto'
import type { LinkIdentityDto } from './dto/trip-request-identity.dto'
import type { schema } from '@tailfire/database'

type OtaTripRequest = typeof schema.otaTripRequests.$inferSelect

@Injectable()
export class OtaTripRequestsService {
  private readonly logger = new Logger(OtaTripRequestsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly leadsService: OtaLeadsService,
  ) {}

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
        contactEmail: dto.email ?? null,
        contactName: dto.name ?? null,
        contactPhone: dto.phone ?? null,
        advisorSlug: dto.advisorSlug ?? null,
        referralSessionId: dto.referralSessionId ?? null,
        sessionId: dto.sessionId ?? null,
        source: dto.source ?? 'ota',
        tripGroupId: dto.tripGroupId ?? null,
        title: dto.title ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        travelers: dto.travelers ?? 1,
        specialRequests: dto.specialRequests ?? null,
        dateFlexibility: dto.dateFlexibility ?? false,
        travelStyle: dto.travelStyle ?? null,
        components: dto.components,
        boardOrder: dto.components.map((c: any) => ({ type: 'component', id: c.id })),
        status: 'draft',
        expiresAt,
      })
      .returning()

    this.logger.log(
      `Created trip request ${created!.id} for ${dto.email ?? `session:${dto.sessionId}`} (${dto.components.length} components)`,
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

    if (!existing.contactEmail) {
      throw new BadRequestException(
        'Email required to submit',
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

  // ============================================================================
  // FIND BY SESSION — Get all draft requests for a session
  // ============================================================================

  async findBySession(sessionId: string): Promise<OtaTripRequest[]> {
    const { otaTripRequests } = this.db.schema

    return this.db.client
      .select()
      .from(otaTripRequests)
      .where(
        and(
          eq(otaTripRequests.sessionId, sessionId),
          eq(otaTripRequests.status, 'draft'),
        ),
      )
  }

  // ============================================================================
  // FIND BY SHARE TOKEN — Get a single request by its share token
  // ============================================================================

  async findByShareToken(token: string): Promise<OtaTripRequest | null> {
    const { otaTripRequests } = this.db.schema

    const [row] = await this.db.client
      .select()
      .from(otaTripRequests)
      .where(eq(otaTripRequests.shareToken, token))
      .limit(1)

    return row ?? null
  }

  // ============================================================================
  // ADD COMPONENT — Append a component to the JSONB array (draft only)
  // ============================================================================

  async addComponent(id: string, component: any): Promise<OtaTripRequest> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot add component: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    const components = [...((existing.components as any[]) ?? []), component]
    const boardOrder = [
      ...((existing.boardOrder as any[]) ?? []),
      { type: 'component', id: component.id },
    ]

    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        components,
        boardOrder,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    this.logger.log(
      `Added component ${component.id} to trip request ${id} (now ${components.length} components)`,
    )

    return updated!
  }

  // ============================================================================
  // REMOVE COMPONENT — Filter out a component by ID (also removes from board_order)
  // ============================================================================

  async removeComponent(id: string, componentId: string): Promise<OtaTripRequest> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot remove component: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    const components = ((existing.components as any[]) ?? []).filter(
      (c: any) => c.id !== componentId,
    )

    const boardOrder = ((existing.boardOrder as any[]) ?? []).filter(
      (item: any) => !(item.type === 'component' && item.id === componentId),
    )

    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        components,
        boardOrder,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    this.logger.log(
      `Removed component ${componentId} from trip request ${id} (now ${components.length} components)`,
    )

    return updated!
  }

  // ============================================================================
  // UPDATE BOARD ORDER — Set the display ordering of components + inspiration
  // ============================================================================

  async updateBoardOrder(id: string, boardOrder: any[]): Promise<OtaTripRequest> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot update board order: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        boardOrder,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    this.logger.log(`Updated board order for trip request ${id} (${boardOrder.length} items)`)

    return updated!
  }

  // ============================================================================
  // GENERATE SHARE TOKEN — Create a 64-char hex token (or return existing)
  // ============================================================================

  async generateShareToken(id: string): Promise<string> {
    const existing = await this.findById(id)

    // Return existing token if already set
    if (existing.shareToken) {
      return existing.shareToken
    }

    const token = crypto.randomBytes(32).toString('hex')

    const { otaTripRequests } = this.db.schema

    await this.db.client
      .update(otaTripRequests)
      .set({
        shareToken: token,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))

    this.logger.log(`Generated share token for trip request ${id}`)

    return token
  }

  // ============================================================================
  // REVOKE SHARE TOKEN — Clear the share token
  // ============================================================================

  async revokeShareToken(id: string): Promise<void> {
    await this.findById(id) // ensure exists

    const { otaTripRequests } = this.db.schema

    await this.db.client
      .update(otaTripRequests)
      .set({
        shareToken: null,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))

    this.logger.log(`Revoked share token for trip request ${id}`)
  }

  // ============================================================================
  // LINK IDENTITY — Associate an email/contact with an anonymous draft
  // ============================================================================

  async linkIdentity(
    id: string,
    dto: LinkIdentityDto,
  ): Promise<{ contactId: string; isExisting: boolean; advisorName?: string }> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot link identity: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    // Use OtaLeadsService.captureLead to find-or-create the contact
    const result = await this.leadsService.captureLead({
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
      advisorSlug: existing.advisorSlug ?? undefined,
      referralSessionId: existing.referralSessionId ?? undefined,
    })

    const { otaTripRequests } = this.db.schema

    await this.db.client
      .update(otaTripRequests)
      .set({
        contactEmail: dto.email,
        contactName: dto.name ?? null,
        contactPhone: dto.phone ?? null,
        contactId: result.contact.id,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))

    const isExisting = result.attribution === 'crm_existing'

    this.logger.log(
      `Linked identity for trip request ${id}: contact=${result.contact.id}, existing=${isExisting}`,
    )

    return {
      contactId: result.contact.id,
      isExisting,
      advisorName: result.advisorName,
    }
  }

  // ============================================================================
  // UPDATE INSPIRATION — Replace inspiration JSONB array
  // ============================================================================

  async updateInspiration(id: string, cards: any[], newCardIds?: string[]): Promise<void> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot update inspiration: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    const { otaTripRequests } = this.db.schema

    // Auto-append new inspiration cards to board_order
    const setValues: Record<string, any> = {
      inspiration: cards,
      updatedAt: new Date(),
    }

    if (newCardIds && newCardIds.length > 0) {
      const currentBoardOrder = (existing.boardOrder as any[]) ?? []
      const existingBoardIds = new Set(currentBoardOrder.map((item: any) => item.id))
      const newBoardEntries = newCardIds
        .filter((cid) => !existingBoardIds.has(cid))
        .map((cid) => ({ type: 'inspiration', id: cid }))
      setValues.boardOrder = [...currentBoardOrder, ...newBoardEntries]
    }

    await this.db.client
      .update(otaTripRequests)
      .set(setValues)
      .where(eq(otaTripRequests.id, id))

    this.logger.log(`Updated inspiration for trip request ${id} (${cards.length} cards)`)
  }

  // ============================================================================
  // UPDATE SUBMIT DETAILS — Update date flexibility, travel style, etc. before submit
  // ============================================================================

  async updateSubmitDetails(
    id: string,
    dto: {
      dateFlexibility?: boolean
      travelStyle?: string
      travelers?: number
      specialRequests?: string
    },
  ): Promise<OtaTripRequest> {
    const existing = await this.findById(id)

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot update submit details: trip request ${id} is '${existing.status}', expected 'draft'`,
      )
    }

    const { otaTripRequests } = this.db.schema

    const [updated] = await this.db.client
      .update(otaTripRequests)
      .set({
        dateFlexibility: dto.dateFlexibility,
        travelStyle: dto.travelStyle,
        travelers: dto.travelers,
        specialRequests: dto.specialRequests,
        updatedAt: new Date(),
      })
      .where(eq(otaTripRequests.id, id))
      .returning()

    this.logger.log(`Updated submit details for trip request ${id}`)

    return updated!
  }
}
