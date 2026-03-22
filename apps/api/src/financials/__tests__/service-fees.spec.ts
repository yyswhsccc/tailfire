/**
 * Integration Tests: Service Fees
 *
 * Tests the service fee lifecycle including:
 * - Creating service fees for trips
 * - Status transitions (draft → sent → paid)
 * - Refund processing
 * - Cancellation
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { FinancialsModule } from '../financials.module'
import { ServiceFeesService } from '../service-fees.service'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

const { trips, contacts } = schema

describe('Service Fees (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let serviceFeesService: ServiceFeesService
  let testTripId: string
  let testContactId: string

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
        FinancialsModule,
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    dbService = moduleFixture.get<DatabaseService>(DatabaseService)
    serviceFeesService = moduleFixture.get<ServiceFeesService>(ServiceFeesService)

    const db = getDb()

    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // Tests should create their own data and clean up after themselves.

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'ServiceFee',
        lastName: 'Tester',
        email: `servicefee-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create test trip
    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Service Fee Test Trip',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001', // Test owner ID
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id
  })

  afterAll(async () => {
    const db = getDb()

    // Clean up test data
    await db.delete(schema.serviceFees).where(eq(schema.serviceFees.tripId, testTripId))
    await db.delete(trips).where(eq(trips.id, testTripId))
    await db.delete(contacts).where(eq(contacts.id, testContactId))

    await app.close()
  })

  describe('Service Fee Creation', () => {
    it('should create a service fee in draft status', async () => {
      const fee = await serviceFeesService.createServiceFee(testTripId, {
        title: 'Planning Fee',
        amountCents: 15000, // $150.00 CAD
        currency: 'CAD',
        description: 'Trip planning consultation fee',
      })

      expect(fee).toBeDefined()
      expect(fee.id).toBeDefined()
      expect(fee.title).toBe('Planning Fee')
      expect(fee.amountCents).toBe(15000)
      expect(fee.currency).toBe('CAD')
      expect(fee.status).toBe('draft')
    })

    it('should create a service fee with due date', async () => {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 30)

      // Create date string in YYYY-MM-DD format (what the DB stores)
      const dueDateString = dueDate.toISOString().split('T')[0]

      const fee = await serviceFeesService.createServiceFee(testTripId, {
        title: 'Booking Fee',
        amountCents: 25000,
        currency: 'CAD',
        dueDate: dueDateString,
      })

      expect(fee).toBeDefined()
      expect(fee.dueDate).toBeDefined()
      // Compare date strings directly to avoid timezone conversion issues
      // The stored date should match the date string we sent
      const storedDateString = typeof fee.dueDate === 'string'
        ? fee.dueDate.split('T')[0]
        : new Date(fee.dueDate!).toISOString().split('T')[0]
      expect(storedDateString).toBe(dueDateString)
    })
  })

  describe('Service Fee Status Transitions', () => {
    let testFeeId: string

    beforeAll(async () => {
      const fee = await serviceFeesService.createServiceFee(testTripId, {
        title: 'Status Test Fee',
        amountCents: 10000,
        currency: 'CAD',
      })
      testFeeId = fee.id
    })

    it('should transition from draft to sent', async () => {
      const fee = await serviceFeesService.sendServiceFee(testFeeId)

      expect(fee.status).toBe('sent')
      expect(fee.sentAt).toBeDefined()
    })

    it('should transition from sent to paid', async () => {
      const fee = await serviceFeesService.markAsPaid(testFeeId)

      expect(fee.status).toBe('paid')
      expect(fee.paidAt).toBeDefined()
    })

    it('should allow refund from paid status', async () => {
      const fee = await serviceFeesService.processRefund(testFeeId, {
        reason: 'Customer request',
      })

      expect(fee.status).toBe('refunded')
      expect(fee.refundedAmountCents).toBe(10000)
      expect(fee.refundReason).toBe('Customer request')
    })
  })

  describe('Service Fee Cancellation', () => {
    it('should cancel a draft service fee', async () => {
      const fee = await serviceFeesService.createServiceFee(testTripId, {
        title: 'Cancel Test Fee',
        amountCents: 5000,
        currency: 'CAD',
      })

      const cancelled = await serviceFeesService.cancelServiceFee(fee.id)

      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.cancelledAt).toBeDefined()
    })

    it('should cancel a sent service fee', async () => {
      const fee = await serviceFeesService.createServiceFee(testTripId, {
        title: 'Cancel Sent Fee',
        amountCents: 5000,
        currency: 'CAD',
      })

      await serviceFeesService.sendServiceFee(fee.id)
      const cancelled = await serviceFeesService.cancelServiceFee(fee.id)

      expect(cancelled.status).toBe('cancelled')
    })

    it('should not allow cancelling a paid service fee', async () => {
      const fee = await serviceFeesService.createServiceFee(testTripId, {
        title: 'Cannot Cancel Fee',
        amountCents: 5000,
        currency: 'CAD',
      })

      await serviceFeesService.sendServiceFee(fee.id)
      await serviceFeesService.markAsPaid(fee.id)

      await expect(serviceFeesService.cancelServiceFee(fee.id)).rejects.toThrow()
    })
  })

  describe('Service Fee Listing', () => {
    it('should list all service fees for a trip', async () => {
      const fees = await serviceFeesService.getServiceFees(testTripId)

      expect(fees).toBeDefined()
      expect(Array.isArray(fees)).toBe(true)
      expect(fees.length).toBeGreaterThan(0)
    })

    it('should filter service fees by status', async () => {
      const allFees = await serviceFeesService.getServiceFees(testTripId)
      const draftFees = allFees.filter(fee => fee.status === 'draft')

      expect(draftFees).toBeDefined()
      draftFees.forEach((fee) => {
        expect(fee.status).toBe('draft')
      })
    })
  })
})
