/**
 * Integration Tests: Activity Split Cleanup
 *
 * Tests that traveller splits are properly cleaned up:
 * - Deleted when activity is removed
 * - Deleted when activity moves to a different trip
 * - Preserved when activity moves between days on the same trip
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

const { trips, contacts, tripTravelers, itineraries, itineraryDays, activityTravellerSplits } = schema

describe('Activity Split Cleanup (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let activitiesService: ActivitiesService

  // Test data IDs
  let testContactId: string
  let testTripId1: string
  let testTripId2: string
  let testItineraryId1: string
  let testItineraryId2: string
  let testDayId1a: string
  let testDayId1b: string
  let testDayId2: string
  let testTravellerId: string

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

    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // Tests should create their own data and clean up after themselves.

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        agencyId: testAgencyId,
        firstName: 'Split',
        lastName: 'Tester',
        email: `split-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create first test trip
    const [trip1] = await db
      .insert(trips)
      .values({
        agencyId: testAgencyId,
        name: 'Split Test Trip 1',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001',
      })
      .returning()

    if (!trip1) throw new Error('Failed to create test trip 1')
    testTripId1 = trip1.id

    // Create second test trip
    const [trip2] = await db
      .insert(trips)
      .values({
        agencyId: testAgencyId,
        name: 'Split Test Trip 2',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001',
      })
      .returning()

    if (!trip2) throw new Error('Failed to create test trip 2')
    testTripId2 = trip2.id

    // Create traveller on trip 1
    const [traveller] = await db
      .insert(tripTravelers)
      .values({
        tripId: testTripId1,
        contactId: testContactId,
        isPrimaryTraveler: true,
      })
      .returning()

    if (!traveller) throw new Error('Failed to create test traveller')
    testTravellerId = traveller.id

    // Create itinerary for trip 1
    const [itinerary1] = await db
      .insert(itineraries)
      .values({
        agencyId: testAgencyId,
        tripId: testTripId1,
        name: 'Test Itinerary 1',
        status: 'draft',
      })
      .returning()

    if (!itinerary1) throw new Error('Failed to create test itinerary 1')
    testItineraryId1 = itinerary1.id

    // Create itinerary for trip 2
    const [itinerary2] = await db
      .insert(itineraries)
      .values({
        agencyId: testAgencyId,
        tripId: testTripId2,
        name: 'Test Itinerary 2',
        status: 'draft',
      })
      .returning()

    if (!itinerary2) throw new Error('Failed to create test itinerary 2')
    testItineraryId2 = itinerary2.id

    // Create two days on trip 1's itinerary
    const [day1a] = await db
      .insert(itineraryDays)
      .values({
        agencyId: testAgencyId,
        itineraryId: testItineraryId1,
        dayNumber: 1,
        date: '2025-01-01',
      })
      .returning()

    if (!day1a) throw new Error('Failed to create test day 1a')
    testDayId1a = day1a.id

    const [day1b] = await db
      .insert(itineraryDays)
      .values({
        agencyId: testAgencyId,
        itineraryId: testItineraryId1,
        dayNumber: 2,
        date: '2025-01-02',
      })
      .returning()

    if (!day1b) throw new Error('Failed to create test day 1b')
    testDayId1b = day1b.id

    // Create day on trip 2's itinerary
    const [day2] = await db
      .insert(itineraryDays)
      .values({
        agencyId: testAgencyId,
        itineraryId: testItineraryId2,
        dayNumber: 1,
        date: '2025-02-01',
      })
      .returning()

    if (!day2) throw new Error('Failed to create test day 2')
    testDayId2 = day2.id
  })

  afterAll(async () => {
    const db = getDb()

    // Clean up in reverse order of creation (foreign key constraints)
    await db.delete(itineraryDays).where(eq(itineraryDays.id, testDayId1a))
    await db.delete(itineraryDays).where(eq(itineraryDays.id, testDayId1b))
    await db.delete(itineraryDays).where(eq(itineraryDays.id, testDayId2))
    await db.delete(itineraries).where(eq(itineraries.id, testItineraryId1))
    await db.delete(itineraries).where(eq(itineraries.id, testItineraryId2))
    await db.delete(tripTravelers).where(eq(tripTravelers.id, testTravellerId))
    await db.delete(trips).where(eq(trips.id, testTripId1))
    await db.delete(trips).where(eq(trips.id, testTripId2))
    await db.delete(contacts).where(eq(contacts.id, testContactId))

    await app.close()
  })

  describe('Splits removed on activity delete', () => {
    it('should remove traveller splits when activity is deleted', async () => {
      const db = getDb()

      // Create an activity
      const activity = await activitiesService.create({
        itineraryDayId: testDayId1a,
        activityType: 'tour',
        name: 'Test Activity for Delete',
        currency: 'CAD',
      })

      // Create a split for this activity
      await db.insert(activityTravellerSplits).values({
        tripId: testTripId1,
        activityId: activity.id,
        travellerId: testTravellerId,
        splitType: 'custom',
        amountCents: 10000,
        currency: 'CAD',
      })

      // Verify split exists
      const [splitBefore] = await db
        .select()
        .from(activityTravellerSplits)
        .where(eq(activityTravellerSplits.activityId, activity.id))

      expect(splitBefore).toBeDefined()

      // Delete the activity
      await activitiesService.remove(activity.id)

      // Verify splits are removed
      const [splitAfter] = await db
        .select()
        .from(activityTravellerSplits)
        .where(eq(activityTravellerSplits.activityId, activity.id))

      expect(splitAfter).toBeUndefined()
    })
  })

  describe('Splits removed on cross-trip move', () => {
    it('should remove traveller splits when activity moves to a different trip', async () => {
      const db = getDb()

      // Create an activity on trip 1
      const activity = await activitiesService.create({
        itineraryDayId: testDayId1a,
        activityType: 'tour',
        name: 'Test Activity for Cross-Trip Move',
        currency: 'CAD',
      })

      // Create a split for this activity
      await db.insert(activityTravellerSplits).values({
        tripId: testTripId1,
        activityId: activity.id,
        travellerId: testTravellerId,
        splitType: 'equal',
        amountCents: 20000,
        currency: 'CAD',
      })

      // Verify split exists
      const [splitBefore] = await db
        .select()
        .from(activityTravellerSplits)
        .where(eq(activityTravellerSplits.activityId, activity.id))

      expect(splitBefore).toBeDefined()

      // Move activity to trip 2
      await activitiesService.move(activity.id, { targetDayId: testDayId2 })

      // Verify splits are removed (they belong to trip 1's travellers)
      const [splitAfter] = await db
        .select()
        .from(activityTravellerSplits)
        .where(eq(activityTravellerSplits.activityId, activity.id))

      expect(splitAfter).toBeUndefined()

      // Cleanup: delete the activity from trip 2
      await activitiesService.remove(activity.id)
    })
  })

  describe('Splits preserved on same-trip move', () => {
    it('should preserve traveller splits when activity moves to a different day on the same trip', async () => {
      const db = getDb()

      // Create an activity on day 1a of trip 1
      const activity = await activitiesService.create({
        itineraryDayId: testDayId1a,
        activityType: 'tour',
        name: 'Test Activity for Same-Trip Move',
        currency: 'CAD',
      })

      // Create a split for this activity
      await db.insert(activityTravellerSplits).values({
        tripId: testTripId1,
        activityId: activity.id,
        travellerId: testTravellerId,
        splitType: 'custom',
        amountCents: 15000,
        currency: 'CAD',
      })

      // Verify split exists
      const [splitBefore] = await db
        .select()
        .from(activityTravellerSplits)
        .where(eq(activityTravellerSplits.activityId, activity.id))

      expect(splitBefore).toBeDefined()
      expect(splitBefore?.amountCents).toBe(15000)

      // Move activity to day 1b (same trip, different day)
      await activitiesService.move(activity.id, { targetDayId: testDayId1b })

      // Verify splits are preserved
      const [splitAfter] = await db
        .select()
        .from(activityTravellerSplits)
        .where(eq(activityTravellerSplits.activityId, activity.id))

      expect(splitAfter).toBeDefined()
      expect(splitAfter?.amountCents).toBe(15000)
      expect(splitAfter?.travellerId).toBe(testTravellerId)

      // Cleanup: delete the activity
      await activitiesService.remove(activity.id)
    })
  })
})
