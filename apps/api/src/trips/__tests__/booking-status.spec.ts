/**
 * Integration Tests: Booking Status Aggregation
 *
 * Tests the booking status endpoint that aggregates payment status across activities:
 * - Empty trip returns zero summary
 * - Activities without payment schedules return null status
 * - Paid/partial/pending/overdue status aggregation
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { TripsModule } from '../trips.module'
import { TripsService } from '../trips.service'
import { PaymentSchedulesService } from '../payment-schedules.service'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

const { trips, contacts, itineraries, itineraryDays, itineraryActivities, activityPricing } = schema

describe('Booking Status Aggregation (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let tripsService: TripsService
  let paymentSchedulesService: PaymentSchedulesService
  let testTripId: string
  let testContactId: string
  let testItineraryId: string
  let testDayId: string
  let testActivityId: string
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
    tripsService = moduleFixture.get<TripsService>(TripsService)
    paymentSchedulesService = moduleFixture.get<PaymentSchedulesService>(PaymentSchedulesService)
  })

  beforeEach(async () => {
    const db = getDb()

    // Create fresh test data for each test
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'BookingStatus',
        lastName: 'Tester',
        email: `booking-status-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Booking Status Test Trip',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001',
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    const [itinerary] = await db
      .insert(itineraries)
      .values({
        tripId: testTripId,
        name: 'Test Itinerary',
      })
      .returning()

    if (!itinerary) throw new Error('Failed to create test itinerary')
    testItineraryId = itinerary.id

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

    const [activity] = await db
      .insert(itineraryActivities)
      .values({
        itineraryDayId: testDayId,
        componentType: 'lodging',
        activityType: 'lodging',
        name: 'Test Hotel',
        sequenceOrder: 0,
        status: 'confirmed',
      })
      .returning()

    if (!activity) throw new Error('Failed to create test activity')
    testActivityId = activity.id

    const [pricing] = await db
      .insert(activityPricing)
      .values({
        activityId: testActivityId,
        pricingType: 'per_room',
        basePrice: '500.00',
        totalPriceCents: 50000,
        currency: 'CAD',
      })
      .returning()

    if (!pricing) throw new Error('Failed to create test activity pricing')
    testActivityPricingId = pricing.id
  })

  afterEach(async () => {
    const db = getDb()
    // Clean up test data
    if (testTripId) await db.delete(trips).where(eq(trips.id, testTripId))
    if (testContactId) await db.delete(contacts).where(eq(contacts.id, testContactId))
  })

  afterAll(async () => {
    await app.close()
  })

  describe('getBookingStatus', () => {
    it('should include activity cost in summary even without payment schedule', async () => {
      // Activity has pricing (50000 cents) but no payment schedule yet
      const result = await tripsService.getBookingStatus(testTripId)

      expect(result.tripId).toBe(testTripId)
      expect(result.summary.totalActivities).toBe(1)
      expect(result.summary.activitiesWithPaymentSchedule).toBe(0)
      // NEW: totalExpectedCents should reflect activity_pricing.totalPriceCents
      expect(result.summary.totalExpectedCents).toBe(50000)
      expect(result.summary.totalPaidCents).toBe(0)
      expect(result.summary.totalRemainingCents).toBe(50000)

      // Activity should show 'pending' status when cost > 0 but no schedule
      const activityStatus = result.activities[testActivityId]
      expect(activityStatus).toBeDefined()
      expect(activityStatus?.paymentStatus).toBe('pending')
      expect(activityStatus?.paymentTotalCents).toBe(50000)
      expect(activityStatus?.paymentRemainingCents).toBe(50000)
      expect(activityStatus?.hasPaymentSchedule).toBe(false)
    })

    it('should show null status for activity with $0 pricing and no schedule', async () => {
      const db = getDb()

      // Create activity with $0 pricing
      const [zeroActivity] = await db
        .insert(itineraryActivities)
        .values({
          itineraryDayId: testDayId,
          componentType: 'tour',
          activityType: 'tour',
          name: 'Free Tour',
          sequenceOrder: 1,
          status: 'confirmed',
        })
        .returning()

      await db.insert(activityPricing).values({
        activityId: zeroActivity!.id,
        pricingType: 'flat_rate',
        basePrice: '0.00',
        totalPriceCents: 0,
        currency: 'CAD',
      })

      try {
        const result = await tripsService.getBookingStatus(testTripId)

        const freeActivityStatus = result.activities[zeroActivity!.id]
        expect(freeActivityStatus).toBeDefined()
        // $0 cost with no schedule = null status (no payment needed)
        expect(freeActivityStatus?.paymentStatus).toBeNull()
        expect(freeActivityStatus?.paymentTotalCents).toBe(0)
      } finally {
        await db.delete(activityPricing).where(eq(activityPricing.activityId, zeroActivity!.id))
        await db.delete(itineraryActivities).where(eq(itineraryActivities.id, zeroActivity!.id))
      }
    })

    it('should aggregate pending status for unpaid expected items', async () => {
      // Create payment schedule with expected items included
      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
        expectedPaymentItems: [{
          paymentName: 'Full Payment',
          expectedAmountCents: 50000,
          sequenceOrder: 0,
        }],
      })

      const result = await tripsService.getBookingStatus(testTripId)

      expect(result.summary.totalActivities).toBe(1)
      expect(result.summary.activitiesWithPaymentSchedule).toBe(1)
      expect(result.summary.totalExpectedCents).toBe(50000)
      expect(result.summary.totalPaidCents).toBe(0)
      expect(result.summary.totalRemainingCents).toBe(50000)

      const activityStatus = result.activities[testActivityId]
      expect(activityStatus?.paymentStatus).toBe('pending')
      expect(activityStatus?.paymentTotalCents).toBe(50000)
      expect(activityStatus?.paymentPaidCents).toBe(0)

      // Cleanup
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should aggregate paid status when fully paid', async () => {
      // Create payment schedule with expected items
      const config = await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
        expectedPaymentItems: [{
          paymentName: 'Full Payment',
          expectedAmountCents: 50000,
          sequenceOrder: 0,
        }],
      })

      // Get the expected payment item ID
      const items = config.expectedPaymentItems || []
      const itemId = items[0]?.id
      expect(itemId).toBeDefined()

      // Record full payment
      await paymentSchedulesService.createTransaction({
        expectedPaymentItemId: itemId!,
        transactionType: 'payment',
        amountCents: 50000,
        currency: 'CAD',
        transactionDate: new Date().toISOString(),
      })

      const result = await tripsService.getBookingStatus(testTripId)

      expect(result.summary.totalExpectedCents).toBe(50000)
      expect(result.summary.totalPaidCents).toBe(50000)
      expect(result.summary.totalRemainingCents).toBe(0)

      const activityStatus = result.activities[testActivityId]
      expect(activityStatus?.paymentStatus).toBe('paid')
      expect(activityStatus?.paymentPaidCents).toBe(50000)

      // Cleanup
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should aggregate partial status when partially paid', async () => {
      // Create payment schedule with expected items
      const config = await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
        expectedPaymentItems: [{
          paymentName: 'Full Payment',
          expectedAmountCents: 50000,
          sequenceOrder: 0,
        }],
      })

      // Get the expected payment item ID
      const items = config.expectedPaymentItems || []
      const itemId = items[0]?.id
      expect(itemId).toBeDefined()

      // Record partial payment
      await paymentSchedulesService.createTransaction({
        expectedPaymentItemId: itemId!,
        transactionType: 'payment',
        amountCents: 25000,
        currency: 'CAD',
        transactionDate: new Date().toISOString(),
      })

      const result = await tripsService.getBookingStatus(testTripId)

      expect(result.summary.totalPaidCents).toBe(25000)
      expect(result.summary.totalRemainingCents).toBe(25000)

      const activityStatus = result.activities[testActivityId]
      expect(activityStatus?.paymentStatus).toBe('partial')
      expect(activityStatus?.paymentPaidCents).toBe(25000)
      expect(activityStatus?.paymentRemainingCents).toBe(25000)

      // Cleanup
      await paymentSchedulesService.delete(testActivityPricingId)
    })

    it('should aggregate overdue status for unpaid past-due items', async () => {
      // Create payment schedule with a due date in the past
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 7) // 7 days ago
      const pastDueDateStr = pastDate.toISOString().split('T')[0]

      await paymentSchedulesService.create({
        activityPricingId: testActivityPricingId,
        scheduleType: 'full',
        expectedPaymentItems: [{
          paymentName: 'Overdue Payment',
          expectedAmountCents: 50000,
          dueDate: pastDueDateStr,
          sequenceOrder: 0,
        }],
      })

      const result = await tripsService.getBookingStatus(testTripId)

      expect(result.summary.totalActivities).toBe(1)
      expect(result.summary.activitiesWithPaymentSchedule).toBe(1)
      expect(result.summary.totalExpectedCents).toBe(50000)
      expect(result.summary.totalPaidCents).toBe(0)
      expect(result.summary.totalRemainingCents).toBe(50000)
      expect(result.summary.overdueCount).toBe(1)

      const activityStatus = result.activities[testActivityId]
      expect(activityStatus?.paymentStatus).toBe('overdue')
      expect(activityStatus?.paymentTotalCents).toBe(50000)
      expect(activityStatus?.paymentPaidCents).toBe(0)
      expect(activityStatus?.nextDueDate).toBe(pastDueDateStr)

      // Cleanup
      await paymentSchedulesService.delete(testActivityPricingId)
    })
  })
})
