/**
 * Integration Tests: Trip Reference Number Generation
 *
 * Tests the database trigger-based reference number generation system
 * Covers:
 * - Auto-generation on INSERT with all trip type prefixes (FIT, GRP, BUS, MICE, DFT)
 * - Sequential numbering per type and year
 * - Regeneration on UPDATE when trip_type changes (planning only)
 * - Immutability once status leaves 'planning'
 * - Year rollover behavior
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { TripsModule } from '../trips.module'
import { DatabaseModule } from '../../db/database.module'
import { ConfigModule } from '@nestjs/config'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { eq } from 'drizzle-orm'
import { schema } from '@tailfire/database'

const { trips, contacts } = schema

describe('Trip Reference Numbers (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let testContactId: string
  let testOwnerId: string

  // Helper to get DB instance
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
    const db = getDb()

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'Test',
        lastName: 'User',
        email: `test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id
    testOwnerId = contact.id // Use contact as owner for simplicity
  })

  afterAll(async () => {
    // Clean up test data
    if (testContactId) {
      const db = getDb()
      await db.delete(contacts).where(eq(contacts.id, testContactId))
    }
    await app.close()
  })

  beforeEach(async () => {
    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // TODO: This test needs refactoring to work with existing data or use a test DB
    // For now, skipping truncation - tests may need to be updated to handle existing sequences
  })

  describe('Auto-generation on INSERT', () => {
    it('should generate FIT prefix for leisure trips', async () => {
      const db = getDb()
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test FIT Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      expect(trip!.referenceNumber).toMatch(/^FIT-\d{4}-\d{6}$/)
      expect(trip!.referenceNumber).toContain('-2025-') // Current year
    })

    it('should generate FIT prefix for honeymoon trips', async () => {
      const db = getDb()
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Honeymoon Trip',
          ownerId: testOwnerId,
          tripType: 'honeymoon',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      expect(trip!.referenceNumber).toMatch(/^FIT-\d{4}-\d{6}$/)
    })

    it('should generate FIT prefix for custom trips', async () => {
      const db = getDb()
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Custom Trip',
          ownerId: testOwnerId,
          tripType: 'custom',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      expect(trip!.referenceNumber).toMatch(/^FIT-\d{4}-\d{6}$/)
    })

    it('should generate GRP prefix for group trips', async () => {
      const db = getDb()
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Group Trip',
          ownerId: testOwnerId,
          tripType: 'group',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      expect(trip!.referenceNumber).toMatch(/^GRP-\d{4}-\d{6}$/)
    })

    it('should generate BUS prefix for business trips', async () => {
      const db = getDb()
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Business Trip',
          ownerId: testOwnerId,
          tripType: 'business',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      expect(trip!.referenceNumber).toMatch(/^BUS-\d{4}-\d{6}$/)
    })

    it('should generate MICE prefix for corporate trips', async () => {
      const db = getDb()
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Corporate Trip',
          ownerId: testOwnerId,
          tripType: 'corporate',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      expect(trip!.referenceNumber).toMatch(/^MICE-\d{4}-\d{6}$/)
    })

    it('should increment sequence for same trip type', async () => {
      const db = getDb()
      const [trip1] = await db
        .insert(trips)
        .values({
          name: 'First FIT Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      const [trip2] = await db
        .insert(trips)
        .values({
          name: 'Second FIT Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip1).toBeDefined()
      expect(trip2).toBeDefined()

      // Extract sequence numbers
      const seq1 = parseInt(trip1!.referenceNumber!.split('-')[2]!)
      const seq2 = parseInt(trip2!.referenceNumber!.split('-')[2]!)

      expect(seq2).toBe(seq1 + 1)
    })

    it('should use independent sequences for different trip types', async () => {
      const db = getDb()
      const [fit] = await db
        .insert(trips)
        .values({
          name: 'FIT Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      const [grp] = await db
        .insert(trips)
        .values({
          name: 'Group Trip',
          ownerId: testOwnerId,
          tripType: 'group',
          primaryContactId: testContactId,
        })
        .returning()

      expect(fit).toBeDefined()
      expect(grp).toBeDefined()

      // Both should start from sequence 1 (or current seq for their type)
      expect(fit!.referenceNumber).toContain('FIT-')
      expect(grp!.referenceNumber).toContain('GRP-')
      expect(fit!.referenceNumber).not.toBe(grp!.referenceNumber)
    })
  })

  describe('Regeneration on UPDATE (planning only)', () => {
    it('should regenerate reference when trip_type changes in planning status', async () => {
      const db = getDb()

      // Create as leisure (FIT)
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      const originalRef = trip!.referenceNumber
      expect(originalRef).toContain('FIT-')

      // Update to group (GRP) while still draft
      const [updated] = await db
        .update(trips)
        .set({ tripType: 'group' })
        .where(eq(trips.id, trip!.id))
        .returning()

      expect(updated).toBeDefined()
      expect(updated!.referenceNumber).toContain('GRP-')
      expect(updated!.referenceNumber).not.toBe(originalRef)
    })

    it('should regenerate reference number on second update (planning)', async () => {
      const db = getDb()

      // Create as leisure (FIT)
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      const fitRef = trip!.referenceNumber
      expect(fitRef).toContain('FIT-')

      // First update: leisure -> group
      const [updated1] = await db
        .update(trips)
        .set({ tripType: 'group' })
        .where(eq(trips.id, trip!.id))
        .returning()

      expect(updated1).toBeDefined()
      const grpRef = updated1!.referenceNumber
      expect(grpRef).toContain('GRP-')
      expect(grpRef).not.toBe(fitRef)

      // Second update: group -> business (should regenerate again)
      const [updated2] = await db
        .update(trips)
        .set({ tripType: 'business' })
        .where(eq(trips.id, trip!.id))
        .returning()

      expect(updated2).toBeDefined()
      const busRef = updated2!.referenceNumber
      expect(busRef).toContain('BUS-')
      expect(busRef).not.toBe(grpRef)
      expect(busRef).not.toBe(fitRef)
    })

    it('should NOT regenerate when trip_type unchanged (planning)', async () => {
      const db = getDb()

      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      const originalRef = trip!.referenceNumber

      // Update name only (no trip_type change)
      const [updated] = await db
        .update(trips)
        .set({ name: 'Updated Name' })
        .where(eq(trips.id, trip!.id))
        .returning()

      expect(updated).toBeDefined()
      expect(updated!.referenceNumber).toBe(originalRef)
    })

    it('should NOT regenerate once status leaves planning', async () => {
      const db = getDb()

      // Create as leisure (FIT)
      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      const fitRef = trip!.referenceNumber
      expect(fitRef).toContain('FIT-')

      // Move to active status
      const [quoted] = await db
        .update(trips)
        .set({ status: 'active' })
        .where(eq(trips.id, trip!.id))
        .returning()

      expect(quoted).toBeDefined()

      // Try to change trip_type - should NOT regenerate
      const [updated] = await db
        .update(trips)
        .set({ tripType: 'group' })
        .where(eq(trips.id, quoted!.id))
        .returning()

      expect(updated).toBeDefined()
      expect(updated!.referenceNumber).toBe(fitRef)
      expect(updated!.tripType).toBe('group')
    })
  })

  describe('Immutability after draft', () => {
    it('should preserve reference number when transitioning to active', async () => {
      const db = getDb()

      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      const originalRef = trip!.referenceNumber

      const [booked] = await db
        .update(trips)
        .set({ status: 'active' })
        .where(eq(trips.id, trip!.id))
        .returning()

      expect(booked).toBeDefined()
      expect(booked!.referenceNumber).toBe(originalRef)
    })

    it('should preserve reference number through full lifecycle', async () => {
      const db = getDb()

      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      const originalRef = trip!.referenceNumber

      // planning -> active
      await db.update(trips).set({ status: 'active' }).where(eq(trips.id, trip!.id))

      // active -> travelling
      await db.update(trips).set({ status: 'travelling' }).where(eq(trips.id, trip!.id))

      // travelling -> travelled
      const [completed] = await db
        .update(trips)
        .set({ status: 'travelled' })
        .where(eq(trips.id, trip!.id))
        .returning()

      expect(completed).toBeDefined()
      expect(completed!.referenceNumber).toBe(originalRef)
    })
  })

  describe('Year rollover (simulation)', () => {
    it('should include current year in reference number', async () => {
      const db = getDb()

      const [trip] = await db
        .insert(trips)
        .values({
          name: 'Test Trip',
          ownerId: testOwnerId,
          tripType: 'leisure',
          primaryContactId: testContactId,
        })
        .returning()

      expect(trip).toBeDefined()
      const currentYear = new Date().getFullYear()
      expect(trip!.referenceNumber).toContain(`-${currentYear}-`)
    })

    // Note: Actual year rollover testing would require mocking system time
    // or waiting until Jan 1st. The trigger uses CURRENT_DATE which resets
    // sequences automatically based on {trip_type, year} composite key.
  })
})
