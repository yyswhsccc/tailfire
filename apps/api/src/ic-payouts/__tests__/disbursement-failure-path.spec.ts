/**
 * Failure-path integration test (Task 40)
 *
 * Cross-service test that verifies the full failure-path wiring between
 * DisbursementService.fail() and IcPayoutNotificationsService.onDisbursementFailed().
 *
 * Asserts all six side-effect categories produced by DisbursementService.fail():
 *   1. Attempt row inserted (outcome='failed', reason recorded)
 *   2. Settlement DELETE SQL executed (commission_item_settlements)
 *   3. Adjustment UPDATE SQL executed (flip status='pending', check_id=NULL)
 *   4. Reservation check cancelled (commissionChecks status='cancelled')
 *   5. Invoice cancelled (icInvoices status='cancelled')
 *   6. Disbursement failed (icDisbursements status='failed')
 *
 * Plus cross-service assertions:
 *   7. 'ic-payout.disbursement.failed' event emitted with correct payload
 *   8. IcPayoutNotificationsService.onDisbursementFailed sends two emails (IC + admin)
 *   9. Defensive: admin email still sent when IC has no email
 *
 * This is NOT a real DB E2E test — it uses the same chainable-mock DB pattern
 * as disbursement.service.spec.ts to record and assert on writes. The value is
 * in cross-service wiring coverage, not real Postgres transaction semantics.
 */

import { Test } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { getQueueToken } from '@nestjs/bullmq'
import { DisbursementService } from '../disbursements/disbursement.service'
import { IcPayoutNotificationsService } from '../notifications/ic-payout-notifications.service'
import { DatabaseService } from '../../db/database.service'
import { FxRateService } from '../fx/fx-rate.service'
import { QUEUES } from '../../automation/automation.types'

// Mock EmailService via module factory to avoid compiling email-accounts / imap deps
// (same pattern as notifications.service.spec.ts)
jest.mock('../../email/email.service', () => ({
  EmailService: class MockEmailService {
    sendEmail = jest.fn().mockResolvedValue({ success: true, emailLogId: 'log-1' })
  },
}))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EmailService } = require('../../email/email.service') as { EmailService: any }

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENCY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const INVOICE_ID = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii'
const DISBURSE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const ACCOUNT_ID = 'acacacac-acac-acac-acac-acacacacacac'
const RESERVATION_CHECK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ATTEMPT_ID = 'aaaabbbb-aaaa-aaaa-aaaa-aaaabbbbaaaa'
const ADMIN_ID = 'adminadm-inad-mina-dmin-adminadminadm'
const IC_EMAIL = 'ic@example.com'
const ADMIN_EMAIL = 'admin@example.com'

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
    totalCents: 50_000,
    reportableBaseCents: 45_000,
    taxCents: 5_000,
    reservationCheckId: RESERVATION_CHECK_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeDisbursement(overrides: Record<string, unknown> = {}) {
  return {
    id: DISBURSE_ID,
    invoiceId: INVOICE_ID,
    userId: USER_ID,
    agencyId: AGENCY_ID,
    payoutAccountId: ACCOUNT_ID,
    amountCents: 50_000,
    currency: 'CAD',
    provider: 'manual',
    rail: 'interac_etransfer',
    idempotencyKey: 'deadbeef-dead-dead-dead-deadbeefcafe',
    status: 'sending',
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
    outcome: 'failed',
    reason: 'manual fail by admin',
    manualReference: null,
    manualProofStoragePath: null,
    manualSentBy: ADMIN_ID,
    startedAt: new Date(),
    completedAt: new Date(),
    ...overrides,
  }
}

// ─── DB mock factory (adapted from disbursement.service.spec.ts) ──────────────
//
// This factory is focused on the 'fail' path:
//   tx selects: [0]=disbursement, [1]=invoice
//   tx inserts: [0]=attempt (outcome='failed')
//   tx executes: [0]=getNextAttemptNumber, [1]=DELETE settlements, [2]=UPDATE adjustments
//   tx updates:  [0]=disbursements (status='failed'), [1]=commissionChecks (status='cancelled'), [2]=icInvoices (status='cancelled')
//
// For the notifications DB: resolves getUserEmail and getAdminEmails selects.

function createDisbursementMockDb(opts: {
  disbursement?: ReturnType<typeof makeDisbursement>
  invoice?: ReturnType<typeof makeInvoice>
  updatedDisbursement?: ReturnType<typeof makeDisbursement>
  /** Pass [] to simulate concurrent-finalize ConflictException */
  txUpdateReturns?: ReturnType<typeof makeDisbursement>[]
} = {}) {
  const {
    disbursement = makeDisbursement({ status: 'sending' }),
    invoice = makeInvoice(),
    updatedDisbursement = makeDisbursement({ status: 'failed' }),
    txUpdateReturns,
  } = opts

  const calls = {
    inserts: [] as any[],
    updates: [] as any[],
    executes: [] as any[],
  }

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

  // Transaction — all selects for 'fail' happen inside tx
  // tx select sequence: [0]=disbursement, [1]=invoice
  const txUpdateReturnValue = txUpdateReturns !== undefined
    ? txUpdateReturns
    : [updatedDisbursement]

  const mockTransaction = jest.fn(async (cb: (tx: any) => Promise<any>) => {
    const txSelectCount = { n: 0 }
    const txSelectResponses = [
      [disbursement],  // 0: disbursement status check
      [invoice],       // 1: invoice load
    ]

    let executeCount = 0
    const tx = {
      select: jest.fn(() => {
        const idx = txSelectCount.n++
        return makeSelectChain(txSelectResponses[idx] ?? [])
      }),
      insert: jest.fn((_table: any) => ({
        values: jest.fn((vals: any) => {
          calls.inserts.push(vals)
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
        if (idx === 0) return [{ n: 1 }]  // getNextAttemptNumber
        return []
      }),
    }
    return cb(tx)
  })

  return {
    client: {
      // db.client not used for selects in fail path (all inside tx)
      select: jest.fn(() => makeSelectChain([])),
      insert: jest.fn(),
      update: jest.fn(),
      execute: jest.fn(),
      transaction: mockTransaction,
    },
    _calls: calls,
  }
}

/**
 * Creates a mock DatabaseService suitable for IcPayoutNotificationsService.
 * Sequences: [getUserEmail result, getAdminEmails result]
 */
function createNotificationsMockDb(opts: {
  icEmail: string | null
  adminEmails: string[]
}) {
  let callIndex = 0
  const sequences = [
    [{ email: opts.icEmail }],
    opts.adminEmails.map((e) => ({ email: e })),
  ]

  const makeWhereResult = (rows: { email: string | null }[]) => {
    const result = Promise.resolve(rows) as any
    result.limit = jest.fn().mockResolvedValue(rows.slice(0, 1))
    return result
  }

  return {
    client: {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            const rows = sequences[callIndex] ?? []
            callIndex++
            return makeWhereResult(rows)
          }),
        }),
      }),
    },
  }
}

// ─── Module builders ──────────────────────────────────────────────────────────

async function buildDisbursementService(db: ReturnType<typeof createDisbursementMockDb>) {
  const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) }
  const mockFxRate = { getRateOnDate: jest.fn().mockResolvedValue(1.0) }
  const mockEmitter = { emit: jest.fn() }

  const moduleRef = await Test.createTestingModule({
    providers: [
      DisbursementService,
      { provide: DatabaseService, useValue: db },
      { provide: getQueueToken(QUEUES.IC_PAYOUT_DISBURSE), useValue: mockQueue },
      { provide: FxRateService, useValue: mockFxRate },
      { provide: EventEmitter2, useValue: mockEmitter },
    ],
  }).compile()

  return {
    service: moduleRef.get(DisbursementService),
    emitter: mockEmitter,
  }
}

async function buildNotificationsService(
  notifDb: ReturnType<typeof createNotificationsMockDb>,
  emailMock: any,
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      IcPayoutNotificationsService,
      { provide: DatabaseService, useValue: notifDb },
      { provide: EmailService, useValue: emailMock },
    ],
  }).compile()
  return moduleRef.get(IcPayoutNotificationsService)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IC Payout failure path — cross-service integration (Task 40)', () => {
  afterEach(() => jest.clearAllMocks())

  /**
   * FP1: Full failure path from 'sending'
   *
   * Verifies that a single call to DisbursementService.fail() produces ALL of:
   *   - attempt row (outcome='failed', reason recorded, failedBy=adminId)
   *   - DELETE settlements SQL executed (commission_item_settlements)
   *   - UPDATE adjustments SQL executed (flip status='pending', check_id=NULL)
   *   - commissionChecks update (status='cancelled')
   *   - icInvoices update (status='cancelled')
   *   - icDisbursements update (status='failed')
   *   - 'ic-payout.disbursement.failed' event emitted with correct payload
   */
  it('FP1: fail() from "sending" — all six DB side-effects + event emitted', async () => {
    const db = createDisbursementMockDb({
      disbursement: makeDisbursement({ status: 'sending' }),
      invoice: makeInvoice({ reservationCheckId: RESERVATION_CHECK_ID }),
      updatedDisbursement: makeDisbursement({ status: 'failed' }),
    })
    const { service, emitter } = await buildDisbursementService(db)

    const result = await service.fail(DISBURSE_ID, 'manual fail by admin', ADMIN_ID)

    // 1. Disbursement returned as 'failed'
    expect(result.status).toBe('failed')

    // 2. Attempt row inserted with outcome='failed', reason, failedBy
    const failedAttempt = db._calls.inserts.find((i: any) => i.outcome === 'failed')
    expect(failedAttempt).toBeDefined()
    expect(failedAttempt.reason).toBe('manual fail by admin')
    expect(failedAttempt.manualSentBy).toBe(ADMIN_ID)
    expect(failedAttempt.disbursementId).toBe(DISBURSE_ID)

    // 3. DELETE settlements SQL executed (commission_item_settlements)
    const deleteSettlementsExec = db._calls.executes.find((e: any) => {
      const chunks = e?.queryChunks ?? []
      return chunks.some((c: any) => String(c?.value ?? '').includes('commission_item_settlements'))
        || String(e).includes('commission_item_settlements')
    })
    expect(deleteSettlementsExec).toBeDefined()

    // 4. UPDATE adjustments SQL executed (commission_adjustments back to 'pending')
    const updateAdjustmentsExec = db._calls.executes.find((e: any) => {
      const chunks = e?.queryChunks ?? []
      return chunks.some((c: any) => String(c?.value ?? '').includes('commission_adjustments'))
        || String(e).includes('commission_adjustments')
    })
    expect(updateAdjustmentsExec).toBeDefined()

    // 5. commissionChecks cancelled (appears in db._calls.updates)
    const cancelledUpdates = db._calls.updates.filter((u: any) => u.status === 'cancelled')
    // Must have at least 2 'cancelled' updates: commissionChecks + icInvoices
    expect(cancelledUpdates.length).toBeGreaterThanOrEqual(2)

    // 6. icDisbursements set to 'failed'
    const failedUpdate = db._calls.updates.find((u: any) => u.status === 'failed')
    expect(failedUpdate).toBeDefined()

    // 7. Event emitted after transaction commits
    expect(emitter.emit).toHaveBeenCalledWith(
      'ic-payout.disbursement.failed',
      expect.objectContaining({
        disbursementId: DISBURSE_ID,
        invoiceId: INVOICE_ID,
        agencyId: AGENCY_ID,
        userId: USER_ID,
        currency: 'CAD',
        amountCents: 50_000,
        reason: 'manual fail by admin',
        failedBy: ADMIN_ID,
      }),
    )
  })

  /**
   * FP2: Full failure path from 'queued'
   *
   * Admin can cancel a disbursement before the processor runs. The same
   * reversal logic applies regardless of whether status was 'queued' or 'sending'.
   */
  it('FP2: fail() from "queued" — allowed (admin cancels before processor), produces same side-effects', async () => {
    const db = createDisbursementMockDb({
      disbursement: makeDisbursement({ status: 'queued' }),
      invoice: makeInvoice({ reservationCheckId: RESERVATION_CHECK_ID }),
      updatedDisbursement: makeDisbursement({ status: 'failed' }),
    })
    const { service, emitter } = await buildDisbursementService(db)

    const result = await service.fail(DISBURSE_ID, 'Admin cancelled before send', ADMIN_ID)

    expect(result.status).toBe('failed')

    // Attempt inserted
    const failedAttempt = db._calls.inserts.find((i: any) => i.outcome === 'failed')
    expect(failedAttempt).toBeDefined()
    expect(failedAttempt.reason).toBe('Admin cancelled before send')

    // Reversal SQL still fires even from 'queued'
    const execContainingSettlements = db._calls.executes.find((e: any) => {
      const chunks = e?.queryChunks ?? []
      return chunks.some((c: any) => String(c?.value ?? '').includes('commission_item_settlements'))
        || String(e).includes('commission_item_settlements')
    })
    expect(execContainingSettlements).toBeDefined()

    // Event emitted
    expect(emitter.emit).toHaveBeenCalledWith(
      'ic-payout.disbursement.failed',
      expect.objectContaining({
        disbursementId: DISBURSE_ID,
        reason: 'Admin cancelled before send',
        failedBy: ADMIN_ID,
      }),
    )
  })

  /**
   * FP3: No reversal SQL when invoice has no reservationCheckId
   *
   * An invoice that was approved but never had a reservation check should
   * not fire reversal SQL. This guards against NULL check_id NULLification.
   */
  it('FP3: fail() — skips reversal SQL when invoice has no reservationCheckId', async () => {
    const db = createDisbursementMockDb({
      disbursement: makeDisbursement({ status: 'sending' }),
      invoice: makeInvoice({ reservationCheckId: null }),
      updatedDisbursement: makeDisbursement({ status: 'failed' }),
    })
    const { service, emitter } = await buildDisbursementService(db)

    await service.fail(DISBURSE_ID, 'reason', ADMIN_ID)

    // No reversal executes — only getNextAttemptNumber execute (idx=0) fires
    const reversalExecs = db._calls.executes.filter((e: any) => {
      const chunks = e?.queryChunks ?? []
      return chunks.some((c: any) =>
        String(c?.value ?? '').includes('commission_item_settlements')
        || String(c?.value ?? '').includes('commission_adjustments'),
      )
    })
    expect(reversalExecs).toHaveLength(0)

    // Event still emitted
    expect(emitter.emit).toHaveBeenCalledWith('ic-payout.disbursement.failed', expect.anything())
  })

  /**
   * FP4: Notification handler sends two emails (IC + admin)
   *
   * Invokes onDisbursementFailed directly with the payload that DisbursementService.fail()
   * would emit. Verifies both the IC email (subject: "could not be sent") and the admin
   * email (subject: "Disbursement failed") are sent with the correct content.
   */
  it('FP4: onDisbursementFailed — sends two emails (IC + admin) with correct content', async () => {
    const notifDb = createNotificationsMockDb({
      icEmail: IC_EMAIL,
      adminEmails: [ADMIN_EMAIL],
    })
    const emailMock = { sendEmail: jest.fn().mockResolvedValue({ success: true, emailLogId: 'log-1' }) }
    const notifications = await buildNotificationsService(notifDb, emailMock)

    const failPayload = {
      disbursementId: DISBURSE_ID,
      invoiceId: INVOICE_ID,
      agencyId: AGENCY_ID,
      userId: USER_ID,
      currency: 'CAD',
      amountCents: 50_000,
      reason: 'manual fail by admin',
      failedBy: ADMIN_ID,
    }

    await notifications.onDisbursementFailed(failPayload)

    expect(emailMock.sendEmail).toHaveBeenCalledTimes(2)

    // First call: IC notification
    const icCall = emailMock.sendEmail.mock.calls[0][0]
    expect(icCall.to).toEqual([IC_EMAIL])
    expect(icCall.subject).toContain('could not be sent')
    expect(icCall.html).toContain('manual fail by admin')
    expect(icCall.html).toContain(DISBURSE_ID)
    expect(icCall.agencyId).toBe(AGENCY_ID)
    expect(icCall.templateSlug).toBe('ic-payout.disbursement.failed-ic')

    // Second call: admin notification
    const adminCall = emailMock.sendEmail.mock.calls[1][0]
    expect(adminCall.to).toEqual([ADMIN_EMAIL])
    expect(adminCall.subject).toContain('Disbursement failed')
    expect(adminCall.html).toContain('manual fail by admin')
    expect(adminCall.html).toContain(INVOICE_ID)
    expect(adminCall.html).toContain(DISBURSE_ID)
    expect(adminCall.agencyId).toBe(AGENCY_ID)
    expect(adminCall.templateSlug).toBe('ic-payout.disbursement.failed-admin')
  })

  /**
   * FP5: Notification handler — admin email still sent when IC has no email
   *
   * Defensive case: IC user profile has no email address set. Admin must still
   * receive their notification since they need to take corrective action.
   */
  it('FP5: onDisbursementFailed — admin email still sent when IC has no email', async () => {
    const notifDb = createNotificationsMockDb({
      icEmail: null,   // IC has no email
      adminEmails: [ADMIN_EMAIL],
    })
    const emailMock = { sendEmail: jest.fn().mockResolvedValue({ success: true, emailLogId: 'log-1' }) }
    const notifications = await buildNotificationsService(notifDb, emailMock)

    await notifications.onDisbursementFailed({
      disbursementId: DISBURSE_ID,
      invoiceId: INVOICE_ID,
      agencyId: AGENCY_ID,
      userId: USER_ID,
      currency: 'CAD',
      amountCents: 50_000,
      reason: 'IBAN invalid',
      failedBy: ADMIN_ID,
    })

    // Only one call — admin (IC skipped because no email)
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(1)
    const adminCall = emailMock.sendEmail.mock.calls[0][0]
    expect(adminCall.to).toEqual([ADMIN_EMAIL])
    expect(adminCall.subject).toContain('Disbursement failed')
  })

  /**
   * FP6: Notification handler — no emails sent when both IC and admin have no addresses
   *
   * Edge case: completely unconfigured agency. Neither sendEmail should fire.
   */
  it('FP6: onDisbursementFailed — no emails sent when IC has no email and no admin recipients', async () => {
    const notifDb = createNotificationsMockDb({
      icEmail: null,
      adminEmails: [],
    })
    const emailMock = { sendEmail: jest.fn().mockResolvedValue({ success: true, emailLogId: 'log-1' }) }
    const notifications = await buildNotificationsService(notifDb, emailMock)

    await notifications.onDisbursementFailed({
      disbursementId: DISBURSE_ID,
      invoiceId: INVOICE_ID,
      agencyId: AGENCY_ID,
      userId: USER_ID,
      currency: 'CAD',
      amountCents: 50_000,
      reason: 'test',
      failedBy: ADMIN_ID,
    })

    expect(emailMock.sendEmail).not.toHaveBeenCalled()
  })

  /**
   * FP7: Event payload → notification handler wiring (end-to-end across both services)
   *
   * Runs DisbursementService.fail() to capture the emitted event payload, then feeds
   * that exact payload to IcPayoutNotificationsService.onDisbursementFailed() and asserts
   * the notification emails are produced. This validates the payload contract between
   * DisbursementService and IcPayoutNotificationsService is consistent.
   */
  it('FP7: event payload from fail() feeds correctly into onDisbursementFailed() — two emails produced', async () => {
    // 1. Run fail() and capture the emitted payload
    const disbDb = createDisbursementMockDb({
      disbursement: makeDisbursement({ status: 'sending' }),
      invoice: makeInvoice({ reservationCheckId: RESERVATION_CHECK_ID }),
      updatedDisbursement: makeDisbursement({ status: 'failed' }),
    })
    const { service, emitter } = await buildDisbursementService(disbDb)

    await service.fail(DISBURSE_ID, 'Wire failed: invalid IBAN', ADMIN_ID)

    // Extract the payload DisbursementService actually emitted
    expect(emitter.emit).toHaveBeenCalledWith('ic-payout.disbursement.failed', expect.anything())
    const emittedPayload = (emitter.emit as jest.Mock).mock.calls[0][1]

    // Verify the payload has the expected shape
    expect(emittedPayload).toMatchObject({
      disbursementId: DISBURSE_ID,
      invoiceId: INVOICE_ID,
      agencyId: AGENCY_ID,
      userId: USER_ID,
      currency: 'CAD',
      amountCents: 50_000,
      reason: 'Wire failed: invalid IBAN',
      failedBy: ADMIN_ID,
    })

    // 2. Feed the emitted payload into the notifications handler
    const notifDb = createNotificationsMockDb({
      icEmail: IC_EMAIL,
      adminEmails: [ADMIN_EMAIL],
    })
    const emailMock = { sendEmail: jest.fn().mockResolvedValue({ success: true, emailLogId: 'log-1' }) }
    const notifications = await buildNotificationsService(notifDb, emailMock)

    await notifications.onDisbursementFailed(emittedPayload)

    // Both emails must be sent
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(2)

    // IC email contains reason
    const icCall = emailMock.sendEmail.mock.calls[0][0]
    expect(icCall.to).toEqual([IC_EMAIL])
    expect(icCall.html).toContain('Wire failed: invalid IBAN')

    // Admin email contains reason and disbursement details
    const adminCall = emailMock.sendEmail.mock.calls[1][0]
    expect(adminCall.to).toEqual([ADMIN_EMAIL])
    expect(adminCall.html).toContain('Wire failed: invalid IBAN')
    expect(adminCall.html).toContain(DISBURSE_ID)
  })
})
