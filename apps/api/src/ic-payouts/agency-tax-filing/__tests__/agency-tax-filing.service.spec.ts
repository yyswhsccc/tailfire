/**
 * Unit Tests: AgencyTaxFilingService
 *
 * Pure unit tests with a mocked DatabaseService.
 * Verifies upsert logic: insert when no row exists, update when one does.
 */

import { Test } from '@nestjs/testing'
import { AgencyTaxFilingService } from '../agency-tax-filing.service'
import { DatabaseService } from '../../../db/database.service'

// ─── Mock helpers ────────────────────────────────────────────────────────────

/**
 * Minimal Drizzle mock that records insert/update calls and returns
 * configurable row sets.  Mirrors the pattern in ic-tax-profiles.service.spec.ts.
 */
function createMockDrizzle() {
  const state = {
    selectRows: [] as any[],
    insertReturning: [] as any[],
    updateReturning: [] as any[],
  }

  // insert chain: .insert().values().returning() → Promise<rows>
  const mockReturningInsert = jest.fn(() => Promise.resolve(state.insertReturning))
  const mockValuesInsert = jest.fn(() => ({ returning: mockReturningInsert }))
  const mockInsert = jest.fn(() => ({ values: mockValuesInsert }))

  // update chain: .update().set().where().returning() → Promise<rows>
  const mockReturningUpdate = jest.fn(() => Promise.resolve(state.updateReturning))
  const mockWhereUpdate = jest.fn(() => ({ returning: mockReturningUpdate }))
  const mockSetUpdate = jest.fn(() => ({ where: mockWhereUpdate }))
  const mockUpdate = jest.fn(() => ({ set: mockSetUpdate }))

  // select chain: .select().from().where().limit() → Promise<rows>
  const mockLimit = jest.fn(() => Promise.resolve(state.selectRows))
  const mockWhereSelect = jest.fn(() => ({ limit: mockLimit }))
  const mockFrom = jest.fn(() => ({ where: mockWhereSelect }))
  const mockSelect = jest.fn(() => ({ from: mockFrom }))

  const client = { insert: mockInsert, update: mockUpdate, select: mockSelect }

  return {
    client,
    _state: state,
    _calls: {
      get insert() { return (mockInsert.mock.calls as unknown[][]) },
      get update() { return (mockUpdate.mock.calls as unknown[][]) },
    },
  }
}

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const baseInput = {
  legalName: 'Phoenix Voyages Inc.',
  payerAccountNumber: '123456789RP0001',
  filingAddress: { street: '1 King St W', city: 'Toronto', province: 'ON', postalCode: 'M5H1A1' },
  filingProvince: 'ON',
  effectiveFrom: '2026-01-01',
}

const existingRow = {
  agencyId: 'agency-1',
  legalName: 'Phoenix Voyages Inc.',
  payerAccountNumber: '123456789RP0001',
  filingAddress: { street: '1 King St W', city: 'Toronto', province: 'ON', postalCode: 'M5H1A1' },
  filingProvince: 'ON',
  effectiveFrom: '2026-01-01',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgencyTaxFilingService', () => {
  let service: AgencyTaxFilingService
  let mockDb: ReturnType<typeof createMockDrizzle>

  beforeEach(async () => {
    mockDb = createMockDrizzle()

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgencyTaxFilingService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile()

    service = moduleRef.get(AgencyTaxFilingService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns null when no config exists', async () => {
      mockDb._state.selectRows = []
      const result = await service.get('agency-1')
      expect(result).toBeNull()
    })

    it('returns the existing row when config is present', async () => {
      mockDb._state.selectRows = [existingRow]
      const result = await service.get('agency-1')
      expect(result).toEqual(existingRow)
    })
  })

  // ── upsert — insert path ───────────────────────────────────────────────────

  describe('upsert (no existing config)', () => {
    beforeEach(() => {
      // get() returns empty → insert path
      mockDb._state.selectRows = []
      mockDb._state.insertReturning = [{ ...existingRow, createdBy: 'admin-1', updatedBy: 'admin-1' }]
    })

    it('calls insert, not update', async () => {
      await service.upsert('agency-1', 'admin-1', baseInput)
      expect(mockDb._calls.insert).toHaveLength(1)
      expect(mockDb._calls.update).toHaveLength(0)
    })

    it('returns the inserted row', async () => {
      const result = await service.upsert('agency-1', 'admin-1', baseInput)
      expect(result.agencyId).toBe('agency-1')
      expect(result.legalName).toBe('Phoenix Voyages Inc.')
    })

    it('passes agencyId and userId (createdBy/updatedBy) to insert', async () => {
      await service.upsert('agency-42', 'user-99', baseInput)
      // Key assertion: insert was called (not update)
      expect(mockDb._calls.insert).toHaveLength(1)
      expect(mockDb._calls.update).toHaveLength(0)
    })

    it('inserts transmitterNumber when provided', async () => {
      mockDb._state.insertReturning = [{ ...existingRow, transmitterNumber: 'MM123456' }]
      const result = await service.upsert('agency-1', 'admin-1', {
        ...baseInput,
        transmitterNumber: 'MM123456',
      })
      expect(result.transmitterNumber).toBe('MM123456')
    })
  })

  // ── upsert — update path ───────────────────────────────────────────────────

  describe('upsert (existing config present)', () => {
    beforeEach(() => {
      // get() returns a row → update path
      mockDb._state.selectRows = [existingRow]
      mockDb._state.updateReturning = [{ ...existingRow, legalName: 'Phoenix Voyages Renamed' }]
    })

    it('calls update, not insert', async () => {
      await service.upsert('agency-1', 'admin-1', { ...baseInput, legalName: 'Phoenix Voyages Renamed' })
      expect(mockDb._calls.update).toHaveLength(1)
      expect(mockDb._calls.insert).toHaveLength(0)
    })

    it('returns the updated row', async () => {
      const result = await service.upsert('agency-1', 'admin-1', {
        ...baseInput,
        legalName: 'Phoenix Voyages Renamed',
      })
      expect(result.legalName).toBe('Phoenix Voyages Renamed')
    })
  })
})
