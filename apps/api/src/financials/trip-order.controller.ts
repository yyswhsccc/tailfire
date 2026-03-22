/**
 * Trip-Order Controller
 *
 * REST API endpoints for Trip-Order snapshot management with proper JWT-based auth.
 * All endpoints derive agencyId and userId from the authenticated JWT context.
 *
 * Snapshot Endpoints (canonical flow):
 * - POST /trips/:tripId/trip-orders - Generate snapshot and return for preview
 * - GET /trips/:tripId/trip-orders - List all versions for a trip
 * - GET /trip-orders/:id - Get specific version by ID
 * - GET /trips/:tripId/trip-orders/latest - Get most recent version
 * - POST /trip-orders/:id/finalize - Finalize a draft snapshot
 * - POST /trip-orders/:id/download - Download PDF from stored snapshot
 * - POST /trip-orders/:id/send-email - Send email from stored snapshot
 *
 * Legacy Endpoints (deprecated - use snapshot flow instead):
 * - POST /trips/:tripId/trip-order - Generate live PDF URL
 * - POST /trips/:tripId/trip-order/download - Download live PDF
 * - POST /trips/:tripId/trip-order/send-email - Send live PDF via email
 */

import { Controller, Post, Get, Param, Body, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from 'express'
import { TripOrderService, TripOrderSnapshotDto } from './trip-order.service'
import { SendTripOrderEmailDto } from './dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { TripAccessService } from '../trips/trip-access.service'
import type { AuthContext } from '../auth/auth.types'
import type { GenerateTripOrderDto, TripOrderResponseDto } from '@tailfire/shared-types'

// DTO for sending trip order email from snapshot (no userId needed - from auth)
interface SendStoredTripOrderEmailDto {
  to: string[]
  cc?: string[]
  bcc?: string[]
  customSubject?: string
  customMessage?: string
}

interface SendTripOrderEmailResponse {
  success: boolean
  emailLogId?: string
  providerMessageId?: string
  recipients: string[]
  error?: string
}

@ApiTags('Trip Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TripOrderController {
  constructor(
    private readonly tripOrderService: TripOrderService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  // ===========================================================================
  // SNAPSHOT MANAGEMENT ENDPOINTS (Canonical Flow)
  // ===========================================================================

  /**
   * Generate Trip-Order snapshot and return for preview
   * POST /trips/:tripId/trip-orders
   *
   * Creates a new versioned snapshot of the trip order data.
   * Each call creates a new version (auto-incrementing).
   */
  @Post('trips/:tripId/trip-orders')
  @ApiOperation({ summary: 'Generate new trip order snapshot' })
  async generateTripOrderSnapshot(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string
  ): Promise<TripOrderSnapshotDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.tripOrderService.generateTripOrderSnapshot(tripId, auth.agencyId, auth.userId)
  }

  /**
   * List all Trip-Order versions for a trip
   * GET /trips/:tripId/trip-orders
   */
  @Get('trips/:tripId/trip-orders')
  @ApiOperation({ summary: 'List all trip order versions' })
  async listTripOrders(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string
  ): Promise<TripOrderSnapshotDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.tripOrderService.listTripOrders(tripId, auth.agencyId)
  }

  /**
   * Get the latest Trip-Order version for a trip
   * GET /trips/:tripId/trip-orders/latest
   */
  @Get('trips/:tripId/trip-orders/latest')
  @ApiOperation({ summary: 'Get latest trip order version' })
  async getLatestTripOrder(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string
  ): Promise<TripOrderSnapshotDto | null> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.tripOrderService.getLatestTripOrder(tripId, auth.agencyId)
  }

  /**
   * Get a specific Trip-Order by ID
   * GET /trip-orders/:id
   */
  @Get('trip-orders/:id')
  @ApiOperation({ summary: 'Get trip order by ID' })
  async getTripOrderById(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<TripOrderSnapshotDto> {
    return this.tripOrderService.getTripOrderById(id, auth.agencyId)
  }

  /**
   * Check TICO compliance for a Trip-Order
   * GET /trip-orders/:id/compliance
   *
   * Returns list of compliance violations. Empty array means compliant.
   */
  @Get('trip-orders/:id/compliance')
  @ApiOperation({ summary: 'Check TICO compliance for trip order' })
  async checkCompliance(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<{ compliant: boolean; violations: string[] }> {
    const tripOrder = await this.tripOrderService.getTripOrderById(id, auth.agencyId)
    const violations = this.tripOrderService.validateTICOCompliance(tripOrder)
    return { compliant: violations.length === 0, violations }
  }

  /**
   * Finalize a Trip-Order (draft -> finalized)
   * POST /trip-orders/:id/finalize
   *
   * Once finalized, the snapshot cannot be modified.
   * Only draft snapshots can be finalized.
   * ALL TICO compliance requirements must be satisfied.
   */
  @Post('trip-orders/:id/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize trip order (draft -> finalized)' })
  async finalizeTripOrder(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<TripOrderSnapshotDto> {
    return this.tripOrderService.finalizeTripOrder(id, auth.agencyId, auth.userId)
  }

  /**
   * Download PDF from stored Trip-Order snapshot
   * POST /trip-orders/:id/download
   *
   * Generates PDF from the stored snapshot data (not live data).
   */
  @Post('trip-orders/:id/download')
  @ApiOperation({ summary: 'Download PDF from stored snapshot' })
  async downloadStoredTripOrder(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Res() res: Response
  ): Promise<void> {
    const pdfBuffer = await this.tripOrderService.generatePdfFromSnapshot(id, auth.agencyId)

    const filename = `trip-order-${id.slice(0, 8)}.pdf`

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    })

    res.send(pdfBuffer)
  }

  /**
   * Send Trip-Order email from stored snapshot
   * POST /trip-orders/:id/send-email
   *
   * Sends email using the stored snapshot data and marks the order as sent.
   */
  @Post('trip-orders/:id/send-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send trip order email from snapshot' })
  async sendStoredTripOrderEmail(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SendStoredTripOrderEmailDto
  ): Promise<SendTripOrderEmailResponse> {
    return this.tripOrderService.sendStoredTripOrderEmail(id, auth.agencyId, auth.userId, dto)
  }

  // ===========================================================================
  // LEGACY ENDPOINTS (Deprecated - use snapshot flow instead)
  // ===========================================================================

  /**
   * @deprecated Use POST /trips/:tripId/trip-orders instead for snapshot-based flow
   *
   * Generate Trip-Order PDF and return URL (live data, not stored)
   * POST /trips/:tripId/trip-order
   */
  @Post('trips/:tripId/trip-order')
  @ApiOperation({
    summary: '[DEPRECATED] Generate live Trip-Order PDF URL',
    deprecated: true,
    description: 'Use POST /trips/:tripId/trip-orders instead for the snapshot-based flow',
  })
  async generateTripOrder(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: GenerateTripOrderDto
  ): Promise<TripOrderResponseDto> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.tripOrderService.generateTripOrderWithUrl(tripId, auth.agencyId, dto)
  }

  /**
   * @deprecated Use POST /trip-orders/:id/download instead for snapshot-based flow
   *
   * Generate and download Trip-Order PDF directly (live data, not stored)
   * POST /trips/:tripId/trip-order/download
   */
  @Post('trips/:tripId/trip-order/download')
  @ApiOperation({
    summary: '[DEPRECATED] Download live Trip-Order PDF',
    deprecated: true,
    description: 'Use POST /trip-orders/:id/download instead for the snapshot-based flow',
  })
  async downloadTripOrder(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: GenerateTripOrderDto,
    @Res() res: Response
  ): Promise<void> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    const pdfBuffer = await this.tripOrderService.generateTripOrder(tripId, auth.agencyId, dto)

    const filename = `trip-order-${tripId.slice(0, 8)}.pdf`

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    })

    res.send(pdfBuffer)
  }

  /**
   * @deprecated Use POST /trip-orders/:id/send-email instead for snapshot-based flow
   *
   * Generate and send Trip-Order PDF via email (live data, not stored)
   * POST /trips/:tripId/trip-order/send-email
   */
  @Post('trips/:tripId/trip-order/send-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[DEPRECATED] Send live Trip-Order PDF via email',
    deprecated: true,
    description: 'Use POST /trip-orders/:id/send-email instead for the snapshot-based flow',
  })
  async sendTripOrderEmail(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: SendTripOrderEmailDto
  ): Promise<SendTripOrderEmailResponse> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.tripOrderService.sendTripOrderEmail(tripId, auth.agencyId, dto)
  }
}
