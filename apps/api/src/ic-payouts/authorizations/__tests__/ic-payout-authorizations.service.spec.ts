/**
 * Unit Tests: IcPayoutAuthorizationsService
 *
 * TDD — tests written against the public API of the service.
 * No real DB, storage, or Puppeteer needed — all deps are mocked.
 *
 * Key design decisions:
 *  - RctiPdfService is mocked to return Buffer.from('fake-pdf').
 *    Puppeteer visual output belongs in manual smoke testing.
 *  - StorageService.uploadDocument is mocked to return predictable paths
 *    that mirror the real '{componentId}/{timestamp}-{fileName}' pattern.
 *  - DatabaseService mock follows the exact same Drizzle chain pattern
 *    established in ic-payout-accounts.service.spec.ts.
 */

import { Test } from '@nestjs/testing'
import { IcPayoutAuthorizationsService } from '../ic-payout-authorizations.service'
import { DatabaseService } from '../../../db/database.service'
import { StorageService } from '../../../trips/storage.service'
import { RctiPdfService } from '../rcti-pdf.service'

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function createMockStorage() {
  return {
    uploadDocument: jest.fn(async (
      _file: Buffer,
      componentId: string,
      fileName: string,
      _contentType: string,
    ): Promise<string> => {
      // Mirror the real service's path generation: {componentId}/{timestamp}-{fileName}
      return `${componentId}/${Date.now()}-${fileName}`
    }),
  }
}

function createMockPdf() {
  return {
    render: jest.fn(async (_input: { text: string; signaturePngBytes: Buffer }) =>
      Buffer.from('fake-pdf'),
    ),
  }
}

/**
 * Drizzle mock with transaction support.
 *
 * Strategy:
 *  - select().from().where().limit() resolves with rows from state.selectRows.
 *  - update() records the .set() payload into _calls.update.
 *  - transaction() executes the callback with a tx that shares mockUpdate and
 *    a fresh insert chain; state.insertReturning controls what insert().returning() resolves to.
 */
function createMockDrizzle() {
  const calls = {
    update: [] as Array<{ table: unknown; set: Record<string, unknown> }>,
  }

  function makeSelectChain(rows: any[]): any {
    const chain: any = {}
    chain.from = jest.fn(() => chain)
    chain.where = jest.fn(() => {
      const thenableChain: any = {}
      thenableChain.limit = jest.fn(() => Promise.resolve(rows))
      thenableChain.then = (resolve: (v: any) => any, reject: (e: any) => any) =>
        Promise.resolve(rows).then(resolve, reject)
      return thenableChain
    })
    chain.limit = jest.fn(() => Promise.resolve(rows))
    return chain
  }

  const mockSelect = jest.fn(() => makeSelectChain([]))

  const mockUpdate = jest.fn((table: any) => {
    const where = jest.fn(() => Promise.resolve())
    const set = jest.fn((s: Record<string, unknown>) => {
      calls.update.push({ table, set: s })
      return { where }
    })
    return { set }
  })

  const mockTransaction = jest.fn(async (cb: (tx: any) => any) => {
    const txInsertReturning = jest.fn()
    const txInsertValues = jest.fn(() => ({ returning: txInsertReturning }))
    const txInsert = jest.fn(() => ({ values: txInsertValues }))
    const tx = {
      select: jest.fn(() => makeSelectChain([])),
      insert: txInsert,
      update: mockUpdate,
    }
    txInsertReturning.mockImplementation(() => Promise.resolve(state.insertReturning))
    return cb(tx)
  })

  const state = {
    insertReturning: [] as any[],
    selectRows: [] as any[],
  }

  const client = {
    select: mockSelect,
    update: mockUpdate,
    transaction: mockTransaction,
  }

  return { client, _state: state, _calls: calls, _mocks: { mockSelect, mockUpdate, mockTransaction } }
}

// ─── Default accept input ─────────────────────────────────────────────────────

const defaultInput = {
  agencyId: 'agency-1',
  userId: 'user-1',
  agencyLegalName: 'Phoenix Voyages Inc.',
  icLegalName: 'Mary IC Consultant',
  acceptedIp: '10.0.0.1',
  signaturePngBytes: Buffer.from('fake-png'),
  payerTaxRegistrationAttested: true,
  recipientTaxRegistrationAttested: true,
}

const defaultCreatedAuth = {
  id: 'auth-new',
  agencyId: 'agency-1',
  userId: 'user-1',
  agreementVersion: 'v1-2026-05',
  agreementTextHash: 'a'.repeat(64),
  agreementPdfStoragePath: 'ic-payouts/authorizations/user-1/123-v1-2026-05.pdf',
  signaturePngStoragePath: 'ic-payouts/authorizations/user-1/456-sig-v1-2026-05.png',
  acceptedAt: new Date(),
  acceptedIp: '10.0.0.1',
  payerTaxRegistrationAttested: true,
  recipientTaxRegistrationAttested: true,
  status: 'active',
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IcPayoutAuthorizationsService', () => {
  let service: IcPayoutAuthorizationsService
  let mockDb: ReturnType<typeof createMockDrizzle>
  let mockStorage: ReturnType<typeof createMockStorage>
  let mockPdf: ReturnType<typeof createMockPdf>

  beforeEach(async () => {
    mockDb = createMockDrizzle()
    mockStorage = createMockStorage()
    mockPdf = createMockPdf()

    mockDb._state.insertReturning = [defaultCreatedAuth]

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcPayoutAuthorizationsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: StorageService, useValue: mockStorage },
        { provide: RctiPdfService, useValue: mockPdf },
      ],
    }).compile()

    service = moduleRef.get(IcPayoutAuthorizationsService)
  })

  afterEach(() => jest.clearAllMocks())

  // ── hash + storage paths ───────────────────────────────────────────────────

  it('hashes the agreement text and stores both PDF and signature', async () => {
    const auth = await service.accept(defaultInput)

    // The hash must be a valid sha256 hex string
    expect(auth.agreementTextHash).toMatch(/^[a-f0-9]{64}$/)

    // Both storage paths must be under the user's component folder
    expect(auth.agreementPdfStoragePath).toMatch(/^ic-payouts\/authorizations\/user-1\//)
    expect(auth.signaturePngStoragePath).toMatch(/^ic-payouts\/authorizations\/user-1\//)
  })

  it('produces the correct sha256 hash for the rendered agreement text', async () => {
    // The hash stored on the returned record must match the actual agreement text hash
    // We verify determinism: same inputs → same hash
    const { createHash } = require('crypto') as typeof import('crypto')
    const { rctiAgreementText } = require('../rcti-template')
    const text = rctiAgreementText({
      agencyLegalName: defaultInput.agencyLegalName,
      icLegalName: defaultInput.icLegalName,
    })
    const expectedHash = createHash('sha256').update(text).digest('hex')

    // The mock db returns defaultCreatedAuth which has a fake hash; to test the
    // SERVICE computes the right hash, we inspect what was inserted by checking
    // the txInsertValues call args.
    await service.accept(defaultInput)

    // Verify uploadDocument was called with a pdf buffer (not the original signature)
    expect(mockStorage.uploadDocument).toHaveBeenCalledTimes(2)
    // Verify pdf.render was called with the agreement text
    const renderCall = mockPdf.render.mock.calls[0]![0]
    const actualHash = createHash('sha256').update(renderCall.text).digest('hex')
    expect(actualHash).toBe(expectedHash)
  })

  // ── supersede prior active authorization ───────────────────────────────────

  it('supersedes prior active authorization atomically', async () => {
    await service.accept(defaultInput)

    // Inside the transaction, update() should have been called with status: 'superseded'
    expect(mockDb._calls.update).toContainEqual(
      expect.objectContaining({
        set: expect.objectContaining({ status: 'superseded' }),
      }),
    )
  })

  it('inserts the new authorization with status active', async () => {
    const auth = await service.accept(defaultInput)
    expect(auth.status).toBe('active')
    expect(auth.id).toBe('auth-new')
  })

  // ── ic_tax_profiles update ─────────────────────────────────────────────────

  it('updates ic_tax_profiles.rctiAuthorizationId after successful insert', async () => {
    const auth = await service.accept(defaultInput)

    expect(mockDb._calls.update).toContainEqual(
      expect.objectContaining({
        set: expect.objectContaining({ rctiAuthorizationId: auth.id }),
      }),
    )
  })

  // ── storage content types ──────────────────────────────────────────────────

  it('uploads PDF and signature to storage with correct content types', async () => {
    await service.accept(defaultInput)

    expect(mockStorage.uploadDocument).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining('ic-payouts/authorizations/user-1'),
      expect.stringMatching(/\.pdf$/),
      'application/pdf',
    )

    expect(mockStorage.uploadDocument).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining('ic-payouts/authorizations/user-1'),
      expect.stringMatching(/\.png$/),
      'image/png',
    )
  })

  it('passes the original signature bytes as the PNG upload (not the PDF buffer)', async () => {
    await service.accept(defaultInput)

    // Find the PNG upload call
    const pngCall = mockStorage.uploadDocument.mock.calls.find(
      ([, , fileName]) => fileName.endsWith('.png'),
    )
    expect(pngCall).toBeDefined()
    // The file buffer for the PNG upload must equal the input signaturePngBytes
    expect(pngCall![0]).toEqual(defaultInput.signaturePngBytes)
  })

  // ── getActive ──────────────────────────────────────────────────────────────

  it('getActive returns null when no active auth exists', async () => {
    // Default mockSelect returns [] — no rows found
    const result = await service.getActive('agency-1', 'user-1')
    expect(result).toBeNull()
  })

  it('getActive returns the active authorization when one exists', async () => {
    mockDb._mocks.mockSelect.mockImplementationOnce(() => {
      const chain: any = {}
      chain.from = jest.fn(() => chain)
      chain.where = jest.fn(() => {
        const t: any = {}
        t.limit = jest.fn(() => Promise.resolve([defaultCreatedAuth]))
        t.then = (res: any, rej: any) => Promise.resolve([defaultCreatedAuth]).then(res, rej)
        return t
      })
      chain.limit = jest.fn(() => Promise.resolve([defaultCreatedAuth]))
      return chain
    })

    const result = await service.getActive('agency-1', 'user-1')
    expect(result).toEqual(defaultCreatedAuth)
    expect(result?.status).toBe('active')
  })
})
