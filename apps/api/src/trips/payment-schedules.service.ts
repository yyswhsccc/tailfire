/**
 * Payment Schedules Service
 *
 * Handles CRUD operations and calculations for component-level payment schedules.
 * Manages payment_schedule_config and expected_payment_items tables.
 *
 * TICO Compliance Features:
 * - 45-day final payment rule validation
 * - Sum validation (items must equal total exactly)
 * - Minimum payment amount ($1.00 / 100 cents)
 * - Item locking after payment received
 * - Audit logging via PaymentAuditService
 *
 * @see beta/docs/design/payment-schedule/PAYMENT_SCHEDULE_TEMPLATES.md
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { and, eq, sql, isNull } from 'drizzle-orm'
import { addDays, subDays, isAfter } from 'date-fns'
import { DatabaseService } from '../db/database.service'
import { PaymentAuditService } from './payment-audit.service'
import { PaymentTemplatesService } from './payment-templates.service'
import { AutomationService } from '../automation/automation.service'
import { QUEUES, getPaymentReminderJobId } from '../automation/automation.types'
import type {
  PaymentScheduleConfigDto,
  CreatePaymentScheduleConfigDto,
  UpdatePaymentScheduleConfigDto,
  ExpectedPaymentItemDto,
  CreateExpectedPaymentItemDto,
  UpdateExpectedPaymentItemDto,
  CreditCardGuaranteeDto,
  CreateCreditCardGuaranteeDto,
  UpdateCreditCardGuaranteeDto,
  DepositCalculation,
  PaymentTransactionDto,
  CreatePaymentTransactionDto,
  PaymentTransactionListResponseDto,
  ApplyTemplateDto,
  ApplyTemplateResponseDto,
  ExpectedPaymentItemWithLockingDto,
  PaymentScheduleValidationResult,
  PaymentScheduleValidationError,
  PaymentScheduleValidationWarning,
  TripExpectedPaymentDto,
  TripPaymentTransactionDto,
  ContactPaymentTransactionDto,
} from '@tailfire/shared-types'

/**
 * TICO validation rules (imported from shared-types but also defined here for reference)
 */
const TICO_RULES = {
  MIN_FINAL_PAYMENT_DAYS_BEFORE_DEPARTURE: 45,
  REQUIRE_EXACT_SUM: true,
  MAX_INSTALLMENTS: 12,
  MIN_PAYMENT_AMOUNT_CENTS: 100, // $1.00
  DEPOSIT_WARNING_THRESHOLD_PERCENT: 50,
} as const

@Injectable()
export class PaymentSchedulesService {
  private readonly logger = new Logger(PaymentSchedulesService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly auditService: PaymentAuditService,
    private readonly templatesService: PaymentTemplatesService,
    private readonly automationService: AutomationService,
  ) {}

  // ============================================================================
  // Payment Schedule Config Operations
  // ============================================================================

  /**
   * Get payment schedule config by activity pricing ID
   */
  async findByActivityPricingId(
    activityPricingId: string,
    travelerBookingId?: string | null,
  ): Promise<PaymentScheduleConfigDto | null> {
    const conditions = [
      eq(this.db.schema.paymentScheduleConfig.activityPricingId, activityPricingId),
    ]
    if (travelerBookingId) {
      conditions.push(eq(this.db.schema.paymentScheduleConfig.travelerBookingId, travelerBookingId))
    } else {
      conditions.push(isNull(this.db.schema.paymentScheduleConfig.travelerBookingId))
    }

    const [config] = await this.db.client
      .select()
      .from(this.db.schema.paymentScheduleConfig)
      .where(and(...conditions))
      .limit(1)

    if (!config) {
      return null
    }

    // Load expected payment items
    const expectedPaymentItems = await this.findExpectedPaymentItems(config.id)

    // Load credit card guarantee (if exists)
    const creditCardGuarantee = await this.findCreditCardGuarantee(config.id)

    return this.formatPaymentScheduleConfig(config, expectedPaymentItems, creditCardGuarantee)
  }

  /**
   * Get payment schedule config by traveler booking ID
   */
  async findByTravelerBookingId(
    travelerBookingId: string,
  ): Promise<PaymentScheduleConfigDto | null> {
    const [config] = await this.db.client
      .select()
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.travelerBookingId, travelerBookingId))
      .limit(1)

    if (!config) {
      return null
    }

    const expectedPaymentItems = await this.findExpectedPaymentItems(config.id)
    const creditCardGuarantee = await this.findCreditCardGuarantee(config.id)
    return this.formatPaymentScheduleConfig(config, expectedPaymentItems, creditCardGuarantee)
  }

  /**
   * Get all payment schedule configs for an activity pricing (global + per-traveler)
   */
  async findAllByActivityPricingId(
    activityPricingId: string,
  ): Promise<PaymentScheduleConfigDto[]> {
    const configs = await this.db.client
      .select()
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.activityPricingId, activityPricingId))

    const results: PaymentScheduleConfigDto[] = []
    for (const config of configs) {
      const expectedPaymentItems = await this.findExpectedPaymentItems(config.id)
      const creditCardGuarantee = await this.findCreditCardGuarantee(config.id)
      results.push(this.formatPaymentScheduleConfig(config, expectedPaymentItems, creditCardGuarantee))
    }
    return results
  }

  /**
   * Create payment schedule configuration with expected payment items
   * This is a transactional operation.
   */
  async create(data: CreatePaymentScheduleConfigDto, isAdmin = false): Promise<PaymentScheduleConfigDto> {
    const pricingId = data.activityPricingId
    if (!pricingId) {
      throw new BadRequestException('activityPricingId is required')
    }

    // Block edits after trip departure unless admin
    await this.ensureTripEditable(pricingId, isAdmin)

    // Validate component pricing exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.id, pricingId))
      .limit(1)

    if (!activityPricing) {
      throw new NotFoundException(
        `Activity pricing with ID ${pricingId} not found`,
      )
    }

    // Validate that component pricing has a total price
    if (!activityPricing.totalPriceCents) {
      throw new BadRequestException(
        'Component pricing must have a total_price_cents before creating a payment schedule'
      )
    }

    // Traveler booking validation and exclusivity
    let totalForValidation = activityPricing.totalPriceCents
    if (data.travelerBookingId) {
      // Validate traveler booking exists and belongs to same activity
      const [travelerBooking] = await this.db.client
        .select()
        .from(this.db.schema.travelerBookings)
        .where(eq(this.db.schema.travelerBookings.id, data.travelerBookingId))
        .limit(1)

      if (!travelerBooking) {
        throw new NotFoundException(`Traveler booking with ID ${data.travelerBookingId} not found`)
      }

      // Verify it belongs to the same activity
      const [pricing] = await this.db.client
        .select({ activityId: this.db.schema.activityPricing.activityId })
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.id, pricingId))
        .limit(1)

      if (pricing && travelerBooking.activityId !== pricing.activityId) {
        throw new BadRequestException('Traveler booking does not belong to the same activity as the pricing')
      }

      if (!travelerBooking.priceCents) {
        throw new BadRequestException('Traveler booking must have priceCents set before creating a payment schedule')
      }

      totalForValidation = travelerBooking.priceCents

      // Exclusivity: reject if a global (NULL) schedule already exists
      const globalSchedule = await this.findByActivityPricingId(pricingId, null)
      if (globalSchedule) {
        throw new BadRequestException(
          'Cannot create per-traveler schedule: a global schedule already exists. Delete it first.'
        )
      }
    } else {
      // Creating a global schedule: reject if any per-traveler schedules already exist
      const allConfigs = await this.findAllByActivityPricingId(pricingId)
      const perTravelerConfigs = allConfigs.filter(c => c.travelerBookingId !== null)
      if (perTravelerConfigs.length > 0) {
        throw new BadRequestException(
          'Cannot create global schedule: per-traveler schedules already exist. Delete them first.'
        )
      }
    }

    // Check for existing schedule with same scope (idempotency)
    const existingSchedule = await this.findByActivityPricingId(pricingId, data.travelerBookingId)
    if (existingSchedule) {
      throw new BadRequestException(
        `Payment schedule already exists for this scope. Use update instead.`
      )
    }

    // Validate deposit settings if schedule type is 'deposit'
    if (data.scheduleType === 'deposit') {
      if (!data.depositType) {
        throw new BadRequestException('depositType is required when scheduleType is "deposit"')
      }
      if (data.depositType === 'percentage') {
        if (data.depositPercentage === undefined || data.depositPercentage === null) {
          throw new BadRequestException('depositPercentage is required when depositType is "percentage"')
        }
        // Validate percentage range (0-100)
        if (data.depositPercentage < 0 || data.depositPercentage > 100) {
          throw new BadRequestException('depositPercentage must be between 0 and 100')
        }
      }
      if (data.depositType === 'fixed_amount') {
        if (!data.depositAmountCents) {
          throw new BadRequestException('depositAmountCents is required when depositType is "fixed_amount"')
        }
        // Validate deposit doesn't exceed total
        if (data.depositAmountCents > activityPricing.totalPriceCents) {
          throw new BadRequestException('depositAmountCents cannot exceed total_price_cents')
        }
        // Validate non-negative
        if (data.depositAmountCents < 0) {
          throw new BadRequestException('depositAmountCents must be non-negative')
        }
      }
    }

    // Validate credit card guarantee if schedule type is 'guarantee'
    if (data.scheduleType === 'guarantee') {
      if (!data.creditCardGuarantee) {
        throw new BadRequestException('creditCardGuarantee is required when scheduleType is "guarantee"')
      }
    }

    // Validate expected payment items sum to total (if provided)
    if (data.expectedPaymentItems && data.expectedPaymentItems.length > 0) {
      const sum = data.expectedPaymentItems.reduce((acc, item) => acc + item.expectedAmountCents, 0)
      if (sum !== totalForValidation) {
        throw new BadRequestException(
          `Expected payment items must sum to total. Expected: ${totalForValidation}, Got: ${sum}`
        )
      }
      // Validate all amounts are non-negative
      for (const item of data.expectedPaymentItems) {
        if (item.expectedAmountCents < 0) {
          throw new BadRequestException('Expected payment amounts must be non-negative')
        }
      }
    }

    // Create payment schedule config
    // Note: agencyId is on activityPricing, not paymentScheduleConfig
    const [config] = await this.db.client
      .insert(this.db.schema.paymentScheduleConfig)
      .values({
        activityPricingId: pricingId,
        travelerBookingId: data.travelerBookingId || null,
        scheduleType: data.scheduleType,
        allowPartialPayments: data.allowPartialPayments ?? false,
        depositType: data.depositType || null,
        depositPercentage: data.depositPercentage?.toString() || null,
        depositAmountCents: data.depositAmountCents || null,
      })
      .returning()

    // Create expected payment items if provided
    let expectedPaymentItems: ExpectedPaymentItemDto[] = []
    if (data.expectedPaymentItems && data.expectedPaymentItems.length > 0) {
      expectedPaymentItems = await this.createExpectedPaymentItems(
        config!.id,
        activityPricing.agencyId,
        data.expectedPaymentItems,
        pricingId, // Pass activityPricingId for payment reminder scheduling
      )
    }

    // Create credit card guarantee if provided
    let creditCardGuarantee: CreditCardGuaranteeDto | null = null
    if (data.creditCardGuarantee) {
      creditCardGuarantee = await this.createCreditCardGuarantee(
        config!.id,
        data.creditCardGuarantee,
      )
    }

    return this.formatPaymentScheduleConfig(config!, expectedPaymentItems, creditCardGuarantee)
  }

  /**
   * Update payment schedule configuration
   * This is a transactional operation.
   */
  async update(
    activityPricingId: string,
    data: UpdatePaymentScheduleConfigDto,
    isAdmin = false,
  ): Promise<PaymentScheduleConfigDto> {
    // Block edits after trip departure unless admin
    await this.ensureTripEditable(activityPricingId, isAdmin)

    // Find existing config
    const existingConfig = await this.findByActivityPricingId(activityPricingId)
    if (!existingConfig) {
      throw new NotFoundException(
        `Payment schedule config for activity pricing ID ${activityPricingId} not found`,
      )
    }

    // Get the component pricing for validation
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.id, activityPricingId))
      .limit(1)

    if (!activityPricing || !activityPricing.totalPriceCents) {
      throw new BadRequestException('Component pricing must have a total_price_cents')
    }

    // Use traveler booking price when config has travelerBookingId
    let totalForValidation = activityPricing.totalPriceCents
    if (existingConfig.travelerBookingId) {
      const [travelerBooking] = await this.db.client
        .select()
        .from(this.db.schema.travelerBookings)
        .where(eq(this.db.schema.travelerBookings.id, existingConfig.travelerBookingId))
        .limit(1)
      if (travelerBooking?.priceCents) {
        totalForValidation = travelerBooking.priceCents
      }
    }

    // Validate deposit settings if schedule type is being changed to 'deposit'
    const newScheduleType = data.scheduleType || existingConfig.scheduleType
    if (newScheduleType === 'deposit') {
      const newDepositType = data.depositType ?? existingConfig.depositType
      if (!newDepositType) {
        throw new BadRequestException('depositType is required when scheduleType is "deposit"')
      }
      if (newDepositType === 'percentage') {
        const newDepositPercentage = data.depositPercentage ??
          (existingConfig.depositPercentage ? parseFloat(existingConfig.depositPercentage) : null)
        if (newDepositPercentage === null || newDepositPercentage === undefined) {
          throw new BadRequestException('depositPercentage is required when depositType is "percentage"')
        }
        // Validate percentage range (0-100)
        if (newDepositPercentage < 0 || newDepositPercentage > 100) {
          throw new BadRequestException('depositPercentage must be between 0 and 100')
        }
      }
      if (newDepositType === 'fixed_amount') {
        const newDepositAmountCents = data.depositAmountCents ?? existingConfig.depositAmountCents
        if (!newDepositAmountCents) {
          throw new BadRequestException('depositAmountCents is required when depositType is "fixed_amount"')
        }
        // Validate deposit doesn't exceed total
        if (newDepositAmountCents > totalForValidation) {
          throw new BadRequestException('depositAmountCents cannot exceed total_price_cents')
        }
        // Validate non-negative
        if (newDepositAmountCents < 0) {
          throw new BadRequestException('depositAmountCents must be non-negative')
        }
      }
    }

    // Validate credit card guarantee if schedule type is being changed to 'guarantee'
    if (newScheduleType === 'guarantee') {
      const hasExistingGuarantee = !!existingConfig.creditCardGuarantee
      if (!data.creditCardGuarantee && !hasExistingGuarantee) {
        throw new BadRequestException('creditCardGuarantee is required when scheduleType is "guarantee"')
      }
    }

    // Validate expected payment items sum to total (if provided)
    if (data.expectedPaymentItems && data.expectedPaymentItems.length > 0) {
      const sum = data.expectedPaymentItems.reduce((acc, item) => acc + item.expectedAmountCents, 0)
      if (sum !== totalForValidation) {
        throw new BadRequestException(
          `Expected payment items must sum to total_price_cents. Expected: ${totalForValidation}, Got: ${sum}`
        )
      }
      // Validate all amounts are non-negative
      for (const item of data.expectedPaymentItems) {
        if (item.expectedAmountCents < 0) {
          throw new BadRequestException('Expected payment amounts must be non-negative')
        }
      }
    }

    // Update config
    const [updatedConfig] = await this.db.client
      .update(this.db.schema.paymentScheduleConfig)
      .set({
        ...(data.scheduleType !== undefined && { scheduleType: data.scheduleType }),
        ...(data.allowPartialPayments !== undefined && {
          allowPartialPayments: data.allowPartialPayments,
        }),
        ...(data.depositType !== undefined && { depositType: data.depositType }),
        ...(data.depositPercentage !== undefined && {
          depositPercentage: data.depositPercentage?.toString() || null,
        }),
        ...(data.depositAmountCents !== undefined && {
          depositAmountCents: data.depositAmountCents,
        }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.paymentScheduleConfig.id, existingConfig.id))
      .returning()

    // Handle expected payment items updates
    let expectedPaymentItems: ExpectedPaymentItemDto[] = []
    if (data.expectedPaymentItems && data.expectedPaymentItems.length > 0) {
      // Get existing items to cancel their reminders before deleting
      const existingItems = await this.findExpectedPaymentItems(existingConfig.id)
      for (const item of existingItems) {
        await this.cancelPaymentReminders(item.id)
      }

      // Delete existing items and recreate
      await this.db.client
        .delete(this.db.schema.expectedPaymentItems)
        .where(eq(this.db.schema.expectedPaymentItems.paymentScheduleConfigId, existingConfig.id))

      // Create new items (will schedule new reminders)
      expectedPaymentItems = await this.createExpectedPaymentItems(
        existingConfig.id,
        activityPricing.agencyId,
        data.expectedPaymentItems,
        activityPricingId, // Pass for payment reminder scheduling
      )
    } else {
      // Keep existing items
      expectedPaymentItems = await this.findExpectedPaymentItems(existingConfig.id)
    }

    // Handle credit card guarantee updates
    let creditCardGuarantee: CreditCardGuaranteeDto | null = null
    if (data.creditCardGuarantee) {
      // Check if existing guarantee exists
      const existingGuarantee = await this.findCreditCardGuarantee(existingConfig.id)
      if (existingGuarantee) {
        // Update existing guarantee
        creditCardGuarantee = await this.updateCreditCardGuarantee(
          existingGuarantee.id,
          data.creditCardGuarantee,
        )
      } else {
        // Create new guarantee - cast to CreateCreditCardGuaranteeDto
        creditCardGuarantee = await this.createCreditCardGuarantee(
          existingConfig.id,
          data.creditCardGuarantee as any as CreateCreditCardGuaranteeDto,
        )
      }
    } else {
      // Keep existing guarantee if no update provided
      creditCardGuarantee = await this.findCreditCardGuarantee(existingConfig.id)
    }

    return this.formatPaymentScheduleConfig(updatedConfig, expectedPaymentItems, creditCardGuarantee)
  }

  /**
   * Delete payment schedule configuration (cascades to expected payment items)
   */
  async delete(activityPricingId: string, isAdmin = false): Promise<void> {
    // Block edits after trip departure unless admin
    await this.ensureTripEditable(activityPricingId, isAdmin)

    const existingConfig = await this.findByActivityPricingId(activityPricingId)
    if (!existingConfig) {
      throw new NotFoundException(
        `Payment schedule config for activity pricing ID ${activityPricingId} not found`,
      )
    }

    await this.db.client
      .delete(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.id, existingConfig.id))
  }

  // ============================================================================
  // Expected Payment Items Operations
  // ============================================================================

  /**
   * Get expected payment items for a payment schedule config
   */
  async findExpectedPaymentItems(
    paymentScheduleConfigId: string,
  ): Promise<ExpectedPaymentItemDto[]> {
    const items = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(
        eq(this.db.schema.expectedPaymentItems.paymentScheduleConfigId, paymentScheduleConfigId),
      )
      .orderBy(this.db.schema.expectedPaymentItems.sequenceOrder)

    return items.map(this.formatExpectedPaymentItem)
  }

  /**
   * Create multiple expected payment items and schedule payment reminders
   */
  private async createExpectedPaymentItems(
    paymentScheduleConfigId: string,
    agencyId: string,
    items: CreateExpectedPaymentItemDto[],
    activityPricingId?: string,
  ): Promise<ExpectedPaymentItemDto[]> {
    if (items.length === 0) {
      return []
    }

    const created = await this.db.client
      .insert(this.db.schema.expectedPaymentItems)
      .values(
        items.map((item) => ({
          paymentScheduleConfigId,
          agencyId,
          paymentName: item.paymentName,
          expectedAmountCents: item.expectedAmountCents,
          dueDate: item.dueDate || null,
          sequenceOrder: item.sequenceOrder,
        })),
      )
      .returning()

    // Schedule payment reminders for items with due dates
    if (activityPricingId) {
      const tripContext = await this.getTripContextFromActivityPricingId(activityPricingId)
      if (tripContext) {
        for (const item of created) {
          if (item.dueDate) {
            await this.schedulePaymentReminders(
              item.id,
              tripContext.tripId,
              tripContext.contactId,
              agencyId,
              item.dueDate,
            )
          }
        }
      }
    }

    return created.map(this.formatExpectedPaymentItem)
  }

  /**
   * Ensure the trip hasn't departed yet (status is not in_progress/completed/cancelled).
   * Blocks payment schedule edits after departure unless user is admin.
   */
  private async ensureTripEditable(activityPricingId: string, isAdmin = false): Promise<void> {
    if (isAdmin) return

    const tripContext = await this.getTripContextFromActivityPricingId(activityPricingId)
    if (!tripContext) return // can't resolve trip — allow (edge case)

    const [trip] = await this.db.client
      .select({ status: this.db.schema.trips.status })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripContext.tripId))
      .limit(1)

    if (!trip) return

    const lockedStatuses = ['in_progress', 'completed', 'cancelled']
    if (lockedStatuses.includes(trip.status)) {
      throw new BadRequestException(
        'Payment schedule cannot be modified after the trip has departed. Contact an admin for changes.'
      )
    }
  }

  /**
   * Resolve activityPricingId from an expected payment item ID.
   * Traverses: expectedPaymentItem → paymentScheduleConfig → activityPricingId
   */
  private async getActivityPricingIdFromItem(itemId: string): Promise<string | null> {
    const [item] = await this.db.client
      .select({ configId: this.db.schema.expectedPaymentItems.paymentScheduleConfigId })
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
      .limit(1)
    if (!item?.configId) return null

    const [config] = await this.db.client
      .select({ activityPricingId: this.db.schema.paymentScheduleConfig.activityPricingId })
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.id, item.configId))
      .limit(1)
    return config?.activityPricingId || null
  }

  /**
   * Resolve activityPricingId from a payment schedule config ID.
   */
  private async getActivityPricingIdFromConfigId(configId: string): Promise<string | null> {
    const [config] = await this.db.client
      .select({ activityPricingId: this.db.schema.paymentScheduleConfig.activityPricingId })
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.id, configId))
      .limit(1)
    return config?.activityPricingId || null
  }

  /**
   * Get trip and contact context from activity pricing ID
   */
  private async getTripContextFromActivityPricingId(
    activityPricingId: string,
  ): Promise<{ tripId: string; contactId: string } | null> {
    // Get activity from pricing
    const [pricing] = await this.db.client
      .select({ activityId: this.db.schema.activityPricing.activityId })
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.id, activityPricingId))
      .limit(1)

    if (!pricing?.activityId) {
      this.logger.warn(`Activity pricing ${activityPricingId} has no activity`)
      return null
    }

    // Get trip from activity
    const [activity] = await this.db.client
      .select({ tripId: this.db.schema.itineraryActivities.tripId })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, pricing.activityId))
      .limit(1)

    if (!activity?.tripId) {
      this.logger.warn(`Activity ${pricing.activityId} has no trip`)
      return null
    }

    // Get primary contact from trip
    const [trip] = await this.db.client
      .select({ primaryContactId: this.db.schema.trips.primaryContactId })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, activity.tripId))
      .limit(1)

    if (!trip?.primaryContactId) {
      this.logger.warn(`Trip ${activity.tripId} has no primary contact`)
      return null
    }

    return {
      tripId: activity.tripId,
      contactId: trip.primaryContactId,
    }
  }

  /**
   * Update an expected payment item
   * Reschedules payment reminders if due date changes
   */
  async updateExpectedPaymentItem(
    itemId: string,
    data: UpdateExpectedPaymentItemDto,
    isAdmin = false,
  ): Promise<ExpectedPaymentItemDto> {
    // Block edits after trip departure unless admin
    const pricingIdForGuard = await this.getActivityPricingIdFromItem(itemId)
    if (pricingIdForGuard) await this.ensureTripEditable(pricingIdForGuard, isAdmin)

    // Get existing item to check for due date changes
    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Expected payment item with ID ${itemId} not found`)
    }

    // Validate amount >= paidAmountCents (prevent setting below what's already paid)
    if (data.expectedAmountCents !== undefined) {
      if (data.expectedAmountCents < existing.paidAmountCents) {
        throw new BadRequestException(
          `Cannot set expected amount (${data.expectedAmountCents}) below paid amount (${existing.paidAmountCents})`,
        )
      }
    }

    // Validate contactId if provided
    if (data.contactId !== undefined && data.contactId !== null) {
      const tripId = await this.getTripIdFromExpectedPaymentItemId(itemId)
      if (tripId) {
        const isValidContact = await this.validateContactForTrip(data.contactId, tripId, existing.agencyId)
        if (!isValidContact) {
          throw new BadRequestException(
            'Contact must be the primary contact or a traveler on the trip',
          )
        }
      }
    }

    const [updated] = await this.db.client
      .update(this.db.schema.expectedPaymentItems)
      .set({
        ...(data.paymentName !== undefined && { paymentName: data.paymentName }),
        ...(data.expectedAmountCents !== undefined && {
          expectedAmountCents: data.expectedAmountCents,
        }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.sequenceOrder !== undefined && { sequenceOrder: data.sequenceOrder }),
        ...(data.paidAmountCents !== undefined && { paidAmountCents: data.paidAmountCents }),
        ...(data.contactId !== undefined && { contactId: data.contactId }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
      .returning()

    if (!updated) {
      throw new NotFoundException(`Expected payment item with ID ${itemId} not found`)
    }

    // Re-sync status if amount changed (e.g., may go from 'paid' to 'partial' or vice versa)
    let finalItem = updated
    if (data.expectedAmountCents !== undefined && data.expectedAmountCents !== existing.expectedAmountCents) {
      await this.syncPaidAmountCents(itemId)
      // Re-fetch to get updated status from sync
      const [refetched] = await this.db.client
        .select()
        .from(this.db.schema.expectedPaymentItems)
        .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
        .limit(1)
      if (refetched) {
        // If sync changed status to 'paid', cancel reminders
        if (refetched.status === 'paid' && updated.status !== 'paid') {
          await this.cancelPaymentReminders(itemId)
        }
        finalItem = refetched
      }
    }

    // Reschedule payment reminders if due date changed
    const dueDateChanged = data.dueDate !== undefined && data.dueDate !== existing.dueDate
    const statusChangedToPaid = data.status === 'paid' && existing.status !== 'paid'

    if (statusChangedToPaid) {
      // Cancel reminders when payment is marked as paid
      await this.cancelPaymentReminders(itemId)
    } else if (dueDateChanged && data.dueDate) {
      // Reschedule reminders with new due date
      const tripContext = await this.getTripContextFromPaymentItemId(itemId)
      if (tripContext) {
        await this.reschedulePaymentReminders(
          itemId,
          tripContext.tripId,
          tripContext.contactId,
          existing.agencyId,
          data.dueDate,
        )
      }
    } else if (dueDateChanged && !data.dueDate) {
      // Due date removed - cancel all reminders
      await this.cancelPaymentReminders(itemId)
    }

    return this.formatExpectedPaymentItem(finalItem)
  }

  /**
   * Get trip context from payment item ID
   */
  private async getTripContextFromPaymentItemId(
    itemId: string,
  ): Promise<{ tripId: string; contactId: string } | null> {
    // Get payment schedule config from item
    const [item] = await this.db.client
      .select({ paymentScheduleConfigId: this.db.schema.expectedPaymentItems.paymentScheduleConfigId })
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
      .limit(1)

    if (!item) {
      return null
    }

    // Get activity pricing from config
    const [config] = await this.db.client
      .select({ activityPricingId: this.db.schema.paymentScheduleConfig.activityPricingId })
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.id, item.paymentScheduleConfigId))
      .limit(1)

    if (!config?.activityPricingId) {
      return null
    }

    return this.getTripContextFromActivityPricingId(config.activityPricingId)
  }

  // ============================================================================
  // Credit Card Guarantee Operations
  // ============================================================================

  /**
   * Get credit card guarantee for a payment schedule config
   */
  async findCreditCardGuarantee(
    paymentScheduleConfigId: string,
  ): Promise<CreditCardGuaranteeDto | null> {
    const [guarantee] = await this.db.client
      .select()
      .from(this.db.schema.creditCardGuarantee)
      .where(eq(this.db.schema.creditCardGuarantee.paymentScheduleConfigId, paymentScheduleConfigId))
      .limit(1)

    if (!guarantee) {
      return null
    }

    return this.formatCreditCardGuarantee(guarantee)
  }

  /**
   * Create credit card guarantee
   */
  private async createCreditCardGuarantee(
    paymentScheduleConfigId: string,
    data: CreateCreditCardGuaranteeDto,
  ): Promise<CreditCardGuaranteeDto> {
    const [created] = await this.db.client
      .insert(this.db.schema.creditCardGuarantee)
      .values({
        paymentScheduleConfigId,
        cardHolderName: data.cardHolderName,
        cardLast4: data.cardLast4,
        authorizationCode: data.authorizationCode,
        authorizationDate: new Date(data.authorizationDate),
        authorizationAmountCents: data.authorizationAmountCents,
      })
      .returning()

    return this.formatCreditCardGuarantee(created!)
  }

  /**
   * Update credit card guarantee
   */
  private async updateCreditCardGuarantee(
    id: string,
    data: UpdateCreditCardGuaranteeDto,
  ): Promise<CreditCardGuaranteeDto> {
    const [updated] = await this.db.client
      .update(this.db.schema.creditCardGuarantee)
      .set({
        ...(data.cardHolderName !== undefined && { cardHolderName: data.cardHolderName }),
        ...(data.cardLast4 !== undefined && { cardLast4: data.cardLast4 }),
        ...(data.authorizationCode !== undefined && { authorizationCode: data.authorizationCode }),
        ...(data.authorizationDate !== undefined && { authorizationDate: new Date(data.authorizationDate) }),
        ...(data.authorizationAmountCents !== undefined && {
          authorizationAmountCents: data.authorizationAmountCents,
        }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.creditCardGuarantee.id, id))
      .returning()

    if (!updated) {
      throw new NotFoundException(`Credit card guarantee with ID ${id} not found`)
    }

    return this.formatCreditCardGuarantee(updated)
  }

  // ============================================================================
  // Payment Transaction Operations
  // ============================================================================

  /**
   * Resolve the contact ID for a payment transaction.
   * Resolution chain:
   * 1. Use requestedContactId if provided
   * 2. Else fallback to expected_payment_item.contact_id
   * 3. Else fallback to trip's primary_contact_id
   * 4. Return null if none found
   */
  private async resolveTransactionContactId(
    expectedPaymentItemId: string,
    requestedContactId?: string | null,
  ): Promise<string | null> {
    // 1. Use explicit contactId if provided
    if (requestedContactId) {
      return requestedContactId
    }

    // 2. Try expected payment item's assigned contact
    const [epi] = await this.db.client
      .select({ contactId: this.db.schema.expectedPaymentItems.contactId })
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
      .limit(1)

    if (epi?.contactId) {
      return epi.contactId
    }

    // 3. Try trip's primary contact
    const tripContext = await this.getTripContextFromPaymentItemId(expectedPaymentItemId)
    if (tripContext?.contactId) {
      return tripContext.contactId
    }

    // 4. No contact found
    return null
  }

  /**
   * Create a payment transaction and sync paidAmountCents cache
   * Validates currency matches parent and wraps operations in a transaction
   */
  async createTransaction(
    data: CreatePaymentTransactionDto,
  ): Promise<PaymentTransactionDto> {
    // Validate expected payment item exists
    const [expectedPaymentItem] = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, data.expectedPaymentItemId))
      .limit(1)

    if (!expectedPaymentItem) {
      throw new NotFoundException(
        `Expected payment item with ID ${data.expectedPaymentItemId} not found`,
      )
    }

    // Validate amount is non-negative (CHECK constraint in DB, but also validate here)
    if (data.amountCents < 0) {
      throw new BadRequestException('Transaction amount must be non-negative')
    }

    // Validate currency matches parent activity_pricing currency and get agencyId
    const parentInfo = await this.getParentInfo(data.expectedPaymentItemId)
    if (parentInfo?.currency && data.currency !== parentInfo.currency) {
      throw new BadRequestException(
        `Transaction currency (${data.currency}) must match parent pricing currency (${parentInfo.currency})`,
      )
    }

    if (!parentInfo?.agencyId) {
      throw new BadRequestException('Could not determine agency for transaction')
    }

    const agencyId = parentInfo.agencyId

    // Validate trip has at least one traveler before accepting payment (skip for refunds/adjustments)
    if (data.transactionType === 'payment') {
      await this.validateTripHasTravelersForPayment(data.expectedPaymentItemId)
    }

    // Resolve contact ID (explicit → epi.contact_id → trip primary contact → null)
    const resolvedContactId = await this.resolveTransactionContactId(
      data.expectedPaymentItemId,
      data.contactId,
    )

    // Wrap insert + cache sync in a transaction for consistency
    const result = await this.db.client.transaction(async (tx) => {
      // Create the transaction
      const [transaction] = await tx
        .insert(this.db.schema.paymentTransactions)
        .values({
          agencyId,
          expectedPaymentItemId: data.expectedPaymentItemId,
          transactionType: data.transactionType,
          amountCents: data.amountCents,
          currency: data.currency,
          paymentMethod: data.paymentMethod || null,
          referenceNumber: data.referenceNumber || null,
          transactionDate: new Date(data.transactionDate),
          notes: data.notes || null,
          contactId: resolvedContactId,
        })
        .returning()

      if (!transaction) {
        throw new Error('Failed to create transaction')
      }

      // Sync paidAmountCents cache within the same transaction
      await this.syncPaidAmountCentsWithTx(tx, data.expectedPaymentItemId)

      return transaction
    })

    return this.formatPaymentTransaction(result)
  }

  /**
   * Get parent info (currency, agencyId) from the activity_pricing table
   * Traverses: expectedPaymentItem → paymentScheduleConfig → activityPricing
   * Logs warnings for broken parent chain to catch data integrity issues
   */
  private async getParentInfo(expectedPaymentItemId: string): Promise<{ currency: string | null; agencyId: string | null }> {
    const [item] = await this.db.client
      .select({ paymentScheduleConfigId: this.db.schema.expectedPaymentItems.paymentScheduleConfigId })
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
      .limit(1)

    if (!item) {
      this.logger.warn(`Expected payment item ${expectedPaymentItemId} not found when getting parent info`)
      return { currency: null, agencyId: null }
    }

    const [config] = await this.db.client
      .select({ activityPricingId: this.db.schema.paymentScheduleConfig.activityPricingId })
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.id, item.paymentScheduleConfigId))
      .limit(1)

    if (!config) {
      this.logger.warn(`Payment schedule config ${item.paymentScheduleConfigId} not found for expected payment item ${expectedPaymentItemId}`)
      return { currency: null, agencyId: null }
    }

    const [pricing] = await this.db.client
      .select({
        currency: this.db.schema.activityPricing.currency,
        agencyId: this.db.schema.activityPricing.agencyId,
      })
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.id, config.activityPricingId))
      .limit(1)

    if (!pricing?.currency) {
      this.logger.warn(`Activity pricing ${config.activityPricingId} has no currency set`)
    }
    if (!pricing?.agencyId) {
      this.logger.warn(`Activity pricing ${config.activityPricingId} has no agencyId set`)
    }

    return {
      currency: pricing?.currency || null,
      agencyId: pricing?.agencyId || null,
    }
  }

  /**
   * Validate that the trip associated with a payment item has at least one traveler.
   * Traverses: expectedPaymentItem → config → activityPricing → activity → trip → trip_travelers
   */
  private async validateTripHasTravelersForPayment(expectedPaymentItemId: string): Promise<void> {
    const result = await this.db.client
      .select({
        activityId: this.db.schema.activityPricing.activityId,
      })
      .from(this.db.schema.expectedPaymentItems)
      .innerJoin(
        this.db.schema.paymentScheduleConfig,
        eq(this.db.schema.expectedPaymentItems.paymentScheduleConfigId, this.db.schema.paymentScheduleConfig.id)
      )
      .innerJoin(
        this.db.schema.activityPricing,
        eq(this.db.schema.paymentScheduleConfig.activityPricingId, this.db.schema.activityPricing.id)
      )
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
      .limit(1)

    if (!result[0]) return // Can't resolve chain — skip validation

    // Resolve tripId from the activity (direct trip_id or via itinerary chain)
    const [activity] = await this.db.client
      .select({
        directTripId: this.db.schema.itineraryActivities.tripId,
        itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId,
      })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, result[0].activityId))
      .limit(1)

    if (!activity) return

    let tripId = activity.directTripId
    if (!tripId && activity.itineraryDayId) {
      const [dayResult] = await this.db.client
        .select({ tripId: this.db.schema.itineraries.tripId })
        .from(this.db.schema.itineraryDays)
        .innerJoin(
          this.db.schema.itineraries,
          eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
        )
        .where(eq(this.db.schema.itineraryDays.id, activity.itineraryDayId))
        .limit(1)
      tripId = dayResult?.tripId ?? null
    }

    if (!tripId) return // Can't resolve trip — skip validation

    // Check if trip has at least one traveler
    const [travelerCount] = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))

    if (!travelerCount || travelerCount.count === 0) {
      throw new BadRequestException(
        'Cannot record payment: this trip has no travelers assigned. Please add at least one traveler before recording payments.'
      )
    }
  }

  /**
   * Get all transactions for an expected payment item
   */
  async findTransactionsByExpectedPaymentItemId(
    expectedPaymentItemId: string,
  ): Promise<PaymentTransactionListResponseDto> {
    // Validate expected payment item exists and get its data
    const [expectedPaymentItem] = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
      .limit(1)

    if (!expectedPaymentItem) {
      throw new NotFoundException(
        `Expected payment item with ID ${expectedPaymentItemId} not found`,
      )
    }

    // Get all transactions for this expected payment item
    const transactions = await this.db.client
      .select()
      .from(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.expectedPaymentItemId, expectedPaymentItemId))
      .orderBy(this.db.schema.paymentTransactions.transactionDate)

    return {
      transactions: transactions.map(this.formatPaymentTransaction),
      expectedPaymentItem: {
        id: expectedPaymentItem.id,
        paymentName: expectedPaymentItem.paymentName,
        expectedAmountCents: expectedPaymentItem.expectedAmountCents,
        paidAmountCents: expectedPaymentItem.paidAmountCents,
        status: expectedPaymentItem.status,
      },
    }
  }

  // ============================================================================
  // Trip-Level Payment Queries
  // ============================================================================

  /**
   * Get all expected payment items for a trip with activity context
   */
  async getExpectedPaymentsByTripId(
    tripId: string,
    agencyId: string,
  ): Promise<TripExpectedPaymentDto[]> {
    await this.ensureTripAccess(tripId, agencyId)

    type TripExpectedPaymentRow = {
      expected_payment_item_id: string
      payment_schedule_config_id: string
      payment_name: string
      expected_amount_cents: number
      paid_amount_cents: number
      status: string
      sequence_order: number
      due_date: string | Date | null
      created_at: string | Date
      updated_at: string | Date
      activity_pricing_id: string
      activity_id: string
      activity_name: string
      activity_type: string
      currency: string
      is_locked: boolean
      contact_id: string | null
      contact_name: string | null
      traveler_booking_id: string | null
      traveler_name: string | null
    }

    const rows = await this.db.client.execute(sql`
      SELECT
        epi.id AS expected_payment_item_id,
        epi.payment_schedule_config_id,
        epi.payment_name,
        epi.expected_amount_cents,
        epi.paid_amount_cents,
        epi.status,
        epi.sequence_order,
        epi.due_date,
        epi.created_at,
        epi.updated_at,
        epi.is_locked,
        epi.contact_id,
        psc.component_pricing_id AS activity_pricing_id,
        ia.id AS activity_id,
        ia.name AS activity_name,
        ia.activity_type,
        ap.currency,
        CASE WHEN c.id IS NOT NULL THEN TRIM(CONCAT(c.first_name, ' ', c.last_name)) ELSE NULL END AS contact_name,
        psc.traveler_booking_id,
        CASE WHEN tb.id IS NOT NULL THEN TRIM(CONCAT(c2.first_name, ' ', c2.last_name)) ELSE NULL END AS traveler_name
      FROM expected_payment_items epi
      JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
      JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries it ON it.id = iday.itinerary_id
      LEFT JOIN contacts c ON c.id = epi.contact_id
      LEFT JOIN traveler_bookings tb ON tb.id = psc.traveler_booking_id
      LEFT JOIN trip_travelers tt2 ON tt2.id = tb.trip_traveler_id
      LEFT JOIN contacts c2 ON c2.id = tt2.contact_id
      WHERE (it.trip_id = ${tripId} OR ia.trip_id = ${tripId})
        AND ap.agency_id = ${agencyId}
        AND ia.agency_id = ${agencyId}
      ORDER BY ia.created_at ASC, epi.sequence_order ASC
    `) as unknown as TripExpectedPaymentRow[]

    return rows.map((row) => {
      const dueDate = row.due_date
        ? row.due_date instanceof Date
          ? row.due_date.toISOString().split('T')[0]!
          : row.due_date
        : null
      const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
      const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
      const paidAmountCents = row.paid_amount_cents ?? 0
      const remainingCents = row.expected_amount_cents - paidAmountCents

      return {
        id: row.expected_payment_item_id,
        paymentScheduleConfigId: row.payment_schedule_config_id,
        paymentName: row.payment_name,
        expectedAmountCents: row.expected_amount_cents,
        paidAmountCents,
        dueDate,
        status: row.status as TripExpectedPaymentDto['status'],
        sequenceOrder: row.sequence_order,
        contactId: row.contact_id || null,
        createdAt,
        updatedAt,
        activityId: row.activity_id,
        activityName: row.activity_name,
        activityType: row.activity_type as TripExpectedPaymentDto['activityType'],
        activityPricingId: row.activity_pricing_id,
        currency: row.currency,
        remainingCents,
        isLocked: row.is_locked ?? false,
        contactName: row.contact_name || null,
        travelerName: row.traveler_name || null,
        travelerBookingId: row.traveler_booking_id || null,
      }
    })
  }

  /**
   * Get all payment transactions for a trip with activity context
   */
  async getTransactionsByTripId(
    tripId: string,
    agencyId: string,
  ): Promise<TripPaymentTransactionDto[]> {
    await this.ensureTripAccess(tripId, agencyId)

    type TripPaymentTransactionRow = {
      transaction_id: string
      expected_payment_item_id: string
      payment_name: string
      transaction_type: string
      amount_cents: number
      currency: string
      payment_method: string | null
      reference_number: string | null
      transaction_date: string | Date
      notes: string | null
      created_at: string | Date
      created_by: string | null
      activity_id: string
      activity_name: string
      contact_id: string | null
      contact_name: string | null
      traveler_name: string | null
    }

    // NOTE: payment_schedule_config uses component_pricing_id (legacy name), not activity_pricing_id
    const rows = await this.db.client.execute(sql`
      SELECT
        pt.id AS transaction_id,
        pt.expected_payment_item_id,
        epi.payment_name,
        pt.transaction_type,
        pt.amount_cents,
        pt.currency,
        pt.payment_method,
        pt.reference_number,
        pt.transaction_date,
        pt.notes,
        pt.created_at,
        pt.created_by,
        pt.contact_id,
        ia.id AS activity_id,
        ia.name AS activity_name,
        CASE WHEN c.id IS NOT NULL THEN TRIM(CONCAT(c.first_name, ' ', c.last_name)) ELSE NULL END AS contact_name,
        CASE WHEN tb.id IS NOT NULL THEN TRIM(CONCAT(c2.first_name, ' ', c2.last_name)) ELSE NULL END AS traveler_name
      FROM payment_transactions pt
      JOIN expected_payment_items epi ON epi.id = pt.expected_payment_item_id
      JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
      JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries it ON it.id = iday.itinerary_id
      LEFT JOIN contacts c ON c.id = pt.contact_id
      LEFT JOIN traveler_bookings tb ON tb.id = psc.traveler_booking_id
      LEFT JOIN trip_travelers tt2 ON tt2.id = tb.trip_traveler_id
      LEFT JOIN contacts c2 ON c2.id = tt2.contact_id
      WHERE (it.trip_id = ${tripId} OR ia.trip_id = ${tripId})
        AND pt.agency_id = ${agencyId}
        AND ap.agency_id = ${agencyId}
        AND ia.agency_id = ${agencyId}
      ORDER BY pt.transaction_date DESC, pt.created_at DESC
    `) as unknown as TripPaymentTransactionRow[]

    return rows.map((row) => {
      const transactionDate = row.transaction_date instanceof Date
        ? row.transaction_date.toISOString()
        : row.transaction_date
      const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at

      return {
        id: row.transaction_id,
        expectedPaymentItemId: row.expected_payment_item_id,
        transactionType: row.transaction_type as TripPaymentTransactionDto['transactionType'],
        amountCents: row.amount_cents,
        currency: row.currency,
        paymentMethod: row.payment_method as TripPaymentTransactionDto['paymentMethod'],
        referenceNumber: row.reference_number,
        transactionDate,
        notes: row.notes,
        contactId: row.contact_id || null,
        createdAt,
        createdBy: row.created_by,
        activityId: row.activity_id,
        activityName: row.activity_name,
        paymentName: row.payment_name,
        contactName: row.contact_name || null,
        travelerName: row.traveler_name || null,
      }
    })
  }

  /**
   * Get payment transactions for a contact across all their trips
   * Includes trips where contact is primary contact OR a traveler
   */
  async getContactPaymentTransactions(
    contactId: string,
    agencyId: string,
  ): Promise<ContactPaymentTransactionDto[]> {
    type ContactPaymentTransactionRow = {
      transaction_id: string
      expected_payment_item_id: string
      payment_name: string
      transaction_type: string
      amount_cents: number
      currency: string
      payment_method: string | null
      reference_number: string | null
      transaction_date: string | Date
      notes: string | null
      created_at: string | Date
      created_by: string | null
      activity_id: string
      activity_name: string
      trip_id: string
      trip_name: string
      contact_id: string | null
      contact_name: string | null
      traveler_name: string | null
    }

    const rows = await this.db.client.execute(sql`
      SELECT
        pt.id AS transaction_id,
        pt.expected_payment_item_id,
        epi.payment_name,
        pt.transaction_type,
        pt.amount_cents,
        pt.currency,
        pt.payment_method,
        pt.reference_number,
        pt.transaction_date,
        pt.notes,
        pt.created_at,
        pt.created_by,
        pt.contact_id,
        ia.id AS activity_id,
        ia.name AS activity_name,
        t.id AS trip_id,
        t.name AS trip_name,
        CASE WHEN c.id IS NOT NULL THEN TRIM(CONCAT(c.first_name, ' ', c.last_name)) ELSE NULL END AS contact_name,
        CASE WHEN tb.id IS NOT NULL THEN TRIM(CONCAT(c2.first_name, ' ', c2.last_name)) ELSE NULL END AS traveler_name
      FROM payment_transactions pt
      JOIN expected_payment_items epi ON epi.id = pt.expected_payment_item_id
      JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
      JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries it ON it.id = iday.itinerary_id
      JOIN trips t ON t.id = COALESCE(it.trip_id, ia.trip_id)
      LEFT JOIN contacts c ON c.id = pt.contact_id
      LEFT JOIN traveler_bookings tb ON tb.id = psc.traveler_booking_id
      LEFT JOIN trip_travelers tt2 ON tt2.id = tb.trip_traveler_id
      LEFT JOIN contacts c2 ON c2.id = tt2.contact_id
      WHERE (
        -- Explicitly paid by this contact
        pt.contact_id = ${contactId}
        OR (
          -- Legacy/unassigned: payment belongs to contact's trip and has no payer
          pt.contact_id IS NULL
          AND t.id IN (
            SELECT DISTINCT trip_id FROM (
              SELECT id AS trip_id FROM trips WHERE primary_contact_id = ${contactId} AND agency_id = ${agencyId}
              UNION
              SELECT trip_id FROM trip_travelers WHERE contact_id = ${contactId}
            ) contact_trips
          )
        )
      )
        AND pt.agency_id = ${agencyId}
        AND ap.agency_id = ${agencyId}
        AND ia.agency_id = ${agencyId}
      ORDER BY pt.transaction_date DESC, pt.created_at DESC
    `) as unknown as ContactPaymentTransactionRow[]

    return rows.map((row) => {
      const transactionDate = row.transaction_date instanceof Date
        ? row.transaction_date.toISOString()
        : row.transaction_date
      const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at

      return {
        id: row.transaction_id,
        expectedPaymentItemId: row.expected_payment_item_id,
        transactionType: row.transaction_type as ContactPaymentTransactionDto['transactionType'],
        amountCents: row.amount_cents,
        currency: row.currency,
        paymentMethod: row.payment_method as ContactPaymentTransactionDto['paymentMethod'],
        referenceNumber: row.reference_number,
        transactionDate,
        notes: row.notes,
        contactId: row.contact_id || null,
        createdAt,
        createdBy: row.created_by,
        activityId: row.activity_id,
        activityName: row.activity_name,
        paymentName: row.payment_name,
        tripId: row.trip_id,
        tripName: row.trip_name,
        contactName: row.contact_name || null,
        travelerName: row.traveler_name || null,
      }
    })
  }

  /**
   * Delete a payment transaction and sync paidAmountCents cache
   */
  async deleteTransaction(transactionId: string): Promise<void> {
    // Get the transaction to find the expected payment item ID
    const [transaction] = await this.db.client
      .select()
      .from(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.id, transactionId))
      .limit(1)

    if (!transaction) {
      throw new NotFoundException(
        `Payment transaction with ID ${transactionId} not found`,
      )
    }

    const expectedPaymentItemId = transaction.expectedPaymentItemId

    // Delete the transaction
    await this.db.client
      .delete(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.id, transactionId))

    // Sync paidAmountCents cache
    await this.syncPaidAmountCents(expectedPaymentItemId)
  }

  /**
   * Update the contact ("Paid By") on a payment transaction
   */
  async updateTransactionContact(
    transactionId: string,
    contactId: string | null,
    agencyId: string,
  ): Promise<PaymentTransactionDto> {
    // Get the transaction
    const [transaction] = await this.db.client
      .select()
      .from(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.id, transactionId))
      .limit(1)

    if (!transaction) {
      throw new NotFoundException(`Payment transaction with ID ${transactionId} not found`)
    }

    // Validate contactId if provided
    if (contactId) {
      const tripId = await this.getTripIdFromExpectedPaymentItemId(transaction.expectedPaymentItemId)
      if (tripId) {
        const isValid = await this.validateContactForTrip(contactId, tripId, agencyId)
        if (!isValid) {
          throw new BadRequestException(
            'Contact must be the primary contact or a traveler on the trip',
          )
        }
      }
    }

    // Update contact_id
    const [updated] = await this.db.client
      .update(this.db.schema.paymentTransactions)
      .set({ contactId })
      .where(eq(this.db.schema.paymentTransactions.id, transactionId))
      .returning()

    if (!updated) {
      throw new Error('Failed to update transaction contact')
    }

    return this.formatPaymentTransaction(updated)
  }

  /**
   * Sync paidAmountCents cache on expected_payment_item
   * Calculates total from all transactions (payments - refunds +/- adjustments)
   */
  private async syncPaidAmountCents(expectedPaymentItemId: string): Promise<void> {
    // Get all transactions for this expected payment item
    const transactions = await this.db.client
      .select()
      .from(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.expectedPaymentItemId, expectedPaymentItemId))

    // Calculate net paid amount
    let netPaidCents = 0
    for (const tx of transactions) {
      if (tx.transactionType === 'payment') {
        netPaidCents += tx.amountCents
      } else if (tx.transactionType === 'refund') {
        netPaidCents -= tx.amountCents
      } else if (tx.transactionType === 'adjustment') {
        // Adjustments can be positive or negative (stored as positive, semantics depend on use case)
        // For now, treat adjustments as additions (can be refined based on business rules)
        netPaidCents += tx.amountCents
      }
    }

    // Ensure non-negative (can't have negative paid amount)
    netPaidCents = Math.max(0, netPaidCents)

    // Get expected amount to determine status
    const [expectedPaymentItem] = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
      .limit(1)

    if (!expectedPaymentItem) {
      return // Item was deleted, nothing to sync
    }

    // Determine status based on paid amount vs expected amount
    // Check overdue status first - any unpaid balance past due date is overdue
    const isPastDue = expectedPaymentItem.dueDate
      ? (() => {
          const dueDate = new Date(expectedPaymentItem.dueDate)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          return dueDate < today
        })()
      : false

    let newStatus: 'pending' | 'partial' | 'paid' | 'overdue' = 'pending'
    if (netPaidCents >= expectedPaymentItem.expectedAmountCents) {
      newStatus = 'paid'
    } else if (isPastDue) {
      // Any unpaid balance past due date is overdue (regardless of partial payment)
      newStatus = 'overdue'
    } else if (netPaidCents > 0) {
      newStatus = 'partial'
    }

    // Update the expected payment item with the new paidAmountCents and status
    await this.db.client
      .update(this.db.schema.expectedPaymentItems)
      .set({
        paidAmountCents: netPaidCents,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
  }

  /**
   * Sync paidAmountCents within a transaction context
   * Used when inserting/deleting transactions to ensure atomicity
   */
  private async syncPaidAmountCentsWithTx(
    tx: Parameters<Parameters<typeof this.db.client.transaction>[0]>[0],
    expectedPaymentItemId: string,
  ): Promise<void> {
    // Get all transactions for this expected payment item within the transaction
    const transactions = await tx
      .select()
      .from(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.expectedPaymentItemId, expectedPaymentItemId))

    // Calculate net paid amount
    let netPaidCents = 0
    for (const txn of transactions) {
      if (txn.transactionType === 'payment') {
        netPaidCents += txn.amountCents
      } else if (txn.transactionType === 'refund') {
        netPaidCents -= txn.amountCents
      } else if (txn.transactionType === 'adjustment') {
        netPaidCents += txn.amountCents
      }
    }

    // Ensure non-negative
    netPaidCents = Math.max(0, netPaidCents)

    // Get expected amount to determine status
    const [expectedPaymentItem] = await tx
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
      .limit(1)

    if (!expectedPaymentItem) {
      return // Item was deleted, nothing to sync
    }

    // Determine status based on paid amount vs expected amount
    // Check overdue status first - any unpaid balance past due date is overdue
    const isPastDue = expectedPaymentItem.dueDate
      ? (() => {
          const dueDate = new Date(expectedPaymentItem.dueDate)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          return dueDate < today
        })()
      : false

    let newStatus: 'pending' | 'partial' | 'paid' | 'overdue' = 'pending'
    if (netPaidCents >= expectedPaymentItem.expectedAmountCents) {
      newStatus = 'paid'
    } else if (isPastDue) {
      // Any unpaid balance past due date is overdue (regardless of partial payment)
      newStatus = 'overdue'
    } else if (netPaidCents > 0) {
      newStatus = 'partial'
    }

    // Update within the transaction
    await tx
      .update(this.db.schema.expectedPaymentItems)
      .set({
        paidAmountCents: netPaidCents,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.expectedPaymentItems.id, expectedPaymentItemId))
  }

  private formatPaymentTransaction(transaction: any): PaymentTransactionDto {
    return {
      id: transaction.id,
      expectedPaymentItemId: transaction.expectedPaymentItemId,
      transactionType: transaction.transactionType,
      amountCents: transaction.amountCents,
      currency: transaction.currency,
      paymentMethod: transaction.paymentMethod,
      referenceNumber: transaction.referenceNumber,
      transactionDate: transaction.transactionDate.toISOString(),
      notes: transaction.notes,
      contactId: transaction.contactId || null,
      createdAt: transaction.createdAt.toISOString(),
      createdBy: transaction.createdBy,
    }
  }

  // ============================================================================
  // Calculation Helpers
  // ============================================================================

  /**
   * Calculate deposit amount and remaining balance
   */
  calculateDeposit(
    totalPriceCents: number,
    depositType: 'percentage' | 'fixed_amount',
    depositValue: number,
  ): DepositCalculation {
    let depositAmountCents: number

    if (depositType === 'percentage') {
      // depositValue is percentage (0-100)
      depositAmountCents = Math.round((totalPriceCents * depositValue) / 100)
    } else {
      // depositValue is fixed amount in cents
      depositAmountCents = depositValue
    }

    // Validate deposit doesn't exceed total
    if (depositAmountCents > totalPriceCents) {
      throw new BadRequestException('Deposit amount cannot exceed total price')
    }

    return {
      depositAmountCents,
      remainingAmountCents: totalPriceCents - depositAmountCents,
      totalAmountCents: totalPriceCents,
    }
  }

  /**
   * Generate expected payment items for deposit schedule
   */
  generateDepositSchedule(
    totalPriceCents: number,
    depositType: 'percentage' | 'fixed_amount',
    depositValue: number,
    depositDueDate?: string,
    finalDueDate?: string,
  ): CreateExpectedPaymentItemDto[] {
    const calculation = this.calculateDeposit(totalPriceCents, depositType, depositValue)

    return [
      {
        paymentName: 'Deposit',
        expectedAmountCents: calculation.depositAmountCents,
        dueDate: depositDueDate || null,
        sequenceOrder: 0,
      },
      {
        paymentName: 'Final Balance',
        expectedAmountCents: calculation.remainingAmountCents,
        dueDate: finalDueDate || null,
        sequenceOrder: 1,
      },
    ]
  }

  // ============================================================================
  // Template Application (TICO Compliant)
  // ============================================================================

  /**
   * Apply a payment schedule template to an activity pricing.
   *
   * CRITICAL: This method resolves relative date offsets (daysFromBooking,
   * daysBeforeDeparture) to absolute dates BEFORE running TICO validation.
   * This ensures the 45-day final payment check works correctly.
   *
   * @param activityPricingId - The activity pricing to apply the template to
   * @param agencyId - Agency ID for template lookup and authorization
   * @param userId - User performing the action (for audit logging)
   * @param dto - Template application parameters
   * @returns The created/updated payment schedule config with resolved items
   */
  async applyTemplate(
    activityPricingId: string,
    agencyId: string,
    userId: string,
    dto: ApplyTemplateDto,
    isAdmin = false,
  ): Promise<ApplyTemplateResponseDto> {
    // Block edits after trip departure unless admin
    await this.ensureTripEditable(activityPricingId, isAdmin)

    // 1. Validate activity pricing exists and get total price
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.id, activityPricingId))
      .limit(1)

    if (!activityPricing) {
      throw new NotFoundException(`Activity pricing with ID ${activityPricingId} not found`)
    }

    // 2. Fetch the template
    const template = await this.templatesService.findByIdOrThrow(dto.templateId, agencyId)

    if (!template.items || template.items.length === 0) {
      throw new BadRequestException('Template has no payment items')
    }

    // 3. Resolve template items to concrete expected payment items
    const bookingDate = dto.bookingDate ? new Date(dto.bookingDate) : new Date()
    const departureDate = new Date(dto.departureDate)

    const resolvedItems: CreateExpectedPaymentItemDto[] = template.items.map((item) => {
      // Calculate amount
      let expectedAmountCents: number
      if (item.percentage !== null && item.percentage !== undefined) {
        // Percentage of total
        const percentage = parseFloat(item.percentage)
        expectedAmountCents = Math.round((dto.totalAmountCents * percentage) / 100)
      } else if (item.fixedAmountCents !== null && item.fixedAmountCents !== undefined) {
        expectedAmountCents = item.fixedAmountCents
      } else {
        throw new BadRequestException(`Template item ${item.paymentName} has no amount defined`)
      }

      // Calculate due date - MUST resolve to absolute date for TICO validation
      let dueDate: string | null = null
      if (item.daysFromBooking !== null && item.daysFromBooking !== undefined) {
        const dueDateObj = new Date(bookingDate)
        dueDateObj.setDate(dueDateObj.getDate() + item.daysFromBooking)
        dueDate = dueDateObj.toISOString().split('T')[0] ?? null // ISO date string
      } else if (item.daysBeforeDeparture !== null && item.daysBeforeDeparture !== undefined) {
        const dueDateObj = new Date(departureDate)
        dueDateObj.setDate(dueDateObj.getDate() - item.daysBeforeDeparture)
        dueDate = dueDateObj.toISOString().split('T')[0] ?? null
      }

      return {
        paymentName: item.paymentName,
        expectedAmountCents,
        dueDate,
        sequenceOrder: item.sequenceOrder,
      }
    })

    // 4. Handle rounding errors - adjust last item to ensure exact sum
    const currentSum = resolvedItems.reduce((acc, item) => acc + item.expectedAmountCents, 0)
    const difference = dto.totalAmountCents - currentSum
    if (difference !== 0 && resolvedItems.length > 0) {
      // Add/subtract difference to the last item (typically final balance)
      const lastItem = resolvedItems[resolvedItems.length - 1]
      if (lastItem) {
        lastItem.expectedAmountCents += difference
        this.logger.debug(
          `Adjusted last payment item by ${difference} cents to match total (rounding correction)`
        )
      }
    }

    // 5. Run TICO validation BEFORE persisting
    const validation = this.validatePaymentSchedule(
      resolvedItems,
      dto.totalAmountCents,
      departureDate,
      bookingDate
    )

    if (!validation.isValid) {
      throw new BadRequestException({
        code: 'TICO_VALIDATION_FAILED',
        message: 'Payment schedule failed TICO compliance validation',
        errors: validation.errors,
        warnings: validation.warnings,
      })
    }

    // Log warnings (but don't block)
    if (validation.warnings.length > 0) {
      this.logger.warn(
        `Payment schedule template application has warnings: ${JSON.stringify(validation.warnings)}`
      )
    }

    // 6. Create or update payment schedule config with template items
    return this.db.client.transaction(async (tx) => {
      // Find global config only (templates don't apply to per-traveler schedules via this path)
      const [existingConfig] = await tx
        .select()
        .from(this.db.schema.paymentScheduleConfig)
        .where(and(
          eq(this.db.schema.paymentScheduleConfig.activityPricingId, activityPricingId),
          isNull(this.db.schema.paymentScheduleConfig.travelerBookingId)
        ))
        .limit(1)

      let configId: string

      if (existingConfig) {
        // Update existing config
        await tx
          .update(this.db.schema.paymentScheduleConfig)
          .set({
            scheduleType: template.scheduleType,
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.paymentScheduleConfig.id, existingConfig.id))

        configId = existingConfig.id

        // Delete existing items (will be replaced)
        await tx
          .delete(this.db.schema.expectedPaymentItems)
          .where(eq(this.db.schema.expectedPaymentItems.paymentScheduleConfigId, configId))
      } else {
        // Create new config
        // Note: agencyId is on activityPricing, not paymentScheduleConfig
        const insertedConfigs = await tx
          .insert(this.db.schema.paymentScheduleConfig)
          .values({
            activityPricingId,
            scheduleType: template.scheduleType,
            allowPartialPayments: false,
          })
          .returning()

        const newConfig = insertedConfigs[0]
        if (!newConfig) {
          throw new Error('Failed to create payment schedule config')
        }
        configId = newConfig.id
      }

      // Create expected payment items
      const createdItems: ExpectedPaymentItemDto[] = []
      for (const item of resolvedItems) {
        const [created] = await tx
          .insert(this.db.schema.expectedPaymentItems)
          .values({
            paymentScheduleConfigId: configId,
            agencyId,
            paymentName: item.paymentName,
            expectedAmountCents: item.expectedAmountCents,
            dueDate: item.dueDate,
            sequenceOrder: item.sequenceOrder,
            status: 'pending',
            paidAmountCents: 0,
          })
          .returning()

        createdItems.push(this.formatExpectedPaymentItem(created))
      }

      // Audit log
      await this.auditService.logTemplateApplied(
        configId,
        agencyId,
        userId,
        template.id,
        template.version
      )

      // Fetch updated config
      const [updatedConfig] = await tx
        .select()
        .from(this.db.schema.paymentScheduleConfig)
        .where(eq(this.db.schema.paymentScheduleConfig.id, configId))
        .limit(1)

      this.logger.log(
        `Applied template "${template.name}" (v${template.version}) to activity pricing ${activityPricingId}`
      )

      return {
        config: this.formatPaymentScheduleConfig(updatedConfig, createdItems, null),
        items: createdItems,
        templateId: template.id,
        templateVersion: template.version,
      }
    })
  }

  // ============================================================================
  // TICO Validation
  // ============================================================================

  /**
   * Validate a payment schedule against TICO rules.
   *
   * HARD FAILURES (errors array - operation will be rejected):
   * - Sum mismatch: items don't sum to total
   * - Final payment too late: < 45 days before departure
   * - Payment too small: any item < $1.00 (100 cents)
   * - Too many installments: > 12 items
   *
   * SOFT WARNINGS (warnings array - logged but allowed):
   * - High deposit: first payment > 50% of total
   * - Past due date: any due date in the past
   */
  validatePaymentSchedule(
    items: CreateExpectedPaymentItemDto[],
    totalPriceCents: number,
    departureDate: Date,
    _bookingDate: Date = new Date()
  ): PaymentScheduleValidationResult {
    const errors: PaymentScheduleValidationError[] = []
    const warnings: PaymentScheduleValidationWarning[] = []

    // Rule 1: Sum must equal total exactly
    const sum = items.reduce((acc, item) => acc + item.expectedAmountCents, 0)
    if (sum !== totalPriceCents) {
      errors.push({
        code: 'SUM_MISMATCH',
        message: `Payment items sum to ${sum} cents but total is ${totalPriceCents} cents`,
        difference: totalPriceCents - sum,
      })
    }

    // Rule 2: Final payment timing (find last item by sequence order)
    const sortedItems = [...items].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    const finalItem = sortedItems[sortedItems.length - 1]
    if (finalItem?.dueDate) {
      const finalDueDate = new Date(finalItem.dueDate)
      const daysBeforeDeparture = Math.floor(
        (departureDate.getTime() - finalDueDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysBeforeDeparture < TICO_RULES.MIN_FINAL_PAYMENT_DAYS_BEFORE_DEPARTURE) {
        errors.push({
          code: 'FINAL_PAYMENT_TOO_LATE',
          message: `Final payment must be at least ${TICO_RULES.MIN_FINAL_PAYMENT_DAYS_BEFORE_DEPARTURE} days before departure. Current: ${daysBeforeDeparture} days`,
          daysBeforeDeparture,
          required: TICO_RULES.MIN_FINAL_PAYMENT_DAYS_BEFORE_DEPARTURE,
        })
      }
    }

    // Rule 3: Minimum payment amounts
    for (const item of items) {
      if (item.expectedAmountCents < TICO_RULES.MIN_PAYMENT_AMOUNT_CENTS) {
        errors.push({
          code: 'PAYMENT_TOO_SMALL',
          message: `Payment "${item.paymentName}" is below minimum ($1.00): ${item.expectedAmountCents} cents`,
          paymentName: item.paymentName,
          amountCents: item.expectedAmountCents,
          minimumCents: TICO_RULES.MIN_PAYMENT_AMOUNT_CENTS,
        })
      }
    }

    // Rule 4: Maximum installments
    if (items.length > TICO_RULES.MAX_INSTALLMENTS) {
      errors.push({
        code: 'TOO_MANY_INSTALLMENTS',
        message: `Too many payment items (${items.length}). Maximum allowed: ${TICO_RULES.MAX_INSTALLMENTS}`,
        count: items.length,
        maximum: TICO_RULES.MAX_INSTALLMENTS,
      })
    }

    // Warning: High deposit percentage
    const firstItem = sortedItems[0]
    if (firstItem && totalPriceCents > 0) {
      const depositPercent = (firstItem.expectedAmountCents / totalPriceCents) * 100
      if (depositPercent > TICO_RULES.DEPOSIT_WARNING_THRESHOLD_PERCENT) {
        warnings.push({
          code: 'HIGH_DEPOSIT',
          message: `Deposit is ${depositPercent.toFixed(1)}% of total (exceeds ${TICO_RULES.DEPOSIT_WARNING_THRESHOLD_PERCENT}% threshold)`,
          depositPercent: depositPercent,
          threshold: TICO_RULES.DEPOSIT_WARNING_THRESHOLD_PERCENT,
        })
      }
    }

    // Warning: Past due dates
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (const item of items) {
      if (item.dueDate) {
        const dueDate = new Date(item.dueDate)
        if (dueDate < today) {
          warnings.push({
            code: 'PAST_DUE_DATE',
            message: `Payment "${item.paymentName}" has a due date in the past: ${item.dueDate}`,
            paymentName: item.paymentName,
            dueDate: item.dueDate,
          })
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  // ============================================================================
  // Item Locking (TICO Compliance)
  // NOTE: is_locked, locked_at, locked_by columns not yet in DB.
  // These methods are stubbed - add migration to enable locking.
  // ============================================================================

  /**
   * Lock an expected payment item after receiving a payment.
   * Locked items cannot be edited without admin unlock.
   *
   * Called automatically when a payment transaction is recorded.
   */
  async lockItemOnPayment(
    itemId: string,
    _agencyId: string,
    _userId: string,
  ): Promise<void> {
    // Verify item exists
    const [item] = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
      .limit(1)

    if (!item) {
      throw new NotFoundException(`Expected payment item ${itemId} not found`)
    }

    // Locking disabled — no-op until is_locked column is added via migration
    this.logger.debug(`Locking disabled - expected payment item ${itemId} would be locked after payment`)
  }

  /**
   * Unlock an expected payment item (admin only).
   * Requires a reason for audit trail.
   */
  async unlockItem(
    itemId: string,
    _agencyId: string,
    _userId: string,
    reason: string,
  ): Promise<ExpectedPaymentItemWithLockingDto> {
    // Validate reason
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('Unlock reason must be at least 10 characters')
    }

    const [item] = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
      .limit(1)

    if (!item) {
      throw new NotFoundException(`Expected payment item ${itemId} not found`)
    }

    // Locking disabled — return item with isLocked=false until column is added
    return this.formatExpectedPaymentItemWithLocking(item)
  }

  /**
   * Check if an item can be edited (not locked).
   * Throws ForbiddenException if locked.
   */
  async ensureItemNotLocked(_itemId: string): Promise<void> {
    // Locking disabled — all items are considered unlocked until column is added
  }

  // ============================================================================
  // Payment Reminder Scheduling
  // ============================================================================

  /**
   * Schedule payment reminders for an expected payment item
   * Sends reminders at: 7 days before, 3 days before, due date, 1 day overdue
   */
  private async schedulePaymentReminders(
    paymentItemId: string,
    tripId: string,
    contactId: string,
    agencyId: string,
    dueDate: string | Date,
  ): Promise<void> {
    const reminderOffsets: Array<{ days: number; type: '7_days_before' | '3_days_before' | 'due_date' | '1_day_overdue' }> = [
      { days: 7, type: '7_days_before' },
      { days: 3, type: '3_days_before' },
      { days: 0, type: 'due_date' },
      { days: -1, type: '1_day_overdue' },
    ]

    const dueDateObj = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
    const now = new Date()

    for (const { days, type } of reminderOffsets) {
      const reminderDate = days >= 0 ? subDays(dueDateObj, days) : addDays(dueDateObj, Math.abs(days))

      // Only schedule if reminder date is in the future
      if (isAfter(reminderDate, now)) {
        const jobId = getPaymentReminderJobId(paymentItemId, type)

        try {
          await this.automationService.scheduleAt(
            QUEUES.CLIENT_CARE,
            'payment.reminder',
            {
              type: 'payment.reminder' as const,
              expectedPaymentItemId: paymentItemId,
              tripId,
              contactId,
              agencyId,
              reminderType: type,
            },
            reminderDate,
            { jobId },
          )

          this.logger.debug(`Scheduled ${type} reminder for payment ${paymentItemId} at ${reminderDate.toISOString()}`)
        } catch (error) {
          // Log but don't fail - payment item creation should succeed even if scheduling fails
          this.logger.warn(`Failed to schedule ${type} reminder for payment ${paymentItemId}: ${error}`)
        }
      }
    }
  }

  /**
   * Cancel all scheduled payment reminders for a payment item
   */
  private async cancelPaymentReminders(paymentItemId: string): Promise<void> {
    const reminderTypes: Array<'7_days_before' | '3_days_before' | 'due_date' | '1_day_overdue'> = [
      '7_days_before',
      '3_days_before',
      'due_date',
      '1_day_overdue',
    ]

    for (const type of reminderTypes) {
      const jobId = getPaymentReminderJobId(paymentItemId, type)
      try {
        await this.automationService.cancel(jobId, QUEUES.CLIENT_CARE)
      } catch {
        // Ignore cancellation errors - job may not exist
      }
    }

    this.logger.debug(`Cancelled payment reminders for payment item ${paymentItemId}`)
  }

  /**
   * Reschedule payment reminders when due date changes
   */
  private async reschedulePaymentReminders(
    paymentItemId: string,
    tripId: string,
    contactId: string,
    agencyId: string,
    newDueDate: string | Date,
  ): Promise<void> {
    // Cancel existing reminders
    await this.cancelPaymentReminders(paymentItemId)

    // Schedule new reminders with the updated due date
    await this.schedulePaymentReminders(paymentItemId, tripId, contactId, agencyId, newDueDate)
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private formatPaymentScheduleConfig(
    config: any,
    expectedPaymentItems: ExpectedPaymentItemDto[],
    creditCardGuarantee: CreditCardGuaranteeDto | null = null,
  ): PaymentScheduleConfigDto {
    return {
      id: config.id,
      activityPricingId: config.activityPricingId,
      travelerBookingId: config.travelerBookingId || null,
      scheduleType: config.scheduleType,
      allowPartialPayments: config.allowPartialPayments,
      depositType: config.depositType,
      depositPercentage: config.depositPercentage,
      depositAmountCents: config.depositAmountCents,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
      expectedPaymentItems,
      creditCardGuarantee: creditCardGuarantee || undefined,
    }
  }

  private formatExpectedPaymentItem(item: any): ExpectedPaymentItemDto {
    return {
      id: item.id,
      paymentScheduleConfigId: item.paymentScheduleConfigId,
      paymentName: item.paymentName,
      expectedAmountCents: item.expectedAmountCents,
      dueDate: item.dueDate || null,
      status: item.status,
      sequenceOrder: item.sequenceOrder,
      paidAmountCents: item.paidAmountCents,
      contactId: item.contactId || null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }

  private formatCreditCardGuarantee(guarantee: any): CreditCardGuaranteeDto {
    return {
      id: guarantee.id,
      paymentScheduleConfigId: guarantee.paymentScheduleConfigId,
      cardHolderName: guarantee.cardHolderName,
      cardLast4: guarantee.cardLast4,
      authorizationCode: guarantee.authorizationCode,
      authorizationDate: guarantee.authorizationDate.toISOString(),
      authorizationAmountCents: guarantee.authorizationAmountCents,
      createdAt: guarantee.createdAt.toISOString(),
      updatedAt: guarantee.updatedAt.toISOString(),
    }
  }

  /**
   * Format expected payment item with locking fields
   * NOTE: is_locked, locked_at, locked_by columns not yet in DB - returns defaults
   */
  private formatExpectedPaymentItemWithLocking(item: any): ExpectedPaymentItemWithLockingDto {
    return {
      id: item.id,
      paymentScheduleConfigId: item.paymentScheduleConfigId,
      paymentName: item.paymentName,
      expectedAmountCents: item.expectedAmountCents,
      dueDate: item.dueDate || null,
      status: item.status,
      sequenceOrder: item.sequenceOrder,
      paidAmountCents: item.paidAmountCents,
      contactId: item.contactId || null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      isLocked: false,
      lockedAt: null,
      lockedBy: null,
    }
  }

  private async ensureTripAccess(tripId: string, agencyId: string): Promise<void> {
    const [trip] = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(and(
        eq(this.db.schema.trips.id, tripId),
        eq(this.db.schema.trips.agencyId, agencyId),
      ))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`)
    }
  }

  // ============================================================================
  // Single Expected Payment Item Operations (Add/Delete)
  // ============================================================================

  /**
   * Add a single expected payment item to an existing payment schedule config.
   * Does NOT enforce sum == totalPrice (UI shows warning instead).
   */
  async addExpectedPaymentItem(
    configId: string,
    agencyId: string,
    data: CreateExpectedPaymentItemDto,
    isAdmin = false,
  ): Promise<ExpectedPaymentItemDto> {
    // Block edits after trip departure unless admin
    const pricingIdForGuard = await this.getActivityPricingIdFromConfigId(configId)
    if (pricingIdForGuard) await this.ensureTripEditable(pricingIdForGuard, isAdmin)

    // Validate config exists and belongs to agency
    const [config] = await this.db.client
      .select({
        id: this.db.schema.paymentScheduleConfig.id,
        activityPricingId: this.db.schema.paymentScheduleConfig.activityPricingId,
      })
      .from(this.db.schema.paymentScheduleConfig)
      .innerJoin(
        this.db.schema.activityPricing,
        eq(this.db.schema.paymentScheduleConfig.activityPricingId, this.db.schema.activityPricing.id),
      )
      .where(
        and(
          eq(this.db.schema.paymentScheduleConfig.id, configId),
          eq(this.db.schema.activityPricing.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!config) {
      throw new NotFoundException(`Payment schedule config with ID ${configId} not found`)
    }

    // Always assign server-side sequenceOrder (ignore client value to prevent duplicates/collisions)
    const existingItems = await this.findExpectedPaymentItems(configId)
    const maxSeq = existingItems.reduce((max, item) => Math.max(max, item.sequenceOrder), -1)
    const sequenceOrder = maxSeq + 1

    // Insert the item
    const [created] = await this.db.client
      .insert(this.db.schema.expectedPaymentItems)
      .values({
        paymentScheduleConfigId: configId,
        agencyId,
        paymentName: data.paymentName,
        expectedAmountCents: data.expectedAmountCents,
        dueDate: data.dueDate || null,
        sequenceOrder,
      })
      .returning()

    // Schedule payment reminders if dueDate provided
    if (created!.dueDate) {
      const tripContext = await this.getTripContextFromActivityPricingId(config.activityPricingId)
      if (tripContext) {
        await this.schedulePaymentReminders(
          created!.id,
          tripContext.tripId,
          tripContext.contactId,
          agencyId,
          created!.dueDate,
        )
      }
    }

    return this.formatExpectedPaymentItem(created!)
  }

  /**
   * Delete a single expected payment item.
   * Blocks if any payment_transactions exist for the item.
   */
  async deleteExpectedPaymentItem(
    itemId: string,
    agencyId: string,
    isAdmin = false,
  ): Promise<void> {
    // Block edits after trip departure unless admin
    const pricingIdForGuard = await this.getActivityPricingIdFromItem(itemId)
    if (pricingIdForGuard) await this.ensureTripEditable(pricingIdForGuard, isAdmin)

    // Validate item exists and belongs to agency
    const [item] = await this.db.client
      .select()
      .from(this.db.schema.expectedPaymentItems)
      .where(
        and(
          eq(this.db.schema.expectedPaymentItems.id, itemId),
          eq(this.db.schema.expectedPaymentItems.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!item) {
      throw new NotFoundException(`Expected payment item with ID ${itemId} not found`)
    }

    // Block if any transactions exist (use EXISTS, not paidAmountCents — refunds can net to 0)
    const [txCheck] = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.expectedPaymentItemId, itemId))

    if (txCheck && txCheck.count > 0) {
      throw new BadRequestException(
        'Cannot delete expected payment item that has payment transactions. Delete the transactions first.',
      )
    }

    // Cancel payment reminders
    await this.cancelPaymentReminders(itemId)

    // Delete the item
    await this.db.client
      .delete(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
  }

  // ============================================================================
  // Trip Access Helpers (for TripAccessService integration)
  // ============================================================================

  /**
   * Get tripId from paymentScheduleConfigId
   * Path: paymentScheduleConfig → activityPricing → activity → trip
   */
  async getTripIdFromPaymentScheduleConfigId(configId: string): Promise<string | null> {
    const [config] = await this.db.client
      .select({ activityPricingId: this.db.schema.paymentScheduleConfig.activityPricingId })
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.id, configId))
      .limit(1)

    if (!config?.activityPricingId) {
      return null
    }

    return this.getTripIdFromActivityPricingId(config.activityPricingId)
  }

  /**
   * Get tripId from activityPricingId
   * Path: activityPricing → activity → trip (via tripId or day → itinerary → trip)
   */
  async getTripIdFromActivityPricingId(activityPricingId: string): Promise<string | null> {
    const [pricing] = await this.db.client
      .select({ activityId: this.db.schema.activityPricing.activityId })
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.id, activityPricingId))
      .limit(1)

    if (!pricing?.activityId) {
      return null
    }

    const [activity] = await this.db.client
      .select({
        tripId: this.db.schema.itineraryActivities.tripId,
        itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId,
      })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, pricing.activityId))
      .limit(1)

    // Floating packages have tripId set directly
    if (activity?.tripId) {
      return activity.tripId
    }

    // Non-package activities: traverse day → itinerary → trip
    if (activity?.itineraryDayId) {
      const [result] = await this.db.client
        .select({ tripId: this.db.schema.itineraries.tripId })
        .from(this.db.schema.itineraryDays)
        .innerJoin(
          this.db.schema.itineraries,
          eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id),
        )
        .where(eq(this.db.schema.itineraryDays.id, activity.itineraryDayId))
        .limit(1)
      return result?.tripId || null
    }

    return null
  }

  /**
   * Get tripId from travelerBookingId
   * Path: travelerBooking → activity → trip
   */
  async getTripIdFromTravelerBookingId(travelerBookingId: string): Promise<string | null> {
    const [booking] = await this.db.client
      .select({ activityId: this.db.schema.travelerBookings.activityId })
      .from(this.db.schema.travelerBookings)
      .where(eq(this.db.schema.travelerBookings.id, travelerBookingId))
      .limit(1)

    if (!booking?.activityId) {
      return null
    }

    const [activity] = await this.db.client
      .select({
        tripId: this.db.schema.itineraryActivities.tripId,
        itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId,
      })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, booking.activityId))
      .limit(1)

    if (activity?.tripId) {
      return activity.tripId
    }

    if (activity?.itineraryDayId) {
      const [result] = await this.db.client
        .select({ tripId: this.db.schema.itineraries.tripId })
        .from(this.db.schema.itineraryDays)
        .innerJoin(
          this.db.schema.itineraries,
          eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id),
        )
        .where(eq(this.db.schema.itineraryDays.id, activity.itineraryDayId))
        .limit(1)
      return result?.tripId || null
    }

    return null
  }

  /**
   * Get tripId from expectedPaymentItemId
   * Path: expectedPaymentItem → paymentScheduleConfig → activityPricing → activity → trip
   */
  async getTripIdFromExpectedPaymentItemId(itemId: string): Promise<string | null> {
    const [item] = await this.db.client
      .select({ paymentScheduleConfigId: this.db.schema.expectedPaymentItems.paymentScheduleConfigId })
      .from(this.db.schema.expectedPaymentItems)
      .where(eq(this.db.schema.expectedPaymentItems.id, itemId))
      .limit(1)

    if (!item) {
      return null
    }

    const [config] = await this.db.client
      .select({ activityPricingId: this.db.schema.paymentScheduleConfig.activityPricingId })
      .from(this.db.schema.paymentScheduleConfig)
      .where(eq(this.db.schema.paymentScheduleConfig.id, item.paymentScheduleConfigId))
      .limit(1)

    if (!config?.activityPricingId) {
      return null
    }

    return this.getTripIdFromActivityPricingId(config.activityPricingId)
  }

  /**
   * Validate that a contact is the primary contact or a traveler on the trip
   */
  private async validateContactForTrip(
    contactId: string,
    tripId: string,
    agencyId: string,
  ): Promise<boolean> {
    const rows = await this.db.client.execute(sql`
      SELECT 1 FROM (
        SELECT id AS contact_id FROM trips
        WHERE id = ${tripId} AND primary_contact_id = ${contactId} AND agency_id = ${agencyId}
        UNION
        SELECT contact_id FROM trip_travelers
        WHERE trip_id = ${tripId} AND contact_id = ${contactId}
      ) valid_contacts
      LIMIT 1
    `) as unknown as { contact_id: string }[]

    return rows.length > 0
  }

  /**
   * Get tripId from transactionId
   * Path: transaction → expectedPaymentItem → paymentScheduleConfig → activityPricing → activity → trip
   */
  async getTripIdFromTransactionId(transactionId: string): Promise<string | null> {
    const [transaction] = await this.db.client
      .select({ expectedPaymentItemId: this.db.schema.paymentTransactions.expectedPaymentItemId })
      .from(this.db.schema.paymentTransactions)
      .where(eq(this.db.schema.paymentTransactions.id, transactionId))
      .limit(1)

    if (!transaction?.expectedPaymentItemId) {
      return null
    }

    return this.getTripIdFromExpectedPaymentItemId(transaction.expectedPaymentItemId)
  }
}
