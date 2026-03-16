/**
 * Service Fees Controller
 *
 * REST API endpoints for service fee management.
 *
 * Endpoints:
 * - GET /trips/:tripId/service-fees - List all service fees for a trip
 * - GET /service-fees/:id - Get a single service fee
 * - POST /trips/:tripId/service-fees - Create a new service fee
 * - PATCH /service-fees/:id - Update a service fee (draft only)
 * - POST /service-fees/:id/send - Send a service fee
 * - POST /service-fees/:id/mark-paid - Mark as paid (manual, pre-Stripe)
 * - POST /service-fees/:id/refund - Process a refund
 * - POST /service-fees/:id/cancel - Cancel a service fee
 * - DELETE /service-fees/:id - Delete a service fee (draft only)
 */

import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ServiceFeesService } from './service-fees.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { TripAccessService } from '../trips/trip-access.service'
import type {
  ServiceFeeResponseDto,
  CreateServiceFeeDto,
  UpdateServiceFeeDto,
  RefundServiceFeeDto,
} from '@tailfire/shared-types'

@ApiTags('Service Fees')
@Controller()
export class ServiceFeesController {
  constructor(
    private readonly serviceFeesService: ServiceFeesService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Get all service fees for a trip
   * GET /trips/:tripId/service-fees
   */
  @Get('trips/:tripId/service-fees')
  async getServiceFees(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
  ): Promise<ServiceFeeResponseDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.serviceFeesService.getServiceFees(tripId, auth)
  }

  /**
   * Get a single service fee
   * GET /service-fees/:id
   */
  @Get('service-fees/:id')
  async getServiceFee(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ServiceFeeResponseDto> {
    return this.serviceFeesService.getServiceFee(id, auth)
  }

  /**
   * Create a new service fee (draft status)
   * POST /trips/:tripId/service-fees
   */
  @Post('trips/:tripId/service-fees')
  async createServiceFee(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CreateServiceFeeDto
  ): Promise<ServiceFeeResponseDto> {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.serviceFeesService.createServiceFee(tripId, dto, auth)
  }

  /**
   * Update a service fee (draft only)
   * PATCH /service-fees/:id
   */
  @Patch('service-fees/:id')
  async updateServiceFee(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateServiceFeeDto
  ): Promise<ServiceFeeResponseDto> {
    return this.serviceFeesService.updateServiceFee(id, dto, auth)
  }

  /**
   * Send a service fee (draft -> sent)
   * POST /service-fees/:id/send
   */
  @Post('service-fees/:id/send')
  async sendServiceFee(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ServiceFeeResponseDto> {
    return this.serviceFeesService.sendServiceFee(id, auth)
  }

  /**
   * Mark a service fee as paid (sent -> paid)
   * This is a manual endpoint for pre-Stripe testing
   * In production, payment confirmation comes from Stripe webhooks
   * POST /service-fees/:id/mark-paid
   */
  @Post('service-fees/:id/mark-paid')
  async markAsPaid(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ServiceFeeResponseDto> {
    return this.serviceFeesService.markAsPaid(id, auth)
  }

  /**
   * Process a refund
   * POST /service-fees/:id/refund
   */
  @Post('service-fees/:id/refund')
  async processRefund(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: RefundServiceFeeDto
  ): Promise<ServiceFeeResponseDto> {
    return this.serviceFeesService.processRefund(id, dto, auth)
  }

  /**
   * Cancel a service fee (draft/sent -> cancelled)
   * POST /service-fees/:id/cancel
   */
  @Post('service-fees/:id/cancel')
  async cancelServiceFee(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ServiceFeeResponseDto> {
    return this.serviceFeesService.cancelServiceFee(id, auth)
  }

  /**
   * Delete a service fee (draft only)
   * DELETE /service-fees/:id
   */
  @Delete('service-fees/:id')
  async deleteServiceFee(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.serviceFeesService.deleteServiceFee(id, auth)
    return { success: true }
  }
}
