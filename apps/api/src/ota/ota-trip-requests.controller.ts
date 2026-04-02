/**
 * OTA Trip Requests Controller
 *
 * REST endpoints for the OTA trip request pipeline. Consumers build
 * multi-component trip requests (flights, cruises, hotels, tours) which
 * progress through: draft → submitted → promoted.
 *
 * Auth: @Public (bypass JWT) + OtaServiceKeyGuard (x-ota-service-key header).
 */

import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { OtaServiceKeyGuard } from './guards/ota-service-key.guard'
import { OtaTripRequestsService } from './ota-trip-requests.service'
import { TripPromotionService } from './trip-promotion.service'
import { TripInspirationService } from './trip-inspiration.service'
import { CreateTripRequestDto, UpdateComponentsDto, TripRequestComponentDto } from './dto/create-trip-request.dto'
import { UpdateBoardOrderDto } from './dto/board-order.dto'
import { LinkIdentityDto } from './dto/trip-request-identity.dto'

@ApiTags('OTA Trip Requests')
@ApiHeader({
  name: 'x-ota-service-key',
  description: 'OTA service-to-service key',
  required: true,
})
@Controller('ota/trip-requests')
@Public()
@UseGuards(OtaServiceKeyGuard)
export class OtaTripRequestsController {
  private readonly logger = new Logger(OtaTripRequestsController.name)

  constructor(
    private readonly tripRequests: OtaTripRequestsService,
    private readonly promotionService: TripPromotionService,
    private readonly inspirationService: TripInspirationService,
  ) {}

  // ==========================================================================
  // Static routes FIRST (before :id parameterized routes)
  // ==========================================================================

  /**
   * Create a new trip request (status: draft).
   * POST /ota/trip-requests
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new OTA trip request' })
  @ApiResponse({ status: 201, description: 'Trip request created in draft status' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async create(@Body() dto: CreateTripRequestDto) {
    const request = await this.tripRequests.create(dto)
    return { requestId: request.id }
  }

  /**
   * Get all draft trip requests for a session.
   * GET /ota/trip-requests/by-session/:sessionId
   */
  @Get('by-session/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get draft trip requests by session ID' })
  @ApiResponse({ status: 200, description: 'Array of draft trip requests for the session' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async findBySession(@Param('sessionId') sessionId: string) {
    return this.tripRequests.findBySession(sessionId)
  }

  /**
   * Get a shared trip request by share token (public-safe view).
   * GET /ota/trip-requests/shared/:token
   */
  @Get('shared/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a shared trip request by token (strips sensitive fields)' })
  @ApiResponse({ status: 200, description: 'Trip request with sensitive fields stripped' })
  @ApiResponse({ status: 404, description: 'Share token not found or revoked' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async findByShareToken(@Param('token') token: string) {
    const request = await this.tripRequests.findByShareToken(token)

    if (!request) {
      throw new NotFoundException('Share token not found or revoked')
    }

    // Only expose safe display fields — strip all internal/sensitive data
    return {
      id: request.id,
      title: request.title,
      components: request.components,
      inspiration: request.inspiration,
      boardOrder: request.boardOrder,
      startDate: request.startDate,
      endDate: request.endDate,
      travelers: request.travelers,
      status: request.status,
    }
  }

  // ==========================================================================
  // Parameterized :id routes
  // ==========================================================================

  /**
   * Get trip request details.
   * GET /ota/trip-requests/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get trip request details' })
  @ApiResponse({ status: 200, description: 'Trip request details' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tripRequests.findById(id)
  }

  /**
   * Update components on a draft trip request.
   * PUT /ota/trip-requests/:id/components
   */
  @Put(':id/components')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update components on a draft trip request' })
  @ApiResponse({ status: 200, description: 'Components updated' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async updateComponents(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComponentsDto,
  ) {
    const request = await this.tripRequests.updateComponents(id, dto)
    const components = request.components as any[]
    return { requestId: request.id, componentCount: components.length }
  }

  /**
   * Add a single component to a draft trip request.
   * POST /ota/trip-requests/:id/components/add
   */
  @Post(':id/components/add')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a component to a draft trip request' })
  @ApiResponse({ status: 200, description: 'Component added' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async addComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { component: TripRequestComponentDto },
  ) {
    const request = await this.tripRequests.addComponent(id, body.component)
    const components = request.components as any[]
    return { requestId: request.id, componentCount: components.length }
  }

  /**
   * Remove a component from a draft trip request.
   * DELETE /ota/trip-requests/:id/components/:componentId
   */
  @Delete(':id/components/:componentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a component from a draft trip request' })
  @ApiResponse({ status: 200, description: 'Component removed' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async removeComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId') componentId: string,
  ) {
    const request = await this.tripRequests.removeComponent(id, componentId)
    const components = request.components as any[]
    return { requestId: request.id, componentCount: components.length }
  }

  /**
   * Update the board display order for a draft trip request.
   * PATCH /ota/trip-requests/:id/board-order
   */
  @Patch(':id/board-order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update board display order' })
  @ApiResponse({ status: 200, description: 'Board order updated' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async updateBoardOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardOrderDto,
  ) {
    await this.tripRequests.updateBoardOrder(id, dto.boardOrder)
    return { requestId: id }
  }

  /**
   * Generate (or return existing) share token for a trip request.
   * POST /ota/trip-requests/:id/share
   */
  @Post(':id/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a share token for a trip request' })
  @ApiResponse({ status: 200, description: 'Share token generated' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async generateShareToken(@Param('id', ParseUUIDPipe) id: string) {
    const shareToken = await this.tripRequests.generateShareToken(id)
    return {
      shareToken,
      shareUrl: `/my-trip/${id}?token=${shareToken}`,
    }
  }

  /**
   * Revoke the share token for a trip request.
   * DELETE /ota/trip-requests/:id/share
   */
  @Delete(':id/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the share token for a trip request' })
  @ApiResponse({ status: 200, description: 'Share token revoked' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async revokeShareToken(@Param('id', ParseUUIDPipe) id: string) {
    await this.tripRequests.revokeShareToken(id)
    return { message: 'Share token revoked' }
  }

  /**
   * Link an identity (email/name/phone) to an anonymous draft trip request.
   * PATCH /ota/trip-requests/:id/identity
   */
  @Patch(':id/identity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link consumer identity to a draft trip request' })
  @ApiResponse({ status: 200, description: 'Identity linked' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async linkIdentity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkIdentityDto,
  ) {
    return this.tripRequests.linkIdentity(id, dto)
  }

  /**
   * Fetch inspiration cards for a destination and merge with existing.
   * POST /ota/trip-requests/:id/inspiration
   */
  @Post(':id/inspiration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch and merge inspiration cards for a destination' })
  @ApiResponse({ status: 200, description: 'Inspiration cards fetched and saved' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async fetchInspiration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { destination: string },
  ) {
    // Fetch new cards from inspiration service
    const newCards = await this.inspirationService.getInspirationCards(body.destination)

    // Get existing request to merge with current inspiration
    const request = await this.tripRequests.findById(id)
    const existingCards = (request.inspiration as any[]) ?? []

    // Merge: deduplicate by card ID
    const existingIds = new Set(existingCards.map((c: any) => c.id))
    const trulyNewCards = newCards.filter((c) => !existingIds.has(c.id))
    const merged = [...existingCards, ...trulyNewCards]

    // Persist merged inspiration + auto-append new cards to board_order
    const newCardIds = trulyNewCards.map((c) => c.id)
    await this.tripRequests.updateInspiration(id, merged, newCardIds)

    return { cards: merged }
  }

  /**
   * Submit a trip request and trigger promotion into a full Tailfire trip.
   * POST /ota/trip-requests/:id/submit
   *
   * 1. Transitions draft → submitted
   * 2. Runs the promotion pipeline inline
   * 3. Returns success even if promotion fails (the request was submitted)
   */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a trip request and trigger promotion' })
  @ApiResponse({ status: 200, description: 'Trip request submitted (promotion may be async)' })
  @ApiResponse({ status: 400, description: 'Request is not in draft status or has no components' })
  @ApiResponse({ status: 404, description: 'Trip request not found' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, any> = {},
  ) {
    // Step 0: Persist any submit-time details (date flexibility, travel style, etc.)
    if (body && Object.keys(body).length > 0) {
      await this.tripRequests.updateSubmitDetails(id, {
        dateFlexibility: body.dateFlexibility,
        travelStyle: body.travelStyle,
        travelers: body.travelers,
        specialRequests: body.specialRequests,
        startDate: body.startDate,
      })
    }

    // Step 1: Transition draft → submitted
    await this.tripRequests.submit(id)

    // Step 2: Run promotion pipeline inline
    let tripId: string | undefined
    let message = 'Trip request submitted and promoted successfully'

    try {
      const result = await this.promotionService.promote(id)
      tripId = result.tripId
    } catch (error) {
      // Promotion failed, but the request was still submitted successfully
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Promotion failed for trip request ${id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      )
      message = 'Trip request submitted but promotion encountered an error'
    }

    return { requestId: id, tripId, message }
  }
}
