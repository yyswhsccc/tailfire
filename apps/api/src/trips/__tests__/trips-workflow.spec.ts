/**
 * Integration Tests: Trips Workflow
 *
 * Tests the complete trip lifecycle including:
 * - Trip creation with status transitions
 * - Primary contact association and first booking date
 * - Reference number immutability after leaving planning
 * - Contact status updates when trip becomes active
 * - Full lifecycle: planning → active → travelling → travelled
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { TripsModule } from '../trips.module'
import { ContactsModule } from '../../contacts/contacts.module'
import { DatabaseModule } from '../../db/database.module'
import { ConfigModule } from '@nestjs/config'
import { EncryptionModule } from '../../common/encryption'
import { DatabaseService } from '../../db/database.service'
import { ContactsService } from '../../contacts/contacts.service'
import { TripsService } from '../trips.service'
import { eq } from 'drizzle-orm'
import { schema } from '@tailfire/database'

const { contacts } = schema

// Helper to wait for async events to process
// NestJS EventEmitter v3+ processes events asynchronously.
// 500ms provides margin for first-test initialization overhead
const waitForEvents = () => new Promise(resolve => setTimeout(resolve, 500))

describe('Trips Workflow (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let contactsService: ContactsService
  let tripsService: TripsService
  let testContactId: string
  let testOwnerId: string

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
        ContactsModule,
        TripsModule,
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    dbService = moduleFixture.get<DatabaseService>(DatabaseService)
    contactsService = moduleFixture.get<ContactsService>(ContactsService)
    tripsService = moduleFixture.get<TripsService>(TripsService)

    const db = getDb()

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'Workflow',
        lastName: 'Tester',
        email: `workflow-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id
    testOwnerId = contact.id
  })

  afterAll(async () => {
    if (testContactId) {
      const db = getDb()
      await db.delete(contacts).where(eq(contacts.id, testContactId))
    }
    await app.close()
  })

  beforeEach(async () => {
    // Wait for any pending async events from previous tests to complete
    // This prevents event handler race conditions between tests
    await waitForEvents()

    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // Tests should create their own data and clean up after themselves.
    // TODO: Refactor this test to use per-test trip creation and cleanup
    const db = getDb()

    // Reset test contact's first booking date to null for isolated tests
    await db
      .update(contacts)
      .set({ firstBookingDate: null })
      .where(eq(contacts.id, testContactId))
  })

  describe('Trip Creation and Primary Contact', () => {
    it('should create trip with primary contact and NOT set first booking date (planning)', async () => {
      // Create trip in planning status
      const trip = await tripsService.create(
        {
          name: 'Test Trip',
          tripType: 'leisure',
          primaryContactId: testContactId,
          startDate: '2025-06-01',
          endDate: '2025-06-15',
        },
        testOwnerId
      )

      expect(trip).toBeDefined()
      expect(trip.status).toBe('planning')
      expect(trip.primaryContactId).toBe(testContactId)
      expect(trip.referenceNumber).toMatch(/^FIT-\d{4}-\d{6}$/)

      // Check contact - first booking date should NOT be set (still draft)
      const contact = await contactsService.findOneInternal(testContactId)
      expect(contact.firstBookingDate).toBeNull()
    })

    it('should create trip as "active" and set first booking date on contact', async () => {
      // Create trip directly as active
      const trip = await tripsService.create(
        {
          name: 'Booked Trip',
          tripType: 'leisure',
          primaryContactId: testContactId,
          startDate: '2025-07-01',
          endDate: '2025-07-15',
          status: 'active',
        },
        testOwnerId
      )

      expect(trip).toBeDefined()
      expect(trip.status).toBe('active')
      expect(trip.bookingDate).toBeDefined()

      // Wait for event to process
      await waitForEvents()

      // Check contact - first booking date SHOULD be set
      const contact = await contactsService.findOneInternal(testContactId)
      expect(contact.firstBookingDate).toBeDefined()
      expect(contact.firstBookingDate).toBe(trip.bookingDate)
    })
  })

  describe('Status Transitions and Booking Date', () => {
    it('should set first booking date when transitioning from planning → active', async () => {
      // Create as planning
      const trip = await tripsService.create(
        {
          name: 'Draft to Booked',
          tripType: 'leisure',
          primaryContactId: testContactId,
          startDate: '2025-08-01',
          endDate: '2025-08-15',
        },
        testOwnerId
      )

      expect(trip.status).toBe('planning')

      // Verify contact has no first booking date yet
      let contact = await contactsService.findOneInternal(testContactId)
      expect(contact.firstBookingDate).toBeNull()

      // Transition to active
      const bookedTrip = await tripsService.update(trip.id, {
        status: 'active',
      })

      expect(bookedTrip.status).toBe('active')
      expect(bookedTrip.bookingDate).toBeDefined()

      // Wait for event to process
      await waitForEvents()

      // Check contact - first booking date should now be set
      contact = await contactsService.findOneInternal(testContactId)
      expect(contact.firstBookingDate).toBeDefined()
      expect(contact.firstBookingDate).toBe(bookedTrip.bookingDate)
    })

    /**
     * Regression test: firstBookingDate format must be YYYY-MM-DD
     *
     * Previously, setFirstBookingDate stored full ISO timestamps (e.g., 2025-01-15T10:30:00.000Z)
     * but trip.bookingDate is stored as date-only (YYYY-MM-DD). This caused equality checks to fail.
     *
     * The fix in contacts.service.ts uses date.toISOString().split('T')[0] to ensure
     * firstBookingDate is stored as YYYY-MM-DD format, matching trip.bookingDate.
     */
    it('should store firstBookingDate in YYYY-MM-DD format (regression)', async () => {
      // Create trip as active
      const trip = await tripsService.create(
        {
          name: 'Date Format Regression Test',
          tripType: 'leisure',
          primaryContactId: testContactId,
          status: 'active',
          startDate: '2025-12-15',
          endDate: '2025-12-25',
        },
        testOwnerId
      )

      expect(trip.status).toBe('active')
      expect(trip.bookingDate).toBeDefined()

      // Wait for event to process
      await waitForEvents()

      // Check contact's firstBookingDate format
      const contact = await contactsService.findOneInternal(testContactId)
      expect(contact.firstBookingDate).toBeDefined()

      // Verify YYYY-MM-DD format (no timestamp component)
      expect(contact.firstBookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      // Verify it matches trip.bookingDate exactly (both should be YYYY-MM-DD)
      expect(contact.firstBookingDate).toBe(trip.bookingDate)
    })

    it('should NOT change first booking date on subsequent bookings', async () => {
      // Create first active trip
      await tripsService.create(
        {
          name: 'First Booking',
          tripType: 'leisure',
          primaryContactId: testContactId,
          status: 'active',
          startDate: '2025-09-01',
          endDate: '2025-09-15',
        },
        testOwnerId
      )

      // Wait for first event to process
      await waitForEvents()

      const contact1 = await contactsService.findOneInternal(testContactId)
      const firstBookingDate = contact1.firstBookingDate

      expect(firstBookingDate).toBeDefined()

      // Create second active trip (later date)
      await tripsService.create(
        {
          name: 'Second Booking',
          tripType: 'group',
          primaryContactId: testContactId,
          status: 'active',
          startDate: '2025-10-01',
          endDate: '2025-10-15',
        },
        testOwnerId
      )

      // Wait for second event to process
      await waitForEvents()

      // First booking date should remain unchanged
      const contact2 = await contactsService.findOneInternal(testContactId)
      expect(contact2.firstBookingDate).toBe(firstBookingDate)
    })
  })

  describe('Reference Number Immutability', () => {
    it('should lock reference number after leaving planning status', async () => {
      // Create as planning with leisure type (FIT prefix)
      const trip = await tripsService.create(
        {
          name: 'Reference Lock Test',
          tripType: 'leisure',
          primaryContactId: testContactId,
          startDate: '2025-11-01',
          endDate: '2025-11-15',
        },
        testOwnerId
      )

      const planningRef = trip.referenceNumber
      expect(planningRef).toContain('FIT-')

      // Transition to active
      const activeTrip = await tripsService.update(trip.id, {
        status: 'active',
      })

      expect(activeTrip.referenceNumber).toBe(planningRef)

      // Try to change trip type - reference should NOT regenerate
      const updatedTrip = await tripsService.update(trip.id, {
        tripType: 'group',
      })

      expect(updatedTrip.tripType).toBe('group')
      expect(updatedTrip.referenceNumber).toBe(planningRef) // Still FIT prefix
    })
  })

  describe('Full Lifecycle Workflow', () => {
    it('should complete full trip lifecycle: planning → active → travelling → travelled', async () => {
      // Step 1: Create planning trip
      const planningTrip = await tripsService.create(
        {
          name: 'Full Lifecycle Trip',
          tripType: 'leisure',
          primaryContactId: testContactId,
          startDate: '2025-12-01',
          endDate: '2025-12-15',
        },
        testOwnerId
      )

      expect(planningTrip.status).toBe('planning')
      const referenceNumber = planningTrip.referenceNumber

      // Step 2: Transition to active
      const activeTrip = await tripsService.update(planningTrip.id, {
        status: 'active',
      })

      expect(activeTrip.status).toBe('active')
      expect(activeTrip.bookingDate).toBeDefined()
      expect(activeTrip.referenceNumber).toBe(referenceNumber)

      // Wait for event to process
      await waitForEvents()

      // Verify first booking date was set on contact
      const contactAfterBooking = await contactsService.findOneInternal(testContactId)
      expect(contactAfterBooking.firstBookingDate).toBe(activeTrip.bookingDate)

      // Step 3: Transition to travelling
      const travellingTrip = await tripsService.update(activeTrip.id, {
        status: 'travelling',
      })

      expect(travellingTrip.status).toBe('travelling')
      expect(travellingTrip.referenceNumber).toBe(referenceNumber)

      // Step 4: Transition to travelled
      const travelledTrip = await tripsService.update(travellingTrip.id, {
        status: 'travelled',
      })

      expect(travelledTrip.status).toBe('travelled')
      expect(travelledTrip.referenceNumber).toBe(referenceNumber)

      // Final verification
      expect(travelledTrip.id).toBe(planningTrip.id)
      expect(travelledTrip.name).toBe('Full Lifecycle Trip')
      expect(travelledTrip.primaryContactId).toBe(testContactId)
    })

    it('should allow cancellation at any non-terminal stage', async () => {
      // Create and transition to active
      const trip = await tripsService.create(
        {
          name: 'Cancellation Test',
          tripType: 'leisure',
          primaryContactId: testContactId,
          status: 'active',
          startDate: '2026-01-01',
          endDate: '2026-01-15',
        },
        testOwnerId
      )

      expect(trip.status).toBe('active')

      // Cancel the trip
      const cancelledTrip = await tripsService.update(trip.id, {
        status: 'cancelled',
      })

      expect(cancelledTrip.status).toBe('cancelled')

      // Cancelled is terminal - cannot transition to other states
      await expect(
        tripsService.update(cancelledTrip.id, { status: 'travelled' })
      ).rejects.toThrow()
    })
  })

  describe('Invalid State Transitions', () => {
    it('should reject invalid transition: planning → travelling', async () => {
      const trip = await tripsService.create(
        {
          name: 'Invalid Transition Test',
          tripType: 'leisure',
          primaryContactId: testContactId,
          startDate: '2026-02-01',
          endDate: '2026-02-15',
        },
        testOwnerId
      )

      expect(trip.status).toBe('planning')

      // Try invalid transition
      await expect(
        tripsService.update(trip.id, { status: 'travelling' })
      ).rejects.toThrow(/cannot transition/i)
    })

    it('should reject invalid transition: active → planning', async () => {
      const trip = await tripsService.create(
        {
          name: 'Active to Planning Test',
          tripType: 'leisure',
          primaryContactId: testContactId,
          status: 'active',
          startDate: '2026-03-01',
          endDate: '2026-03-15',
        },
        testOwnerId
      )

      expect(trip.status).toBe('active')

      // Try invalid transition
      await expect(
        tripsService.update(trip.id, { status: 'planning' })
      ).rejects.toThrow(/cannot transition/i)
    })

    it('should reject any transition from travelled (terminal state)', async () => {
      const trip = await tripsService.create(
        {
          name: 'Terminal State Test',
          tripType: 'leisure',
          primaryContactId: testContactId,
          status: 'active',
          startDate: '2026-04-01',
          endDate: '2026-04-15',
        },
        testOwnerId
      )

      // Transition through to travelled
      const travellingTrip = await tripsService.update(trip.id, {
        status: 'travelling',
      })
      const travelledTrip = await tripsService.update(travellingTrip.id, {
        status: 'travelled',
      })

      expect(travelledTrip.status).toBe('travelled')

      // Try to transition from travelled to anything else
      await expect(
        tripsService.update(travelledTrip.id, { status: 'travelling' })
      ).rejects.toThrow(/cannot transition/i)

      await expect(
        tripsService.update(travelledTrip.id, { status: 'cancelled' })
      ).rejects.toThrow(/cannot transition/i)
    })
  })
})
