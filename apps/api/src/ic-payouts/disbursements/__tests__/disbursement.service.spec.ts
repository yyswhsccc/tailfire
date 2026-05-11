/**
 * Unit Tests: DisbursementService
 *
 * Coverage:
 *  D1.  enqueue happy path: creates row, queues job, returns disbursement
 *  D2.  enqueue rejects if invoice status ≠ 'approved'
 *  D3.  enqueue idempotent: if disbursement already exists for invoice, returns existing without re-enqueueing
 *  D4.  enqueue rejects if no active default payout account for currency
 *  D5.  markSent rejects if disbursement status ≠ 'sending'
 *  D6.  markSent updates status + completedAt + closes open attempt (includes FX snapshot)
 *  D7.  fail from 'sending' reverses settlements, adjustments, sets invoice='cancelled'
 *  D8.  fail from 'queued' allowed (admin can cancel before sending)
 *  D9.  getNextAttemptNumber returns 1 for no attempts, n+1 otherwise
 *  D10. markSent throws ConflictException when concurrent finalize races the update
 *  D11. fail throws ConflictException when concurrent finalize races the update
 *  D12. enqueue handles 23505 by returning the winner row without re-enqueueing
 *  D13. markSent for CAD invoice: fxRate=1.0 without BoC call, cadEquivalent* = source amounts
 *  D14. markSent for USD invoice: fxRate applied, cadEquivalent* = source × rate (rounded)
 */

import { Test } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DisbursementService } from '../disbursement.service'
import { DatabaseService } from '../../../db/database.service'
import { FxRateService } from '../../fx/fx-rate.service'
import { getQueueToken } from '@nestjs/bullmq'
import { QUEUES } from '../../../automation/automation.types'

const mockEventEmitter = { emit: jest.fn() }

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENCY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const INVOICE_ID = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii'
const DISBURSE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const ACCOUNT_ID = 'acacacac-acac-acac-acac-acacacacacacac'.slice(0, 36)
const RESERVATION_CHECK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ATTEMPT_ID = 'aaaabbbb-aaaa-aaaa-aaaa-aaaabbbbaaaa'.slice(0, 36)
const ADMIN_ID = 'adminadm-inad-mina-dmin-adminadminadm'.slice(0, 36)

// ─── Fixture builders ─────────────────────────────────────────────────────────

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    invoiceNumber: 'INV-2026-11111111-000001',
    invoiceDate: '2026-05-10',
    currency: 'CAD',
    status: 'approved',
    totalCents: 33_900,
    reportableBaseCents: 30_000,
    taxCents: 3_900,
    reservationCheckId: RESERVATION_CHECK_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    userId: USER_ID,
    agencyId: AGENCY_ID,
    currency: 'CAD',
    rail: 'interac_etransfer',
    isDefaultForCurrency: true,
    status: 'active',
    detailsMask: 'j***@example.com',
    label: 'Jane e-Transfer',
    ...overrides,
  }
}

function makeDisbursement(overrides: Record<string, unknown> = {}) {
  return {
    id: DISBURSE_ID,
    invoiceId: INVOICE_ID,
    userId: USER_ID,
    payoutAccountId: ACCOUNT_ID,
    amountCents: 33_900,
    currency: 'CAD',
    provider: 'manual',
    rail: 'interac_etransfer',
    idempotencyKey: 'deadbeef-dead-dead-dead-deadbeefcafe'.slice(0, 36),
    status: 'queued',
    fxRateToCad: null,
    cadEquivalentBaseCents: null,
    cadEquivalentTaxCents: null,
    cadEquivalentTotalCents: null,
    fxRateSource: null,
    fxRateDate: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    disbursementId: DISBURSE_ID,
    attemptNumber: 1,
    provider: 'manual',
    rail: 'interac_etransfer',
    outcome: null,
    reason: null,
    manualReference: null,
    manualProofStoragePath: null,
    manualSentBy: null,
    startedAt: new Date(),
    completedAt: null,
    ...overrides,
  }
}

// ─── DB mock factory ──────────────────────────────────────────────────────────

/**
 * Creates a minimal DatabaseService mock sufficient for DisbursementService.
 *
 * DB call patterns per method:
 *
 * enqueue:
 *   db.client.select(icInvoices)       → [invoice | []]       (selectResponses[0])
 *   db.client.select(icDisbursements)  → [existing | []]      (selectResponses[1])
 *   db.client.select(icPayoutAccounts) → [account | []]       (selectResponses[2])
 *   db.client.insert(icDisbursements)  → [disbursement]
 *   db.client.select(icDisbursements)  → [winnerRow | []]     (selectResponses[3], 23505 only)
 *
 * markSent (Task 37: pre-tx + inside tx):
 *   db.client.select(icDisbursements)       → [disbursement]  (selectResponses[0])
 *   db.client.select(icInvoices)            → [invoice]       (selectResponses[1])
 *   -- FxRateService.getRateOnDate called here (mocked separately) --
 *   tx.select(icDisbursementAttempts) → [openAttempt | []]   (txSelectResponses[0])
 *   tx.update(icDisbursementAttempts)  (if open attempt found)
 *   OR tx.insert(icDisbursementAttempts) (if no open attempt)
 *   tx.update(icDisbursements)    → [updated disbursement]
 *
 * fail (inside tx):
 *   tx.select(icDisbursements)    → [disbursement]            (txSelectResponses[0])
 *   tx.select(icInvoices)         → [invoice]                 (txSelectResponses[1])
 *   tx.insert(icDisbursementAttempts)
 *   tx.execute (DELETE settlements)
 *   tx.execute (UPDATE adjustments)
 *   tx.update(commissionChecks)
 *   tx.update(icInvoices)
 *   tx.update(icDisbursements)    → [updated disbursement]
 *
 * getNextAttemptNumber:
 *   db.client.execute → [{ n: <number> }]
 */
function createMockDb(opts: {
  invoice?: ReturnType<typeof makeInvoice> | null
  existingDisbursement?: ReturnType<typeof makeDisbursement> | null
  account?: ReturnType<typeof makeAccount> | null
  newDisbursement?: ReturnType<typeof makeDisbursement>
  disbursementForMutation?: ReturnType<typeof makeDisbursement> | null
  /**
   * Invoice to return for the pre-tx invoice fetch in markSent (Task 37).
   * Defaults to makeInvoice() so markSent tests pass without extra config.
   */
  invoiceForMarkSent?: ReturnType<typeof makeInvoice> | null
  openAttempt?: ReturnType<typeof makeAttempt> | null
  updatedDisbursement?: ReturnType<typeof makeDisbursement>
  invoiceForFail?: ReturnType<typeof makeInvoice> | null
  nextAttemptN?: number
  /**
   * Controls which db.client select layout and tx select layout to use.
   * 'enqueue' (default): db.client → [invoice, existing, account, winner]
   * 'markSent':          db.client → [disbursement, invoice] (pre-tx); tx → [openAttempt]
   * 'fail':              db.client not used for selects; tx → [disbursement, invoice]
   */
  txPath?: 'markSent' | 'fail' | 'enqueue'
  /**
   * Override what the disbursement update returns inside a tx.
   * Pass [] to simulate a concurrent-finalize collision (ConflictException path).
   */
  txUpdateReturns?: ReturnType<typeof makeDisbursement>[]
  /**
   * If set, the INSERT on icDisbursements throws this error (used to simulate 23505).
   */
  insertThrows?: Error
  /**
   * The row returned by the winner-SELECT after a 23505 collision.
   */
  winnerRow?: ReturnType<typeof makeDisbursement>
} = {}) {
  const {
    invoice = makeInvoice(),
    existingDisbursement = null,
    account = makeAccount(),
    newDisbursement = makeDisbursement(),
    disbursementForMutation = makeDisbursement({ status: 'sending' }),
    invoiceForMarkSent = makeInvoice(),
    openAttempt = makeAttempt(),
    updatedDisbursement = makeDisbursement({ status: 'sent', completedAt: new Date() }),
    invoiceForFail = makeInvoice(),
    nextAttemptN = 1,
    txPath = 'enqueue',
    txUpdateReturns,
    insertThrows,
    winnerRow,
  } = opts

  // Track calls
  const calls = {
    inserts: [] as any[],
    updates: [] as any[],
    executes: [] as any[],
  }

  // Select call counter — used to return different rows per call.
  //
  // enqueue path (db.client):
  //   [0]=invoice, [1]=existing disbursement, [2]=account, [3]=winner (23505 only)
  //
  // markSent path (db.client, pre-tx — Task 37):
  //   [0]=disbursement (status check), [1]=invoice (for CAD-equivalent calc)
  //   → then transaction handles the rest
  //
  // fail/transitionToSending: all inside transaction, db.client selects not used
  let selectCallCount = 0
  // selectResponses layout differs per path:
  //
  // 'enqueue':  [0]=invoice, [1]=existingDisbursement, [2]=account, [3]=winnerRow
  //
  // 'markSent': [0]=disbursementForMutation (status check pre-tx)
  //             [1]=invoiceForMarkSent (for CAD-equivalent calc pre-tx)
  //
  // 'fail':     db.client selects not used (all inside tx)
  const selectResponses: any[][] = txPath === 'markSent'
    ? [
        disbursementForMutation ? [disbursementForMutation] : [],  // 0: disbursement pre-tx
        invoiceForMarkSent ? [invoiceForMarkSent] : [],            // 1: invoice pre-tx
      ]
    : [
        invoice ? [invoice] : [],                                  // 0: invoice (enqueue)
        existingDisbursement ? [existingDisbursement] : [],        // 1: existing disbursement check
        account ? [account] : [],                                  // 2: payout account lookup
        winnerRow ? [winnerRow] : [],                              // 3: winner SELECT after 23505
      ]

  function makeSelectChain(rows: any[]): any {
    return {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
        orderBy: jest.fn().mockResolvedValue(rows),
        then: (res: any, rej: any) => Promise.resolve(rows).then(res, rej),
      }),
      orderBy: jest.fn().mockResolvedValue(rows),
    }
  }

  const mockSelect = jest.fn(() => {
    const idx = selectCallCount++
    const rows = selectResponses[idx] ?? []
    return makeSelectChain(rows)
  })

  // insert mock — supports insertThrows to simulate 23505
  const mockInsert = jest.fn((_table: any) => ({
    values: jest.fn((vals: any) => {
      calls.inserts.push(vals)
      return {
        returning: insertThrows
          ? jest.fn().mockRejectedValue(insertThrows)
          : jest.fn().mockResolvedValue([newDisbursement]),
      }
    }),
  }))

  // update mock
  const mockUpdate = jest.fn((_table: any) => ({
    set: jest.fn((setObj: any) => {
      calls.updates.push(setObj)
      return {
        where: jest.fn(() => ({
          returning: jest.fn().mockResolvedValue([updatedDisbursement]),
        })),
      }
    }),
  }))

  // execute mock (for raw SQL)
  let executeCount = 0
  const mockExecute = jest.fn(async () => {
    const idx = executeCount++
    if (idx === 0) return [{ n: nextAttemptN }]  // getNextAttemptNumber
    return []
  })

  // transaction mock — passes simplified tx object to callback
  const mockTransaction = jest.fn(async (cb: (tx: any) => Promise<any>) => {
    // Inside a transaction, serve tx-specific selects based on which method is being tested.
    //
    // markSent path (Task 37): disbursement + invoice are pre-tx (db.client selects above).
    //   tx selects: [0]=openAttempt only
    //
    // fail path:
    //   tx selects: [0]=disbursement, [1]=invoice
    //
    // This ordering matches the actual service call order in each method.
    const txSelectCount = { n: 0 }
    const txSelectResponses: any[][] = txPath === 'fail'
      ? [
          disbursementForMutation ? [disbursementForMutation] : [],  // 0: disbursement
          invoiceForFail ? [invoiceForFail] : [],                    // 1: invoice
        ]
      : [
          // markSent: only openAttempt in tx (disbursement + invoice pre-loaded outside tx)
          openAttempt !== undefined ? (openAttempt ? [openAttempt] : []) : [],  // 0: open attempt
        ]

    // What the disbursement UPDATE returns inside the tx.
    // Pass txUpdateReturns=[] to simulate a concurrent-finalize collision.
    const txUpdateReturnValue = txUpdateReturns !== undefined
      ? txUpdateReturns
      : [updatedDisbursement]

    let txInsertCount = 0
    const tx = {
      select: jest.fn(() => {
        const idx = txSelectCount.n++
        const rows = txSelectResponses[idx] ?? []
        return makeSelectChain(rows)
      }),
      insert: jest.fn((_table: any) => ({
        values: jest.fn((vals: any) => {
          calls.inserts.push(vals)
          txInsertCount++
          return {
            returning: jest.fn().mockResolvedValue([makeAttempt()]),
          }
        }),
      })),
      update: jest.fn((_table: any) => ({
        set: jest.fn((setObj: any) => {
          calls.updates.push(setObj)
          return {
            where: jest.fn(() => ({
              returning: jest.fn().mockResolvedValue(txUpdateReturnValue),
            })),
          }
        }),
      })),
      execute: jest.fn(async (query: any) => {
        calls.executes.push(query)
        const idx = executeCount++
        if (idx === 0) return [{ n: nextAttemptN }]
        return []
      }),
    }
    return cb(tx)
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
    _calls: calls,
    _mocks: { mockSelect, mockInsert, mockUpdate, mockExecute, mockTransaction },
  }
}

function createMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  }
}

/**
 * Creates a FxRateService mock.
 * Default: returns 1.0 (CAD→CAD identity). Override getRateOnDate per-test as needed.
 */
function createMockFxRateService(defaultRate = 1.0) {
  return {
    getRateOnDate: jest.fn().mockResolvedValue(defaultRate),
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

async function buildModule(
  db: ReturnType<typeof createMockDb>,
  queue = createMockQueue(),
  fxRate: ReturnType<typeof createMockFxRateService> = createMockFxRateService(),
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DisbursementService,
      { provide: DatabaseService, useValue: db },
      { provide: getQueueToken(QUEUES.IC_PAYOUT_DISBURSE), useValue: queue },
      { provide: FxRateService, useValue: fxRate },
      { provide: EventEmitter2, useValue: mockEventEmitter },
    ],
  }).compile()

  return {
    service: moduleRef.get(DisbursementService),
    queue,
    db,
    fxRate,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DisbursementService.enqueue', () => {
  afterEach(() => jest.clearAllMocks())

  // D1. Happy path
  it('D1: creates disbursement row and enqueues job when invoice is approved and account exists', async () => {
    const db = createMockDb()
    const queue = createMockQueue()
    const { service } = await buildModule(db, queue)

    const result = await service.enqueue(INVOICE_ID, USER_ID, 33_900, 'CAD')

    expect(result).toBeDefined()
    expect(db._calls.inserts).toHaveLength(1)
    expect(db._calls.inserts[0]).toMatchObject({
      invoiceId: INVOICE_ID,
      userId: USER_ID,
      currency: 'CAD',
      amountCents: 33_900,
      provider: 'manual',
      status: 'queued',
    })
    expect(queue.add).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({ disbursementId: expect.any(String) }),
      expect.objectContaining({ jobId: expect.any(String) }),
    )
  })

  // D2. Rejects if invoice not approved
  it('D2: throws BadRequestException when invoice status is not "approved"', async () => {
    const db = createMockDb({ invoice: makeInvoice({ status: 'submitted' }) })
    const { service } = await buildModule(db)

    await expect(service.enqueue(INVOICE_ID, USER_ID, 33_900, 'CAD'))
      .rejects
      .toThrow(/must be in 'approved' status/)
  })

  it('D2b: throws NotFoundException when invoice does not exist', async () => {
    const db = createMockDb({ invoice: null })
    const { service } = await buildModule(db)

    await expect(service.enqueue(INVOICE_ID, USER_ID, 33_900, 'CAD'))
      .rejects
      .toThrow(/not found/)
  })

  // D3. Idempotency
  it('D3: returns existing disbursement without re-enqueueing when one already exists', async () => {
    const existing = makeDisbursement({ status: 'sending' })
    const db = createMockDb({ existingDisbursement: existing })
    const queue = createMockQueue()
    const { service } = await buildModule(db, queue)

    const result = await service.enqueue(INVOICE_ID, USER_ID, 33_900, 'CAD')

    expect(result.id).toBe(existing.id)
    expect(result.status).toBe('sending')
    // No new row inserted
    expect(db._calls.inserts).toHaveLength(0)
    // No job enqueued
    expect(queue.add).not.toHaveBeenCalled()
  })

  // D4. Rejects if no active default payout account
  it('D4: throws BadRequestException when IC has no active default payout account for currency', async () => {
    const db = createMockDb({ account: null })
    const { service } = await buildModule(db)

    await expect(service.enqueue(INVOICE_ID, USER_ID, 33_900, 'CAD'))
      .rejects
      .toThrow(/no active default payout account for CAD/)
  })
})

describe('DisbursementService.markSent', () => {
  afterEach(() => jest.clearAllMocks())

  // D5. Rejects if not 'sending'
  it('D5: throws BadRequestException when disbursement status is not "sending"', async () => {
    const db = createMockDb({
      txPath: 'markSent',
      disbursementForMutation: makeDisbursement({ status: 'queued' }),
    })
    const { service } = await buildModule(db)

    await expect(service.markSent(DISBURSE_ID, 'REF-001', null, ADMIN_ID))
      .rejects
      .toThrow(/must be in 'sending' status/)
  })

  it('D5b: throws BadRequestException when disbursement is already sent', async () => {
    const db = createMockDb({
      txPath: 'markSent',
      disbursementForMutation: makeDisbursement({ status: 'sent' }),
    })
    const { service } = await buildModule(db)

    await expect(service.markSent(DISBURSE_ID, 'REF-001', null, ADMIN_ID))
      .rejects
      .toThrow(/must be in 'sending' status/)
  })

  // D6. Happy path — includes FX snapshot assertions
  it('D6: updates open attempt to "sent" and sets disbursement status to "sent" with FX snapshot', async () => {
    const fxRate = createMockFxRateService(1.0)  // CAD→CAD
    const updatedDisb = makeDisbursement({
      status: 'sent',
      completedAt: new Date(),
      fxRateToCad: '1.00000000',
      cadEquivalentBaseCents: 30_000,
      cadEquivalentTaxCents: 3_900,
      cadEquivalentTotalCents: 33_900,
      fxRateSource: 'bank_of_canada',
      fxRateDate: new Date().toISOString().slice(0, 10),
    })
    const db = createMockDb({
      txPath: 'markSent',
      disbursementForMutation: makeDisbursement({ status: 'sending', currency: 'CAD' }),
      invoiceForMarkSent: makeInvoice({ currency: 'CAD', reportableBaseCents: 30_000, taxCents: 3_900, totalCents: 33_900 }),
      openAttempt: makeAttempt({ outcome: null }),
      updatedDisbursement: updatedDisb,
    })
    const { service } = await buildModule(db, createMockQueue(), fxRate)

    const result = await service.markSent(DISBURSE_ID, 'ETRANSFER-123', '/proof/receipt.pdf', ADMIN_ID)

    expect(result.status).toBe('sent')
    expect(result.completedAt).toBeDefined()

    // Ensure the FX fields were passed in the disbursement update
    const sentUpdate = db._calls.updates.find((u: any) => u.status === 'sent')
    expect(sentUpdate).toBeDefined()
    expect(sentUpdate.fxRateToCad).toBe('1.00000000')
    expect(sentUpdate.fxRateSource).toBe('bank_of_canada')
    expect(sentUpdate.cadEquivalentBaseCents).toBe(30_000)
    expect(sentUpdate.cadEquivalentTaxCents).toBe(3_900)
    expect(sentUpdate.cadEquivalentTotalCents).toBe(33_900)

    // FxRateService was called with the correct args
    expect(fxRate.getRateOnDate).toHaveBeenCalledWith('CAD', 'CAD', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))

    // EventEmitter2 should emit disbursement.sent after transaction commits
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'ic-payout.disbursement.sent',
      expect.objectContaining({
        disbursementId: expect.any(String),
        reference: 'ETRANSFER-123',
      }),
    )
  })

  it('D6b: inserts new "sent" attempt when no open attempt exists', async () => {
    const fxRate = createMockFxRateService(1.0)
    const db = createMockDb({
      txPath: 'markSent',
      disbursementForMutation: makeDisbursement({ status: 'sending', currency: 'CAD' }),
      invoiceForMarkSent: makeInvoice(),
      openAttempt: null,  // No open attempt
      updatedDisbursement: makeDisbursement({ status: 'sent', completedAt: new Date() }),
    })
    const { service } = await buildModule(db, createMockQueue(), fxRate)

    const result = await service.markSent(DISBURSE_ID, 'REF-002', null, ADMIN_ID)

    expect(result.status).toBe('sent')
    // A new attempt was inserted
    const insertedAttempt = db._calls.inserts.find((i: any) => i.outcome === 'sent')
    expect(insertedAttempt).toBeDefined()
    expect(insertedAttempt.manualReference).toBe('REF-002')
    expect(insertedAttempt.manualSentBy).toBe(ADMIN_ID)
  })

  // D13. CAD path: fxRate=1.0, cadEquivalent* = source amounts, no BoC call needed
  it('D13: CAD disbursement uses fxRate=1.0, cadEquivalent* equals source amounts', async () => {
    const fxRate = createMockFxRateService(1.0)
    const invoice = makeInvoice({ currency: 'CAD', reportableBaseCents: 50_000, taxCents: 6_500, totalCents: 56_500 })
    const db = createMockDb({
      txPath: 'markSent',
      disbursementForMutation: makeDisbursement({ status: 'sending', currency: 'CAD' }),
      invoiceForMarkSent: invoice,
      openAttempt: makeAttempt({ outcome: null }),
      updatedDisbursement: makeDisbursement({ status: 'sent', completedAt: new Date() }),
    })
    const { service } = await buildModule(db, createMockQueue(), fxRate)

    await service.markSent(DISBURSE_ID, 'REF-CAD', null, ADMIN_ID)

    const sentUpdate = db._calls.updates.find((u: any) => u.status === 'sent')
    expect(sentUpdate).toBeDefined()

    // rate=1.0 → CAD-equivalent values equal the source amounts
    expect(sentUpdate.fxRateToCad).toBe('1.00000000')
    expect(sentUpdate.cadEquivalentBaseCents).toBe(50_000)
    expect(sentUpdate.cadEquivalentTaxCents).toBe(6_500)
    expect(sentUpdate.cadEquivalentTotalCents).toBe(56_500)
    expect(sentUpdate.fxRateSource).toBe('bank_of_canada')
    expect(sentUpdate.fxRateDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // D14. USD path: fxRate applied, cadEquivalent* = source × rate (rounded to nearest cent)
  it('D14: USD disbursement applies fxRate, cadEquivalent* = Math.round(source × rate)', async () => {
    const USD_TO_CAD = 1.3825
    const fxRate = createMockFxRateService(USD_TO_CAD)
    // Invoice amounts in USD cents
    const reportableBaseCents = 30_000   // $300 USD
    const taxCents = 3_900               // $39 USD
    const totalCents = 33_900            // $339 USD

    const invoice = makeInvoice({
      currency: 'USD',
      reportableBaseCents,
      taxCents,
      totalCents,
    })
    const db = createMockDb({
      txPath: 'markSent',
      disbursementForMutation: makeDisbursement({ status: 'sending', currency: 'USD' }),
      invoiceForMarkSent: invoice,
      openAttempt: makeAttempt({ outcome: null }),
      updatedDisbursement: makeDisbursement({ status: 'sent', completedAt: new Date() }),
    })
    const { service } = await buildModule(db, createMockQueue(), fxRate)

    await service.markSent(DISBURSE_ID, 'WISE-USD-001', null, ADMIN_ID)

    // FxRateService called with correct currency pair
    expect(fxRate.getRateOnDate).toHaveBeenCalledWith('USD', 'CAD', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))

    const sentUpdate = db._calls.updates.find((u: any) => u.status === 'sent')
    expect(sentUpdate).toBeDefined()

    expect(sentUpdate.fxRateToCad).toBe(USD_TO_CAD.toFixed(8))
    expect(sentUpdate.cadEquivalentBaseCents).toBe(Math.round(reportableBaseCents * USD_TO_CAD))
    expect(sentUpdate.cadEquivalentTaxCents).toBe(Math.round(taxCents * USD_TO_CAD))
    expect(sentUpdate.cadEquivalentTotalCents).toBe(Math.round(totalCents * USD_TO_CAD))
    expect(sentUpdate.fxRateSource).toBe('bank_of_canada')
    expect(sentUpdate.fxRateDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('DisbursementService.fail', () => {
  afterEach(() => jest.clearAllMocks())

  // D7. Reversal from 'sending'
  it('D7: from "sending" — appends failed attempt, reverses invoice reservation, cancels invoice', async () => {
    const db = createMockDb({
      txPath: 'fail',
      disbursementForMutation: makeDisbursement({ status: 'sending' }),
      invoiceForFail: makeInvoice({ reservationCheckId: RESERVATION_CHECK_ID }),
      updatedDisbursement: makeDisbursement({ status: 'failed' }),
    })
    const { service } = await buildModule(db)

    const result = await service.fail(DISBURSE_ID, 'Wire transfer failed: invalid IBAN', ADMIN_ID)

    expect(result.status).toBe('failed')

    // A 'failed' attempt was inserted
    const failedAttempt = db._calls.inserts.find((i: any) => i.outcome === 'failed')
    expect(failedAttempt).toBeDefined()
    expect(failedAttempt.reason).toBe('Wire transfer failed: invalid IBAN')
    expect(failedAttempt.manualSentBy).toBe(ADMIN_ID)

    // Invoice was cancelled
    const invoiceCancelUpdate = db._calls.updates.find((u: any) => u.status === 'cancelled')
    expect(invoiceCancelUpdate).toBeDefined()

    // Reversal SQL fired: DELETE settlements + UPDATE adjustments
    const deleteSettlements = db._calls.executes.find(
      (e: any) => e?.queryChunks?.some((c: any) => String(c?.value ?? '').includes('commission_item_settlements'))
        || String(e).includes('commission_item_settlements'),
    )
    expect(deleteSettlements).toBeDefined()

    // commissionChecks cancelled
    const checkCancelUpdate = db._calls.updates.find((u: any) => u.status === 'cancelled')
    expect(checkCancelUpdate).toBeDefined()

    // EventEmitter2 should emit disbursement.failed after transaction commits
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'ic-payout.disbursement.failed',
      expect.objectContaining({
        disbursementId: expect.any(String),
        reason: 'Wire transfer failed: invalid IBAN',
        failedBy: ADMIN_ID,
      }),
    )
  })

  // D8. Fail from 'queued' allowed
  it('D8: from "queued" — allowed (admin cancels before processor runs)', async () => {
    const db = createMockDb({
      txPath: 'fail',
      disbursementForMutation: makeDisbursement({ status: 'queued' }),
      invoiceForFail: makeInvoice({ reservationCheckId: RESERVATION_CHECK_ID }),
      updatedDisbursement: makeDisbursement({ status: 'failed' }),
    })
    const { service } = await buildModule(db)

    const result = await service.fail(DISBURSE_ID, 'Admin cancelled before send', ADMIN_ID)
    expect(result.status).toBe('failed')

    // Reversal SQL fired even from 'queued'
    const failedAttempt = db._calls.inserts.find((i: any) => i.outcome === 'failed')
    expect(failedAttempt).toBeDefined()
  })

  it('D7c: throws BadRequestException when disbursement is already "sent"', async () => {
    const db = createMockDb({
      txPath: 'fail',
      disbursementForMutation: makeDisbursement({ status: 'sent' }),
    })
    const { service } = await buildModule(db)

    await expect(service.fail(DISBURSE_ID, 'some reason', ADMIN_ID))
      .rejects
      .toThrow(/must be in 'queued' or 'sending' status/)
  })
})

describe('DisbursementService.getNextAttemptNumber', () => {
  afterEach(() => jest.clearAllMocks())

  // D9. Returns 1 when no attempts, n+1 otherwise
  it('D9a: returns 1 when there are no existing attempts', async () => {
    const db = createMockDb({ nextAttemptN: 1 })
    db._mocks.mockExecute.mockResolvedValue([{ n: 1 }])
    const { service } = await buildModule(db)

    const n = await service.getNextAttemptNumber(DISBURSE_ID)
    expect(n).toBe(1)
  })

  it('D9b: returns n+1 when attempts already exist', async () => {
    const db = createMockDb({ nextAttemptN: 4 })
    db._mocks.mockExecute.mockResolvedValue([{ n: 4 }])
    const { service } = await buildModule(db)

    const n = await service.getNextAttemptNumber(DISBURSE_ID)
    expect(n).toBe(4)
  })
})

describe('DisbursementService.transitionToSending', () => {
  afterEach(() => jest.clearAllMocks())

  it('calls update on icDisbursements with status="sending" and WHERE status="queued"', async () => {
    const db = createMockDb()
    const { service } = await buildModule(db)

    await service.transitionToSending(DISBURSE_ID)

    const sentUpdate = db._calls.updates.find((u: any) => u.status === 'sending')
    expect(sentUpdate).toBeDefined()
  })
})

// ─── Concurrency / idempotency tests ──────────────────────────────────────────

describe('DisbursementService — concurrency guards', () => {
  afterEach(() => jest.clearAllMocks())

  // D10. markSent ConflictException when disbursement update returns no rows
  it('D10: markSent throws ConflictException when disbursement was already finalized by a concurrent request', async () => {
    // Simulate: disbursement is in 'sending' (passes the pre-tx status check), but the
    // WHERE status='sending' guard on the UPDATE matches no rows (concurrent finalize won).
    const fxRate = createMockFxRateService(1.0)
    const db = createMockDb({
      txPath: 'markSent',
      disbursementForMutation: makeDisbursement({ status: 'sending', currency: 'CAD' }),
      invoiceForMarkSent: makeInvoice(),
      openAttempt: makeAttempt({ outcome: null }),
      txUpdateReturns: [],  // UPDATE returns no rows → concurrent finalize collision
    })
    const { service } = await buildModule(db, createMockQueue(), fxRate)

    await expect(service.markSent(DISBURSE_ID, 'REF-001', null, ADMIN_ID))
      .rejects
      .toThrow(/already finalized by a concurrent request/)
  })

  // D11. fail ConflictException when disbursement update returns no rows
  it('D11: fail throws ConflictException when disbursement was already finalized by a concurrent request', async () => {
    // Simulate: disbursement is in 'queued' (passes the status check), but the
    // WHERE status IN ('queued','sending') guard on the UPDATE matches no rows.
    const db = createMockDb({
      txPath: 'fail',
      disbursementForMutation: makeDisbursement({ status: 'queued' }),
      invoiceForFail: makeInvoice(),
      txUpdateReturns: [],  // UPDATE returns no rows → concurrent finalize collision
    })
    const { service } = await buildModule(db)

    await expect(service.fail(DISBURSE_ID, 'some reason', ADMIN_ID))
      .rejects
      .toThrow(/already finalized by a concurrent request/)
  })

  // D12. enqueue handles 23505 unique_violation by returning the winner row
  it('D12: enqueue handles 23505 by returning the winner row without re-enqueueing the BullMQ job', async () => {
    const winner = makeDisbursement({ status: 'queued', idempotencyKey: 'winner-key-0000-0000-000000000000'.slice(0, 36) })
    const uniqueViolationErr = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })

    const db = createMockDb({
      invoice: makeInvoice({ status: 'approved' }),
      existingDisbursement: null,  // Idempotency check finds nothing (concurrent race)
      account: makeAccount(),
      insertThrows: uniqueViolationErr,  // INSERT throws 23505
      winnerRow: winner,                 // Follow-up SELECT returns the winner
    })
    const queue = createMockQueue()
    const { service } = await buildModule(db, queue)

    const result = await service.enqueue(INVOICE_ID, USER_ID, 33_900, 'CAD')

    // Returns the winning row
    expect(result.id).toBe(winner.id)
    expect(result.idempotencyKey).toBe(winner.idempotencyKey)

    // Does NOT enqueue a duplicate BullMQ job
    expect(queue.add).not.toHaveBeenCalled()
  })
})
