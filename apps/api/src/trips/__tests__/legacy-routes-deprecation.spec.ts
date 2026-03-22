import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import request from 'supertest'
import { DatabaseModule } from '../../db/database.module'
import { EncryptionModule } from '../../common/encryption'
import { TripsModule } from '../trips.module'
import { CommonModule } from '../../common/common.module'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

// ============================================================================
// DEPRECATION CONFIGURATION
// Both GET and POST routes still exist with deprecation headers
// Flip LEGACY_ROUTES_REMOVED to true when all legacy routes are removed
// ============================================================================
const LEGACY_ROUTES_REMOVED = false

describe('Legacy Routes Deprecation (/components/*)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let testActivityId: string
  let testContactId: string
  let testTripId: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        EventEmitterModule.forRoot(),
        DatabaseModule,
        EncryptionModule,
        CommonModule,
        TripsModule,
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api/v1')
    await app.init()
    dbService = moduleFixture.get<DatabaseService>(DatabaseService)

    const db = dbService.db

    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // Tests should create their own data and clean up after themselves.

    // Setup test data
    const [contact] = await db.insert(schema.contacts).values({
      firstName: 'Legacy',
      lastName: 'Test',
      email: `legacy-test-${Date.now()}@example.com`,
    }).returning()
    testContactId = contact!.id

    const [trip] = await db.insert(schema.trips).values({
      name: 'Legacy Test Trip',
      status: 'planning',
      primaryContactId: testContactId,
      ownerId: testContactId,
    }).returning()
    testTripId = trip!.id

    const [itinerary] = await db.insert(schema.itineraries).values({
      tripId: testTripId,
      name: 'Test Itinerary',
    }).returning()

    const [day] = await db.insert(schema.itineraryDays).values({
      itineraryId: itinerary!.id,
      dayNumber: 1,
      date: '2025-06-01',
      sequenceOrder: 0,
    }).returning()

    const [activity] = await db.insert(schema.itineraryActivities).values({
      itineraryDayId: day!.id,
      componentType: 'lodging',
      activityType: 'lodging',
      name: 'Test Hotel',
      sequenceOrder: 0,
      proposalStatus: 'approved',
    }).returning()
    testActivityId = activity!.id
  })

  afterAll(async () => {
    const db = dbService.db
    await db.delete(schema.trips).where(eq(schema.trips.id, testTripId))
    await db.delete(schema.contacts).where(eq(schema.contacts.id, testContactId))
    await app.close()
  })

  describe('Deprecation Headers', () => {
    it('should return Deprecation header on /components/:id/media', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/components/${testActivityId}/media`)

      if (LEGACY_ROUTES_REMOVED) {
        expect(response.status).toBe(404)
      } else {
        expect(response.headers['deprecation']).toBe('true')
        expect(response.headers['sunset']).toBeDefined()
        expect(response.headers['x-deprecation-notice']).toContain('deprecated')
      }
    })

    it('should return Deprecation header on /components/:id/documents', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/components/${testActivityId}/documents`)

      if (LEGACY_ROUTES_REMOVED) {
        expect(response.status).toBe(404)
      } else {
        expect(response.headers['deprecation']).toBe('true')
        expect(response.headers['sunset']).toBeDefined()
      }
    })

    it('should include Link header with successor path', async () => {
      if (LEGACY_ROUTES_REMOVED) return

      const response = await request(app.getHttpServer())
        .get(`/api/v1/components/${testActivityId}/media`)

      expect(response.headers['link']).toContain('successor-version')
      expect(response.headers['link']).toContain('/activities/')
    })

    it('should include sunset date of March 31, 2025', async () => {
      if (LEGACY_ROUTES_REMOVED) return

      const response = await request(app.getHttpServer())
        .get(`/api/v1/components/${testActivityId}/media`)

      const sunsetDate = new Date(response.headers['sunset'] as string)
      // Use UTC methods to avoid timezone conversion issues
      expect(sunsetDate.getUTCFullYear()).toBe(2025)
      expect(sunsetDate.getUTCMonth()).toBe(2) // March is 0-indexed as 2
      expect(sunsetDate.getUTCDate()).toBe(31)
    })
  })

  describe('ComponentMediaController Routes', () => {
    it('GET /components/:id/media should work or 404', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/components/${testActivityId}/media`)

      if (LEGACY_ROUTES_REMOVED) {
        expect(response.status).toBe(404)
      } else {
        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('media')
      }
    })

    it('POST /components/:id/media should accept requests or 404', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/components/${testActivityId}/media`)
        .set('Content-Type', 'multipart/form-data')

      if (LEGACY_ROUTES_REMOVED) {
        expect(response.status).toBe(404)
      } else {
        // Route exists but no file - returns 400 (BadRequest), not 404
        expect(response.status).toBe(400)
      }
    })
  })

  describe('ComponentDocumentsController Routes', () => {
    it('GET /components/:id/documents should work or 404', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/components/${testActivityId}/documents`)

      if (LEGACY_ROUTES_REMOVED) {
        expect(response.status).toBe(404)
      } else {
        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('documents')
      }
    })

    it('POST /components/:id/documents should accept requests or 404', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/components/${testActivityId}/documents`)
        .set('Content-Type', 'multipart/form-data')

      if (LEGACY_ROUTES_REMOVED) {
        expect(response.status).toBe(404)
      } else {
        // Route exists but no file - returns 400 (BadRequest), not 404
        expect(response.status).toBe(400)
      }
    })
  })

  describe('Route Equivalence', () => {
    it('new and legacy media routes should return same data', async () => {
      if (LEGACY_ROUTES_REMOVED) return

      const [legacyRes, newRes] = await Promise.all([
        request(app.getHttpServer()).get(`/api/v1/components/${testActivityId}/media`),
        request(app.getHttpServer()).get(`/api/v1/activities/${testActivityId}/media`),
      ])

      expect(legacyRes.body).toEqual(newRes.body)
    })

    it('new and legacy documents routes should return same data', async () => {
      if (LEGACY_ROUTES_REMOVED) return

      const [legacyRes, newRes] = await Promise.all([
        request(app.getHttpServer()).get(`/api/v1/components/${testActivityId}/documents`),
        request(app.getHttpServer()).get(`/api/v1/activities/${testActivityId}/documents`),
      ])

      expect(legacyRes.body).toEqual(newRes.body)
    })
  })

  describe('New Routes Do Not Have Deprecation Headers', () => {
    it('GET /activities/:id/media should NOT have deprecation headers', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/activities/${testActivityId}/media`)

      expect(response.status).toBe(200)
      expect(response.headers['deprecation']).toBeUndefined()
      expect(response.headers['sunset']).toBeUndefined()
    })

    it('GET /activities/:id/documents should NOT have deprecation headers', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/activities/${testActivityId}/documents`)

      expect(response.status).toBe(200)
      expect(response.headers['deprecation']).toBeUndefined()
      expect(response.headers['sunset']).toBeUndefined()
    })
  })
})
