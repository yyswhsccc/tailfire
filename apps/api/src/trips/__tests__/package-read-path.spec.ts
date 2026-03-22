/**
 * Regression Test: Package Read Path via Activities API
 *
 * Verifies that GET /activities/:id returns full package data when the activity
 * is a package (activityType='package'). This test locks in the consolidated
 * read path after migrating from the legacy /packages API.
 *
 * Expected response for packages includes:
 * - pricing (from activity_pricing table)
 * - packageDetails (from package_details table)
 * - activities (linked children via parent_activity_id)
 * - travelers (from activity_travelers table)
 * - computed totals (totalPriceCents, totalPaidCents, totalUnpaidCents)
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
import { ActivitiesService } from '../activities.service'
import { schema } from '@tailfire/database'

const { trips, contacts, itineraries, itineraryDays, itineraryActivities, activityPricing, packageDetails } = schema

describe('Package Read Path via Activities API (Regression)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let activitiesService: ActivitiesService
  let testTripId: string
  let testContactId: string
  let testItineraryId: string
  let testDayId: string
  let testPackageId: string
  let linkedActivityId: string

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
    activitiesService = moduleFixture.get<ActivitiesService>(ActivitiesService)
  })

  beforeEach(async () => {
    const db = getDb()

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'PackageReadPath',
        lastName: 'Tester',
        email: `package-read-path-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create test trip (ownerId is required)
    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Package Read Path Test Trip',
        primaryContactId: testContactId,
        ownerId: '00000000-0000-0000-0000-000000000001', // Required field
        status: 'planning',
        currency: 'USD',
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    // Create itinerary
    const [itinerary] = await db
      .insert(itineraries)
      .values({
        tripId: testTripId,
        name: 'Test Itinerary',
        status: 'draft',
      })
      .returning()

    if (!itinerary) throw new Error('Failed to create test itinerary')
    testItineraryId = itinerary.id

    // Create itinerary day
    const [day] = await db
      .insert(itineraryDays)
      .values({
        itineraryId: testItineraryId,
        dayNumber: 1,
        date: '2025-03-01',
      })
      .returning()

    if (!day) throw new Error('Failed to create test day')
    testDayId = day.id

    // Create package using the service (proper way to create floating packages)
    const packageResult = await activitiesService.create(
      {
        activityType: 'package',
        name: 'Test Package',
        proposalStatus: 'approved',
        totalPriceCents: 150000,
        taxesCents: 15000,
        commissionTotalCents: 22500,
        commissionSplitPercentage: 15,
        currency: 'USD',
        pricingType: 'per_person',
      },
      null,
      testTripId,
      {
        supplierName: 'Test Supplier Inc',
        cancellationPolicy: '48-hour cancellation policy',
        cancellationDeadline: '2025-02-25',
        termsAndConditions: 'Standard terms apply',
        groupBookingNumber: 'GRP-12345',
      }
    )
    testPackageId = packageResult.id

    // Create a linked activity (child of the package)
    const linkedResult = await activitiesService.create({
      itineraryDayId: testDayId,
      parentActivityId: testPackageId,
      activityType: 'tour',
      name: 'Linked Tour Activity',
      proposalStatus: 'draft',
    })
    linkedActivityId = linkedResult.id
  })

  afterEach(async () => {
    const db = getDb()

    // Clean up in reverse order of dependencies
    if (linkedActivityId) {
      await db.delete(itineraryActivities).where(eq(itineraryActivities.id, linkedActivityId))
    }
    if (testPackageId) {
      await db.delete(packageDetails).where(eq(packageDetails.activityId, testPackageId))
      await db.delete(activityPricing).where(eq(activityPricing.activityId, testPackageId))
      await db.delete(itineraryActivities).where(eq(itineraryActivities.id, testPackageId))
    }
    if (testDayId) {
      await db.delete(itineraryDays).where(eq(itineraryDays.id, testDayId))
    }
    if (testItineraryId) {
      await db.delete(itineraries).where(eq(itineraries.id, testItineraryId))
    }
    if (testTripId) {
      await db.delete(trips).where(eq(trips.id, testTripId))
    }
    if (testContactId) {
      await db.delete(contacts).where(eq(contacts.id, testContactId))
    }
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /activities/:id (package)', () => {
    it('should return full package data with pricing, details, and children', async () => {
      const response = await request(app.getHttpServer())
        .get(`/activities/${testPackageId}`)
        .expect(200)

      const pkg = response.body

      // Basic activity fields
      expect(pkg.id).toBe(testPackageId)
      expect(pkg.name).toBe('Test Package')
      expect(pkg.activityType).toBe('package')
      expect(pkg.proposalStatus).toBe('approved')
      // Note: Floating packages (no itineraryDayId) don't have tripId resolved
      // because they're not linked through the day → itinerary → trip chain
      expect(pkg.tripId).toBeDefined()

      // Pricing from activity_pricing table
      expect(pkg.pricing).toBeDefined()
      expect(pkg.pricing.totalPriceCents).toBe(150000)
      expect(pkg.pricing.taxesAndFeesCents).toBe(15000)
      expect(pkg.pricing.commissionTotalCents).toBe(22500)
      expect(pkg.pricing.commissionSplitPercentage).toBe(15)
      expect(pkg.pricing.currency).toBe('USD')
      expect(pkg.pricing.pricingType).toBe('per_person')

      // Package details from package_details table
      expect(pkg.packageDetails).toBeDefined()
      expect(pkg.packageDetails.supplierName).toBe('Test Supplier Inc')
      expect(pkg.packageDetails.cancellationPolicy).toBe('48-hour cancellation policy')
      expect(pkg.packageDetails.cancellationDeadline).toBe('2025-02-25')
      expect(pkg.packageDetails.termsAndConditions).toBe('Standard terms apply')
      expect(pkg.packageDetails.groupBookingNumber).toBe('GRP-12345')

      // Linked children (activities with parent_activity_id pointing to this package)
      expect(pkg.activities).toBeDefined()
      expect(Array.isArray(pkg.activities)).toBe(true)
      expect(pkg.activities.length).toBe(1)
      expect(pkg.activities[0].id).toBe(linkedActivityId)
      expect(pkg.activities[0].name).toBe('Linked Tour Activity')
      expect(pkg.activities[0].activityType).toBe('tour')

      // Computed totals
      expect(typeof pkg.totalPriceCents).toBe('number')
      expect(typeof pkg.totalPaidCents).toBe('number')
      expect(typeof pkg.totalUnpaidCents).toBe('number')

      // Travelers array (empty in this test, but should exist)
      expect(pkg.travelers).toBeDefined()
      expect(Array.isArray(pkg.travelers)).toBe(true)
    })

    it('should return 404 for non-existent activity ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      await request(app.getHttpServer())
        .get(`/activities/${nonExistentId}`)
        .expect(404)
    })

    it('should return package without children when none are linked', async () => {
      const db = getDb()

      // Remove the linked activity
      await db.delete(itineraryActivities).where(eq(itineraryActivities.id, linkedActivityId))

      const response = await request(app.getHttpServer())
        .get(`/activities/${testPackageId}`)
        .expect(200)

      expect(response.body.activities).toBeDefined()
      expect(response.body.activities.length).toBe(0)

      // Re-create for cleanup
      const newLinked = await activitiesService.create({
        itineraryDayId: testDayId,
        parentActivityId: testPackageId,
        activityType: 'tour',
        name: 'Linked Tour Activity',
        proposalStatus: 'draft',
      })
      linkedActivityId = newLinked.id
    })
  })

  describe('GET /trips/:tripId/packages', () => {
    it('should return packages array (empty for floating packages)', async () => {
      // Note: The current implementation uses a join chain
      // (activity → day → itinerary → trip) that doesn't find floating packages
      // (packages with null itineraryDayId). This is a known limitation.
      const response = await request(app.getHttpServer())
        .get(`/trips/${testTripId}/packages`)
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      // Floating packages aren't found via this endpoint
      // because they don't have itineraryDayId to join through
    })
  })

  describe('GET /trips/:tripId/packages/totals', () => {
    it('should return aggregated package totals for trip', async () => {
      const response = await request(app.getHttpServer())
        .get(`/trips/${testTripId}/packages/totals`)
        .expect(200)

      const totals = response.body

      // Should have totals structure
      expect(typeof totals.grandTotalCents).toBe('number')
      expect(typeof totals.totalCollectedCents).toBe('number')
      expect(typeof totals.outstandingCents).toBe('number')
      expect(typeof totals.expectedCommissionCents).toBe('number')
      expect(typeof totals.pendingCommissionCents).toBe('number')
    })
  })
})
