/**
 * Service Fees Service
 *
 * Manages service fee lifecycle (without Stripe integration):
 * - CRUD operations for service fees
 * - Status transitions: draft -> sent -> paid -> partially_refunded/refunded
 * - Currency conversion with exchange rate snapshots
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { eq, desc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ExchangeRatesService } from './exchange-rates.service'
import { TripNotificationsService } from './trip-notifications.service'
import { TripAccessService } from '../trips/trip-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  ServiceFeeResponseDto,
  CreateServiceFeeDto,
  UpdateServiceFeeDto,
  ServiceFeeStatus,
  RefundServiceFeeDto,
} from '@tailfire/shared-types'

// Valid status transitions
const VALID_TRANSITIONS: Record<ServiceFeeStatus, ServiceFeeStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'cancelled'],
  paid: ['partially_refunded', 'refunded'],
  partially_refunded: ['refunded'],
  refunded: [],
  cancelled: [],
}

@Injectable()
export class ServiceFeesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly notificationsService: TripNotificationsService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Get all service fees for a trip
   */
  async getServiceFees(tripId: string, auth?: AuthContext): Promise<ServiceFeeResponseDto[]> {
    if (auth) {
      await this.tripAccessService.verifyReadAccess(tripId, auth)
    }

    const fees = await this.db.client
      .select()
      .from(this.db.schema.serviceFees)
      .where(eq(this.db.schema.serviceFees.tripId, tripId))
      .orderBy(desc(this.db.schema.serviceFees.createdAt))

    return fees.map((fee) => this.formatServiceFee(fee))
  }

  /**
   * Get a single service fee by ID
   */
  async getServiceFee(serviceFeeId: string, auth?: AuthContext): Promise<ServiceFeeResponseDto> {
    const [fee] = await this.db.client
      .select()
      .from(this.db.schema.serviceFees)
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
      .limit(1)

    if (!fee) {
      throw new NotFoundException(`Service fee ${serviceFeeId} not found`)
    }

    if (auth) {
      await this.tripAccessService.verifyReadAccess(fee.tripId, auth)
    }

    return this.formatServiceFee(fee)
  }

  /**
   * Create a new service fee (draft status)
   */
  async createServiceFee(
    tripId: string,
    dto: CreateServiceFeeDto,
    auth?: AuthContext,
  ): Promise<ServiceFeeResponseDto> {
    if (auth) {
      await this.tripAccessService.verifyWriteAccess(tripId, auth)
    }

    // Verify trip exists and get currency
    const [trip] = await this.db.client
      .select({ id: this.db.schema.trips.id, currency: this.db.schema.trips.currency })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    const tripCurrency = trip.currency ?? 'CAD'
    const feeCurrency = dto.currency ?? tripCurrency

    // Calculate amount in trip currency if different
    let exchangeRate: string | null = null
    let amountInTripCurrencyCents: number | null = null

    if (feeCurrency !== tripCurrency) {
      const rateData = await this.exchangeRatesService.getExchangeRate(feeCurrency, tripCurrency)
      exchangeRate = rateData.rate
      const conversion = await this.exchangeRatesService.convertCurrency({
        amountCents: dto.amountCents,
        fromCurrency: feeCurrency,
        toCurrency: tripCurrency,
      })
      amountInTripCurrencyCents = conversion.convertedAmountCents
    }

    const [fee] = await this.db.client
      .insert(this.db.schema.serviceFees)
      .values({
        tripId,
        title: dto.title,
        amountCents: dto.amountCents,
        currency: feeCurrency,
        description: dto.description,
        dueDate: dto.dueDate,
        recipientType: dto.recipientType ?? 'primary_traveller',
        status: 'draft',
        exchangeRateToTripCurrency: exchangeRate,
        amountInTripCurrencyCents,
      })
      .returning()

    return this.formatServiceFee(fee!)
  }

  /**
   * Update a service fee (only in draft status)
   */
  async updateServiceFee(
    serviceFeeId: string,
    dto: UpdateServiceFeeDto,
    auth?: AuthContext,
  ): Promise<ServiceFeeResponseDto> {
    const existing = await this.getServiceFeeRecord(serviceFeeId)

    if (auth) {
      await this.tripAccessService.verifyWriteAccess(existing.tripId, auth)
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException('Can only update service fees in draft status')
    }

    // Get trip currency for potential recalculation
    const [trip] = await this.db.client
      .select({ currency: this.db.schema.trips.currency })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, existing.tripId))
      .limit(1)

    const tripCurrency = trip?.currency ?? 'CAD'
    const newCurrency = dto.currency ?? existing.currency
    const newAmount = dto.amountCents ?? existing.amountCents

    // Recalculate exchange rate if currency or amount changed
    let exchangeRate = existing.exchangeRateToTripCurrency
    let amountInTripCurrencyCents = existing.amountInTripCurrencyCents

    if (newCurrency !== tripCurrency) {
      if (dto.currency !== undefined || dto.amountCents !== undefined) {
        const rateData = await this.exchangeRatesService.getExchangeRate(newCurrency!, tripCurrency)
        exchangeRate = rateData.rate
        const conversion = await this.exchangeRatesService.convertCurrency({
          amountCents: newAmount,
          fromCurrency: newCurrency!,
          toCurrency: tripCurrency,
        })
        amountInTripCurrencyCents = conversion.convertedAmountCents
      }
    } else {
      exchangeRate = null
      amountInTripCurrencyCents = null
    }

    const [updated] = await this.db.client
      .update(this.db.schema.serviceFees)
      .set({
        title: dto.title ?? existing.title,
        amountCents: newAmount,
        currency: newCurrency,
        description: dto.description ?? existing.description,
        dueDate: dto.dueDate ?? existing.dueDate,
        recipientType: dto.recipientType ?? existing.recipientType,
        exchangeRateToTripCurrency: exchangeRate,
        amountInTripCurrencyCents,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
      .returning()

    return this.formatServiceFee(updated!)
  }

  /**
   * Send a service fee (draft -> sent)
   */
  async sendServiceFee(serviceFeeId: string, auth?: AuthContext): Promise<ServiceFeeResponseDto> {
    const existing = await this.getServiceFeeRecord(serviceFeeId)

    if (auth) {
      await this.tripAccessService.verifyWriteAccess(existing.tripId, auth)
    }

    this.validateTransition(existing.status, 'sent')

    const [updated] = await this.db.client
      .update(this.db.schema.serviceFees)
      .set({
        status: 'sent',
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
      .returning()

    return this.formatServiceFee(updated!)
  }

  /**
   * Mark a service fee as paid (sent -> paid)
   * In future, this will be called by Stripe webhook
   */
  async markAsPaid(serviceFeeId: string, auth?: AuthContext): Promise<ServiceFeeResponseDto> {
    const existing = await this.getServiceFeeRecord(serviceFeeId)

    if (auth) {
      await this.tripAccessService.verifyWriteAccess(existing.tripId, auth)
    }

    this.validateTransition(existing.status, 'paid')

    const [updated] = await this.db.client
      .update(this.db.schema.serviceFees)
      .set({
        status: 'paid',
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
      .returning()

    // Create payment received notification
    await this.notificationsService.createPaymentReceivedNotification(
      existing.tripId,
      serviceFeeId,
      existing.amountCents,
      existing.currency ?? 'CAD'
    )

    return this.formatServiceFee(updated!)
  }

  /**
   * Process a refund (paid -> partially_refunded or refunded)
   */
  async processRefund(
    serviceFeeId: string,
    dto: RefundServiceFeeDto,
    auth?: AuthContext,
  ): Promise<ServiceFeeResponseDto> {
    const existing = await this.getServiceFeeRecord(serviceFeeId)

    if (auth) {
      await this.tripAccessService.verifyWriteAccess(existing.tripId, auth)
    }

    if (existing.status !== 'paid' && existing.status !== 'partially_refunded') {
      throw new BadRequestException('Can only refund paid or partially refunded service fees')
    }

    const currentRefunded = existing.refundedAmountCents ?? 0
    const maxRefundable = existing.amountCents
    // If no amount specified, refund the remaining balance
    const refundAmount = dto.amountCents ?? (maxRefundable - currentRefunded)
    const newTotalRefunded = currentRefunded + refundAmount

    if (newTotalRefunded > maxRefundable) {
      throw new BadRequestException(
        `Refund amount exceeds remaining balance. Max refundable: ${maxRefundable - currentRefunded} cents`
      )
    }

    const isFullyRefunded = newTotalRefunded >= maxRefundable
    const newStatus: ServiceFeeStatus = isFullyRefunded ? 'refunded' : 'partially_refunded'

    const [updated] = await this.db.client
      .update(this.db.schema.serviceFees)
      .set({
        status: newStatus,
        refundedAmountCents: newTotalRefunded,
        refundReason: dto.reason ?? existing.refundReason,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
      .returning()

    // Create refund notification
    await this.notificationsService.createRefundProcessedNotification(
      existing.tripId,
      serviceFeeId,
      refundAmount,
      existing.currency ?? 'CAD'
    )

    return this.formatServiceFee(updated!)
  }

  /**
   * Cancel a service fee (draft/sent -> cancelled)
   */
  async cancelServiceFee(serviceFeeId: string, auth?: AuthContext): Promise<ServiceFeeResponseDto> {
    const existing = await this.getServiceFeeRecord(serviceFeeId)

    if (auth) {
      await this.tripAccessService.verifyWriteAccess(existing.tripId, auth)
    }

    this.validateTransition(existing.status, 'cancelled')

    const [updated] = await this.db.client
      .update(this.db.schema.serviceFees)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
      .returning()

    return this.formatServiceFee(updated!)
  }

  /**
   * Delete a service fee (only in draft status)
   */
  async deleteServiceFee(serviceFeeId: string, auth?: AuthContext): Promise<void> {
    const existing = await this.getServiceFeeRecord(serviceFeeId)

    if (auth) {
      await this.tripAccessService.verifyWriteAccess(existing.tripId, auth)
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException('Can only delete service fees in draft status')
    }

    await this.db.client
      .delete(this.db.schema.serviceFees)
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async getServiceFeeRecord(serviceFeeId: string) {
    const [fee] = await this.db.client
      .select()
      .from(this.db.schema.serviceFees)
      .where(eq(this.db.schema.serviceFees.id, serviceFeeId))
      .limit(1)

    if (!fee) {
      throw new NotFoundException(`Service fee ${serviceFeeId} not found`)
    }

    return fee
  }

  private validateTransition(currentStatus: ServiceFeeStatus, newStatus: ServiceFeeStatus): void {
    const validNextStates = VALID_TRANSITIONS[currentStatus]
    if (!validNextStates.includes(newStatus)) {
      throw new ConflictException(
        `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions: ${validNextStates.join(', ') || 'none'}`
      )
    }
  }

  private formatServiceFee(fee: {
    id: string
    tripId: string
    recipientType: 'primary_traveller' | 'all_travellers'
    title: string
    amountCents: number
    currency: string | null
    dueDate: string | null
    description: string | null
    status: ServiceFeeStatus
    exchangeRateToTripCurrency: string | null
    amountInTripCurrencyCents: number | null
    stripeInvoiceId: string | null
    stripePaymentIntentId: string | null
    stripeHostedInvoiceUrl: string | null
    refundedAmountCents: number | null
    refundReason: string | null
    sentAt: Date | null
    paidAt: Date | null
    refundedAt: Date | null
    cancelledAt: Date | null
    createdAt: Date
    updatedAt: Date
    createdBy: string | null
    updatedBy: string | null
  }): ServiceFeeResponseDto {
    return {
      id: fee.id,
      tripId: fee.tripId,
      recipientType: fee.recipientType,
      title: fee.title,
      amountCents: fee.amountCents,
      currency: fee.currency ?? 'CAD',
      dueDate: fee.dueDate,
      description: fee.description,
      status: fee.status,
      exchangeRateToTripCurrency: fee.exchangeRateToTripCurrency,
      amountInTripCurrencyCents: fee.amountInTripCurrencyCents,
      stripeInvoiceId: fee.stripeInvoiceId,
      stripePaymentIntentId: fee.stripePaymentIntentId,
      stripeHostedInvoiceUrl: fee.stripeHostedInvoiceUrl,
      refundedAmountCents: fee.refundedAmountCents ?? 0,
      refundReason: fee.refundReason,
      sentAt: fee.sentAt?.toISOString() ?? null,
      paidAt: fee.paidAt?.toISOString() ?? null,
      refundedAt: fee.refundedAt?.toISOString() ?? null,
      cancelledAt: fee.cancelledAt?.toISOString() ?? null,
      createdAt: fee.createdAt.toISOString(),
      updatedAt: fee.updatedAt.toISOString(),
      createdBy: fee.createdBy,
      updatedBy: fee.updatedBy,
    }
  }
}
