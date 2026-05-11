/**
 * Unit Tests: IcInvoiceService
 *
 * TDD — tests written before implementation and verified to fail, then pass.
 *
 * Key invariants tested:
 *  C3-1. Reservation is created atomically at submit time (not approve time).
 *  C3-2. Concurrent double-claim of the same item is rejected via ON CONFLICT DO NOTHING.
 *  C3-3. Active RCTI authorization required before submission.
 *  C3-4. Multi-currency selections split into one invoice per currency.
 *  C3-5. Tax computed correctly via PlaceOfSupplyService output.
 *  C3-6. Zero tax when IC is not GST-registered.
 *  C3-7. Pending adjustments auto-included, currency-grouped.
 *  C3-8. Empty selectedCheckItemIds throws BadRequest.
 *  C3-9. approve() state machine: submitted → approved; idempotence-guard on other states.
 *  C3-10. reject() reversal: deletes settlements, flips adjustments to pending, cancels paid check.
 *  C3-11. PDF failure is non-blocking (invoice committed, no rollback).
 *  C3-12. Snapshot fields (legalName, address, gstHstNumber, sinOrBnMask) populated from profile.
 */

import { Test } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { IcInvoiceService } from '../ic-invoice.service'
import { DatabaseService } from '../../../db/database.service'
import { IcInvoiceNumberAllocator } from '../ic-invoice-number-allocator.service'
import { PlaceOfSupplyService } from '../../place-of-supply/place-of-supply.service'
import { IcInvoicePdfService } from '../ic-invoice-pdf.service'
import { StorageService } from '../../../trips/storage.service'
import { DisbursementService } from '../../disbursements/disbursement.service'

const mockEventEmitter = { emit: jest.fn() }
const mockDisbursementService = { enqueue: jest.fn().mockResolvedValue({}) }

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENCY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const PROFILE_ID = 'pppppppp-pppp-pppp-pppp-pppppppppppp'
const AUTH_ID = 'authauth-auth-auth-auth-authauthauthauth'.slice(0, 36)
const RESERVATION_CHECK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const INVOICE_ID = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii'
const INVOICE_NUMBER = 'INV-2026-11111111-000001'

// ─── Mock builders ─────────────────────────────────────────────────────────────

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    legalName: 'Mary IC Consultant',
    domicileAddress: { street: '1 King St', city: 'Toronto', province: 'ON', postalCode: 'M5H1A1' },
    domicileProvince: 'ON',
    isCorporation: false,
    gstHstRegistered: true,
    gstHstNumber: '123456789RT0001',
    sinOrBnMask: '***-***-789',
    rctiAuthorizationId: AUTH_ID,
    autoDisburse: false,
    approvalCeilingCents: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeCadItem(id: string, commissionCents = 10_000) {
  return {
    id,
    checkId: 'src-check-cad',
    activityPricingId: `ap-${id}`,
    description: `Activity for ${id}`,
    receivedCents: commissionCents,
    currency: 'CAD',
    tripRef: 'TRIP-001',
    commissionCents,
    settled_amount_cents: commissionCents,
  }
}

function makeUsdItem(id: string, commissionCents = 8_000) {
  return {
    id,
    checkId: 'src-check-usd',
    activityPricingId: `ap-${id}`,
    description: `Activity for ${id}`,
    receivedCents: commissionCents,
    currency: 'USD',
    tripRef: 'TRIP-002',
    commissionCents,
    settled_amount_cents: commissionCents,
  }
}

function makeAdjustment(id: string, currency = 'CAD', amountCents = -5000) {
  return {
    id,
    agencyId: AGENCY_ID,
    agentUserId: USER_ID,
    currency,
    amountCents,
    description: 'Clawback adjustment',
    status: 'pending',
  }
}

function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    invoiceNumber: INVOICE_NUMBER,
    invoiceDate: '2026-05-10',
    currency: 'CAD',
    icLegalName: 'Mary IC Consultant',
    icAddress: { street: '1 King St', city: 'Toronto', province: 'ON', postalCode: 'M5H1A1' },
    icDomicileProvince: 'ON',
    icGstHstNumber: '123456789RT0001',
    icSinOrBnMask: '***-***-789',
    icTaxProfileId: PROFILE_ID,
    rctiAuthorizationId: AUTH_ID,
    reportableBaseCents: 30_000,
    taxCents: 3_900,
    totalCents: 33_900,
    placeOfSupplyJurisdiction: 'ON',
    placeOfSupplyRule: 'general-recipient-address',
    taxType: 'HST',
    taxRateBp: 1300,
    pdfStoragePath: null,
    pdfHash: null,
    status: 'submitted',
    submittedAt: new Date(),
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    reservationCheckId: RESERVATION_CHECK_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeReservationCheck(overrides: Record<string, unknown> = {}) {
  return {
    id: RESERVATION_CHECK_ID,
    agencyId: AGENCY_ID,
    checkNumber: INVOICE_NUMBER,
    checkType: 'paid',
    checkDate: '2026-05-10',
    checkAmountCents: 30_000,
    currency: 'CAD',
    recipientUserId: USER_ID,
    recipientName: 'Mary IC Consultant',
    status: 'submitted',
    source: 'ic-payouts',
    sourceRef: INVOICE_NUMBER,
    ...overrides,
  }
}

// ─── Database mock ─────────────────────────────────────────────────────────────

/**
 * Creates a comprehensive DatabaseService mock that supports the full
 * IcInvoiceService transaction graph:
 *
 *  Phase 0 (pre-tx):   select → profile lookup
 *  Phase 1 (pre-tx):   execute → eligible items SQL (returns rows with currency)
 *  Phase 2 (pre-tx):   execute → pending adjustments SQL
 *  Phase 3 (tx):       insert commissionChecks → reservationCheck
 *  Phase 4 (tx):       execute → settlements INSERT ... ON CONFLICT DO NOTHING RETURNING
 *  Phase 5 (tx):       execute → adjustments UPDATE ... RETURNING
 *  Phase 6 (tx):       insert icInvoices → invoice row
 *  Phase 7 (tx):       insert icInvoiceLines → (no returning needed)
 *  Phase 8 (post-tx):  select → lines fetch for PDF
 *  Phase 9 (post-tx):  update → pdfStoragePath + pdfHash
 *  approve: update icInvoices WHERE status='submitted', update commissionChecks
 *  reject:  update icInvoices WHERE status IN (...), execute DELETE settlements,
 *           execute UPDATE adjustments, update commissionChecks
 */
function createMockDb(initialState?: {
  profile?: ReturnType<typeof makeProfile> | null
  eligibleItems?: ReturnType<typeof makeCadItem>[]
  adjustments?: ReturnType<typeof makeAdjustment>[]
  settlementsReturning?: { id: string }[]
  reservationCheck?: ReturnType<typeof makeReservationCheck>
  invoice?: ReturnType<typeof makeInvoiceRow>
  lines?: any[]
  existingInvoice?: ReturnType<typeof makeInvoiceRow>
}) {
  const state = {
    // Use explicit undefined check — null means "no profile", undefined means "use default"
    profile: initialState?.profile !== undefined ? initialState.profile : makeProfile(),
    eligibleItems: initialState?.eligibleItems ?? [
      makeCadItem('item-1'),
      makeCadItem('item-2'),
      makeCadItem('item-3'),
    ],
    adjustments: initialState?.adjustments ?? [],
    // settlements INSERT returns one row per claimed item by default
    settlementsReturning: initialState?.settlementsReturning ?? null, // null = auto from items
    reservationCheck: initialState?.reservationCheck ?? makeReservationCheck(),
    invoice: initialState?.invoice ?? makeInvoiceRow(),
    lines: initialState?.lines ?? [],
    existingInvoice: initialState?.existingInvoice ?? makeInvoiceRow(),
  }

  const calls = {
    settlementsInserts: 0,
    settlementsDelete: 0,
    adjustmentsUpdates: [] as Record<string, unknown>[],
    commissionChecksUpdate: [] as Record<string, unknown>[],
    invoiceInserts: 0,
    lineInserts: 0,
    invoiceUpdates: [] as Record<string, unknown>[],
  }

  // Track what settlements mock should return — tests can override per call
  let settlementsCallCount = 0
  const settlementsOverrides: Map<number, { id: string }[]> = new Map()

  // Build the select chain. The mock intercepts the FIRST select call for
  // profile lookup, then subsequent selects for lines (post-tx PDF).
  let selectCallCount = 0

  function makeSelectChain(rows: any[]): any {
    const chain: any = {}
    chain.from = jest.fn(() => chain)
    chain.where = jest.fn(() => ({
      limit: jest.fn(() => Promise.resolve(rows)),
      then: (res: (v: any) => any, rej: (e: any) => any) =>
        Promise.resolve(rows).then(res, rej),
    }))
    chain.limit = jest.fn(() => Promise.resolve(rows))
    return chain
  }

  const mockSelect = jest.fn(() => {
    const callIdx = selectCallCount++
    // First select: profile lookup
    if (callIdx === 0) {
      return makeSelectChain(state.profile ? [state.profile] : [])
    }
    // Subsequent selects: invoice lines fetch (for PDF render)
    return makeSelectChain(state.lines)
  })

  // execute() handles several different raw SQL calls.
  // We distinguish them by tracking call order within the transaction.
  // Order inside tx: [0]=settlements INSERT, [1]=adjustments UPDATE
  // Outside tx: [0]=eligibleItems query, [1]=adjustments query
  let outsideExecuteCount = 0
  let insideTxExecuteCount = 0
  let inTransaction = false

  const mockExecute = jest.fn(async (_sql: unknown) => {
    if (inTransaction) {
      const idx = insideTxExecuteCount++
      if (idx === 0) {
        // settlements INSERT ... ON CONFLICT DO NOTHING RETURNING id
        calls.settlementsInserts++
        const callN = settlementsCallCount++
        if (settlementsOverrides.has(callN)) {
          return settlementsOverrides.get(callN)!
        }
        // Default: return one row per eligible item in the state
        if (state.settlementsReturning !== null) {
          return state.settlementsReturning
        }
        return state.eligibleItems.map((_, i) => ({ id: `settlement-${i}` }))
      }
      if (idx === 1) {
        // adjustments UPDATE ... RETURNING
        const rows = state.adjustments
          .filter(a => a.status === 'pending')
          .map(a => ({ amount_cents: a.amountCents, id: a.id }))
        calls.adjustmentsUpdates.push({ status: 'reconciled' })
        return rows
      }
      // Additional execute calls in reject() path:
      if (idx === 2) {
        // DELETE settlements
        calls.settlementsDelete++
        return []
      }
      if (idx === 3) {
        // UPDATE adjustments back to pending
        calls.adjustmentsUpdates.push({ status: 'pending' })
        return []
      }
      return []
    } else {
      const idx = outsideExecuteCount++
      if (idx === 0) {
        // eligible items query
        return state.eligibleItems
      }
      if (idx === 1) {
        // pending adjustments query
        return state.adjustments
      }
      return []
    }
  })

  // insert chain
  const mockInsertReturning = jest.fn()
  const mockInsertValues = jest.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = jest.fn((_table: unknown) => {
    return { values: mockInsertValues }
  })

  // We need separate insert tracking for different tables.
  // Use a smarter approach: track insert call order inside/outside tx.
  let txInsertCallCount = 0
  mockInsertReturning.mockImplementation(async () => {
    // Inside tx, we have inserts in order:
    // [0] = commissionChecks (reservation) → return [reservationCheck]
    // [1] = icInvoices → return [invoice]
    // [2] = icInvoiceLines → return (no need to return)
    const idx = txInsertCallCount++
    if (idx === 0) return [state.reservationCheck]
    if (idx === 1) {
      calls.invoiceInserts++
      return [state.invoice]
    }
    calls.lineInserts++
    return []
  })

  // update chain for tx and non-tx
  const mockUpdateSet = jest.fn((setObj: Record<string, unknown>) => {
    return {
      where: jest.fn(() => ({
        returning: jest.fn(async () => {
          // Determine which table / which update this is based on setObj fields
          if ('status' in setObj && setObj.status === 'approved') {
            calls.invoiceUpdates.push({ ...setObj })
            // Only return if current status matches 'submitted'
            if (state.existingInvoice?.status === 'submitted') {
              return [{ ...state.existingInvoice, ...setObj }]
            }
            return [] // triggers "not in submitted state" guard
          }
          if ('status' in setObj && setObj.status === 'rejected') {
            calls.invoiceUpdates.push({ ...setObj })
            const rejectable = ['submitted', 'approved'].includes(state.existingInvoice?.status ?? '')
            if (rejectable) {
              return [{ ...state.existingInvoice, ...setObj }]
            }
            return [] // triggers "not rejectable" guard
          }
          if ('status' in setObj && setObj.status === 'accepted') {
            calls.commissionChecksUpdate.push({ ...setObj })
            return [{ ...state.reservationCheck, ...setObj }]
          }
          if ('status' in setObj && setObj.status === 'cancelled') {
            calls.commissionChecksUpdate.push({ ...setObj })
            return [{ ...state.reservationCheck, ...setObj }]
          }
          if ('pdfStoragePath' in setObj) {
            calls.invoiceUpdates.push({ ...setObj })
            return [{ ...state.invoice, ...setObj }]
          }
          calls.invoiceUpdates.push({ ...setObj })
          return [state.invoice]
        }),
      })),
    }
  })
  const mockUpdate = jest.fn(() => ({ set: mockUpdateSet }))

  const mockTransaction = jest.fn(async (cb: (tx: any) => Promise<any>) => {
    inTransaction = true
    insideTxExecuteCount = 0
    txInsertCallCount = 0
    try {
      const tx = {
        insert: mockInsert,
        update: mockUpdate,
        execute: mockExecute,
        select: mockSelect,
      }
      return await cb(tx)
    } finally {
      inTransaction = false
    }
  })

  const client = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    execute: mockExecute,
    transaction: mockTransaction,
  }

  return {
    client,
    _state: state,
    _calls: calls,
    _settlementsOverrides: settlementsOverrides,
    _mocks: { mockSelect, mockInsert, mockUpdate, mockExecute, mockTransaction },
  }
}

function createMockAllocator() {
  return {
    allocate: jest.fn(async (_agencyId: string, _userId: string, _taxYear: number) =>
      INVOICE_NUMBER,
    ),
  }
}

function createMockPlaceOfSupply(overrides: {
  taxType?: string
  rateBp?: number
  jurisdiction?: string
  rule?: string
} = {}) {
  return {
    resolve: jest.fn(async () => ({
      jurisdiction: overrides.jurisdiction ?? 'ON',
      taxType: overrides.taxType ?? 'HST',
      rateBp: overrides.rateBp ?? 1300,
      rule: overrides.rule ?? 'general-recipient-address',
    })),
  }
}

function createMockPdf() {
  return {
    render: jest.fn(async () => Buffer.from('%PDF-1.4\n% Test stub\n')),
  }
}

function createMockStorage() {
  return {
    uploadDocument: jest.fn(async (
      _file: Buffer,
      componentId: string,
      fileName: string,
      _contentType: string,
    ) => `${componentId}/${Date.now()}-${fileName}`),
  }
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('IcInvoiceService.submitClaim — C3 reservation', () => {
  let service: IcInvoiceService
  let mockDb: ReturnType<typeof createMockDb>
  let mockAllocator: ReturnType<typeof createMockAllocator>
  let mockPlaceOfSupply: ReturnType<typeof createMockPlaceOfSupply>
  let mockPdf: ReturnType<typeof createMockPdf>
  let mockStorage: ReturnType<typeof createMockStorage>

  async function buildModule(
    dbOverride?: ReturnType<typeof createMockDb>,
    posOverride?: ReturnType<typeof createMockPlaceOfSupply>,
    pdfOverride?: ReturnType<typeof createMockPdf>,
  ) {
    mockDb = dbOverride ?? createMockDb()
    mockAllocator = createMockAllocator()
    mockPlaceOfSupply = posOverride ?? createMockPlaceOfSupply()
    mockPdf = pdfOverride ?? createMockPdf()
    mockStorage = createMockStorage()

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcInvoiceService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: IcInvoiceNumberAllocator, useValue: mockAllocator },
        { provide: PlaceOfSupplyService, useValue: mockPlaceOfSupply },
        { provide: IcInvoicePdfService, useValue: mockPdf },
        { provide: StorageService, useValue: mockStorage },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DisbursementService, useValue: mockDisbursementService },
      ],
    }).compile()

    service = moduleRef.get(IcInvoiceService)
  }

  beforeEach(async () => {
    await buildModule()
  })

  afterEach(() => jest.clearAllMocks())

  // ── C3-1: Reservation at submit time ────────────────────────────────────────

  it('C3-1: atomically reserves selected commission lines on submission, not approval', async () => {
    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1', 'item-2', 'item-3'],
    })

    expect(result.invoices).toHaveLength(1)
    const inv = result.invoices[0]!
    expect(inv.status).toBe('submitted')
    expect(inv.reservationCheckId).toBeDefined()
    expect(inv.reservationCheckId).toBe(RESERVATION_CHECK_ID)

    // Transaction was called — reservation happens inside
    expect(mockDb._mocks.mockTransaction).toHaveBeenCalledTimes(1)
    // Settlements INSERT was called inside the transaction
    expect(mockDb._calls.settlementsInserts).toBe(1)
    // Invoice insert happened inside the transaction
    expect(mockDb._calls.invoiceInserts).toBe(1)
  })

  // ── C3-2: Concurrent double-claim prevention ─────────────────────────────────

  it('C3-2: rejects double-claim when settlements INSERT returns fewer rows than items', async () => {
    // Simulate: the settlement INSERT returns 0 rows (concurrent winner already claimed it)
    const db = createMockDb({
      eligibleItems: [makeCadItem('item-1')],
      settlementsReturning: [], // ON CONFLICT DO NOTHING → nothing claimed → conflict
    })

    await buildModule(db)

    await expect(
      service.submitClaim({
        agencyId: AGENCY_ID,
        userId: USER_ID,
        selectedCheckItemIds: ['item-1'],
      }),
    ).rejects.toThrow(/already claimed|conflict/i)
  })

  it('C3-2b: accepts submission when all items are successfully claimed', async () => {
    const db = createMockDb({
      eligibleItems: [makeCadItem('item-1')],
      settlementsReturning: [{ id: 'settlement-0' }], // exactly 1 row returned
    })

    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1'],
    })
    expect(result.invoices).toHaveLength(1)
    expect(result.invoices[0]!.status).toBe('submitted')
  })

  // ── C3-3: RCTI authorization required ───────────────────────────────────────

  it('C3-3: requires an active RCTI authorization (rctiAuthorizationId must be set)', async () => {
    const db = createMockDb({ profile: makeProfile({ rctiAuthorizationId: null }) })
    await buildModule(db)

    await expect(
      service.submitClaim({
        agencyId: AGENCY_ID,
        userId: USER_ID,
        selectedCheckItemIds: ['item-1'],
      }),
    ).rejects.toThrow(/RCTI authorization required/i)
  })

  it('C3-3b: throws when no IC tax profile exists for the agent', async () => {
    const db = createMockDb({ profile: null })
    await buildModule(db)

    await expect(
      service.submitClaim({
        agencyId: AGENCY_ID,
        userId: USER_ID,
        selectedCheckItemIds: ['item-1'],
      }),
    ).rejects.toThrow(/RCTI authorization required|profile not found|no profile/i)
  })

  // ── C3-4: Multi-currency split ───────────────────────────────────────────────

  it('C3-4: groups multi-currency selection into separate invoices', async () => {
    // Build two separate single-currency DBs to simulate per-currency processing.
    // The service processes currencies in iteration order (Map insertion order),
    // so we can verify both invoices are produced with their own reservation checks.

    // CAD db: returns 1 CAD item and 1 USD item from execute (the eligibility query),
    // but the items will be grouped by the service into separate currency buckets.
    const db = createMockDb({
      eligibleItems: [makeCadItem('cad-item-1'), makeUsdItem('usd-item-1')],
      adjustments: [],
    })

    // Override insert to return different rows per currency transaction.
    // Transactions run sequentially (CAD first since Maps preserve insertion order).
    const cadReservation = makeReservationCheck({ id: 'res-cad', currency: 'CAD', checkAmountCents: 10_000 })
    const usdReservation = makeReservationCheck({ id: 'res-usd', currency: 'USD', checkAmountCents: 8_000 })
    const cadInvoice = makeInvoiceRow({ id: 'inv-cad', currency: 'CAD', reservationCheckId: 'res-cad' })
    const usdInvoice = makeInvoiceRow({ id: 'inv-usd', currency: 'USD', reservationCheckId: 'res-usd' })

    // Track insert calls globally across both transactions
    let insertCallIdx = 0
    db._mocks.mockInsert.mockImplementation((_table: unknown) => ({
      values: jest.fn(() => ({
        returning: jest.fn(async () => {
          const idx = insertCallIdx++
          if (idx === 0) return [cadReservation]   // CAD tx: reservation check
          if (idx === 1) return [cadInvoice]        // CAD tx: invoice
          if (idx === 2) return []                  // CAD tx: lines
          if (idx === 3) return [usdReservation]    // USD tx: reservation check
          if (idx === 4) return [usdInvoice]        // USD tx: invoice
          return []                                 // USD tx: lines
        }),
      })),
    }))

    // Override transaction to use the overridden insert + always succeed settlements (1 row)
    db._mocks.mockTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        insert: db._mocks.mockInsert,
        update: db.client.update,
        execute: jest.fn(async () => [{ id: 'claimed-row' }]), // 1 row = 1 item settled
        select: db.client.select,
      }
      return cb(tx)
    })

    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['cad-item-1', 'usd-item-1'],
    })

    expect(result.invoices).toHaveLength(2)
    const currencies = result.invoices.map(i => i.currency).sort()
    expect(currencies).toEqual(['CAD', 'USD'])

    // Each invoice has its own reservationCheckId
    const reservationIds = result.invoices.map(i => i.reservationCheckId)
    expect(new Set(reservationIds).size).toBe(2)
  })

  // ── C3-5: Tax computation ────────────────────────────────────────────────────

  it('C3-5: computes HST tax correctly using PlaceOfSupplyService output (ON 13%)', async () => {
    const db = createMockDb({
      eligibleItems: [
        makeCadItem('item-1', 40_000),
        makeCadItem('item-2', 35_000),
        makeCadItem('item-3', 25_000),
      ],
      invoice: makeInvoiceRow({
        reportableBaseCents: 100_000,
        taxCents: 13_000,
        totalCents: 113_000,
        taxType: 'HST',
        taxRateBp: 1300,
      }),
    })

    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1', 'item-2', 'item-3'],
    })

    expect(result.invoices[0]!.reportableBaseCents).toBe(100_000)
    expect(result.invoices[0]!.taxCents).toBe(13_000)
    expect(result.invoices[0]!.totalCents).toBe(113_000)
    expect(result.invoices[0]!.taxType).toBe('HST')
    expect(result.invoices[0]!.taxRateBp).toBe(1300)
  })

  // ── C3-6: Zero tax when not GST-registered ───────────────────────────────────

  it('C3-6: zero tax when IC is not GST-registered', async () => {
    const pos = createMockPlaceOfSupply({ taxType: 'NONE', rateBp: 0 })
    const db = createMockDb({
      profile: makeProfile({ gstHstRegistered: false, gstHstNumber: null }),
      eligibleItems: [makeCadItem('item-1', 100_000)],
      invoice: makeInvoiceRow({
        reportableBaseCents: 100_000,
        taxCents: 0,
        totalCents: 100_000,
        taxType: 'NONE',
        taxRateBp: 0,
      }),
    })

    await buildModule(db, pos)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1'],
    })

    expect(result.invoices[0]!.reportableBaseCents).toBe(100_000)
    expect(result.invoices[0]!.taxCents).toBe(0)
    expect(result.invoices[0]!.totalCents).toBe(100_000)
    expect(result.invoices[0]!.taxType).toBe('NONE')
  })

  // ── C3-7: Pending adjustments auto-included ──────────────────────────────────

  it('C3-7: includes pending adjustments as invoice lines, currency-grouped', async () => {
    const adjustment = makeAdjustment('adj-1', 'CAD', -5_000)
    const db = createMockDb({
      eligibleItems: [makeCadItem('cad-item-1'), makeCadItem('cad-item-2')],
      adjustments: [adjustment],
      settlementsReturning: [{ id: 's-1' }, { id: 's-2' }],
      invoice: makeInvoiceRow({ reportableBaseCents: 15_000 }), // 2×10000 + (-5000)
      lines: [
        { id: 'line-1', lineType: 'commission', amountCents: 10_000 },
        { id: 'line-2', lineType: 'commission', amountCents: 10_000 },
        { id: 'line-3', lineType: 'adjustment', amountCents: -5_000 },
      ],
    })

    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['cad-item-1', 'cad-item-2'],
    })

    expect(result.invoices).toHaveLength(1)
    // Adjustment was included — verify adjustmentsUpdates called with reconciled
    expect(db._calls.adjustmentsUpdates.some(u => u.status === 'reconciled')).toBe(true)
  })

  // ── C3-8: Empty selection ────────────────────────────────────────────────────

  it('C3-8: throws BadRequest when no eligible items selected', async () => {
    await expect(
      service.submitClaim({
        agencyId: AGENCY_ID,
        userId: USER_ID,
        selectedCheckItemIds: [],
      }),
    ).rejects.toThrow(/no eligible items/i)
  })

  // ── C3-11: PDF failure is non-blocking ───────────────────────────────────────

  it('C3-11: PDF failure does NOT roll back the reservation — invoice committed in submitted state', async () => {
    const failingPdf = {
      render: jest.fn().mockRejectedValue(new Error('Puppeteer failed')),
    }

    await buildModule(undefined, undefined, failingPdf as any)

    // Should not throw — invoice is committed even if PDF fails
    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1', 'item-2', 'item-3'],
    })

    // Invoice exists with submitted status
    expect(result.invoices).toHaveLength(1)
    expect(result.invoices[0]!.status).toBe('submitted')
    // But no PDF path — it failed
    expect(result.invoices[0]!.pdfStoragePath).toBeFalsy()
  })

  // ── C3-12: Snapshot fields ───────────────────────────────────────────────────

  it('C3-12: snapshot fields are populated from the profile at submission time', async () => {
    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1', 'item-2', 'item-3'],
    })

    const inv = result.invoices[0]!
    expect(inv.icLegalName).toBe('Mary IC Consultant')
    expect(inv.icGstHstNumber).toBe('123456789RT0001')
    expect(inv.icSinOrBnMask).toBe('***-***-789')
    expect(inv.icDomicileProvince).toBe('ON')
    expect(inv.rctiAuthorizationId).toBe(AUTH_ID)
    expect(inv.icTaxProfileId).toBe(PROFILE_ID)
  })
})

// ─── getEligibleForUser() tests ────────────────────────────────────────────────

describe('IcInvoiceService.getEligibleForUser — eligibility query', () => {
  let service: IcInvoiceService
  let mockDb: ReturnType<typeof createMockDb>

  async function buildModule(db?: ReturnType<typeof createMockDb>) {
    mockDb = db ?? createMockDb()

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcInvoiceService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: IcInvoiceNumberAllocator, useValue: createMockAllocator() },
        { provide: PlaceOfSupplyService, useValue: createMockPlaceOfSupply() },
        { provide: IcInvoicePdfService, useValue: createMockPdf() },
        { provide: StorageService, useValue: createMockStorage() },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DisbursementService, useValue: mockDisbursementService },
      ],
    }).compile()

    service = moduleRef.get(IcInvoiceService)
  }

  beforeEach(async () => { await buildModule() })
  afterEach(() => jest.clearAllMocks())

  it('groups eligible items and adjustments by currency', async () => {
    // Build a db where:
    //   - execute (items query) returns 1 CAD item + 1 USD item
    //   - select (adjustments) returns 1 CAD adjustment
    const cadAdjustment = makeAdjustment('adj-cad-1', 'CAD', 1000)

    const db = createMockDb({
      eligibleItems: [
        makeCadItem('i1'),
        makeUsdItem('i2'),
      ],
      adjustments: [cadAdjustment],
    })

    // Override execute to return items in the raw SQL shape that getEligibleForUser expects.
    // Outside-tx execute call 0: items query. Adjustments use Drizzle .select().
    db._mocks.mockExecute.mockImplementation(async () => [
      {
        check_item_id: 'i1',
        currency: 'CAD',
        trip_ref: 'Smith',
        description: 'Resort',
        commission_cents: '50000',
      } as any,
      {
        check_item_id: 'i2',
        currency: 'USD',
        trip_ref: 'Jones',
        description: 'Flight',
        commission_cents: '30000',
      } as any,
    ] as any)

    // Override select chain to return adjustments for the .from(commissionAdjustments).where() call.
    // getEligibleForUser uses: db.client.select().from().where()
    // The mockSelect already handles this in the createMockDb via makeSelectChain.
    // We override to return adjustments on the second select call (first is unused here).
    let selectCallIdx = 0
    db._mocks.mockSelect.mockImplementation(() => {
      selectCallIdx++
      const rows = selectCallIdx === 1 ? [cadAdjustment] : []
      const chain: any = {}
      chain.from = jest.fn(() => chain)
      chain.where = jest.fn(() => Promise.resolve(rows))
      return chain
    })

    await buildModule(db)

    const result = await service.getEligibleForUser(AGENCY_ID, USER_ID)

    expect(result.itemsByCurrency).toHaveLength(2)

    const cad = result.itemsByCurrency.find(g => g.currency === 'CAD')!
    expect(cad).toBeDefined()
    expect(cad.items).toHaveLength(1)
    expect(cad.items[0]!.checkItemId).toBe('i1')
    expect(cad.items[0]!.commissionCents).toBe(50000)
    expect(cad.adjustments).toHaveLength(1)
    expect(cad.adjustments[0]!.adjustmentId).toBe('adj-cad-1')

    const usd = result.itemsByCurrency.find(g => g.currency === 'USD')!
    expect(usd).toBeDefined()
    expect(usd.items).toHaveLength(1)
    expect(usd.items[0]!.checkItemId).toBe('i2')
    expect(usd.items[0]!.commissionCents).toBe(30000)
    expect(usd.adjustments).toHaveLength(0)
  })

  it('returns empty itemsByCurrency when no eligible items or adjustments exist', async () => {
    const db = createMockDb({ eligibleItems: [], adjustments: [] })

    db._mocks.mockExecute.mockImplementation(async () => [])
    db._mocks.mockSelect.mockImplementation(() => {
      const chain: any = {}
      chain.from = jest.fn(() => chain)
      chain.where = jest.fn(() => Promise.resolve([]))
      return chain
    })

    await buildModule(db)

    const result = await service.getEligibleForUser(AGENCY_ID, USER_ID)
    expect(result.itemsByCurrency).toHaveLength(0)
  })
})

// ─── approve() tests ───────────────────────────────────────────────────────────

describe('IcInvoiceService.approve', () => {
  let service: IcInvoiceService
  let mockDb: ReturnType<typeof createMockDb>

  async function buildModule(db?: ReturnType<typeof createMockDb>) {
    mockDb = db ?? createMockDb()

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcInvoiceService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: IcInvoiceNumberAllocator, useValue: createMockAllocator() },
        { provide: PlaceOfSupplyService, useValue: createMockPlaceOfSupply() },
        { provide: IcInvoicePdfService, useValue: createMockPdf() },
        { provide: StorageService, useValue: createMockStorage() },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DisbursementService, useValue: mockDisbursementService },
      ],
    }).compile()

    service = moduleRef.get(IcInvoiceService)
  }

  beforeEach(async () => { await buildModule() })
  afterEach(() => jest.clearAllMocks())

  it('C3-9a: marks invoice approved and flips reservation check to accepted', async () => {
    const result = await service.approve(INVOICE_ID, 'admin-1')
    expect(result.status).toBe('approved')
    // The reservation paid check was updated to accepted
    expect(mockDb._calls.commissionChecksUpdate).toContainEqual(
      expect.objectContaining({ status: 'accepted' }),
    )
  })

  it('C3-9b: throws BadRequest when invoice is not in submitted state', async () => {
    const db = createMockDb({ existingInvoice: makeInvoiceRow({ status: 'draft' }) })
    await buildModule(db)
    await expect(service.approve(INVOICE_ID, 'admin-1')).rejects.toThrow(/not in submitted state/i)
  })
})

// ─── Auto-approve path (Task 29) ──────────────────────────────────────────────

describe('IcInvoiceService.submitClaim — auto-approve path (Task 29)', () => {
  let service: IcInvoiceService
  let mockDb: ReturnType<typeof createMockDb>
  let mockAllocator: ReturnType<typeof createMockAllocator>
  let mockPlaceOfSupply: ReturnType<typeof createMockPlaceOfSupply>
  let mockPdf: ReturnType<typeof createMockPdf>
  let mockStorage: ReturnType<typeof createMockStorage>

  // The eligible item yields $100 commission. With HST 13%: totalCents = $113.
  const COMMISSION_CENTS = 10_000       // $100
  const TOTAL_CENTS = 11_300            // $100 + 13% HST

  // Build a db configured for a single CAD item ($100 commission) with the given profile overrides.
  function buildDb(profileOverrides: Record<string, unknown> = {}) {
    const profile = makeProfile({
      autoDisburse: false,
      approvalCeilingCents: null,
      ...profileOverrides,
    })

    // Invoice row reflects $100 commission + 13% HST = $113 total
    const invoice = makeInvoiceRow({
      reportableBaseCents: COMMISSION_CENTS,
      taxCents: 1_300,
      totalCents: TOTAL_CENTS,
      status: 'submitted',
      approvedAt: null,
      approvedBy: null,
    })

    const db = createMockDb({
      profile,
      eligibleItems: [makeCadItem('item-1', COMMISSION_CENTS)],
      adjustments: [],
      settlementsReturning: [{ id: 'settlement-0' }],
      reservationCheck: makeReservationCheck({ checkAmountCents: COMMISSION_CENTS }),
      invoice,
      // existingInvoice is what approve() reads back from its UPDATE RETURNING.
      // It must be 'submitted' so the approve() WHERE guard passes.
      existingInvoice: makeInvoiceRow({
        reportableBaseCents: COMMISSION_CENTS,
        taxCents: 1_300,
        totalCents: TOTAL_CENTS,
        status: 'submitted',
        approvedAt: null,
        approvedBy: null,
      }),
      lines: [],
    })

    return { db, profile }
  }

  async function buildModule(db: ReturnType<typeof createMockDb>) {
    mockDb = db
    mockAllocator = createMockAllocator()
    mockPlaceOfSupply = createMockPlaceOfSupply({ taxType: 'HST', rateBp: 1300 })
    mockPdf = createMockPdf()
    mockStorage = createMockStorage()

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcInvoiceService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: IcInvoiceNumberAllocator, useValue: mockAllocator },
        { provide: PlaceOfSupplyService, useValue: mockPlaceOfSupply },
        { provide: IcInvoicePdfService, useValue: mockPdf },
        { provide: StorageService, useValue: mockStorage },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DisbursementService, useValue: mockDisbursementService },
      ],
    }).compile()

    service = moduleRef.get(IcInvoiceService)
  }

  afterEach(() => jest.clearAllMocks())

  it('T29-1: auto-approves when autoDisburse=true and total is under ceiling', async () => {
    // $113 total, $200 ceiling → should auto-approve
    const { db } = buildDb({ autoDisburse: true, approvalCeilingCents: 200_00 })
    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1'],
    })

    const inv = result.invoices[0]!
    expect(inv.status).toBe('approved')
    expect(inv.approvedBy).toBe(USER_ID)   // IC's own userId — auto-approve audit trail
    expect(inv.approvedAt).toBeInstanceOf(Date)
  })

  it('T29-2: auto-approves when approvalCeilingCents is null (no ceiling)', async () => {
    // null ceiling → approve unconditionally when autoDisburse=true
    const { db } = buildDb({ autoDisburse: true, approvalCeilingCents: null })
    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1'],
    })

    expect(result.invoices[0]!.status).toBe('approved')
  })

  it('T29-3: stays submitted when totalCents exceeds ceiling', async () => {
    // $113 total, $50 ceiling → ceiling exceeded → no auto-approve
    const { db } = buildDb({ autoDisburse: true, approvalCeilingCents: 50_00 })
    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1'],
    })

    const inv = result.invoices[0]!
    expect(inv.status).toBe('submitted')
    expect(inv.approvedAt).toBeNull()
  })

  it('T29-4: stays submitted when autoDisburse is false (default path unchanged)', async () => {
    // autoDisburse=false → never auto-approve regardless of ceiling
    const { db } = buildDb({ autoDisburse: false, approvalCeilingCents: 1_000_00 })
    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1'],
    })

    expect(result.invoices[0]!.status).toBe('submitted')
  })

  it('T29-5: uses totalCents (including tax) for ceiling check, not reportableBase', async () => {
    // Commission = $100, HST 13% = $13, totalCents = $113.
    // Ceiling = $110: reportableBase ($100) would pass, but totalCents ($113) exceeds it.
    // Must NOT auto-approve.
    const { db } = buildDb({ autoDisburse: true, approvalCeilingCents: 110_00 })
    await buildModule(db)

    const result = await service.submitClaim({
      agencyId: AGENCY_ID,
      userId: USER_ID,
      selectedCheckItemIds: ['item-1'],
    })

    expect(result.invoices[0]!.status).toBe('submitted')
  })
})

// ─── reject() tests ────────────────────────────────────────────────────────────

describe('IcInvoiceService.reject', () => {
  let service: IcInvoiceService
  let mockDb: ReturnType<typeof createMockDb>

  async function buildModule(db?: ReturnType<typeof createMockDb>) {
    mockDb = db ?? createMockDb()

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcInvoiceService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: IcInvoiceNumberAllocator, useValue: createMockAllocator() },
        { provide: PlaceOfSupplyService, useValue: createMockPlaceOfSupply() },
        { provide: IcInvoicePdfService, useValue: createMockPdf() },
        { provide: StorageService, useValue: createMockStorage() },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DisbursementService, useValue: mockDisbursementService },
      ],
    }).compile()

    service = moduleRef.get(IcInvoiceService)
  }

  beforeEach(async () => { await buildModule() })
  afterEach(() => jest.clearAllMocks())

  it('C3-10a: reverses reservation atomically — deletes settlements, flips adjustments, cancels check', async () => {
    // Build a fresh mock that specifically tracks the reject() path.
    // The reject() tx sequence:
    //   1. update(icInvoices).set({status:'rejected'}).where().returning()  → [rejectedInvoice]
    //   2. tx.execute(DELETE settlements)
    //   3. tx.execute(UPDATE adjustments -> pending)
    //   4. update(commissionChecks).set({status:'cancelled'}).where().returning()

    const deleteSettlementsCount = { n: 0 }
    const adjustmentsUpdates: Record<string, unknown>[] = []
    const commissionChecksUpdates: Record<string, unknown>[] = []

    const rejectedInvoice = makeInvoiceRow({ status: 'rejected', rejectedReason: 'Wrong line items' })

    let txExecuteCount = 0
    const mockTxExecute = jest.fn(async () => {
      const idx = txExecuteCount++
      if (idx === 0) {
        deleteSettlementsCount.n++
        return []
      }
      if (idx === 1) {
        adjustmentsUpdates.push({ status: 'pending' })
        return []
      }
      return []
    })

    const mockTxUpdateSet = jest.fn((setObj: Record<string, unknown>) => ({
      where: jest.fn(() => ({
        returning: jest.fn(async () => {
          if ('status' in setObj && setObj.status === 'rejected') {
            return [rejectedInvoice]
          }
          if ('status' in setObj && setObj.status === 'cancelled') {
            commissionChecksUpdates.push({ ...setObj })
            return [makeReservationCheck({ status: 'cancelled' })]
          }
          return []
        }),
      })),
    }))
    const mockTxUpdate = jest.fn(() => ({ set: mockTxUpdateSet }))

    const mockTransaction = jest.fn(async (cb: (tx: any) => Promise<any>) => {
      txExecuteCount = 0
      return cb({
        insert: jest.fn(),
        update: mockTxUpdate,
        execute: mockTxExecute,
        select: jest.fn(),
      })
    })

    // Build a minimal db with this transaction mock
    const rejectDb = {
      client: {
        select: jest.fn(),
        insert: jest.fn(),
        update: mockTxUpdate,
        execute: jest.fn(),
        transaction: mockTransaction,
      },
      _state: {},
      _calls: { settlementsDelete: deleteSettlementsCount, adjustmentsUpdates, commissionChecksUpdate: commissionChecksUpdates },
      _settlementsOverrides: new Map(),
      _mocks: {},
    }

    await buildModule(rejectDb as any)

    const result = await service.reject(INVOICE_ID, 'Wrong line items', 'admin-1')
    expect(result.status).toBe('rejected')
    expect(result.rejectedReason).toBe('Wrong line items')

    // Settlements deleted
    expect(deleteSettlementsCount.n).toBe(1)

    // Adjustments flipped back to pending
    expect(adjustmentsUpdates).toContainEqual(
      expect.objectContaining({ status: 'pending' }),
    )

    // Reservation check cancelled
    expect(commissionChecksUpdates).toContainEqual(
      expect.objectContaining({ status: 'cancelled' }),
    )
  })

  it('C3-10b: throws BadRequest when invoice cannot be rejected from current state (cancelled)', async () => {
    const db = createMockDb({ existingInvoice: makeInvoiceRow({ status: 'cancelled' }) })
    await buildModule(db)
    await expect(service.reject(INVOICE_ID, 'reason', 'admin-1')).rejects.toThrow(/not rejectable/i)
  })

  it('C3-10c: can reject an approved invoice (approved is rejectable)', async () => {
    const db = createMockDb({ existingInvoice: makeInvoiceRow({ status: 'approved' }) })
    await buildModule(db)
    const result = await service.reject(INVOICE_ID, 'Approved in error', 'admin-1')
    expect(result.status).toBe('rejected')
  })
})
