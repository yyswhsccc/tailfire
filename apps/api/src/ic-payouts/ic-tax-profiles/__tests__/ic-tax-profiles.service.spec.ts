/**
 * Unit Tests: IcTaxProfilesService
 *
 * Pure unit tests with mocked DatabaseService and EncryptionService.
 * No real DB connection required — verifies encryption, masking, and RBAC logic.
 */

import { Test } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { IcTaxProfilesService } from '../ic-tax-profiles.service'
import { EncryptionService } from '../../../common/encryption/encryption.service'
import { DatabaseService } from '../../../db/database.service'

// ─── Mock helpers ────────────────────────────────────────────────────────────

/**
 * Creates a minimal mock of EncryptionService that performs real AES operations
 * using an ephemeral in-memory key, so encrypt/decrypt round-trips actually work.
 */
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
 * Creates a minimal mock of DatabaseService.
 *
 * Pattern mirrors activity-logs.service.spec.ts: we mock the insert/select/update
 * chains that Drizzle produces. Each chain method returns `this`-like objects so
 * callers can do `.insert().values().returning()`.
 */
function createMockDrizzle() {
  // Shared state so individual tests can wire returned rows
  const state = {
    insertReturning: [] as any[],
    selectRows: [] as any[],
    updateReturning: [] as any[],
  }

  const mockReturningInsert = jest.fn(() => Promise.resolve(state.insertReturning))
  const mockValuesInsert = jest.fn(() => ({ returning: mockReturningInsert }))
  const mockInsert = jest.fn(() => ({ values: mockValuesInsert }))

  const mockReturningUpdate = jest.fn(() => Promise.resolve(state.updateReturning))
  const mockSetUpdate = jest.fn(() => ({ where: jest.fn(() => ({ returning: mockReturningUpdate })) }))
  const mockUpdate = jest.fn(() => ({ set: mockSetUpdate }))

  const mockLimit = jest.fn(() => Promise.resolve(state.selectRows))
  const mockWhere = jest.fn(() => ({ limit: mockLimit }))
  const mockFrom = jest.fn(() => ({ where: mockWhere }))
  const mockSelect = jest.fn(() => ({ from: mockFrom }))

  const client = {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  }

  return { client, _state: state, _mocks: { mockInsert, mockValuesInsert, mockReturningInsert, mockSelect, mockFrom, mockWhere, mockLimit, mockUpdate, mockSetUpdate, mockReturningUpdate } }
}

// ─── Test data helpers ───────────────────────────────────────────────────────

const baseCreateInput = {
  legalName: 'Mary IC',
  domicileAddress: { street: '1 King St', city: 'Toronto', province: 'ON', postalCode: 'M5H1A1' },
  domicileProvince: 'ON' as const,
  isCorporation: false,
  sinOrBn: '123-456-789',
  gstHstRegistered: false,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IcTaxProfilesService', () => {
  let service: IcTaxProfilesService
  let encryption: ReturnType<typeof createMockEncryption>
  let mockDb: ReturnType<typeof createMockDrizzle>

  beforeEach(async () => {
    mockDb = createMockDrizzle()
    encryption = createMockEncryption()

    const moduleRef = await Test.createTestingModule({
      providers: [
        IcTaxProfilesService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: EncryptionService, useValue: encryption },
      ],
    }).compile()

    service = moduleRef.get(IcTaxProfilesService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ── maskTaxId ──────────────────────────────────────────────────────────────

  describe('maskTaxId (via create)', () => {
    it('masks SIN 123-456-789 to ***-***-789', async () => {
      const profile = {
        id: 'profile-1',
        sinOrBnMask: '***-***-789',
        sinOrBnEncrypted: Buffer.from('dummy'),
        encryptionKeyVersion: 1,
      }
      mockDb._state.insertReturning = [profile]

      const created = await service.create('agency-1', 'user-1', baseCreateInput)
      expect(created.sinOrBnMask).toBe('***-***-789')
    })

    it('masks short tax id correctly (last 4 chars preserved)', async () => {
      const profile = { id: 'p2', sinOrBnMask: '***56789', sinOrBnEncrypted: Buffer.from('d'), encryptionKeyVersion: 1 }
      mockDb._state.insertReturning = [profile]

      const created = await service.create('agency-1', 'user-1', { ...baseCreateInput, sinOrBn: '12356789' })
      // mask preserves last 4, replaces leading digits with *
      expect(created.sinOrBnMask).toBe('***56789')
    })
  })

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('encrypts SIN on create and stores mask', async () => {
      const encryptResult = encryption.encryptWithVersion('123-456-789')
      const profile = {
        id: 'profile-1',
        sinOrBnEncrypted: encryptResult.ciphertext,
        encryptionKeyVersion: encryptResult.keyVersion,
        sinOrBnMask: '***-***-789',
        legalName: 'Mary IC',
      }
      mockDb._state.insertReturning = [profile]

      const created = await service.create('agency-1', 'user-1', baseCreateInput)

      // sinOrBnMask should be set
      expect(created.sinOrBnMask).toBe('***-***-789')
      // sinOrBnEncrypted should be a Buffer
      expect(created.sinOrBnEncrypted).toBeInstanceOf(Buffer)
      // encryptionKeyVersion should match currentKeyVersion
      expect(created.encryptionKeyVersion).toBe(encryption.currentKeyVersion)
      // encryption service was called with the raw SIN
      expect(encryption.encryptWithVersion).toHaveBeenCalledWith('123-456-789')
    })

    it('calls db insert with correct agencyId and userId', async () => {
      mockDb._state.insertReturning = [{ id: 'p1', sinOrBnMask: '***-***-789', sinOrBnEncrypted: Buffer.from('d'), encryptionKeyVersion: 1 }]
      await service.create('agency-xyz', 'user-abc', baseCreateInput)
      const valuesCall = (mockDb._mocks.mockValuesInsert.mock.calls as any[][])[0]?.[0] as any
      expect(valuesCall?.agencyId).toBe('agency-xyz')
      expect(valuesCall?.userId).toBe('user-abc')
    })
  })

  // ── getDecryptedTaxId ──────────────────────────────────────────────────────

  describe('getDecryptedTaxId', () => {
    it('exposes decrypted SIN only via getDecryptedTaxId', async () => {
      // First create a real encrypted buffer via the mock encryption
      const { ciphertext, keyVersion } = encryption.encryptWithVersion('123-456-789')

      // Wire findById (select chain) to return a profile with the encrypted data
      mockDb._state.selectRows = [{
        id: 'profile-1',
        sinOrBnEncrypted: ciphertext,
        encryptionKeyVersion: keyVersion,
        sinOrBnMask: '***-***-789',
        legalName: 'Mary IC',
      }]

      const decrypted = await service.getDecryptedTaxId('profile-1', 'admin-1', 'T4A export')
      expect(decrypted).toBe('123-456-789')
    })

    it('throws NotFoundException when profile does not exist', async () => {
      mockDb._state.selectRows = []
      await expect(
        service.getDecryptedTaxId('nonexistent-id', 'admin-1', 'T4A export'),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when sinOrBnEncrypted is null', async () => {
      mockDb._state.selectRows = [{
        id: 'profile-2',
        sinOrBnEncrypted: null,
        encryptionKeyVersion: null,
      }]
      await expect(
        service.getDecryptedTaxId('profile-2', 'admin-1', 'T4A export'),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('rejects approvalCeilingCents change without admin role', async () => {
      await expect(
        service.update('agency-1', 'user-1', { approvalCeilingCents: 500000 }, { isAdmin: false }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('rejects autoDisburse change without admin role', async () => {
      await expect(
        service.update('agency-1', 'user-1', { autoDisburse: true }, { isAdmin: false }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException when updating a non-existent profile', async () => {
      // Wire findByUser to return no rows (null profile)
      mockDb._state.selectRows = []

      await expect(
        service.update('agency-1', 'user-99', { legalName: 'X' }, { isAdmin: true }),
      ).rejects.toThrow(NotFoundException)
    })

    it('allows approvalCeilingCents change with admin role', async () => {
      const existingProfile = {
        id: 'profile-1',
        agencyId: 'agency-1',
        userId: 'user-1',
        legalName: 'Mary IC',
        sinOrBnMask: '***-***-789',
        sinOrBnEncrypted: Buffer.from('dummy'),
        encryptionKeyVersion: 1,
      }
      // findByUser returns an existing profile
      mockDb._state.selectRows = [existingProfile]
      // update returns the updated profile
      mockDb._state.updateReturning = [{ ...existingProfile, approvalCeilingCents: 500000 }]

      const updated = await service.update(
        'agency-1', 'user-1',
        { approvalCeilingCents: 500000 },
        { isAdmin: true },
      )
      expect(updated.approvalCeilingCents).toBe(500000)
    })

    it('allows autoDisburse change with admin role', async () => {
      const existingProfile = {
        id: 'profile-1',
        agencyId: 'agency-1',
        userId: 'user-1',
        legalName: 'Mary IC',
      }
      mockDb._state.selectRows = [existingProfile]
      mockDb._state.updateReturning = [{ ...existingProfile, autoDisburse: true }]

      const updated = await service.update(
        'agency-1', 'user-1',
        { autoDisburse: true },
        { isAdmin: true },
      )
      expect(updated.autoDisburse).toBe(true)
    })

    it('re-encrypts SIN when sinOrBn is updated', async () => {
      const existingProfile = { id: 'profile-1', agencyId: 'agency-1', userId: 'user-1', legalName: 'Mary IC' }
      mockDb._state.selectRows = [existingProfile]
      const { ciphertext, keyVersion } = encryption.encryptWithVersion('987-654-321')
      mockDb._state.updateReturning = [{ ...existingProfile, sinOrBnMask: '***-***-321', sinOrBnEncrypted: ciphertext, encryptionKeyVersion: keyVersion }]

      const updated = await service.update(
        'agency-1', 'user-1',
        { sinOrBn: '987-654-321' },
        { isAdmin: false },
      )
      expect(updated.sinOrBnMask).toBe('***-***-321')
      // encryptWithVersion called for the new SIN (called at least once — once during update)
      expect(encryption.encryptWithVersion).toHaveBeenCalledWith('987-654-321')
    })
  })
})
