/**
 * Integration Tests: Activity Duplicate
 *
 * Tests the duplicate activity functionality:
 * - Creates new activity with new ID
 * - Appends " (Copy)" to name
 * - Sets sequenceOrder at end of day
 * - Copies all relevant fields (pricing, metadata, etc.)
 * - Rejects cross-day mismatches
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { TripsModule } from '../trips.module'
import { ActivitiesService } from '../activities.service'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

const { trips, contacts, itineraries, itineraryDays, flightDetails, activityPricing } = schema

describe('Activity Duplicate (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let activitiesService: ActivitiesService

  // Test data IDs
  let testContactId: string
  let testTripId: string
  let testItineraryId: string
  let testDayId1: string
  let testDayId2: string

  // Test agency ID for RLS
  const testAgencyId = '11111111-1111-1111-1111-111111111111'

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
    activitiesService = moduleFixture.get<ActivitiesService>(ActivitiesService)

    const db = getDb()

    // Create test contact (using unique email to avoid conflicts)
    const [contact] = await db
      .insert(contacts)
      .values({
        agencyId: testAgencyId,
        firstName: 'Duplicate',
        lastName: 'Tester',
        email: `duplicate-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create test trip
    const [trip] = await db
      .insert(trips)
      .values({
        agencyId: testAgencyId,
        name: 'Duplicate Test Trip',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001',
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    // Create itinerary
    const [itinerary] = await db
      .insert(itineraries)
      .values({
        agencyId: testAgencyId,
        tripId: testTripId,
        name: 'Test Itinerary',
        status: 'draft',
      })
      .returning()

    if (!itinerary) throw new Error('Failed to create test itinerary')
    testItineraryId = itinerary.id

    // Create two days
    const [day1] = await db
      .insert(itineraryDays)
      .values({
        agencyId: testAgencyId,
        itineraryId: testItineraryId,
        dayNumber: 1,
        date: '2025-01-01',
      })
      .returning()

    if (!day1) throw new Error('Failed to create test day 1')
    testDayId1 = day1.id

    const [day2] = await db
      .insert(itineraryDays)
      .values({
        agencyId: testAgencyId,
        itineraryId: testItineraryId,
        dayNumber: 2,
        date: '2025-01-02',
      })
      .returning()

    if (!day2) throw new Error('Failed to create test day 2')
    testDayId2 = day2.id
  })

  afterAll(async () => {
    const db = getDb()

    // Clean up in reverse order
    await db.delete(itineraryDays).where(eq(itineraryDays.id, testDayId1))
    await db.delete(itineraryDays).where(eq(itineraryDays.id, testDayId2))
    await db.delete(itineraries).where(eq(itineraries.id, testItineraryId))
    await db.delete(trips).where(eq(trips.id, testTripId))
    await db.delete(contacts).where(eq(contacts.id, testContactId))

    await app.close()
  })

  describe('Successful duplication', () => {
    it('should create a new activity with a new ID', async () => {
      // Create source activity
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Original Activity',
      })

      // Duplicate it
      const duplicate = await activitiesService.duplicate(testDayId1, source.id)

      // Verify new ID
      expect(duplicate.id).not.toBe(source.id)
      expect(duplicate.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )

      // Cleanup
      await activitiesService.remove(source.id)
      await activitiesService.remove(duplicate.id)
    })

    it('should append " (Copy)" to the name', async () => {
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Test Activity',
      })

      const duplicate = await activitiesService.duplicate(testDayId1, source.id)

      expect(duplicate.name).toBe('Test Activity (Copy)')

      // Cleanup
      await activitiesService.remove(source.id)
      await activitiesService.remove(duplicate.id)
    })

    it('should set sequenceOrder at end of day', async () => {
      // Create multiple activities
      const activity1 = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'First Activity',
      })

      const activity2 = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Second Activity',
      })

      // Duplicate the first activity
      const duplicate = await activitiesService.duplicate(testDayId1, activity1.id)

      // Verify sequenceOrder is at end (after activity2)
      expect(duplicate.sequenceOrder).toBeGreaterThan(activity2.sequenceOrder)

      // Cleanup
      await activitiesService.remove(activity1.id)
      await activitiesService.remove(activity2.id)
      await activitiesService.remove(duplicate.id)
    })

    it('should copy all relevant fields', async () => {
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Full Activity',
        description: 'Test description',
        location: 'Test Location',
        address: '123 Test Street',
        confirmationNumber: 'CONF123',
        status: 'confirmed',
        pricingType: 'per_person',
        currency: 'CAD',
        notes: 'Test notes',
        startDatetime: '2025-01-01T10:00:00Z',
        endDatetime: '2025-01-01T14:00:00Z',
      })

      const duplicate = await activitiesService.duplicate(testDayId1, source.id)

      // Verify all copied fields
      expect(duplicate.description).toBe(source.description)
      expect(duplicate.location).toBe(source.location)
      expect(duplicate.address).toBe(source.address)
      expect(duplicate.confirmationNumber).toBe(source.confirmationNumber)
      expect(duplicate.status).toBe(source.status)
      expect(duplicate.pricingType).toBe(source.pricingType)
      expect(duplicate.currency).toBe(source.currency)
      expect(duplicate.notes).toBe(source.notes)
      expect(duplicate.startDatetime).toBe(source.startDatetime)
      expect(duplicate.endDatetime).toBe(source.endDatetime)
      expect(duplicate.activityType).toBe(source.activityType)
      expect(duplicate.itineraryDayId).toBe(source.itineraryDayId)

      // Cleanup
      await activitiesService.remove(source.id)
      await activitiesService.remove(duplicate.id)
    })

    it('should generate new timestamps', async () => {
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Timestamp Activity',
      })

      // Wait a small amount to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))

      const duplicate = await activitiesService.duplicate(testDayId1, source.id)

      // Timestamps should be new (equal or later than source)
      expect(new Date(duplicate.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(source.createdAt).getTime()
      )

      // Cleanup
      await activitiesService.remove(source.id)
      await activitiesService.remove(duplicate.id)
    })
  })

  describe('Validation guards', () => {
    it('should reject duplicate when activity does not belong to specified dayId', async () => {
      // Create activity on day 1
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Day 1 Activity',
      })

      // Try to duplicate with day 2's ID (cross-day mismatch)
      await expect(activitiesService.duplicate(testDayId2, source.id)).rejects.toThrow(
        /does not belong to day/
      )

      // Cleanup
      await activitiesService.remove(source.id)
    })

    it('should reject duplicate when activity does not exist', async () => {
      const fakeActivityId = '00000000-0000-0000-0000-000000000000'

      await expect(activitiesService.duplicate(testDayId1, fakeActivityId)).rejects.toThrow()
    })

    it('should reject duplicate when dayId is from a different trip (cross-trip guard)', async () => {
      const db = getDb()

      // Create a second trip with its own itinerary and day
      const [trip2] = await db
        .insert(trips)
        .values({
          agencyId: testAgencyId,
          name: 'Second Trip',
          status: 'planning',
          primaryContactId: testContactId,
          currency: 'CAD',
          ownerId: '00000000-0000-0000-0000-000000000002',
        })
        .returning()

      const [itinerary2] = await db
        .insert(itineraries)
        .values({
          agencyId: testAgencyId,
          tripId: trip2!.id,
          name: 'Second Itinerary',
          status: 'draft',
        })
        .returning()

      const [day2Trip2] = await db
        .insert(itineraryDays)
        .values({
          agencyId: testAgencyId,
          itineraryId: itinerary2!.id,
          dayNumber: 1,
          date: '2025-02-01',
        })
        .returning()

      // Create activity on trip 1, day 1
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Trip 1 Activity',
      })

      // Try to duplicate using day from trip 2 (cross-trip attempt)
      await expect(
        activitiesService.duplicate(day2Trip2!.id, source.id)
      ).rejects.toThrow(/does not belong to day/)

      // Cleanup
      await activitiesService.remove(source.id)
      await db.delete(itineraryDays).where(eq(itineraryDays.id, day2Trip2!.id))
      await db.delete(itineraries).where(eq(itineraries.id, itinerary2!.id))
      await db.delete(trips).where(eq(trips.id, trip2!.id))
    })
  })

  describe('Deep copy (detail tables and pricing)', () => {
    it('should copy flight_details when duplicating a flight activity', async () => {
      const db = getDb()

      // Create a flight activity
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'flight',
        name: 'Test Flight',
      })

      // Insert flight details for the source activity
      await db.insert(flightDetails).values({
        activityId: source.id,
        airline: 'Air Canada',
        flightNumber: 'AC123',
        departureAirportCode: 'YYZ',
        departureDate: '2025-01-15',
        departureTime: '10:00',
        departureTimezone: 'America/Toronto',
        arrivalAirportCode: 'YVR',
        arrivalDate: '2025-01-15',
        arrivalTime: '12:30',
        arrivalTimezone: 'America/Vancouver',
      })

      // Duplicate the activity
      const duplicate = await activitiesService.duplicate(testDayId1, source.id)

      // Verify flight details were copied
      const [duplicateFlightDetails] = await db
        .select()
        .from(flightDetails)
        .where(eq(flightDetails.activityId, duplicate.id))

      expect(duplicateFlightDetails).toBeDefined()
      expect(duplicateFlightDetails!.airline).toBe('Air Canada')
      expect(duplicateFlightDetails!.flightNumber).toBe('AC123')
      expect(duplicateFlightDetails!.departureAirportCode).toBe('YYZ')
      expect(duplicateFlightDetails!.arrivalAirportCode).toBe('YVR')
      expect(duplicateFlightDetails!.departureTimezone).toBe('America/Toronto')

      // Cleanup
      await db.delete(flightDetails).where(eq(flightDetails.activityId, source.id))
      await db.delete(flightDetails).where(eq(flightDetails.activityId, duplicate.id))
      await activitiesService.remove(source.id)
      await activitiesService.remove(duplicate.id)
    })

    it('should copy activity_pricing when duplicating an activity with pricing', async () => {
      const db = getDb()

      // Create an activity
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Priced Activity',
      })

      // Update pricing for the source activity (auto-created by create())
      await db.update(activityPricing)
        .set({
          pricingType: 'per_person',
          basePrice: '100.00',
          currency: 'CAD',
          totalPriceCents: 11500,
          taxesAndFeesCents: 1500,
          commissionTotalCents: 1000,
        })
        .where(eq(activityPricing.activityId, source.id))

      // Duplicate the activity
      const duplicate = await activitiesService.duplicate(testDayId1, source.id)

      // Verify pricing was copied
      const [duplicatePricing] = await db
        .select()
        .from(activityPricing)
        .where(eq(activityPricing.activityId, duplicate.id))

      expect(duplicatePricing).toBeDefined()
      expect(duplicatePricing!.pricingType).toBe('per_person')
      expect(duplicatePricing!.currency).toBe('CAD')
      expect(duplicatePricing!.basePrice).toBe('100.00')
      expect(duplicatePricing!.totalPriceCents).toBe(11500)
      expect(duplicatePricing!.taxesAndFeesCents).toBe(1500)
      expect(duplicatePricing!.commissionTotalCents).toBe(1000)

      // Cleanup
      await db.delete(activityPricing).where(eq(activityPricing.activityId, source.id))
      await db.delete(activityPricing).where(eq(activityPricing.activityId, duplicate.id))
      await activitiesService.remove(source.id)
      await activitiesService.remove(duplicate.id)
    })

    it('should not fail when duplicating activity without detail table or pricing', async () => {
      // Create a simple activity without details or pricing
      const source = await activitiesService.create({
        itineraryDayId: testDayId1,
        activityType: 'tour',
        name: 'Simple Activity',
      })

      // Duplicate should succeed without errors
      const duplicate = await activitiesService.duplicate(testDayId1, source.id)

      expect(duplicate.id).not.toBe(source.id)
      expect(duplicate.name).toBe('Simple Activity (Copy)')

      // Cleanup
      await activitiesService.remove(source.id)
      await activitiesService.remove(duplicate.id)
    })
  })
})
