/**
 * Integration Tests: Financial Summary
 *
 * Tests the financial summary calculations including:
 * - Grand total calculations
 * - Per-traveller breakdown
 * - Activity cost aggregation
 * - Service fee aggregation
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { FinancialsModule } from '../financials.module'
import { FinancialSummaryService } from '../financial-summary.service'
import { ServiceFeesService } from '../service-fees.service'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

const { trips, contacts, tripTravelers } = schema

describe('Financial Summary (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let financialSummaryService: FinancialSummaryService
  let serviceFeesService: ServiceFeesService
  let testTripId: string
  let testContactId: string
  let testTravellerId: string

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
    financialSummaryService = moduleFixture.get<FinancialSummaryService>(FinancialSummaryService)
    serviceFeesService = moduleFixture.get<ServiceFeesService>(ServiceFeesService)

    const db = getDb()

    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // Tests should create their own data and clean up after themselves.

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'Summary',
        lastName: 'Tester',
        email: `summary-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create test trip
    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Financial Summary Test Trip',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001', // Test owner ID
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    // Create test traveller
    const [traveller] = await db
      .insert(tripTravelers)
      .values({
        tripId: testTripId,
        contactId: testContactId,
        isPrimaryTraveler: true,
      })
      .returning()

    if (!traveller) throw new Error('Failed to create test traveller')
    testTravellerId = traveller.id
  })

  afterAll(async () => {
    const db = getDb()

    // Clean up test data in correct order (foreign key constraints)
    await db.delete(schema.serviceFees).where(eq(schema.serviceFees.tripId, testTripId))
    await db.delete(tripTravelers).where(eq(tripTravelers.id, testTravellerId))
    await db.delete(trips).where(eq(trips.id, testTripId))
    await db.delete(contacts).where(eq(contacts.id, testContactId))

    await app.close()
  })

  describe('Empty Trip Summary', () => {
    it('should return zero totals for trip with no costs', async () => {
      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      expect(summary).toBeDefined()
      expect(summary.grandTotal.totalCostCents).toBe(0)
      expect(summary.grandTotal.totalCollectedCents).toBe(0)
      expect(summary.grandTotal.outstandingCents).toBe(0)
    })

    it('should return trip currency', async () => {
      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      expect(summary.tripCurrency).toBe('CAD')
    })

    it('should include traveller breakdown', async () => {
      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      expect(summary.travellerBreakdown).toBeDefined()
      expect(Array.isArray(summary.travellerBreakdown)).toBe(true)
    })
  })

  describe('Service Fee Aggregation', () => {
    beforeAll(async () => {
      // Create a paid service fee
      const fee = await serviceFeesService.createServiceFee(testTripId, {
        title: 'Test Planning Fee',
        amountCents: 15000, // $150.00 CAD
        currency: 'CAD',
      })
      await serviceFeesService.sendServiceFee(fee.id)
      await serviceFeesService.markAsPaid(fee.id)
    })

    it('should include paid service fees in collected total', async () => {
      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      expect(summary.serviceFeesSummary.totalInTripCurrencyCents).toBeGreaterThanOrEqual(15000)
      expect(summary.grandTotal.totalCollectedCents).toBeGreaterThanOrEqual(15000)
    })

    it('should include pending service fees in outstanding total', async () => {
      // Create unpaid fee
      await serviceFeesService.createServiceFee(testTripId, {
        title: 'Unpaid Booking Fee',
        amountCents: 25000,
        currency: 'CAD',
      })

      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      expect(summary.grandTotal.outstandingCents).toBeGreaterThanOrEqual(25000)
    })
  })

  describe('Summary Calculations', () => {
    it('should calculate outstanding = total - collected', async () => {
      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      const expectedOutstanding =
        summary.grandTotal.totalCostCents - summary.grandTotal.totalCollectedCents

      expect(summary.grandTotal.outstandingCents).toBe(expectedOutstanding)
    })
  })

  describe('Activity Cost Aggregation from activity_pricing', () => {
    let testItineraryId: string
    let testDayId: string
    let testActivityId: string

    beforeAll(async () => {
      const db = getDb()

      // Create itinerary for the trip
      const [itinerary] = await db
        .insert(schema.itineraries)
        .values({
          tripId: testTripId,
          name: 'Test Itinerary',
        })
        .returning()
      if (!itinerary) throw new Error('Failed to create test itinerary')
      testItineraryId = itinerary.id

      // Create itinerary day
      const [day] = await db
        .insert(schema.itineraryDays)
        .values({
          itineraryId: testItineraryId,
          dayNumber: 1,
          date: '2025-01-01',
        })
        .returning()
      if (!day) throw new Error('Failed to create test day')
      testDayId = day.id

      // Create activity without estimated_cost (legacy field)
      const [activity] = await db
        .insert(schema.itineraryActivities)
        .values({
          itineraryDayId: testDayId,
          name: 'Test Hotel',
          activityType: 'lodging',
          componentType: 'lodging',
          estimatedCost: null, // Legacy field is NULL
          currency: 'CAD',
        })
        .returning()
      if (!activity) throw new Error('Failed to create test activity')
      testActivityId = activity.id

      // Create activity_pricing with correct price (authoritative source)
      await db.insert(schema.activityPricing).values({
        activityId: testActivityId,
        pricingType: 'per_room',
        basePrice: '550.00',
        totalPriceCents: 55000, // $550.00 CAD
        currency: 'CAD',
      })
    })

    afterAll(async () => {
      const db = getDb()
      // Clean up in reverse order of creation
      await db.delete(schema.activityPricing).where(eq(schema.activityPricing.activityId, testActivityId))
      await db.delete(schema.itineraryActivities).where(eq(schema.itineraryActivities.id, testActivityId))
      await db.delete(schema.itineraryDays).where(eq(schema.itineraryDays.id, testDayId))
      await db.delete(schema.itineraries).where(eq(schema.itineraries.id, testItineraryId))
    })

    it('should read cost from activity_pricing.totalPriceCents, not itinerary_activities.estimatedCost', async () => {
      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      // Should include $550.00 (55000 cents) from activity_pricing
      // NOT $0 from the NULL estimated_cost
      expect(summary.activitiesSummary.totalCents).toBeGreaterThanOrEqual(55000)
      expect(summary.activitiesSummary.byActivity.length).toBeGreaterThanOrEqual(1)

      const hotelActivity = summary.activitiesSummary.byActivity.find(
        (a) => a.activityName === 'Test Hotel'
      )
      expect(hotelActivity).toBeDefined()
      expect(hotelActivity?.totalCostCents).toBe(55000)
    })

    it('should gracefully handle activity without pricing row', async () => {
      const db = getDb()

      // Create activity WITHOUT pricing row
      const [noPricingActivity] = await db
        .insert(schema.itineraryActivities)
        .values({
          itineraryDayId: testDayId,
          name: 'No Pricing Activity',
          activityType: 'tour',
          componentType: 'tour',
          estimatedCost: null,
          currency: 'CAD',
        })
        .returning()

      try {
        // Should not throw - should return $0 for this activity
        const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

        const noPricingResult = summary.activitiesSummary.byActivity.find(
          (a) => a.activityName === 'No Pricing Activity'
        )
        expect(noPricingResult).toBeDefined()
        expect(noPricingResult?.totalCostCents).toBe(0)
      } finally {
        await db.delete(schema.itineraryActivities).where(
          eq(schema.itineraryActivities.id, noPricingActivity!.id)
        )
      }
    })
  })

  describe('Exchange Rate Snapshot Preference', () => {
    let snapshotFeeId: string

    beforeAll(async () => {
      const db = getDb()

      // Create a service fee with a snapshotted exchange rate (USD fee on CAD trip)
      const [fee] = await db
        .insert(schema.serviceFees)
        .values({
          tripId: testTripId,
          title: 'USD Fee with Snapshot',
          amountCents: 10000, // $100 USD
          currency: 'USD',
          status: 'paid',
          // Simulate a historical snapshot: 1 USD = 1.35 CAD
          exchangeRateToTripCurrency: '1.35',
          amountInTripCurrencyCents: 13500, // $135 CAD
          paidAt: new Date(),
        })
        .returning()

      if (!fee) throw new Error('Failed to create snapshot test fee')
      snapshotFeeId = fee.id
    })

    afterAll(async () => {
      const db = getDb()
      await db.delete(schema.serviceFees).where(eq(schema.serviceFees.id, snapshotFeeId))
    })

    it('should use amountInTripCurrencyCents when available', async () => {
      const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

      // The USD fee should be converted using the snapshot (13500 cents = $135 CAD)
      // Not the live rate which would be different
      const usdFeeInSummary = summary.serviceFeesSummary.byStatus.paid

      // Should include our snapshotted amount
      expect(usdFeeInSummary).toBeGreaterThanOrEqual(13500)
    })

    it('should use exchangeRateToTripCurrency when amountInTripCurrencyCents is missing', async () => {
      const db = getDb()

      // Create fee with only exchange rate snapshot (no pre-computed amount)
      const [fee] = await db
        .insert(schema.serviceFees)
        .values({
          tripId: testTripId,
          title: 'USD Fee with Rate Only',
          amountCents: 5000, // $50 USD
          currency: 'USD',
          status: 'draft',
          exchangeRateToTripCurrency: '1.40', // 1 USD = 1.40 CAD
          // amountInTripCurrencyCents is null - should use rate * amount
        })
        .returning()

      try {
        const summary = await financialSummaryService.getTripFinancialSummary(testTripId)

        // The fee should be converted: 5000 * 1.40 = 7000 cents ($70 CAD)
        expect(summary.serviceFeesSummary.byStatus.draft).toBeGreaterThanOrEqual(7000)
      } finally {
        await db.delete(schema.serviceFees).where(eq(schema.serviceFees.id, fee!.id))
      }
    })
  })
})
