/**
 * Payment Schedules Controller
 *
 * REST endpoints for activity-level payment schedule management.
 * Handles payment schedule config and expected payment items.
 *
 * Note: Legacy /component-pricing/* routes were removed in favor of
 * /activity-pricing/* to align with the activityPricingId field name.
 *
 * Access control: All endpoints verify trip access via TripAccessService.
 *
 * @see AUTH_INTEGRATION.md for authentication implementation requirements
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PaymentSchedulesService } from './payment-schedules.service'
import { TripAccessService } from './trip-access.service'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  PaymentScheduleConfigDto,
  CreatePaymentScheduleConfigDto,
  UpdatePaymentScheduleConfigDto,
  CreateExpectedPaymentItemDto,
  UpdateExpectedPaymentItemDto,
  ExpectedPaymentItemDto,
  PaymentTransactionDto,
  CreatePaymentTransactionDto,
  PaymentTransactionListResponseDto,
  TripExpectedPaymentDto,
  TripPaymentTransactionDto,
} from '@tailfire/shared-types'

@ApiTags('Payment Schedules')
@Controller('payment-schedules')
export class PaymentSchedulesController {
  constructor(
    private readonly paymentSchedulesService: PaymentSchedulesService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  // ============================================================================
  // Payment Schedule Config Endpoints
  // ============================================================================

  /**
   * Get payment schedule config by activity pricing ID
   * GET /payment-schedules/activity-pricing/:activityPricingId
   *
   * Access check: User must have read access to the trip.
   */
  @Get('activity-pricing/:activityPricingId')
  async getByActivityPricingId(
    @GetAuthContext() auth: AuthContext,
    @Param('activityPricingId') activityPricingId: string,
  ): Promise<PaymentScheduleConfigDto | null> {
    const tripId = await this.paymentSchedulesService.getTripIdFromActivityPricingId(activityPricingId)
    if (!tripId) {
      throw new NotFoundException(`Activity pricing with ID ${activityPricingId} not found`)
    }
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.paymentSchedulesService.findByActivityPricingId(activityPricingId)
  }

  /**
   * Create payment schedule configuration
   * POST /payment-schedules
   *
   * Access check: User must have write access to the trip.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreatePaymentScheduleConfigDto,
  ): Promise<PaymentScheduleConfigDto> {
    if (dto.activityPricingId) {
      const tripId = await this.paymentSchedulesService.getTripIdFromActivityPricingId(dto.activityPricingId)
      if (!tripId) {
        throw new NotFoundException(`Activity pricing with ID ${dto.activityPricingId} not found`)
      }
      await this.tripAccessService.verifyWriteAccess(tripId, auth)
    }
    return this.paymentSchedulesService.create(dto, auth.role === 'admin')
  }

  /**
   * Update payment schedule configuration
   * PATCH /payment-schedules/activity-pricing/:activityPricingId
   *
   * Access check: User must have write access to the trip.
   */
  @Patch('activity-pricing/:activityPricingId')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('activityPricingId') activityPricingId: string,
    @Body() dto: UpdatePaymentScheduleConfigDto,
  ): Promise<PaymentScheduleConfigDto> {
    const tripId = await this.paymentSchedulesService.getTripIdFromActivityPricingId(activityPricingId)
    if (!tripId) {
      throw new NotFoundException(`Activity pricing with ID ${activityPricingId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.paymentSchedulesService.update(activityPricingId, dto, auth.role === 'admin')
  }

  /**
   * Get payment schedule config by traveler booking ID
   * GET /payment-schedules/traveler-booking/:travelerBookingId
   *
   * Access check: User must have read access to the trip.
   */
  @Get('traveler-booking/:travelerBookingId')
  async getByTravelerBookingId(
    @GetAuthContext() auth: AuthContext,
    @Param('travelerBookingId') travelerBookingId: string,
  ): Promise<PaymentScheduleConfigDto | null> {
    const tripId = await this.paymentSchedulesService.getTripIdFromTravelerBookingId(travelerBookingId)
    if (!tripId) {
      throw new NotFoundException(`Traveler booking with ID ${travelerBookingId} not found`)
    }
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.paymentSchedulesService.findByTravelerBookingId(travelerBookingId)
  }

  /**
   * Get all payment schedule configs for an activity pricing (global + per-traveler)
   * GET /payment-schedules/activity-pricing/:activityPricingId/all
   *
   * Access check: User must have read access to the trip.
   */
  @Get('activity-pricing/:activityPricingId/all')
  async getAllByActivityPricingId(
    @GetAuthContext() auth: AuthContext,
    @Param('activityPricingId') activityPricingId: string,
  ): Promise<PaymentScheduleConfigDto[]> {
    const tripId = await this.paymentSchedulesService.getTripIdFromActivityPricingId(activityPricingId)
    if (!tripId) {
      throw new NotFoundException(`Activity pricing with ID ${activityPricingId} not found`)
    }
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.paymentSchedulesService.findAllByActivityPricingId(activityPricingId)
  }

  /**
   * Delete payment schedule configuration (cascades to expected payment items)
   * DELETE /payment-schedules/activity-pricing/:activityPricingId
   *
   * Access check: User must have write access to the trip.
   */
  @Delete('activity-pricing/:activityPricingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @GetAuthContext() auth: AuthContext,
    @Param('activityPricingId') activityPricingId: string,
  ): Promise<void> {
    const tripId = await this.paymentSchedulesService.getTripIdFromActivityPricingId(activityPricingId)
    if (!tripId) {
      throw new NotFoundException(`Activity pricing with ID ${activityPricingId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    await this.paymentSchedulesService.delete(activityPricingId, auth.role === 'admin')
  }

  // ============================================================================
  // Expected Payment Items Endpoints
  // ============================================================================

  /**
   * Update an expected payment item
   * PATCH /payment-schedules/expected-payment-items/:itemId
   *
   * Access check: User must have write access to the trip.
   */
  @Patch('expected-payment-items/:itemId')
  async updateExpectedPaymentItem(
    @GetAuthContext() auth: AuthContext,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateExpectedPaymentItemDto,
  ): Promise<ExpectedPaymentItemDto> {
    const tripId = await this.paymentSchedulesService.getTripIdFromExpectedPaymentItemId(itemId)
    if (!tripId) {
      throw new NotFoundException(`Expected payment item with ID ${itemId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.paymentSchedulesService.updateExpectedPaymentItem(itemId, dto, auth.role === 'admin')
  }

  /**
   * Add an expected payment item to an existing payment schedule config
   * POST /payment-schedules/:configId/expected-payment-items
   *
   * Access check: User must have write access to the trip.
   */
  @Post(':configId/expected-payment-items')
  @HttpCode(HttpStatus.CREATED)
  async addExpectedPaymentItem(
    @GetAuthContext() auth: AuthContext,
    @Param('configId') configId: string,
    @Body() dto: CreateExpectedPaymentItemDto,
  ): Promise<ExpectedPaymentItemDto> {
    const tripId = await this.paymentSchedulesService.getTripIdFromPaymentScheduleConfigId(configId)
    if (!tripId) {
      throw new NotFoundException(`Payment schedule config with ID ${configId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.paymentSchedulesService.addExpectedPaymentItem(configId, auth.agencyId, dto, auth.role === 'admin')
  }

  /**
   * Delete an expected payment item
   * DELETE /payment-schedules/expected-payment-items/:itemId
   *
   * Access check: User must have write access to the trip.
   * Blocks if any payment transactions exist for this item.
   */
  @Delete('expected-payment-items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExpectedPaymentItem(
    @GetAuthContext() auth: AuthContext,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const tripId = await this.paymentSchedulesService.getTripIdFromExpectedPaymentItemId(itemId)
    if (!tripId) {
      throw new NotFoundException(`Expected payment item with ID ${itemId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    await this.paymentSchedulesService.deleteExpectedPaymentItem(itemId, auth.agencyId, auth.role === 'admin')
  }

  // ============================================================================
  // Payment Transaction Endpoints
  // ============================================================================

  /**
   * Create a payment transaction
   * POST /payment-schedules/transactions
   *
   * Access check: User must have write access to the trip.
   */
  @Post('transactions')
  @HttpCode(HttpStatus.CREATED)
  async createTransaction(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreatePaymentTransactionDto,
  ): Promise<PaymentTransactionDto> {
    const tripId = await this.paymentSchedulesService.getTripIdFromExpectedPaymentItemId(dto.expectedPaymentItemId)
    if (!tripId) {
      throw new NotFoundException(`Expected payment item with ID ${dto.expectedPaymentItemId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.paymentSchedulesService.createTransaction(dto)
  }

  /**
   * Get all transactions for an expected payment item
   * GET /payment-schedules/expected-payment-items/:itemId/transactions
   *
   * Access check: User must have read access to the trip.
   */
  @Get('expected-payment-items/:itemId/transactions')
  async getTransactionsByExpectedPaymentItemId(
    @GetAuthContext() auth: AuthContext,
    @Param('itemId') itemId: string,
  ): Promise<PaymentTransactionListResponseDto> {
    const tripId = await this.paymentSchedulesService.getTripIdFromExpectedPaymentItemId(itemId)
    if (!tripId) {
      throw new NotFoundException(`Expected payment item with ID ${itemId} not found`)
    }
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.paymentSchedulesService.findTransactionsByExpectedPaymentItemId(itemId)
  }

  /**
   * Update the contact ("Paid By") on a payment transaction
   * PATCH /payment-schedules/transactions/:transactionId/contact
   *
   * Access check: User must have write access to the trip.
   */
  @Patch('transactions/:transactionId/contact')
  async updateTransactionContact(
    @GetAuthContext() auth: AuthContext,
    @Param('transactionId') transactionId: string,
    @Body() dto: { contactId: string | null },
  ): Promise<PaymentTransactionDto> {
    const tripId = await this.paymentSchedulesService.getTripIdFromTransactionId(transactionId)
    if (!tripId) {
      throw new NotFoundException(`Payment transaction with ID ${transactionId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    return this.paymentSchedulesService.updateTransactionContact(transactionId, dto.contactId, auth.agencyId)
  }

  /**
   * Delete a payment transaction
   * DELETE /payment-schedules/transactions/:transactionId
   *
   * Access check: User must have write access to the trip.
   */
  @Delete('transactions/:transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTransaction(
    @GetAuthContext() auth: AuthContext,
    @Param('transactionId') transactionId: string,
  ): Promise<void> {
    const tripId = await this.paymentSchedulesService.getTripIdFromTransactionId(transactionId)
    if (!tripId) {
      throw new NotFoundException(`Payment transaction with ID ${transactionId} not found`)
    }
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    await this.paymentSchedulesService.deleteTransaction(transactionId)
  }

  // ============================================================================
  // Trip-Level Payment Endpoints
  // ============================================================================

  /**
   * Get all expected payment items for a trip with activity context
   * GET /payment-schedules/trips/:tripId/expected-payments
   *
   * Access check: User must have read access to the trip.
   */
  @Get('trips/:tripId/expected-payments')
  async getExpectedPaymentsByTripId(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
  ): Promise<TripExpectedPaymentDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.paymentSchedulesService.getExpectedPaymentsByTripId(tripId, auth.agencyId)
  }

  /**
   * Get all payment transactions for a trip with activity context
   * GET /payment-schedules/trips/:tripId/transactions
   *
   * Access check: User must have read access to the trip.
   */
  @Get('trips/:tripId/transactions')
  async getTransactionsByTripId(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
  ): Promise<TripPaymentTransactionDto[]> {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.paymentSchedulesService.getTransactionsByTripId(tripId, auth.agencyId)
  }
}
