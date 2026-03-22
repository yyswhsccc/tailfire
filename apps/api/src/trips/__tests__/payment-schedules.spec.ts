/**
 * Integration Tests: Payment Schedules
 *
 * Tests the payment schedule lifecycle including:
 * - Creating payment schedule configs with different schedule types
 * - Credit card guarantee CRUD operations
 * - Expected payment items management
 * - Validation logic for deposit and guarantee types
 * - Update operations
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, BadRequestException, NotFoundException } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { TripsModule } from '../trips.module'
import { PaymentSchedulesService } from '../payment-schedules.service'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

const { trips, contacts, itineraries, itineraryDays, itineraryActivities, activityPricing } = schema

describe('Payment Schedules (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let paymentSchedulesService: PaymentSchedulesService
  let testTripId: string
  let testContactId: string
  let testItineraryId: string
  let testDayId: string
  let testComponentId: string
  let testActivityPricingId: string

  const getDb = () => dbService.db

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
        EventEmitterModule.forRoot(),
        DatabaseModule,
        EncryptionModule,
        TripsModule,
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    dbService = moduleFixture.get<DatabaseService>(DatabaseService)
    paymentSchedulesService = moduleFixture.get<PaymentSchedulesService>(PaymentSchedulesService)

    const db = getDb()

    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // Tests should create their own data and clean up after themselves.

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'PaymentSchedule',
        lastName: 'Tester',
        email: `payment-schedule-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create test trip
    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Payment Schedule Test Trip',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001',
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    // Create test itinerary
    const [itinerary] = await db
      .insert(itineraries)
      .values({
        tripId: testTripId,
        name: 'Test Itinerary',
      })
      .returning()

    if (!itinerary) throw new Error('Failed to create test itinerary')
    testItineraryId = itinerary.id

    // Create test day
    const [day] = await db
      .insert(itineraryDays)
      .values({
        itineraryId: testItineraryId,
        dayNumber: 1,
        date: '2025-06-01',
        sequenceOrder: 0,
      })
      .returning()

    if (!day) throw new Error('Failed to create test day')
    testDayId = day.id

    // Create test component (activity)
    const [component] = await db
      .insert(itineraryActivities)
      .values({
        itineraryDayId: testDayId,
        componentType: 'lodging',
        activityType: 'lodging',
        name: 'Test Hotel',
        sequenceOrder: 0,
        proposalStatus: 'approved',
      })
      .returning()

    if (!component) throw new Error('Failed to create test component')
    testComponentId = component.id

    // Create test activity pricing
    const [pricing] = await db
      .insert(activityPricing)
      .values({
        activityId: testComponentId,
        pricingType: 'per_room',
        basePrice: '500.00',
        totalPriceCents: 50000, // $500.00
        taxesAndFeesCents: 5000, // $50.00
        currency: 'CAD',
      })
      .returning()

    if (!pricing) throw new Error('Failed to create test activity pricing')
    testActivityPricingId = pricing.id
  })

  afterAll(async () => {
    const db = getDb()

    // Clean up test data (cascades will handle most deletions)
    await db.delete(trips).where(eq(trips.id, testTripId))
    await db.delete(contacts).where(eq(contacts.id, testContactId))

    await app.close()
  })

  describe('Full Payment Schedule', () => {
    it('should create a full payment schedule config', async () => {
      const config = await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
        allowPartialPayments: false,
      })

      expect(config).toBeDefined()
      expect(config.activityPricingId).toBe(testActivityPricingId)
      expect(config.scheduleType).toBe('full')
      expect(config.allowPartialPayments).toBe(false)
      expect(config.depositType).toBeNull()
      expect(config.depositPercentage).toBeNull()
      expect(config.depositAmountCents).toBeNull()
      expect(config.expectedPaymentItems).toEqual([])
      expect(config.creditCardGuarantee).toBeUndefined()

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should retrieve payment schedule config by activity pricing ID', async () => {
      // Create
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
      })

      // Retrieve
      const config = await paymentSchedulesService.findByActivityPricingId(testActivityPricingId)

      expect(config).toBeDefined()
      expect(config?.activityPricingId).toBe(testActivityPricingId)

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })
  })

  describe('Deposit Payment Schedule', () => {
    it('should create a deposit schedule with percentage deposit', async () => {
      const config = await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'deposit',
        depositType: 'percentage',
        depositPercentage: 30,
        expectedPaymentItems: [
          {
            paymentName: 'Deposit (30%)',
            expectedAmountCents: 15000,
            sequenceOrder: 0,
          },
          {
            paymentName: 'Final Balance',
            expectedAmountCents: 35000,
            sequenceOrder: 1,
          },
        ],
      })

      expect(config).toBeDefined()
      expect(config.scheduleType).toBe('deposit')
      expect(config.depositType).toBe('percentage')
      expect(config.depositPercentage).toBe('30.00')
      expect(config.expectedPaymentItems).toHaveLength(2)
      expect(config.expectedPaymentItems?.[0]!.paymentName).toBe('Deposit (30%)')
      expect(config.expectedPaymentItems?.[0]!.expectedAmountCents).toBe(15000)

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should create a deposit schedule with fixed amount deposit', async () => {
      const config = await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'deposit',
        depositType: 'fixed_amount',
        depositAmountCents: 20000,
        expectedPaymentItems: [
          {
            paymentName: 'Deposit',
            expectedAmountCents: 20000,
            sequenceOrder: 0,
          },
          {
            paymentName: 'Final Balance',
            expectedAmountCents: 30000,
            sequenceOrder: 1,
          },
        ],
      })

      expect(config).toBeDefined()
      expect(config.depositType).toBe('fixed_amount')
      expect(config.depositAmountCents).toBe(20000)

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should reject deposit schedule without depositType', async () => {
      await expect(
        paymentSchedulesService.create({
          activityPricingId: testActivityPricingId,
          scheduleType: 'deposit',
          expectedPaymentItems: [],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject percentage deposit without depositPercentage', async () => {
      await expect(
        paymentSchedulesService.create({
          activityPricingId: testActivityPricingId,
          scheduleType: 'deposit',
          depositType: 'percentage',
          expectedPaymentItems: [],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject fixed_amount deposit without depositAmountCents', async () => {
      await expect(
        paymentSchedulesService.create({
          activityPricingId: testActivityPricingId,
          scheduleType: 'deposit',
          depositType: 'fixed_amount',
          expectedPaymentItems: [],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject deposit exceeding total price', async () => {
      await expect(
        paymentSchedulesService.create({
          activityPricingId: testActivityPricingId,
          scheduleType: 'deposit',
          depositType: 'fixed_amount',
          depositAmountCents: 60000, // Exceeds $500.00
          expectedPaymentItems: [],
        })
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('Installment Payment Schedule', () => {
    it('should create an installments schedule', async () => {
      const config = await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'installments',
        expectedPaymentItems: [
          {
            paymentName: 'Installment 1',
            expectedAmountCents: 16667,
            dueDate: '2025-06-01',
            sequenceOrder: 0,
          },
          {
            paymentName: 'Installment 2',
            expectedAmountCents: 16667,
            dueDate: '2025-07-01',
            sequenceOrder: 1,
          },
          {
            paymentName: 'Installment 3',
            expectedAmountCents: 16666,
            dueDate: '2025-08-01',
            sequenceOrder: 2,
          },
        ],
      })

      expect(config).toBeDefined()
      expect(config.scheduleType).toBe('installments')
      expect(config.expectedPaymentItems).toHaveLength(3)
      expect(config.expectedPaymentItems?.[0]!.dueDate).toBe('2025-06-01')

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should reject installments that dont sum to total price', async () => {
      await expect(
        paymentSchedulesService.create({
          activityPricingId: testActivityPricingId,
          scheduleType: 'installments',
          expectedPaymentItems: [
            {
              paymentName: 'Installment 1',
              expectedAmountCents: 20000,
              sequenceOrder: 0,
            },
            {
              paymentName: 'Installment 2',
              expectedAmountCents: 20000,
              sequenceOrder: 1,
            },
          ],
        })
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('Credit Card Guarantee Payment Schedule', () => {
    it('should create a guarantee schedule with credit card guarantee', async () => {
      const config = await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'guarantee',
        creditCardGuarantee: {
          paymentScheduleConfigId: '', // Will be set by service
          cardHolderName: 'John Doe',
          cardLast4: '4242',
          authorizationCode: 'AUTH123456',
          authorizationDate: '2025-05-01T10:00:00Z',
          authorizationAmountCents: 50000,
        },
      })

      expect(config).toBeDefined()
      expect(config.scheduleType).toBe('guarantee')
      expect(config.creditCardGuarantee).toBeDefined()
      expect(config.creditCardGuarantee?.cardHolderName).toBe('John Doe')
      expect(config.creditCardGuarantee?.cardLast4).toBe('4242')
      expect(config.creditCardGuarantee?.authorizationCode).toBe('AUTH123456')
      expect(config.creditCardGuarantee?.authorizationAmountCents).toBe(50000)

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should reject guarantee schedule without credit card guarantee', async () => {
      await expect(
        paymentSchedulesService.create({
          activityPricingId: testActivityPricingId,
          scheduleType: 'guarantee',
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should load credit card guarantee when retrieving config', async () => {
      // Create
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'guarantee',
        creditCardGuarantee: {
          paymentScheduleConfigId: '',
          cardHolderName: 'Jane Smith',
          cardLast4: '5555',
          authorizationCode: 'AUTH789',
          authorizationDate: '2025-05-15T14:30:00Z',
          authorizationAmountCents: 50000,
        },
      })

      // Retrieve
      const config = await paymentSchedulesService.findByActivityPricingId(testActivityPricingId)

      expect(config).toBeDefined()
      expect(config?.creditCardGuarantee).toBeDefined()
      expect(config?.creditCardGuarantee?.cardHolderName).toBe('Jane Smith')
      expect(config?.creditCardGuarantee?.cardLast4).toBe('5555')

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })
  })

  describe('Update Payment Schedule', () => {
    it('should update schedule type from full to deposit', async () => {
      // Create full schedule
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
      })

      // Update to deposit
      const updated = await paymentSchedulesService.update(testActivityPricingId, {
        scheduleType: 'deposit',
        depositType: 'percentage',
        depositPercentage: 25,
        expectedPaymentItems: [
          {
            paymentName: 'Deposit',
            expectedAmountCents: 12500,
            sequenceOrder: 0,
          },
          {
            paymentName: 'Balance',
            expectedAmountCents: 37500,
            sequenceOrder: 1,
          },
        ],
      })

      expect(updated.scheduleType).toBe('deposit')
      expect(updated.depositType).toBe('percentage')
      expect(updated.depositPercentage).toBe('25.00')
      expect(updated.expectedPaymentItems).toHaveLength(2)

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should update credit card guarantee', async () => {
      // Create guarantee schedule
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'guarantee',
        creditCardGuarantee: {
          paymentScheduleConfigId: '',
          cardHolderName: 'Original Name',
          cardLast4: '1111',
          authorizationCode: 'AUTH001',
          authorizationDate: '2025-05-01T10:00:00Z',
          authorizationAmountCents: 50000,
        },
      })

      // Update guarantee
      const updated = await paymentSchedulesService.update(testActivityPricingId, {
        creditCardGuarantee: {
          cardHolderName: 'Updated Name',
          cardLast4: '2222',
          authorizationCode: 'AUTH002',
          authorizationDate: '2025-05-15T10:00:00Z',
          authorizationAmountCents: 50000,
        },
      })

      expect(updated.creditCardGuarantee?.cardHolderName).toBe('Updated Name')
      expect(updated.creditCardGuarantee?.cardLast4).toBe('2222')
      expect(updated.creditCardGuarantee?.authorizationCode).toBe('AUTH002')

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should add credit card guarantee when switching to guarantee type', async () => {
      // Create full schedule
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
      })

      // Update to guarantee with new credit card guarantee
      const updated = await paymentSchedulesService.update(testActivityPricingId, {
        scheduleType: 'guarantee',
        creditCardGuarantee: {
          cardHolderName: 'New Guarantee',
          cardLast4: '3333',
          authorizationCode: 'AUTH003',
          authorizationDate: '2025-06-01T10:00:00Z',
          authorizationAmountCents: 50000,
        },
      })

      expect(updated.scheduleType).toBe('guarantee')
      expect(updated.creditCardGuarantee).toBeDefined()
      expect(updated.creditCardGuarantee?.cardHolderName).toBe('New Guarantee')

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should reject switching to guarantee without providing credit card guarantee', async () => {
      // Create full schedule
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
      })

      // Try to update to guarantee without credit card data
      await expect(
        paymentSchedulesService.update(testActivityPricingId, {
          scheduleType: 'guarantee',
        })
      ).rejects.toThrow(BadRequestException)

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })
  })

  describe('Deposit Calculation Helpers', () => {
    it('should calculate percentage deposit correctly', () => {
      const calc = paymentSchedulesService.calculateDeposit(50000, 'percentage', 30)

      expect(calc.totalAmountCents).toBe(50000)
      expect(calc.depositAmountCents).toBe(15000) // 30% of $500
      expect(calc.remainingAmountCents).toBe(35000)
    })

    it('should calculate fixed amount deposit correctly', () => {
      const calc = paymentSchedulesService.calculateDeposit(50000, 'fixed_amount', 20000)

      expect(calc.totalAmountCents).toBe(50000)
      expect(calc.depositAmountCents).toBe(20000)
      expect(calc.remainingAmountCents).toBe(30000)
    })

    it('should generate deposit schedule with expected payment items', () => {
      const items = paymentSchedulesService.generateDepositSchedule(
        50000,
        'percentage',
        25,
        '2025-06-01',
        '2025-08-01'
      )

      expect(items).toHaveLength(2)
      expect(items[0]!.paymentName).toBe('Deposit')
      expect(items[0]!.expectedAmountCents).toBe(12500)
      expect(items[0]!.dueDate).toBe('2025-06-01')
      expect(items[1]!.paymentName).toBe('Final Balance')
      expect(items[1]!.expectedAmountCents).toBe(37500)
      expect(items[1]!.dueDate).toBe('2025-08-01')
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      // Clean up any existing schedule to ensure clean state
      try {
        await paymentSchedulesService.delete(testActivityPricingId)
      } catch (error) {
        // Ignore if no schedule exists
      }
    })

    it('should reject creating schedule for non-existent activity pricing', async () => {
      await expect(
        paymentSchedulesService.create({
          activityPricingId: '00000000-0000-0000-0000-000000000000',
          scheduleType: 'full',
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('should reject creating duplicate schedule for same activity pricing', async () => {
      // Create first schedule
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
      })

      // Try to create duplicate
      await expect(
        paymentSchedulesService.create({
          activityPricingId: testActivityPricingId,
          scheduleType: 'full',
        })
      ).rejects.toThrow(BadRequestException)

      // Clean up
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should reject updating non-existent schedule', async () => {
      await expect(
        paymentSchedulesService.update('00000000-0000-0000-0000-000000000000', {
          scheduleType: 'deposit',
        })
      ).rejects.toThrow(NotFoundException)
    })
  })
})
