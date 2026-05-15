/**
 * Integration Test: Generic POST /activities accepts booking-detail fields
 *
 * Verifies that the generic /activities create path (used by the TES importer
 * and any non-type-specific caller) persists supplier, cancellationPolicy,
 * termsAndConditions, and packageDetails — previously these were silently
 * dropped because the shared Zod create schema didn't include them.
 *
 * Load-bearing for:
 * - B4 §38 finalize() compliance gate (requires non-empty cancellation_policy)
 * - TES cutover backfill (see docs/runbooks/tes-cutover-backfill-plan.md, P1.A)
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { eq } from 'drizzle-orm'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { TripsModule } from '../trips.module'
import { ActivitiesService } from '../activities.service'
import { schema } from '@tailfire/database'

const { trips, contacts, itineraries, itineraryDays, activityPricing, packageDetails } = schema

describe('Generic POST /activities — booking detail fields', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let activitiesService: ActivitiesService
  let testTripId: string
  let testContactId: string
  let testItineraryId: string
  let testDayId: string

  const getDb = () => dbService.db

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
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
  })

  beforeEach(async () => {
    const db = getDb()

    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'CreatePricing',
        lastName: 'Tester',
        email: `create-pricing-${Date.now()}@example.com`,
      })
      .returning()
    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Create Pricing Fields Trip',
        primaryContactId: testContactId,
        ownerId: '00000000-0000-0000-0000-000000000001',
        status: 'planning',
        currency: 'CAD',
      })
      .returning()
    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    const [itinerary] = await db
      .insert(itineraries)
      .values({ tripId: testTripId, name: 'Itin', status: 'draft' })
      .returning()
    if (!itinerary) throw new Error('Failed to create itinerary')
    testItineraryId = itinerary.id

    const [day] = await db
      .insert(itineraryDays)
      .values({ itineraryId: testItineraryId, dayNumber: 1, date: '2026-06-01' })
      .returning()
    if (!day) throw new Error('Failed to create day')
    testDayId = day.id
  })

  afterEach(async () => {
    const db = getDb()
    await db.delete(trips).where(eq(trips.id, testTripId))
    await db.delete(contacts).where(eq(contacts.id, testContactId))
  })

  afterAll(async () => {
    await app.close()
  })

  describe('non-package activity', () => {
    it('persists cancellationPolicy, supplier, termsAndConditions on activity_pricing', async () => {
      const created = await activitiesService.create({
        itineraryDayId: testDayId,
        activityType: 'flight',
        name: 'YYZ→YUL',
        supplier: 'Air Canada',
        cancellationPolicy: 'Per airline fare rules. See booking confirmation for details.',
        termsAndConditions: 'Non-refundable after 24h.',
        totalPriceCents: 45000,
      })

      const db = getDb()
      const [pricing] = await db
        .select()
        .from(activityPricing)
        .where(eq(activityPricing.activityId, created.id))
        .limit(1)

      expect(pricing).toBeDefined()
      expect(pricing!.supplier).toBe('Air Canada')
      expect(pricing!.cancellationPolicy).toBe(
        'Per airline fare rules. See booking confirmation for details.'
      )
      expect(pricing!.termsAndConditions).toBe('Non-refundable after 24h.')
    })

    it('PATCH updates cancellationPolicy and termsAndConditions', async () => {
      const created = await activitiesService.create({
        itineraryDayId: testDayId,
        activityType: 'lodging',
        name: 'Hotel Stay',
        supplier: 'Marriott',
        cancellationPolicy: 'initial policy',
        totalPriceCents: 30000,
      })

      await activitiesService.update(created.id, {
        cancellationPolicy: 'updated policy text',
        termsAndConditions: 'updated terms',
      })

      const db = getDb()
      const [pricing] = await db
        .select()
        .from(activityPricing)
        .where(eq(activityPricing.activityId, created.id))
        .limit(1)

      expect(pricing!.cancellationPolicy).toBe('updated policy text')
      expect(pricing!.termsAndConditions).toBe('updated terms')
      // Verify supplier preserved (COALESCE behavior on unsupplied field)
      expect(pricing!.supplier).toBe('Marriott')
    })
  })

  describe('package activity with packageDetails', () => {
    it('persists both activity_pricing.cancellation_policy AND package_details row', async () => {
      const created = await activitiesService.create(
        {
          activityType: 'package',
          name: 'Sun Package',
          cancellationPolicy: 'Per tour operator; subject to bundle restrictions.',
          totalPriceCents: 250000,
        },
        null,
        testTripId,
        {
          supplierId: null,
          supplierName: 'Air Canada Vacations',
          paymentStatus: 'unpaid',
          cancellationPolicy: 'Package-level cancellation policy',
          groupBookingNumber: 'GRP-7777',
        }
      )

      const db = getDb()

      // activity_pricing got cancellationPolicy at the activity layer
      const [pricing] = await db
        .select()
        .from(activityPricing)
        .where(eq(activityPricing.activityId, created.id))
        .limit(1)
      expect(pricing!.cancellationPolicy).toBe(
        'Per tour operator; subject to bundle restrictions.'
      )

      // package_details row was created with its own block
      const [pkg] = await db
        .select()
        .from(packageDetails)
        .where(eq(packageDetails.activityId, created.id))
        .limit(1)
      expect(pkg).toBeDefined()
      expect(pkg!.supplierName).toBe('Air Canada Vacations')
      expect(pkg!.cancellationPolicy).toBe('Package-level cancellation policy')
      expect(pkg!.groupBookingNumber).toBe('GRP-7777')
    })
  })
})
