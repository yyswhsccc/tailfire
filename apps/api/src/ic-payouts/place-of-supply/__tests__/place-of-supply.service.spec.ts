/**
 * Unit Tests: PlaceOfSupplyService
 *
 * TDD — tests are written against the public API of the service.
 * No real DB needed — all deps are mocked.
 *
 * CRA rule applied: for services provided to a registrant, place of supply
 * is the recipient's (agency's) address — CRA General GST/HST Guide §3.
 * Memorandum 3-3-6 exceptions (real property, in-person services) deferred
 * to tax counsel.
 */

import { Test } from '@nestjs/testing'
import { PlaceOfSupplyService } from '../place-of-supply.service'
import { DatabaseService } from '../../../db/database.service'

// ─── Mock helpers ────────────────────────────────────────────────────────────

/**
 * Minimal Drizzle mock tailored to PlaceOfSupplyService's two select queries:
 *   1. agency_tax_filing_config — keyed by agencyId
 *   2. tax_rates — keyed by jurisdiction + date
 *
 * The mock tracks how many times each table is selected so tests can assert
 * that the short-circuit path skips the tax_rates lookup.
 *
 * Strategy: a queue of responses. Each call to select() pops the next response
 * from _queue. If the queue is empty, the mock returns [].
 */
function createMockDrizzle() {
  const state = {
    agencyConfig: null as any,
    taxRate: null as any,
  }

  const calls = {
    taxRatesSelectCount: 0,
    agencyConfigSelectCount: 0,
  }

  // Track which query we're building so we can route to the right state.
  // We detect the table by inspecting what .from() receives (the table object).
  // Since the table objects are mocked, we use a call-order queue instead.
  //
  // Queue approach: resolve() calls pop from the front of the queue.
  // Tests prime _queue before invoking service methods.
  const _queue: (() => any[])[]  = []

  /**
   * Build a Drizzle select chain that resolves with the return value of `resolver`.
   * The chain supports:
   *   .select().from(table).where(...).orderBy(...).limit(n) → Promise<rows>
   *   .select().from(table).where(...).limit(n) → Promise<rows>
   *   .select().from(table).where(...) → thenable (for code that doesn't call .limit())
   */
  function makeSelectChain(resolver: () => any[]): any {
    const chain: any = {}
    chain.from = jest.fn((table: any) => {
      // Detect table by duck-typing on common column names
      const isAgencyConfig = table && typeof table === 'object' &&
        ('agencyId' in table || (table[Symbol.for('drizzle:Name')] === 'agency_tax_filing_config'))
      const isTaxRates = table && typeof table === 'object' &&
        ('rateBp' in table || (table[Symbol.for('drizzle:Name')] === 'tax_rates'))
      if (isAgencyConfig) calls.agencyConfigSelectCount++
      if (isTaxRates) calls.taxRatesSelectCount++
      return chain
    })
    chain.where = jest.fn(() => {
      const thenableChain: any = {}
      thenableChain.orderBy = jest.fn(() => {
        const orderedChain: any = {}
        orderedChain.limit = jest.fn(() => Promise.resolve(resolver()))
        return orderedChain
      })
      thenableChain.limit = jest.fn(() => Promise.resolve(resolver()))
      thenableChain.then = (resolve: (v: any) => any, reject: (e: any) => any) =>
        Promise.resolve(resolver()).then(resolve, reject)
      return thenableChain
    })
    chain.limit = jest.fn(() => Promise.resolve(resolver()))
    return chain
  }

  // Each call to select() pops a resolver from _queue.
  const mockSelect = jest.fn(() => {
    const resolver = _queue.shift() ?? (() => [])
    return makeSelectChain(resolver)
  })

  const client = { select: mockSelect }

  /**
   * Prime the mock for a specific scenario.
   * Call this BEFORE invoking the service method.
   */
  function primeAgencyConfig(config: any) {
    _queue.push(() => (config ? [config] : []))
  }

  function primeTaxRate(rate: any) {
    _queue.push(() => (rate ? [rate] : []))
  }

  return {
    client,
    _state: state,
    _calls: calls,
    _queue,
    primeAgencyConfig,
    primeTaxRate,
    _mocks: { mockSelect },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlaceOfSupplyService', () => {
  let service: PlaceOfSupplyService
  let mockDb: ReturnType<typeof createMockDrizzle>

  beforeEach(async () => {
    mockDb = createMockDrizzle()

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlaceOfSupplyService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile()

    service = moduleRef.get(PlaceOfSupplyService)
  })

  afterEach(() => jest.clearAllMocks())

  // ── CRA general rule: recipient address ──────────────────────────────────

  it('returns agency filing province by default (CRA general rule for services)', async () => {
    mockDb.primeAgencyConfig({ agencyId: 'phoenix', filingProvince: 'ON' })
    mockDb.primeTaxRate({ jurisdiction: 'ON', taxType: 'HST', rateBp: 1300, effectiveFrom: '2010-07-01' })

    const result = await service.resolve({
      agencyId: 'phoenix',
      icDomicileProvince: 'BC',  // intentionally different — should be ignored
      invoiceDate: '2026-05-01',
      icGstHstRegistered: true,
    })

    expect(result.jurisdiction).toBe('ON')
    expect(result.taxType).toBe('HST')
    expect(result.rateBp).toBe(1300)
    expect(result.rule).toBe('general-recipient-address')
  })

  // ── IC not registered: short-circuit with 0 rate ─────────────────────────

  it('returns 0 rate when IC is not GST/HST registered', async () => {
    // No priming needed — the short-circuit runs before any DB call

    const result = await service.resolve({
      agencyId: 'phoenix',
      icDomicileProvince: 'ON',
      invoiceDate: '2026-05-01',
      icGstHstRegistered: false,
    })

    expect(result.rateBp).toBe(0)
    expect(result.taxType).toBe('NONE')
    expect(result.rule).toBe('ic-not-registered')
  })

  it('does not look up tax_rates when IC is not registered', async () => {
    await service.resolve({
      agencyId: 'phoenix',
      icDomicileProvince: 'ON',
      invoiceDate: '2026-05-01',
      icGstHstRegistered: false,
    })

    expect(mockDb._calls.taxRatesSelectCount).toBe(0)
  })

  it('does not look up agency_tax_filing_config when IC is not registered', async () => {
    await service.resolve({
      agencyId: 'phoenix',
      icDomicileProvince: 'ON',
      invoiceDate: '2026-05-01',
      icGstHstRegistered: false,
    })

    expect(mockDb._mocks.mockSelect).not.toHaveBeenCalled()
  })

  // ── Error: missing agency config ──────────────────────────────────────────

  it('throws when no agency tax filing config exists', async () => {
    mockDb.primeAgencyConfig(null)  // empty result

    await expect(
      service.resolve({
        agencyId: 'phoenix',
        icDomicileProvince: 'ON',
        invoiceDate: '2026-05-01',
        icGstHstRegistered: true,
      })
    ).rejects.toThrow(/no tax filing config/i)
  })

  // ── Error: no tax rate for jurisdiction on invoice date ───────────────────

  it('throws when no tax rate is configured for jurisdiction on invoice date', async () => {
    mockDb.primeAgencyConfig({ agencyId: 'phoenix', filingProvince: 'ON' })
    mockDb.primeTaxRate(null)  // no rate found

    await expect(
      service.resolve({
        agencyId: 'phoenix',
        icDomicileProvince: 'ON',
        invoiceDate: '2026-05-01',
        icGstHstRegistered: true,
      })
    ).rejects.toThrow(/no tax rate.*ON/i)
  })

  // ── Effective-date selection ──────────────────────────────────────────────

  it('picks the most recent effective rate at the invoice date', async () => {
    // tax_rates has multiple effective_from rows for ON.
    // Service should pick the latest effective_from <= invoiceDate.
    // The mock simulates the DB already returning the correct row (SQL ORDER BY + LIMIT 1).
    mockDb.primeAgencyConfig({ agencyId: 'phoenix', filingProvince: 'ON' })
    mockDb.primeTaxRate({ jurisdiction: 'ON', taxType: 'HST', rateBp: 1300, effectiveFrom: '2010-07-01' })

    const result = await service.resolve({
      agencyId: 'phoenix',
      icDomicileProvince: 'ON',
      invoiceDate: '2026-05-01',
      icGstHstRegistered: true,
    })

    expect(result.rateBp).toBe(1300)  // ON HST 13%
    expect(result.taxType).toBe('HST')
  })

  // ── jurisdiction flows through from agency config ─────────────────────────

  it('uses the agency filing province as the tax jurisdiction, not the IC domicile', async () => {
    // Agency is in QC, IC is in AB — QC rules apply
    mockDb.primeAgencyConfig({ agencyId: 'agency-qc', filingProvince: 'QC' })
    mockDb.primeTaxRate({ jurisdiction: 'QC', taxType: 'GST+QST', rateBp: 1498, effectiveFrom: '2012-01-01' })

    const result = await service.resolve({
      agencyId: 'agency-qc',
      icDomicileProvince: 'AB',
      invoiceDate: '2026-05-01',
      icGstHstRegistered: true,
    })

    expect(result.jurisdiction).toBe('QC')
    expect(result.taxType).toBe('GST+QST')
    expect(result.rateBp).toBe(1498)
    expect(result.rule).toBe('general-recipient-address')
  })
})
