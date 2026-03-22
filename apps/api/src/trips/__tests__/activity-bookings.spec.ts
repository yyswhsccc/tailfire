/**
 * Integration Tests: Activity Bookings API
 *
 * Tests the /bookings/activities endpoints:
 * - List defaults to isBooked=true when query param is omitted
 * - Mark/unmark respects package guard
 * - Payment schedule missing flag is correctly computed
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { TripsModule } from '../trips.module'
import { schema } from '@tailfire/database'

const { trips, contacts, itineraries, itineraryDays, itineraryActivities, packages } = schema

describe('Activity Bookings API (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let testTripId: string
  let testContactId: string
  let testItineraryId: string
  let testDayId: string
  let bookedActivityId: string
  let unbookedActivityId: string

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
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      })
    )
    await app.init()

    dbService = moduleFixture.get<DatabaseService>(DatabaseService)
  })

  beforeEach(async () => {
    const db = getDb()

    // Create fresh test data for each test
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'ActivityBookings',
        lastName: 'Tester',
        email: `activity-bookings-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Activity Bookings Test Trip',
        primaryContactId: testContactId,
        ownerId: testContactId,
        status: 'planning',
        currency: 'CAD',
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    const [itinerary] = await db
      .insert(itineraries)
      .values({
        tripId: testTripId,
        name: 'Test Itinerary',
        isSelected: true,
      })
      .returning()

    if (!itinerary) throw new Error('Failed to create test itinerary')
    testItineraryId = itinerary.id

    const [day] = await db
      .insert(itineraryDays)
      .values({
        itineraryId: testItineraryId,
        dayNumber: 1,
        date: '2024-12-18',
      })
      .returning()

    if (!day) throw new Error('Failed to create test day')
    testDayId = day.id

    // Create a booked activity
    const [bookedActivity] = await db
      .insert(itineraryActivities)
      .values({
        itineraryDayId: testDayId,
        activityType: 'tour',
        componentType: 'tour',
        name: 'Booked Tour',
        sequenceOrder: 1,
        isBooked: true,
        bookingDate: new Date('2024-12-15'),
      })
      .returning()

    if (!bookedActivity) throw new Error('Failed to create booked activity')
    bookedActivityId = bookedActivity.id

    // Create an unbooked activity
    const [unbookedActivity] = await db
      .insert(itineraryActivities)
      .values({
        itineraryDayId: testDayId,
        activityType: 'tour',
        componentType: 'tour',
        name: 'Unbooked Tour',
        sequenceOrder: 2,
        isBooked: false,
      })
      .returning()

    if (!unbookedActivity) throw new Error('Failed to create unbooked activity')
    unbookedActivityId = unbookedActivity.id
  })

  afterEach(async () => {
    const db = getDb()
    // Clean up in reverse order of dependencies
    if (testTripId) {
      // Cascade delete handles activities, days, itineraries
      await db.delete(trips).where(eq(trips.id, testTripId))
    }
    if (testContactId) {
      await db.delete(contacts).where(eq(contacts.id, testContactId))
    }
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /bookings/activities', () => {
    it('should default to isBooked=true when query param is omitted', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/activities')
        .query({ tripId: testTripId })
        .expect(200)

      // Should only return booked activities
      expect(response.body.activities).toHaveLength(1)
      expect(response.body.activities[0].id).toBe(bookedActivityId)
      expect(response.body.activities[0].isBooked).toBe(true)
      expect(response.body.total).toBe(1)
    })

    it('should return unbooked activities when isBooked=false', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/activities')
        .query({ tripId: testTripId, isBooked: 'false' })
        .expect(200)

      // Should only return unbooked activities
      expect(response.body.activities).toHaveLength(1)
      expect(response.body.activities[0].id).toBe(unbookedActivityId)
      expect(response.body.activities[0].isBooked).toBe(false)
    })

    it('should return booked activities when isBooked=true explicitly', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/activities')
        .query({ tripId: testTripId, isBooked: 'true' })
        .expect(200)

      expect(response.body.activities).toHaveLength(1)
      expect(response.body.activities[0].id).toBe(bookedActivityId)
    })

    it('should require tripId parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/activities')
        .expect(400)

      // message is an array of validation errors
      const messages = Array.isArray(response.body.message)
        ? response.body.message
        : [response.body.message]
      expect(messages.some((msg: string) => msg.includes('tripId'))).toBe(true)
    })

    it('should return empty array for trip with no matching activities', async () => {
      // Create a new trip with no activities
      const db = getDb()
      const [emptyTrip] = await db
        .insert(trips)
        .values({
          name: 'Empty Trip',
          primaryContactId: testContactId,
          ownerId: testContactId,
          status: 'planning',
          currency: 'CAD',
        })
        .returning()

      const response = await request(app.getHttpServer())
        .get('/bookings/activities')
        .query({ tripId: emptyTrip!.id })
        .expect(200)

      expect(response.body.activities).toHaveLength(0)
      expect(response.body.total).toBe(0)

      // Cleanup
      await db.delete(trips).where(eq(trips.id, emptyTrip!.id))
    })
  })

  describe('POST /bookings/activities/:activityId/mark', () => {
    it('should mark an unbooked activity as booked', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bookings/activities/${unbookedActivityId}/mark`)
        .send({ bookingDate: '2024-12-18' })
        .expect(200)

      expect(response.body.id).toBe(unbookedActivityId)
      expect(response.body.isBooked).toBe(true)
      expect(response.body.bookingDate).toBe('2024-12-18')
      expect(response.body.bookable).toBe(true)
      expect(response.body.blockedReason).toBeNull()
    })

    it('should default bookingDate to today when not provided', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bookings/activities/${unbookedActivityId}/mark`)
        .send({})
        .expect(200)

      const today = new Date().toISOString().split('T')[0]
      expect(response.body.bookingDate).toBe(today)
    })

    it('should return 404 for non-existent activity', async () => {
      await request(app.getHttpServer())
        .post('/bookings/activities/00000000-0000-0000-0000-000000000000/mark')
        .send({})
        .expect(404)
    })

    it('should include paymentScheduleMissing flag', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bookings/activities/${unbookedActivityId}/mark`)
        .send({})
        .expect(200)

      // Activity has no pricing/schedule configured, so flag should be true
      expect(response.body.paymentScheduleMissing).toBe(true)
    })
  })

  describe('POST /bookings/activities/:activityId/unmark', () => {
    it('should remove booking status from a booked activity', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bookings/activities/${bookedActivityId}/unmark`)
        .expect(200)

      expect(response.body.id).toBe(bookedActivityId)
      expect(response.body.isBooked).toBe(false)
      expect(response.body.bookingDate).toBeNull()
    })
  })

  describe('Package Guard', () => {
    let testPackageId: string
    let standaloneActivityId: string
    let childActivityId: string

    beforeEach(async () => {
      const db = getDb()

      // Create a package record (this is the "booking wrapper" for grouped activities)
      const [pkg] = await db
        .insert(packages)
        .values({
          tripId: testTripId,
          name: 'Test Package',
        })
        .returning()

      if (!pkg) throw new Error('Failed to create test package')
      testPackageId = pkg.id

      // Create a standalone activity (no packageId - can be booked individually)
      const [standaloneActivity] = await db
        .insert(itineraryActivities)
        .values({
          itineraryDayId: testDayId,
          activityType: 'custom_cruise',
          componentType: 'custom_cruise',
          name: 'Standalone Custom Cruise',
          sequenceOrder: 3,
          isBooked: false,
        })
        .returning()

      if (!standaloneActivity) throw new Error('Failed to create standalone activity')
      standaloneActivityId = standaloneActivity.id

      // Create a child activity linked to the package
      const [childActivity] = await db
        .insert(itineraryActivities)
        .values({
          itineraryDayId: testDayId,
          activityType: 'tour',
          componentType: 'tour',
          name: 'Child Tour (in package)',
          sequenceOrder: 4,
          isBooked: false,
          packageId: testPackageId,
        })
        .returning()

      if (!childActivity) throw new Error('Failed to create child activity')
      childActivityId = childActivity.id
    })

    it('should block marking a packaged child activity', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bookings/activities/${childActivityId}/mark`)
        .send({})
        .expect(400)

      expect(response.body.message).toContain('linked to a package')
    })

    it('should allow marking a standalone activity (no packageId)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bookings/activities/${standaloneActivityId}/mark`)
        .send({})
        .expect(200)

      expect(response.body.isBooked).toBe(true)
    })

    it('should include child activities in list with bookable=false', async () => {
      // First mark the child as booked via direct DB update (bypassing guard)
      const db = getDb()
      await db
        .update(itineraryActivities)
        .set({ isBooked: true, bookingDate: new Date() })
        .where(eq(itineraryActivities.id, childActivityId))

      const response = await request(app.getHttpServer())
        .get('/bookings/activities')
        .query({ tripId: testTripId })
        .expect(200)

      const childInList = response.body.activities.find((a: any) => a.id === childActivityId)
      expect(childInList).toBeDefined()
      expect(childInList.bookable).toBe(false)
      expect(childInList.blockedReason).toBe('part_of_package')
    })
  })
})
