/**
 * Integration Tests: Component Booking Details
 *
 * Tests the booking detail fields (termsAndConditions, cancellationPolicy, supplier)
 * across different component types:
 * - Creating components with booking details
 * - Retrieving components with booking details
 * - Updating components with booking details
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
import { schema } from '@tailfire/database'
import { eq } from 'drizzle-orm'

const { trips, contacts, itineraries, itineraryDays } = schema

describe('Component Booking Details (Integration)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let componentOrchestrationService: ComponentOrchestrationService
  let testTripId: string
  let testContactId: string
  let testItineraryId: string
  let testDayId: string

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
    componentOrchestrationService = moduleFixture.get<ComponentOrchestrationService>(
      ComponentOrchestrationService
    )

    const db = getDb()

    // NOTE: Do NOT truncate tables - this destroys production/dev data!
    // Tests should create their own data and clean up after themselves.

    // Create test contact
    const [contact] = await db
      .insert(contacts)
      .values({
        firstName: 'BookingDetails',
        lastName: 'Tester',
        email: `booking-details-test-${Date.now()}@example.com`,
      })
      .returning()

    if (!contact) throw new Error('Failed to create test contact')
    testContactId = contact.id

    // Create test trip
    const [trip] = await db
      .insert(trips)
      .values({
        name: 'Booking Details Test Trip',
        status: 'planning',
        primaryContactId: testContactId,
        currency: 'CAD',
        ownerId: '00000000-0000-0000-0000-000000000001',
      })
      .returning()

    if (!trip) throw new Error('Failed to create test trip')
    testTripId = trip.id

    // Create test itinerary
    const [itinerary] = await db
      .insert(itineraries)
      .values({
        tripId: testTripId,
        name: 'Test Itinerary',
      })
      .returning()

    if (!itinerary) throw new Error('Failed to create test itinerary')
    testItineraryId = itinerary.id

    // Create test day
    const [day] = await db
      .insert(itineraryDays)
      .values({
        itineraryId: testItineraryId,
        dayNumber: 1,
        date: '2025-06-01',
        sequenceOrder: 0,
      })
      .returning()

    if (!day) throw new Error('Failed to create test day')
    testDayId = day.id
  })

  afterAll(async () => {
    const db = getDb()

    // Clean up test data (cascades will handle most deletions)
    await db.delete(trips).where(eq(trips.id, testTripId))
    await db.delete(contacts).where(eq(contacts.id, testContactId))

    await app.close()
  })

  describe('Flight Component Booking Details', () => {
    it('should create flight with booking details', async () => {
      const flight = await componentOrchestrationService.createFlight({
        itineraryDayId: testDayId,
        componentType: 'flight',
        name: 'Test Flight',
        sequenceOrder: 0,
        status: 'confirmed',
        totalPriceCents: 75000,
        currency: 'CAD',
        termsAndConditions: 'Non-refundable after 24 hours',
        cancellationPolicy: 'Cancel within 24 hours for full refund',
        supplier: 'Air Canada',
      })

      expect(flight).toBeDefined()
      expect(flight.termsAndConditions).toBe('Non-refundable after 24 hours')
      expect(flight.cancellationPolicy).toBe('Cancel within 24 hours for full refund')
      expect(flight.supplier).toBe('Air Canada')
    })

    it('should retrieve flight with booking details', async () => {
      const created = await componentOrchestrationService.createFlight({
        itineraryDayId: testDayId,
        componentType: 'flight',
        name: 'Test Flight 2',
        sequenceOrder: 1,
        status: 'confirmed',
        totalPriceCents: 80000,
        termsAndConditions: 'Test T&C',
        cancellationPolicy: 'Test Cancellation',
        supplier: 'WestJet',
      })

      const retrieved = await componentOrchestrationService.getFlight(created.id)

      expect(retrieved.termsAndConditions).toBe('Test T&C')
      expect(retrieved.cancellationPolicy).toBe('Test Cancellation')
      expect(retrieved.supplier).toBe('WestJet')
    })

    it('should update flight booking details', async () => {
      const created = await componentOrchestrationService.createFlight({
        itineraryDayId: testDayId,
        componentType: 'flight',
        name: 'Test Flight 3',
        sequenceOrder: 2,
        status: 'confirmed',
        totalPriceCents: 85000,
        termsAndConditions: 'Original T&C',
        supplier: 'Original Airline',
      })

      const updated = await componentOrchestrationService.updateFlight(created.id, {
        termsAndConditions: 'Updated T&C',
        cancellationPolicy: 'New cancellation policy',
        supplier: 'Updated Airline',
      })

      expect(updated.termsAndConditions).toBe('Updated T&C')
      expect(updated.cancellationPolicy).toBe('New cancellation policy')
      expect(updated.supplier).toBe('Updated Airline')
    })

    it('should create flight with null booking details', async () => {
      const flight = await componentOrchestrationService.createFlight({
        itineraryDayId: testDayId,
        componentType: 'flight',
        name: 'Test Flight No Details',
        sequenceOrder: 3,
        status: 'confirmed',
        totalPriceCents: 70000,
      })

      expect(flight.termsAndConditions).toBeNull()
      expect(flight.cancellationPolicy).toBeNull()
      expect(flight.supplier).toBeNull()
    })
  })

  describe('Lodging Component Booking Details', () => {
    it('should create lodging with booking details', async () => {
      const lodging = await componentOrchestrationService.createLodging({
        itineraryDayId: testDayId,
        componentType: 'lodging',
        name: 'Test Hotel',
        sequenceOrder: 0,
        status: 'confirmed',
        totalPriceCents: 35000,
        currency: 'CAD',
        termsAndConditions: 'Check-in after 3pm, Check-out before 11am',
        cancellationPolicy: 'Free cancellation up to 48 hours before check-in',
        supplier: 'Marriott Hotels',
      })

      expect(lodging.termsAndConditions).toBe('Check-in after 3pm, Check-out before 11am')
      expect(lodging.cancellationPolicy).toBe('Free cancellation up to 48 hours before check-in')
      expect(lodging.supplier).toBe('Marriott Hotels')
    })

    it('should update lodging booking details', async () => {
      const created = await componentOrchestrationService.createLodging({
        itineraryDayId: testDayId,
        componentType: 'lodging',
        name: 'Test Hotel 2',
        sequenceOrder: 1,
        status: 'confirmed',
        totalPriceCents: 40000,
        supplier: 'Hilton',
      })

      const updated = await componentOrchestrationService.updateLodging(created.id, {
        termsAndConditions: 'New hotel terms',
        cancellationPolicy: 'Updated cancellation policy',
        supplier: 'Updated Hotel Chain',
      })

      expect(updated.termsAndConditions).toBe('New hotel terms')
      expect(updated.cancellationPolicy).toBe('Updated cancellation policy')
      expect(updated.supplier).toBe('Updated Hotel Chain')
    })
  })

  describe('Transportation Component Booking Details', () => {
    it('should create transportation with booking details', async () => {
      const transport = await componentOrchestrationService.createTransportation({
        itineraryDayId: testDayId,
        componentType: 'transportation',
        name: 'Private Transfer',
        sequenceOrder: 0,
        status: 'confirmed',
        totalPriceCents: 15000,
        currency: 'CAD',
        termsAndConditions: 'Driver will wait 30 minutes',
        cancellationPolicy: 'Cancel 24h before for refund',
        supplier: 'Blacklane',
      })

      expect(transport.termsAndConditions).toBe('Driver will wait 30 minutes')
      expect(transport.cancellationPolicy).toBe('Cancel 24h before for refund')
      expect(transport.supplier).toBe('Blacklane')
    })

    it('should update transportation booking details', async () => {
      const created = await componentOrchestrationService.createTransportation({
        itineraryDayId: testDayId,
        componentType: 'transportation',
        name: 'Rental Car',
        sequenceOrder: 1,
        status: 'confirmed',
        totalPriceCents: 25000,
        supplier: 'Enterprise',
      })

      const updated = await componentOrchestrationService.updateTransportation(created.id, {
        termsAndConditions: 'Full insurance included',
        cancellationPolicy: 'Free cancellation anytime',
        supplier: 'Hertz',
      })

      expect(updated.termsAndConditions).toBe('Full insurance included')
      expect(updated.cancellationPolicy).toBe('Free cancellation anytime')
      expect(updated.supplier).toBe('Hertz')
    })
  })

  describe('Dining Component Booking Details', () => {
    it('should create dining with booking details', async () => {
      const dining = await componentOrchestrationService.createDining({
        itineraryDayId: testDayId,
        componentType: 'dining',
        name: 'Fine Dining Experience',
        sequenceOrder: 0,
        status: 'confirmed',
        totalPriceCents: 20000,
        currency: 'CAD',
        termsAndConditions: 'Smart casual dress code required',
        cancellationPolicy: 'Cancel 48h before to avoid fee',
        supplier: 'OpenTable',
      })

      expect(dining.termsAndConditions).toBe('Smart casual dress code required')
      expect(dining.cancellationPolicy).toBe('Cancel 48h before to avoid fee')
      expect(dining.supplier).toBe('OpenTable')
    })

    it('should update dining booking details', async () => {
      const created = await componentOrchestrationService.createDining({
        itineraryDayId: testDayId,
        componentType: 'dining',
        name: 'Restaurant Reservation',
        sequenceOrder: 1,
        status: 'confirmed',
        totalPriceCents: 18000,
        supplier: 'The Keg',
      })

      const updated = await componentOrchestrationService.updateDining(created.id, {
        termsAndConditions: 'Reservation guaranteed for 15 minutes',
        cancellationPolicy: 'Cancel anytime before 6pm',
        supplier: 'Updated Restaurant',
      })

      expect(updated.termsAndConditions).toBe('Reservation guaranteed for 15 minutes')
      expect(updated.cancellationPolicy).toBe('Cancel anytime before 6pm')
      expect(updated.supplier).toBe('Updated Restaurant')
    })
  })

  describe('Options Component Booking Details', () => {
    it('should create options with booking details', async () => {
      const options = await componentOrchestrationService.createOptions({
        itineraryDayId: testDayId,
        componentType: 'options',
        name: 'Spa Package',
        sequenceOrder: 0,
        status: 'confirmed',
        totalPriceCents: 30000,
        currency: 'CAD',
        termsAndConditions: 'Arrive 15 minutes early',
        cancellationPolicy: 'Cancel 24h before',
        supplier: 'Resort Spa',
      })

      expect(options.termsAndConditions).toBe('Arrive 15 minutes early')
      expect(options.cancellationPolicy).toBe('Cancel 24h before')
      expect(options.supplier).toBe('Resort Spa')
    })

    it('should retrieve options with booking details', async () => {
      const created = await componentOrchestrationService.createOptions({
        itineraryDayId: testDayId,
        componentType: 'options',
        name: 'Wine Tasting',
        sequenceOrder: 1,
        status: 'confirmed',
        totalPriceCents: 12000,
        termsAndConditions: 'Must be 19+',
        supplier: 'Local Winery',
      })

      const retrieved = await componentOrchestrationService.getOptions(created.id)

      expect(retrieved.termsAndConditions).toBe('Must be 19+')
      expect(retrieved.supplier).toBe('Local Winery')
    })
  })

  describe('Custom Cruise Component Booking Details', () => {
    it('should create custom cruise with booking details', async () => {
      const cruise = await componentOrchestrationService.createCustomCruise({
        itineraryDayId: testDayId,
        componentType: 'custom_cruise',
        name: 'Private Yacht Charter',
        sequenceOrder: 0,
        status: 'confirmed',
        totalPriceCents: 500000,
        currency: 'CAD',
        termsAndConditions: 'Captain and crew included',
        cancellationPolicy: 'Deposit non-refundable',
        supplier: 'Luxury Yacht Charters',
      })

      expect(cruise.termsAndConditions).toBe('Captain and crew included')
      expect(cruise.cancellationPolicy).toBe('Deposit non-refundable')
      expect(cruise.supplier).toBe('Luxury Yacht Charters')
    })

    it('should retrieve custom cruise with booking details', async () => {
      const created = await componentOrchestrationService.createCustomCruise({
        itineraryDayId: testDayId,
        componentType: 'custom_cruise',
        name: 'River Cruise',
        sequenceOrder: 1,
        status: 'confirmed',
        totalPriceCents: 300000,
        termsAndConditions: 'All-inclusive',
        supplier: 'River Cruises Inc',
      })

      const retrieved = await componentOrchestrationService.getCustomCruise(created.id)

      expect(retrieved.termsAndConditions).toBe('All-inclusive')
      expect(retrieved.supplier).toBe('River Cruises Inc')
    })
  })

  describe('Port Info Component (No Pricing)', () => {
    it('should create port info with null booking details', async () => {
      const portInfo = await componentOrchestrationService.createPortInfo({
        itineraryDayId: testDayId,
        componentType: 'port_info',
        name: 'Port of Barcelona',
        sequenceOrder: 0,
        status: 'confirmed',
      })

      expect(portInfo.termsAndConditions).toBeNull()
      expect(portInfo.cancellationPolicy).toBeNull()
      expect(portInfo.supplier).toBeNull()
    })
  })

  describe('Partial Updates', () => {
    it('should update only specified booking detail fields', async () => {
      const created = await componentOrchestrationService.createFlight({
        itineraryDayId: testDayId,
        componentType: 'flight',
        name: 'Partial Update Test',
        sequenceOrder: 10,
        status: 'confirmed',
        totalPriceCents: 65000,
        termsAndConditions: 'Original terms',
        cancellationPolicy: 'Original policy',
        supplier: 'Original supplier',
      })

      // Update only supplier
      const updated = await componentOrchestrationService.updateFlight(created.id, {
        supplier: 'New Supplier Only',
      })

      expect(updated.supplier).toBe('New Supplier Only')
      expect(updated.termsAndConditions).toBe('Original terms') // Preserved
      expect(updated.cancellationPolicy).toBe('Original policy') // Preserved
    })

    it('should set booking detail field to null', async () => {
      const created = await componentOrchestrationService.createLodging({
        itineraryDayId: testDayId,
        componentType: 'lodging',
        name: 'Set to Null Test',
        sequenceOrder: 10,
        status: 'confirmed',
        totalPriceCents: 45000,
        termsAndConditions: 'Will be removed',
        supplier: 'Will be removed',
      })

      const updated = await componentOrchestrationService.updateLodging(created.id, {
        termsAndConditions: null,
        supplier: null,
      })

      expect(updated.termsAndConditions).toBeNull()
      expect(updated.supplier).toBeNull()
    })

    describe('Options Partial Updates', () => {
      it('should update only specified booking detail fields for options', async () => {
        const created = await componentOrchestrationService.createOptions({
          itineraryDayId: testDayId,
          componentType: 'options',
          name: 'Options Partial Update Test',
          sequenceOrder: 20,
          status: 'confirmed',
          totalPriceCents: 25000,
          termsAndConditions: 'Original options terms',
          cancellationPolicy: 'Original options policy',
          supplier: 'Original options supplier',
        })

        // Update only termsAndConditions
        const updated = await componentOrchestrationService.updateOptions(created.id, {
          termsAndConditions: 'New T&C Only',
        })

        expect(updated.termsAndConditions).toBe('New T&C Only') // Updated
        expect(updated.cancellationPolicy).toBe('Original options policy') // Preserved
        expect(updated.supplier).toBe('Original options supplier') // Preserved
      })

      it('should clear options booking detail field when explicitly set to null', async () => {
        const created = await componentOrchestrationService.createOptions({
          itineraryDayId: testDayId,
          componentType: 'options',
          name: 'Options Clear Field Test',
          sequenceOrder: 21,
          status: 'confirmed',
          totalPriceCents: 22000,
          termsAndConditions: 'Options terms to clear',
          cancellationPolicy: 'Options policy to keep',
          supplier: 'Options supplier to clear',
        })

        const updated = await componentOrchestrationService.updateOptions(created.id, {
          termsAndConditions: null,
          supplier: null,
        })

        expect(updated.termsAndConditions).toBeNull() // Cleared
        expect(updated.cancellationPolicy).toBe('Options policy to keep') // Preserved
        expect(updated.supplier).toBeNull() // Cleared
      })
    })

    describe('Custom Cruise Partial Updates', () => {
      it('should update only specified booking detail fields for custom cruise', async () => {
        const created = await componentOrchestrationService.createCustomCruise({
          itineraryDayId: testDayId,
          componentType: 'custom_cruise',
          name: 'Cruise Partial Update Test',
          sequenceOrder: 30,
          status: 'confirmed',
          totalPriceCents: 450000,
          termsAndConditions: 'Original cruise terms',
          cancellationPolicy: 'Original cruise policy',
          supplier: 'Original cruise supplier',
        })

        // Update only cancellationPolicy
        const updated = await componentOrchestrationService.updateCustomCruise(created.id, {
          cancellationPolicy: 'New cancellation policy only',
        })

        expect(updated.termsAndConditions).toBe('Original cruise terms') // Preserved
        expect(updated.cancellationPolicy).toBe('New cancellation policy only') // Updated
        expect(updated.supplier).toBe('Original cruise supplier') // Preserved
      })

      it('should clear custom cruise booking detail field when explicitly set to null', async () => {
        const created = await componentOrchestrationService.createCustomCruise({
          itineraryDayId: testDayId,
          componentType: 'custom_cruise',
          name: 'Cruise Clear Field Test',
          sequenceOrder: 31,
          status: 'confirmed',
          totalPriceCents: 400000,
          termsAndConditions: 'Cruise terms to keep',
          cancellationPolicy: 'Cruise policy to clear',
          supplier: 'Cruise supplier to keep',
        })

        const updated = await componentOrchestrationService.updateCustomCruise(created.id, {
          cancellationPolicy: null,
        })

        expect(updated.termsAndConditions).toBe('Cruise terms to keep') // Preserved
        expect(updated.cancellationPolicy).toBeNull() // Cleared
        expect(updated.supplier).toBe('Cruise supplier to keep') // Preserved
      })
    })

    describe('Transportation Partial Updates', () => {
      it('should update only specified booking detail fields for transportation', async () => {
        const created = await componentOrchestrationService.createTransportation({
          itineraryDayId: testDayId,
          componentType: 'transportation',
          name: 'Transport Partial Update Test',
          sequenceOrder: 40,
          status: 'confirmed',
          totalPriceCents: 18000,
          termsAndConditions: 'Original transport terms',
          cancellationPolicy: 'Original transport policy',
          supplier: 'Original transport supplier',
        })

        // Update only supplier
        const updated = await componentOrchestrationService.updateTransportation(created.id, {
          supplier: 'New transport supplier',
        })

        expect(updated.termsAndConditions).toBe('Original transport terms') // Preserved
        expect(updated.cancellationPolicy).toBe('Original transport policy') // Preserved
        expect(updated.supplier).toBe('New transport supplier') // Updated
      })

      it('should clear transportation booking detail field when explicitly set to null', async () => {
        const created = await componentOrchestrationService.createTransportation({
          itineraryDayId: testDayId,
          componentType: 'transportation',
          name: 'Transport Clear Field Test',
          sequenceOrder: 41,
          status: 'confirmed',
          totalPriceCents: 16000,
          termsAndConditions: 'Transport terms to clear',
          cancellationPolicy: 'Transport policy to keep',
          supplier: 'Transport supplier to clear',
        })

        const updated = await componentOrchestrationService.updateTransportation(created.id, {
          termsAndConditions: null,
          supplier: null,
        })

        expect(updated.termsAndConditions).toBeNull() // Cleared
        expect(updated.cancellationPolicy).toBe('Transport policy to keep') // Preserved
        expect(updated.supplier).toBeNull() // Cleared
      })
    })
  })
})
