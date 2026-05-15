/**
 * Unit Tests: ConsumerActivityService — agency scoping (B1)
 *
 * Verifies that:
 * - Same-agency contact lookups proceed and return data
 * - Cross-agency contact lookups throw ForbiddenException (without leaking
 *   whether the contact exists in another agency)
 * - All three read methods (getActivityForContact, getInsightsForContact,
 *   generateSignals) enforce the agency check before reading data
 */

import { ForbiddenException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ConsumerActivityService } from './consumer-activity.service'
import { DatabaseService } from '../db/database.service'

const ACTOR_AGENCY = 'agency-actor'
const OTHER_AGENCY = 'agency-other'
const CONTACT_ID = 'contact-1'

type MockChain = {
  select: jest.Mock
  from: jest.Mock
  where: jest.Mock
  limit: jest.Mock
  orderBy: jest.Mock
}

function makeChain(): MockChain {
  const chain: MockChain = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    orderBy: jest.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  return chain
}

describe('ConsumerActivityService — B1 agency scoping', () => {
  let service: ConsumerActivityService
  let chain: MockChain

  beforeEach(async () => {
    chain = makeChain()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsumerActivityService,
        {
          provide: DatabaseService,
          useValue: {
            client: chain,
            schema: {
              contacts: { id: 'id', agencyId: 'agencyId' },
              consumerActivity: {
                id: 'id',
                contactId: 'contactId',
                createdAt: 'createdAt',
                event: 'event',
                entityType: 'entityType',
                entitySlug: 'entitySlug',
                entityName: 'entityName',
              },
              consumerInsights: {
                id: 'id',
                contactId: 'contactId',
                createdAt: 'createdAt',
              },
            },
          },
        },
      ],
    }).compile()

    service = module.get<ConsumerActivityService>(ConsumerActivityService)
  })

  // ============================================================================
  // getActivityForContact
  // ============================================================================

  describe('getActivityForContact', () => {
    it('returns events for same-agency contact', async () => {
      const fakeEvents = [{ id: 'e1', event: 'page_view', entitySlug: 'caribbean' }]
      // First call (agency check) returns the contact row; second call returns events
      chain.limit.mockResolvedValueOnce([{ id: CONTACT_ID }]).mockResolvedValueOnce(fakeEvents)

      const result = await service.getActivityForContact(CONTACT_ID, ACTOR_AGENCY, 50)

      expect(result).toEqual(fakeEvents)
      expect(chain.limit).toHaveBeenCalledTimes(2)
    })

    it('throws ForbiddenException for cross-agency contact (and never reads activity)', async () => {
      // Agency check: contact does not match (cross-agency or non-existent)
      chain.limit.mockResolvedValueOnce([])

      await expect(
        service.getActivityForContact(CONTACT_ID, OTHER_AGENCY, 50),
      ).rejects.toThrow(ForbiddenException)

      // Critical: only the agency check ran. The activity read must NOT execute.
      expect(chain.limit).toHaveBeenCalledTimes(1)
    })

    it('throws same ForbiddenException for non-existent contact (no enumeration leak)', async () => {
      chain.limit.mockResolvedValueOnce([])

      await expect(
        service.getActivityForContact('does-not-exist', ACTOR_AGENCY, 50),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // ============================================================================
  // getInsightsForContact
  // ============================================================================

  describe('getInsightsForContact', () => {
    it('returns insights for same-agency contact', async () => {
      const fakeInsights = [{ id: 'i1', summary: 'Loves cruises' }]
      chain.limit.mockResolvedValueOnce([{ id: CONTACT_ID }]).mockResolvedValueOnce(fakeInsights)

      const result = await service.getInsightsForContact(CONTACT_ID, ACTOR_AGENCY)

      expect(result).toEqual(fakeInsights)
    })

    it('throws ForbiddenException for cross-agency contact (and never reads insights)', async () => {
      chain.limit.mockResolvedValueOnce([])

      await expect(
        service.getInsightsForContact(CONTACT_ID, OTHER_AGENCY),
      ).rejects.toThrow(ForbiddenException)

      expect(chain.limit).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================================================
  // generateSignals (calls getActivityForContact internally)
  // ============================================================================

  describe('generateSignals', () => {
    it('returns signals for same-agency contact', async () => {
      // Two page_view events on the same entity → 'Interested in' signal (medium)
      const fakeEvents = [
        { event: 'page_view', entityType: 'destination', entitySlug: 'caribbean', entityName: 'Caribbean' },
        { event: 'page_view', entityType: 'destination', entitySlug: 'caribbean', entityName: 'Caribbean' },
      ]
      chain.limit.mockResolvedValueOnce([{ id: CONTACT_ID }]).mockResolvedValueOnce(fakeEvents)

      const signals = await service.generateSignals(CONTACT_ID, ACTOR_AGENCY)

      expect(signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: expect.stringContaining('Caribbean') }),
        ]),
      )
    })

    it('throws ForbiddenException for cross-agency contact (and never reads activity)', async () => {
      chain.limit.mockResolvedValueOnce([])

      await expect(
        service.generateSignals(CONTACT_ID, OTHER_AGENCY),
      ).rejects.toThrow(ForbiddenException)

      expect(chain.limit).toHaveBeenCalledTimes(1)
    })
  })
})
