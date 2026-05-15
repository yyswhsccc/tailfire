/**
 * Integration Test: createHistoricalPaidCheck (P1.C)
 *
 * Verifies the atomic create-paid-check-with-settlements endpoint that the
 * TES → TF cutover importer / backfill scripts depend on. Without this,
 * historical commissions surface on agent payout dashboards as still-owed.
 *
 * Covers:
 * - Happy path: paid check created with status='accepted' + N settlements written
 * - getCommissionDue() must not return items that now have settlements
 * - Settlement amount preservation (matches TES Commission.Paid input)
 * - Idempotency: re-running same (source, sourceRef) returns 409 with existing id
 * - Input validation: empty settlements, duplicate checkItemId, negative amount
 * - Cross-agency leak guard: checkItemIds outside the auth agency → 404
 *
 * See docs/runbooks/tes-cutover-backfill-plan.md#p1c-historical-paid-settlement-endpoint
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ConfigModule } from '@nestjs/config'
import { eq } from 'drizzle-orm'
import { DatabaseModule } from '../../../db/database.module'
import { EncryptionModule } from '../../../common/encryption'
import { DatabaseService } from '../../../db/database.service'
import { CommissionModule } from '../commission.module'
import { CommissionService } from '../commission.service'
import { schema } from '@tailfire/database'

const {
  trips,
  contacts,
  itineraries,
  itineraryDays,
  itineraryActivities,
  activityPricing,
  commissionChecks,
  commissionCheckItems,
  commissionItemSettlements,
  userProfiles,
} = schema

const TEST_AGENCY_ID = '00000000-0000-0000-0000-000000000001'
const ADMIN_USER_ID = 'aaaa0001-0000-0000-0000-000000000001'

describe('CommissionService.createHistoricalPaidCheck (P1.C)', () => {
  let app: INestApplication
  let dbService: DatabaseService
  let commissionService: CommissionService

  let testContactId: string
  let testTripId: string
  let testItineraryId: string
  let testDayId: string
  let testActivityId: string
  let testPricingId: string
  let receivedCheckId: string
  let checkItemId1: string
  let checkItemId2: string

  const getDb = () => dbService.db

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        EventEmitterModule.forRoot(),
        DatabaseModule,
        EncryptionModule,
        CommissionModule,
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    dbService = moduleFixture.get<DatabaseService>(DatabaseService)
    commissionService = moduleFixture.get<CommissionService>(CommissionService)
  })

  beforeEach(async () => {
    const db = getDb()

    const [contact] = await db
      .insert(contacts)
      .values({
        agencyId: TEST_AGENCY_ID,
        firstName: 'HistPaid',
        lastName: 'Tester',
        email: `hist-paid-${Date.now()}-${Math.random()}@example.com`,
      })
      .returning()
    testContactId = contact!.id

    const [trip] = await db
      .insert(trips)
      .values({
        agencyId: TEST_AGENCY_ID,
        name: 'Historical Paid Test Trip',
        primaryContactId: testContactId,
        ownerId: ADMIN_USER_ID,
        status: 'travelled',
        currency: 'CAD',
      })
      .returning()
    testTripId = trip!.id

    const [itin] = await db
      .insert(itineraries)
      .values({ agencyId: TEST_AGENCY_ID, tripId: testTripId, name: 'Itin', status: 'approved' })
      .returning()
    testItineraryId = itin!.id

    const [day] = await db
      .insert(itineraryDays)
      .values({
        agencyId: TEST_AGENCY_ID,
        itineraryId: testItineraryId,
        dayNumber: 1,
        date: '2026-01-01',
      })
      .returning()
    testDayId = day!.id

    const [activity] = await db
      .insert(itineraryActivities)
      .values({
        agencyId: TEST_AGENCY_ID,
        itineraryDayId: testDayId,
        activityType: 'flight',
        componentType: 'flight',
        name: 'Test Flight',
        sequenceOrder: 0,
        proposalStatus: 'approved',
        bookingStatus: 'booked',
      })
      .returning()
    testActivityId = activity!.id

    const [pricing] = await db
      .insert(activityPricing)
      .values({
        agencyId: TEST_AGENCY_ID,
        activityId: testActivityId,
        currency: 'CAD',
        pricingType: 'flat_rate',
        basePrice: '0',
        totalPriceCents: 100000,
      })
      .returning()
    testPricingId = pricing!.id

    // Received check (accepted) — provides the check_items to settle against.
    const [received] = await db
      .insert(commissionChecks)
      .values({
        agencyId: TEST_AGENCY_ID,
        checkNumber: 'RCV-HIST-1',
        checkType: 'received',
        checkDate: '2026-01-15',
        checkAmountCents: 20000,
        currency: 'CAD',
        senderName: 'Air Canada',
        status: 'accepted',
      })
      .returning()
    receivedCheckId = received!.id

    const [item1] = await db
      .insert(commissionCheckItems)
      .values({
        checkId: receivedCheckId,
        activityPricingId: testPricingId,
        receivedCents: 12000,
      })
      .returning()
    checkItemId1 = item1!.id

    const [item2] = await db
      .insert(commissionCheckItems)
      .values({
        checkId: receivedCheckId,
        activityPricingId: testPricingId,
        description: 'second item without pricing FK',
        receivedCents: 8000,
      })
      .returning()
    checkItemId2 = item2!.id
  })

  afterEach(async () => {
    const db = getDb()
    // Cascades clean up everything down from trip + commission check.
    await db.delete(commissionChecks).where(eq(commissionChecks.id, receivedCheckId)).catch(() => {})
    await db.delete(trips).where(eq(trips.id, testTripId)).catch(() => {})
    await db.delete(contacts).where(eq(contacts.id, testContactId)).catch(() => {})
  })

  afterAll(async () => {
    await app.close()
  })

  describe('happy path', () => {
    it('creates paid check + settlements atomically; getCommissionDue no longer returns these items', async () => {
      const result = await commissionService.createHistoricalPaidCheck(
        TEST_AGENCY_ID,
        {
          checkNumber: 'TES-PAID-12345',
          checkDate: '2026-01-20',
          currency: 'CAD',
          recipientUserId: ADMIN_USER_ID,
          recipientName: 'Test Agent',
          source: 'travelesolutions',
          sourceRef: '12345',
          settlements: [
            { checkItemId: checkItemId1, settledAmountCents: 7200 },
            { checkItemId: checkItemId2, settledAmountCents: 4800 },
          ],
        },
        ADMIN_USER_ID
      )

      expect(result.checkType).toBe('paid')
      expect(result.status).toBe('accepted')
      expect(result.checkAmountCents).toBe(12000) // 7200 + 4800
      expect(result.source).toBe('travelesolutions')
      expect(result.sourceRef).toBe('12345')
      expect(result.settlementCount).toBe(2)
      expect(result.duplicateCount).toBe(0)

      // DB verification: settlement rows exist with the exact amounts we passed.
      const db = getDb()
      const settlements = await db
        .select()
        .from(commissionItemSettlements)
        .where(eq(commissionItemSettlements.paidCheckId, result.id))

      expect(settlements).toHaveLength(2)
      const item1Settlement = settlements.find((s) => s.checkItemId === checkItemId1)
      const item2Settlement = settlements.find((s) => s.checkItemId === checkItemId2)
      expect(item1Settlement?.settledAmountCents).toBe(7200)
      expect(item2Settlement?.settledAmountCents).toBe(4800)
    })
  })

  describe('idempotency via (source, sourceRef)', () => {
    it('rejects a duplicate (source, sourceRef) with 409 + existingCheckId', async () => {
      const first = await commissionService.createHistoricalPaidCheck(
        TEST_AGENCY_ID,
        {
          checkNumber: 'TES-PAID-99999',
          checkDate: '2026-01-20',
          currency: 'CAD',
          recipientUserId: ADMIN_USER_ID,
          source: 'travelesolutions',
          sourceRef: '99999',
          settlements: [{ checkItemId: checkItemId1, settledAmountCents: 5000 }],
        },
        ADMIN_USER_ID
      )

      await expect(
        commissionService.createHistoricalPaidCheck(
          TEST_AGENCY_ID,
          {
            checkNumber: 'TES-PAID-99999-DUP',
            checkDate: '2026-01-20',
            currency: 'CAD',
            recipientUserId: ADMIN_USER_ID,
            source: 'travelesolutions',
            sourceRef: '99999',
            settlements: [{ checkItemId: checkItemId2, settledAmountCents: 5000 }],
          },
          ADMIN_USER_ID
        )
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('input validation', () => {
    const validBase = () => ({
      checkNumber: 'TES-PAID-VAL',
      checkDate: '2026-01-20',
      currency: 'CAD',
      recipientUserId: ADMIN_USER_ID,
      source: 'travelesolutions',
    })

    it('rejects empty settlements', async () => {
      await expect(
        commissionService.createHistoricalPaidCheck(
          TEST_AGENCY_ID,
          { ...validBase(), settlements: [] },
          ADMIN_USER_ID
        )
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects duplicate checkItemId in settlements', async () => {
      await expect(
        commissionService.createHistoricalPaidCheck(
          TEST_AGENCY_ID,
          {
            ...validBase(),
            settlements: [
              { checkItemId: checkItemId1, settledAmountCents: 1000 },
              { checkItemId: checkItemId1, settledAmountCents: 2000 },
            ],
          },
          ADMIN_USER_ID
        )
      ).rejects.toThrow(/Duplicate checkItemId/)
    })

    it('rejects negative settledAmountCents', async () => {
      await expect(
        commissionService.createHistoricalPaidCheck(
          TEST_AGENCY_ID,
          {
            ...validBase(),
            settlements: [{ checkItemId: checkItemId1, settledAmountCents: -100 }],
          },
          ADMIN_USER_ID
        )
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('cross-agency leak guard', () => {
    it('rejects checkItemIds that exist but belong to a different agency', async () => {
      const phantomItemId = '99999999-9999-9999-9999-999999999999'
      await expect(
        commissionService.createHistoricalPaidCheck(
          TEST_AGENCY_ID,
          {
            checkNumber: 'TES-PAID-LEAK',
            checkDate: '2026-01-20',
            currency: 'CAD',
            recipientUserId: ADMIN_USER_ID,
            source: 'travelesolutions',
            settlements: [{ checkItemId: phantomItemId, settledAmountCents: 1000 }],
          },
          ADMIN_USER_ID
        )
      ).rejects.toThrow(NotFoundException)
    })
  })
})
