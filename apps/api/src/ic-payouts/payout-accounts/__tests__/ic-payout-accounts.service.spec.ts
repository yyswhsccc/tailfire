/**
 * Unit Tests: IcPayoutAccountsService
 *
 * TDD — tests are written against the public API of the service.
 * No real DB or encryption keys needed — all deps are mocked.
 */

import { Test } from '@nestjs/testing'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { IcPayoutAccountsService } from '../ic-payout-accounts.service'
import { EncryptionService } from '../../../common/encryption/encryption.service'
import { DatabaseService } from '../../../db/database.service'

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function createMockEncryption() {
  const crypto = require('crypto') as typeof import('crypto')
  const ALGORITHM = 'aes-256-gcm'
  const key = crypto.randomBytes(32)
  const VERSION = 1

  return {
    currentKeyVersion: VERSION,
    encryptWithVersion: jest.fn((plain: string) => {
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return { ciphertext: Buffer.concat([iv, tag, enc]), keyVersion: VERSION }
    }),
    decryptWithVersion: jest.fn((ciphertext: Buffer, _version: number) => {
      const iv = ciphertext.subarray(0, 12)
      const tag = ciphertext.subarray(12, 28)
      const enc = ciphertext.subarray(28)
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    }),
  }
}

/**
 * Drizzle mock with transaction support.
 *
 * Strategy:
 *  - `select()` always returns a chain that resolves at `.limit()` OR `.where()`.
 *    We control _what_ it resolves to via `mockSelect.mockImplementationOnce(...)`.
 *  - `update()` records the `.set(...)` payload into `_calls.update` for assertion.
 *  - `transaction()` executes the callback with a tx object that reuses the same
 *    `mockUpdate` (so assertions on `_calls.update` work inside transactions too).
 */
function createMockDrizzle() {
  const calls = {
    update: [] as Array<{ table: string; set: Record<string, unknown> }>,
  }

  /**
   * Build a select chain that resolves with `rows` at either .limit() or .where().
   * The chain is thenable via .where() so code that doesn't call .limit() works too.
   */
  function makeSelectChain(rows: any[]): any {
    const chain: any = {}
    chain.from = jest.fn(() => chain)
    // .where() returns a thenable chain (so `await select().from().where()` resolves)
    chain.where = jest.fn(() => {
      const thenableChain: any = {}
      thenableChain.limit = jest.fn(() => Promise.resolve(rows))
      // Make the chain itself awaitable (for listForUser which has no .limit())
      thenableChain.then = (resolve: (v: any) => any, reject: (e: any) => any) =>
        Promise.resolve(rows).then(resolve, reject)
      return thenableChain
    })
    chain.limit = jest.fn(() => Promise.resolve(rows))
    return chain
  }

  const mockSelect = jest.fn(() => makeSelectChain([]))

  // Update chain: update().set().where()
  const mockUpdate = jest.fn((table: any) => {
    const label = table?.name ?? String(table)
    const where = jest.fn(() => Promise.resolve())
    const set = jest.fn((s: Record<string, unknown>) => {
      calls.update.push({ table: label, set: s })
      return { where }
    })
    return { set }
  })

  // Transaction: executes cb with a tx that reuses mockUpdate
  const mockTransaction = jest.fn(async (cb: (tx: any) => any) => {
    const txInsertReturning = jest.fn()
    const txInsertValues = jest.fn(() => ({ returning: txInsertReturning }))
    const txInsert = jest.fn(() => ({ values: txInsertValues }))
    const tx = {
      select: jest.fn(() => makeSelectChain([])),
      insert: txInsert,
      update: mockUpdate,
    }
    // txInsertReturning resolved lazily so tests can set state.insertReturning before it fires
    txInsertReturning.mockImplementation(() => Promise.resolve(state.insertReturning))
    return cb(tx)
  })

  // Shared state (tests set these before calling service methods)
  const state = {
    insertReturning: [] as any[],
  }

  const client = {
    select: mockSelect,
    update: mockUpdate,
    transaction: mockTransaction,
  }

  return { client, _state: state, _calls: calls, _mocks: { mockSelect, mockUpdate, mockTransaction } }
}

// ─── Helpers to prime the select mock ─────────────────────────────────────────

/**
 * Sets up the next `select()` call to return `rows`.
 * The service's `create()` first selects the tax profile row.
 */
function primeTaxProfile(mockDb: ReturnType<typeof createMockDrizzle>, taxProfile: any) {
  const rows = taxProfile ? [taxProfile] : []
  mockDb._mocks.mockSelect.mockImplementationOnce(() => {
    const chain: any = {}
    chain.from = jest.fn(() => chain)
    chain.where = jest.fn(() => {
      const t: any = {}
      t.limit = jest.fn(() => Promise.resolve(rows))
      t.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej)
      return t
    })
    chain.limit = jest.fn(() => Promise.resolve(rows))
    return chain
  })
}

function primeAccountsList(mockDb: ReturnType<typeof createMockDrizzle>, accounts: any[]) {
  mockDb._mocks.mockSelect.mockImplementationOnce(() => {
    const chain: any = {}
    chain.from = jest.fn(() => chain)
    chain.where = jest.fn(() => {
      const t: any = {}
      t.limit = jest.fn(() => Promise.resolve(accounts))
      t.then = (res: any, rej: any) => Promise.resolve(accounts).then(res, rej)
      return t
    })
    chain.limit = jest.fn(() => Promise.resolve(accounts))
    return chain
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IcPayoutAccountsService', () => {
  let service: IcPayoutAccountsService
  let mockDb: ReturnType<typeof createMockDrizzle>

  beforeEach(async () => {
    mockDb = createMockDrizzle()

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcPayoutAccountsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: EncryptionService, useValue: createMockEncryption() },
      ],
    }).compile()

    service = moduleRef.get(IcPayoutAccountsService)
  })

  afterEach(() => jest.clearAllMocks())

  // ── create: interac e-transfer ─────────────────────────────────────────────

  it('creates an interac e-transfer account and masks the email', async () => {
    primeTaxProfile(mockDb, { id: 'p1', rctiAuthorizationId: 'auth-1' })
    mockDb._state.insertReturning = [{
      id: 'acct-new',
      detailsMask: 'm***@example.com',
      status: 'unverified',
      detailsEncrypted: Buffer.from('encrypted'),
      encryptionKeyVersion: 1,
    }]

    const acct = await service.create('agency-1', 'user-1', {
      label: 'My personal email',
      currency: 'CAD',
      rail: 'interac_etransfer',
      details: { email: 'mary@example.com', securityQuestion: 'Phoenix?', securityAnswer: 'Sun' },
      isDefaultForCurrency: true,
    })

    expect(acct.detailsMask).toBe('m***@example.com')
    expect(acct.status).toBe('unverified')
    expect(acct.detailsEncrypted).toBeInstanceOf(Buffer)
    expect(acct.encryptionKeyVersion).toBeGreaterThan(0)
  })

  // ── atomic default swap ────────────────────────────────────────────────────

  it('atomically swaps default when a new default account is added for a currency', async () => {
    primeTaxProfile(mockDb, { id: 'p1', rctiAuthorizationId: 'auth-1' })
    mockDb._state.insertReturning = [{
      id: 'acct-new',
      detailsMask: 'b***@x.com',
      status: 'unverified',
      detailsEncrypted: Buffer.alloc(28),
      encryptionKeyVersion: 1,
    }]

    await service.create('agency-1', 'user-1', {
      label: 'New default',
      currency: 'CAD',
      rail: 'interac_etransfer',
      details: { email: 'b@x.com' },
      isDefaultForCurrency: true,
    })

    expect(mockDb._calls.update).toContainEqual(
      expect.objectContaining({
        set: expect.objectContaining({ isDefaultForCurrency: false }),
      }),
    )
  })

  // ── RCTI guard ────────────────────────────────────────────────────────────

  it('rejects creating an account when no active RCTI authorization exists', async () => {
    primeTaxProfile(mockDb, { id: 'p1', rctiAuthorizationId: null })

    await expect(
      service.create('agency-1', 'user-1', {
        label: 'X',
        currency: 'CAD',
        rail: 'interac_etransfer',
        details: { email: 'a@b.com' },
      }),
    ).rejects.toThrow(ForbiddenException)
  })

  // ── EFT + PAD ─────────────────────────────────────────────────────────────

  it('captures PAD agreement on EFT rail creation', async () => {
    primeTaxProfile(mockDb, { id: 'p1', rctiAuthorizationId: 'auth-1' })
    mockDb._state.insertReturning = [{
      id: 'acct-eft',
      detailsMask: '***4567',
      status: 'unverified',
      detailsEncrypted: Buffer.alloc(28),
      encryptionKeyVersion: 1,
      padAgreementVersion: 'v1',
      padAcceptedAt: new Date(),
    }]

    const acct = await service.create('agency-1', 'user-1', {
      label: 'TD chequing',
      currency: 'CAD',
      rail: 'eft',
      details: { institution: '004', transit: '12345', account: '1234567' },
      padAgreementVersion: 'v1',
      padAcceptedIp: '10.0.0.1',
    })

    expect(acct.padAgreementVersion).toBe('v1')
    expect(acct.padAcceptedAt).toBeInstanceOf(Date)
  })

  it('rejects EFT account creation without PAD agreement', async () => {
    primeTaxProfile(mockDb, { id: 'p1', rctiAuthorizationId: 'auth-1' })

    await expect(
      service.create('agency-1', 'user-1', {
        label: 'TD',
        currency: 'CAD',
        rail: 'eft',
        details: { institution: '004', transit: '12345', account: '1234567' },
      }),
    ).rejects.toThrow(BadRequestException)
  })

  // ── rail-specific field validation ────────────────────────────────────────

  it('validates rail-specific required fields', async () => {
    // Each create() needs its own tax profile prime (two calls = two primes)
    primeTaxProfile(mockDb, { id: 'p1', rctiAuthorizationId: 'auth-1' })
    primeTaxProfile(mockDb, { id: 'p1', rctiAuthorizationId: 'auth-1' })

    // Interac without email
    await expect(
      service.create('agency-1', 'user-1', {
        label: 'X',
        currency: 'CAD',
        rail: 'interac_etransfer',
        details: {},
      }),
    ).rejects.toThrow(/email/i)

    // Wire without SWIFT
    await expect(
      service.create('agency-1', 'user-1', {
        label: 'Y',
        currency: 'USD',
        rail: 'wire',
        details: { account: '123' },
      }),
    ).rejects.toThrow(/swift/i)
  })

  // ── archive ───────────────────────────────────────────────────────────────

  it('archives an account by setting status=archived and isDefaultForCurrency=false', async () => {
    await service.archive('agency-1', 'user-1', 'acct-1')

    expect(mockDb._calls.update).toContainEqual(
      expect.objectContaining({
        set: expect.objectContaining({ status: 'archived', isDefaultForCurrency: false }),
      }),
    )
  })

  // ── list ──────────────────────────────────────────────────────────────────

  it('lists all accounts for a user', async () => {
    primeAccountsList(mockDb, [{ id: 'a1' }, { id: 'a2' }])
    const result = await service.listForUser('agency-1', 'user-1')
    expect(result).toHaveLength(2)
  })
})
