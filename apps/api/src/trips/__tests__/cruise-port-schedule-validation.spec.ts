/**
 * Integration Tests: Cruise Port Schedule Validation
 *
 * Tests the validation logic for generate-port-schedule endpoint:
 * - Validates UUID format for itineraryId
 * - Validates date format (YYYY-MM-DD)
 * - Validates date ordering (arrivalDate >= departureDate)
 * - Validates portCallsJson is an array
 * - Validates itinerary ownership (cruise belongs to provided itineraryId)
 * - Validates skipDelete behavior (ignored if existing children)
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { TripsModule } from '../trips.module'
import { ComponentOrchestrationService } from '../component-orchestration.service'
import { ActivitiesService } from '../activities.service'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

const { trips, contacts, itineraries, itineraryDays, itineraryActivities, customCruiseDetails } = schema

describe('Cruise Port Schedule Validation (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let orchestrationService: ComponentOrchestrationService
  let activitiesService: ActivitiesService

  // Test data IDs
  let testContactId: string
  let testTripId: string
  let testItineraryId: string
  let testItineraryId2: string
  let testDayId: string
  let testCruiseId: string

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
    orchestrationService = moduleFixture.get<ComponentOrchestrationService>(ComponentOrchestrationService)
    activitiesService = moduleFixture.get<ActivitiesService>(ActivitiesService)

    const db = getDb()

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'Cruise',
        lastName: 'Validator',
        email: `cruise-validation-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create test trip
    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Cruise Validation Test Trip',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001',
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    // Create first itinerary
    const [itinerary] = await db
      .insert(itineraries)
      .values({
        tripId: testTripId,
        name: 'Test Itinerary 1',
        status: 'draft',
      })
      .returning()

    if (!itinerary) throw new Error('Failed to create test itinerary')
    testItineraryId = itinerary.id

    // Create second itinerary (for ownership mismatch testing)
    const [itinerary2] = await db
      .insert(itineraries)
      .values({
        tripId: testTripId,
        name: 'Test Itinerary 2',
        status: 'draft',
      })
      .returning()

    if (!itinerary2) throw new Error('Failed to create test itinerary 2')
    testItineraryId2 = itinerary2.id

    // Create test day
    const [day] = await db
      .insert(itineraryDays)
      .values({
        itineraryId: testItineraryId,
        date: '2025-12-08',
        dayNumber: 1,
      })
      .returning()

    if (!day) throw new Error('Failed to create test day')
    testDayId = day.id

    // Create test cruise activity
    const [cruise] = await db
      .insert(itineraryActivities)
      .values({
        itineraryDayId: testDayId,
        componentType: 'custom_cruise',
        activityType: 'custom_cruise',
        name: 'Test Cruise',
        sequenceOrder: 0,
        status: 'proposed',
      })
      .returning()

    if (!cruise) throw new Error('Failed to create test cruise')
    testCruiseId = cruise.id

    // Create cruise details
    await db.insert(customCruiseDetails).values({
      activityId: testCruiseId,
      nights: 7,
      departureDate: '2025-12-08',
      arrivalDate: '2025-12-15',
      departurePort: 'Rome',
      arrivalPort: 'Lisbon',
    })
  })

  afterAll(async () => {
    const db = getDb()

    // Clean up in reverse order of dependencies
    await db.delete(customCruiseDetails).where(eq(customCruiseDetails.activityId, testCruiseId))
    await db.delete(itineraryActivities).where(eq(itineraryActivities.itineraryDayId, testDayId))
    await db.delete(itineraryDays).where(eq(itineraryDays.itineraryId, testItineraryId))
    await db.delete(itineraryDays).where(eq(itineraryDays.itineraryId, testItineraryId2))
    await db.delete(itineraries).where(eq(itineraries.tripId, testTripId))
    await db.delete(trips).where(eq(trips.id, testTripId))
    await db.delete(contacts).where(eq(contacts.id, testContactId))

    await app.close()
  })

  describe('Ownership Validation', () => {
    it('should reject mismatched itineraryId', async () => {
      await expect(
        orchestrationService.generateCruisePortSchedule(testCruiseId, {
          itineraryId: testItineraryId2, // Wrong itinerary!
          customCruiseDetails: {
            departureDate: '2025-12-08',
            arrivalDate: '2025-12-15',
          },
        })
      ).rejects.toThrow('Provided itineraryId does not match cruise ownership')
    })

    it('should reject non-existent cruise', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      await expect(
        orchestrationService.generateCruisePortSchedule(fakeId, {
          itineraryId: testItineraryId,
          customCruiseDetails: {
            departureDate: '2025-12-08',
            arrivalDate: '2025-12-15',
          },
        })
      ).rejects.toThrow('Cruise activity not found')
    })

    it('should accept matching itineraryId', async () => {
      // This should succeed with correct ownership
      const result = await orchestrationService.generateCruisePortSchedule(testCruiseId, {
        itineraryId: testItineraryId, // Correct itinerary
        customCruiseDetails: {
          departureDate: '2025-12-08',
          arrivalDate: '2025-12-15',
          departurePort: 'Rome',
          arrivalPort: 'Lisbon',
        },
        skipDelete: true,
      })

      expect(result.created).toBeDefined()
      expect(result.created.length).toBeGreaterThan(0)

      // Clean up created port activities
      await activitiesService.deleteByParentId(testCruiseId)
    })
  })

  describe('skipDelete Safety Check', () => {
    it('should ignore skipDelete when cruise has existing children', async () => {
      // First create some port activities
      const firstResult = await orchestrationService.generateCruisePortSchedule(testCruiseId, {
        itineraryId: testItineraryId,
        customCruiseDetails: {
          departureDate: '2025-12-08',
          arrivalDate: '2025-12-10', // 3 days
          departurePort: 'Rome',
          arrivalPort: 'Naples',
        },
        skipDelete: true, // This is fine - no existing children
      })

      expect(firstResult.created.length).toBe(3)
      expect(firstResult.deleted).toBe(0)

      // Now try to regenerate with skipDelete=true - should be ignored
      const secondResult = await orchestrationService.generateCruisePortSchedule(testCruiseId, {
        itineraryId: testItineraryId,
        customCruiseDetails: {
          departureDate: '2025-12-08',
          arrivalDate: '2025-12-12', // 5 days now
          departurePort: 'Rome',
          arrivalPort: 'Lisbon',
        },
        skipDelete: true, // Should be ignored - cruise has existing children
      })

      // Should have deleted the old 3 and created new 5
      expect(secondResult.deleted).toBe(3)
      expect(secondResult.created.length).toBe(5)

      // Clean up
      await activitiesService.deleteByParentId(testCruiseId)
    })
  })

  describe('Date Validation', () => {
    it('should require departure date before or equal to arrival date', async () => {
      await expect(
        orchestrationService.generateCruisePortSchedule(testCruiseId, {
          itineraryId: testItineraryId,
          customCruiseDetails: {
            departureDate: '2025-12-15', // After arrival!
            arrivalDate: '2025-12-08',
          },
        })
      ).rejects.toThrow('Cruise arrival date must be on or after departure date')
    })

    it('should reject invalid date formats', async () => {
      await expect(
        orchestrationService.generateCruisePortSchedule(testCruiseId, {
          itineraryId: testItineraryId,
          customCruiseDetails: {
            departureDate: 'invalid-date',
            arrivalDate: '2025-12-08',
          },
        })
      ).rejects.toThrow('Invalid cruise dates')
    })
  })
})
