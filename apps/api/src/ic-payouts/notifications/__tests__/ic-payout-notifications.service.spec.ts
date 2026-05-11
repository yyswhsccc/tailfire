/**
 * Unit Tests: IcPayoutNotificationsService
 *
 * Coverage:
 *  N1. onInvoiceSubmitted: skips email when autoApproved=true
 *  N2. onInvoiceSubmitted: sends to admin recipients on manual path
 *  N3. onInvoiceSubmitted: logs warn and no-ops if no admin recipients
 *  N4. onInvoiceApproved: sends to IC's email
 *  N5. onInvoiceApproved: no-ops if user has no email
 *  N6. onInvoiceRejected: includes reason in body
 *  N7. onInvoiceRejected: no-ops if user has no email
 *  N8. onDisbursementAwaitingManualSend: sends to admin recipients with rail+mask in body
 *  N9. onDisbursementAwaitingManualSend: warns if no admin recipients
 *  N10. onDisbursementSent: sends to IC with reference in body
 *  N11. onDisbursementFailed: sends to BOTH IC and admin (two sendEmail calls)
 *  N12. onDisbursementFailed: still sends admin email if IC has no email
 *  N13. onDisbursementReturned: no-op (no sendEmail call)
 */

import { Test, TestingModule } from '@nestjs/testing'
import { IcPayoutNotificationsService } from '../ic-payout-notifications.service'
import type {
  InvoiceSubmittedEvent,
  InvoiceApprovedEvent,
  InvoiceRejectedEvent,
  DisbursementAwaitingManualSendEvent,
  DisbursementSentEvent,
  DisbursementFailedEvent,
  DisbursementReturnedEvent,
} from '../ic-payout-notifications.service'
import { DatabaseService } from '../../../db/database.service'

// EmailService: use a string token to avoid transitively compiling email-accounts
// and imap-write modules which contain pre-existing TS errors unrelated to this task.
// The NestJS testing module resolves string tokens the same way as class tokens when
// useValue is provided.
//
// The actual EmailService class IS imported in IcPayoutNotificationsService, so NestJS
// uses that class constructor as the injection token. We provide it here as a string
// to make the import side-effect-free, but we still need the real class for provide.
// Solution: re-export the class symbol from the service under test via a type import.
//
// Simpler approach: just mock the module so ts-jest skips type-checking its deps.
jest.mock('../../../email/email.service', () => ({
  EmailService: class MockEmailService {
    sendEmail = jest.fn().mockResolvedValue({ success: true, emailLogId: 'log-1' })
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EmailService } = require('../../../email/email.service') as { EmailService: any }

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENCY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const ADMIN_ID = 'adminaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const INVOICE_ID = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii'
const DISBURSE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const IC_EMAIL = 'ic@example.com'
const ADMIN_EMAIL = 'admin@example.com'

// ─── Event payload factories ──────────────────────────────────────────────────

function makeSubmittedEvent(overrides: Partial<InvoiceSubmittedEvent> = {}): InvoiceSubmittedEvent {
  return {
    invoiceId: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    currency: 'CAD',
    totalCents: 30_000,
    autoApproved: false,
    ...overrides,
  }
}

function makeApprovedEvent(overrides: Partial<InvoiceApprovedEvent> = {}): InvoiceApprovedEvent {
  return {
    invoiceId: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    totalCents: 30_000,
    currency: 'CAD',
    approvedBy: ADMIN_ID,
    ...overrides,
  }
}

function makeRejectedEvent(overrides: Partial<InvoiceRejectedEvent> = {}): InvoiceRejectedEvent {
  return {
    invoiceId: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    reason: 'Missing receipts',
    rejectedBy: ADMIN_ID,
    ...overrides,
  }
}

function makeAwaitingEvent(overrides: Partial<DisbursementAwaitingManualSendEvent> = {}): DisbursementAwaitingManualSendEvent {
  return {
    disbursementId: DISBURSE_ID,
    invoiceId: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    currency: 'CAD',
    amountCents: 30_000,
    rail: 'interac_etransfer',
    mask: 'j***@example.com',
    ...overrides,
  }
}

function makeSentEvent(overrides: Partial<DisbursementSentEvent> = {}): DisbursementSentEvent {
  return {
    disbursementId: DISBURSE_ID,
    invoiceId: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    currency: 'CAD',
    amountCents: 30_000,
    reference: 'REF-20260511-001',
    completedAt: new Date('2026-05-11T12:00:00Z'),
    ...overrides,
  }
}

function makeFailedEvent(overrides: Partial<DisbursementFailedEvent> = {}): DisbursementFailedEvent {
  return {
    disbursementId: DISBURSE_ID,
    invoiceId: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    currency: 'CAD',
    amountCents: 30_000,
    reason: 'NSF',
    failedBy: ADMIN_ID,
    ...overrides,
  }
}

function makeReturnedEvent(overrides: Partial<DisbursementReturnedEvent> = {}): DisbursementReturnedEvent {
  return {
    disbursementId: DISBURSE_ID,
    invoiceId: INVOICE_ID,
    agencyId: AGENCY_ID,
    userId: USER_ID,
    currency: 'CAD',
    amountCents: 30_000,
    ...overrides,
  }
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function createPreciseDb(opts: {
  /** Sequence of where() return values. Index 0 is first call, etc. */
  whereResults: Array<{ email: string | null }[]>
}) {
  let callIndex = 0
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
            const rows = opts.whereResults[callIndex] ?? []
            callIndex++
            return makeWhereResult(rows)
          }),
        }),
      }),
    },
    schema: {},
  }
}

function createMockEmail() {
  return {
    sendEmail: jest.fn().mockResolvedValue({ success: true, emailLogId: 'log-1' }),
  }
}

async function buildService(db: any, emailMock: any) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      IcPayoutNotificationsService,
      { provide: DatabaseService, useValue: db },
      { provide: EmailService, useValue: emailMock },
    ],
  }).compile()
  return module.get<IcPayoutNotificationsService>(IcPayoutNotificationsService)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IcPayoutNotificationsService', () => {
  // ── N1: autoApproved skips admin email ──────────────────────────────────────
  it('N1: onInvoiceSubmitted — skips email when autoApproved=true', async () => {
    const db = createPreciseDb({ whereResults: [] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onInvoiceSubmitted(makeSubmittedEvent({ autoApproved: true }))

    expect(email.sendEmail).not.toHaveBeenCalled()
    expect(db.client.select).not.toHaveBeenCalled()
  })

  // ── N2: manual path sends to admin recipients ────────────────────────────────
  it('N2: onInvoiceSubmitted — sends admin email on manual path', async () => {
    const db = createPreciseDb({
      whereResults: [
        [{ email: ADMIN_EMAIL }, { email: 'admin2@example.com' }],
      ],
    })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onInvoiceSubmitted(makeSubmittedEvent({ autoApproved: false }))

    expect(email.sendEmail).toHaveBeenCalledTimes(1)
    const call = email.sendEmail.mock.calls[0][0]
    expect(call.to).toEqual([ADMIN_EMAIL, 'admin2@example.com'])
    expect(call.subject).toContain('New invoice submitted')
    expect(call.agencyId).toBe(AGENCY_ID)
  })

  // ── N3: no admin recipients → warn + no-op ────────────────────────────────
  it('N3: onInvoiceSubmitted — warns and no-ops if no admin recipients', async () => {
    const db = createPreciseDb({ whereResults: [[]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onInvoiceSubmitted(makeSubmittedEvent({ autoApproved: false }))

    expect(email.sendEmail).not.toHaveBeenCalled()
  })

  // ── N4: invoice.approved → IC email ─────────────────────────────────────────
  it('N4: onInvoiceApproved — sends email to IC', async () => {
    const db = createPreciseDb({ whereResults: [[{ email: IC_EMAIL }]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onInvoiceApproved(makeApprovedEvent())

    expect(email.sendEmail).toHaveBeenCalledTimes(1)
    const call = email.sendEmail.mock.calls[0][0]
    expect(call.to).toEqual([IC_EMAIL])
    expect(call.subject).toContain('approved')
    expect(call.html).toContain('CAD 300.00')
    expect(call.agencyId).toBe(AGENCY_ID)
  })

  // ── N5: invoice.approved, no user email → no-op ──────────────────────────
  it('N5: onInvoiceApproved — no-ops if user has no email', async () => {
    const db = createPreciseDb({ whereResults: [[{ email: null }]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onInvoiceApproved(makeApprovedEvent())

    expect(email.sendEmail).not.toHaveBeenCalled()
  })

  // ── N6: invoice.rejected → IC email with reason ──────────────────────────
  it('N6: onInvoiceRejected — sends email with reason in body', async () => {
    const db = createPreciseDb({ whereResults: [[{ email: IC_EMAIL }]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onInvoiceRejected(makeRejectedEvent({ reason: 'Missing receipts' }))

    expect(email.sendEmail).toHaveBeenCalledTimes(1)
    const call = email.sendEmail.mock.calls[0][0]
    expect(call.to).toEqual([IC_EMAIL])
    expect(call.subject).toContain('rejected')
    expect(call.html).toContain('Missing receipts')
    expect(call.text).toContain('Missing receipts')
  })

  // ── N7: invoice.rejected, no user email → no-op ──────────────────────────
  it('N7: onInvoiceRejected — no-ops if user has no email', async () => {
    const db = createPreciseDb({ whereResults: [[{ email: null }]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onInvoiceRejected(makeRejectedEvent())

    expect(email.sendEmail).not.toHaveBeenCalled()
  })

  // ── N8: disbursement.awaiting-manual-send → admin email with rail+mask ──
  it('N8: onDisbursementAwaitingManualSend — sends admin email with rail and mask', async () => {
    const db = createPreciseDb({ whereResults: [[{ email: ADMIN_EMAIL }]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onDisbursementAwaitingManualSend(
      makeAwaitingEvent({ rail: 'interac_etransfer', mask: 'j***@example.com' }),
    )

    expect(email.sendEmail).toHaveBeenCalledTimes(1)
    const call = email.sendEmail.mock.calls[0][0]
    expect(call.to).toEqual([ADMIN_EMAIL])
    expect(call.subject).toContain('awaiting')
    expect(call.html).toContain('interac_etransfer')
    expect(call.html).toContain('j***@example.com')
  })

  // ── N9: awaiting-manual-send, no admin → warn + no-op ───────────────────
  it('N9: onDisbursementAwaitingManualSend — warns if no admin recipients', async () => {
    const db = createPreciseDb({ whereResults: [[]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onDisbursementAwaitingManualSend(makeAwaitingEvent())

    expect(email.sendEmail).not.toHaveBeenCalled()
  })

  // ── N10: disbursement.sent → IC email with reference ─────────────────────
  it('N10: onDisbursementSent — sends IC email with reference', async () => {
    const db = createPreciseDb({ whereResults: [[{ email: IC_EMAIL }]] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onDisbursementSent(makeSentEvent({ reference: 'REF-20260511-001' }))

    expect(email.sendEmail).toHaveBeenCalledTimes(1)
    const call = email.sendEmail.mock.calls[0][0]
    expect(call.to).toEqual([IC_EMAIL])
    expect(call.subject).toContain('payment has been sent')
    expect(call.html).toContain('REF-20260511-001')
    expect(call.text).toContain('REF-20260511-001')
  })

  // ── N11: disbursement.failed → BOTH IC and admin (two sendEmail calls) ───
  it('N11: onDisbursementFailed — sends to BOTH IC and admin', async () => {
    const db = createPreciseDb({
      whereResults: [
        [{ email: IC_EMAIL }],      // getUserEmail for IC
        [{ email: ADMIN_EMAIL }],   // getAdminEmails
      ],
    })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onDisbursementFailed(makeFailedEvent({ reason: 'NSF' }))

    expect(email.sendEmail).toHaveBeenCalledTimes(2)

    const icCall = email.sendEmail.mock.calls[0][0]
    expect(icCall.to).toEqual([IC_EMAIL])
    expect(icCall.html).toContain('NSF')
    expect(icCall.subject).toContain('could not be sent')

    const adminCall = email.sendEmail.mock.calls[1][0]
    expect(adminCall.to).toEqual([ADMIN_EMAIL])
    expect(adminCall.html).toContain('NSF')
    expect(adminCall.subject).toContain('Disbursement failed')
  })

  // ── N12: disbursement.failed, IC has no email → still sends admin email ─
  it('N12: onDisbursementFailed — sends admin email even if IC has no email', async () => {
    const db = createPreciseDb({
      whereResults: [
        [{ email: null }],           // getUserEmail → null
        [{ email: ADMIN_EMAIL }],    // getAdminEmails
      ],
    })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    await svc.onDisbursementFailed(makeFailedEvent())

    expect(email.sendEmail).toHaveBeenCalledTimes(1)
    const adminCall = email.sendEmail.mock.calls[0][0]
    expect(adminCall.to).toEqual([ADMIN_EMAIL])
  })

  // ── N13: disbursement.returned → no-op ───────────────────────────────────
  it('N13: onDisbursementReturned — no-op (no sendEmail call)', async () => {
    const db = createPreciseDb({ whereResults: [] })
    const email = createMockEmail()
    const svc = await buildService(db, email)

    svc.onDisbursementReturned(makeReturnedEvent())

    expect(email.sendEmail).not.toHaveBeenCalled()
    expect(db.client.select).not.toHaveBeenCalled()
  })
})
